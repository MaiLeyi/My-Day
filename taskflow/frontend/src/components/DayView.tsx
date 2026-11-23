import { useEffect, useRef, useState } from 'react'
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { Folder, Project, Task } from '../types'
import { PRIORITY_LABEL, fmt, getDragPayload, markConflicts, parseDate, projectColor, setDragPayload, today } from '../utils'
import DateField from './DateField'

interface Props {
  date: string
  tasks: Task[]
  projects: Project[]
  folders: Folder[]
  focusId?: string
  batchMode: boolean
  selected: Set<string>
  onDateChange: (iso: string) => void
  onAddDay: (iso: string) => void
  onAddAt: (iso: string, start: string, end: string) => void
  onScheduleRange: (taskId: string, iso: string, start: string, end: string) => void
  onOpen: (id: string) => void
  onToggleSelect: (id: string) => void
  onDropTask: (sourceId: string, targetId: string) => void
  onToggleStatus: (task: Task) => void
  onDeleteTask: (task: Task) => void
}

const HOUR_HEIGHT = 46
const SNAP = 15
const DEFAULT_DURATION = 30

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

function toTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function shiftDay(iso: string, delta: number): string {
  const d = parseDate(iso)
  d.setDate(d.getDate() + delta)
  return fmt(d)
}

interface TimedItem {
  task: Task
  start: number
  end: number
  conflict: boolean
}

interface DragState {
  taskId: string
  mode: 'move' | 'start' | 'end'
  pointerY: number
  start: number
  end: number
  previewStart: number
  previewEnd: number
  moved: boolean
}

interface SelectState {
  startMin: number
  curMin: number
  dragging: boolean
}

export default function DayView(props: Props) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [select, setSelect] = useState<SelectState | null>(null)
  const selectRef = useRef<SelectState | null>(null)
  const selectCleanupRef = useRef<(() => void) | null>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const dayTasks = props.tasks.filter(
    (t) => t.planDate === props.date || (t.dueDate === props.date && t.planDate !== props.date),
  )
  const timedSource = dayTasks
    .filter((t) => t.planDate === props.date && !!t.start)
    .map((t) => {
      const start = toMinutes(t.start)
      const end = t.end ? toMinutes(t.end) : start + DEFAULT_DURATION
      return { task: t, start, end: end > start ? end : start + DEFAULT_DURATION }
    })
  const timed = markConflicts(timedSource)
  const untimed = dayTasks.filter((t) => !(t.planDate === props.date && t.start))

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = 7 * HOUR_HEIGHT
  }, [props.date])

  useEffect(() => () => cleanupRef.current?.(), [])
  useEffect(() => () => selectCleanupRef.current?.(), [])

  // 新建事项后滚动到它出现的位置
  useEffect(() => {
    if (!props.focusId) return
    const el = document.querySelector<HTMLElement>(`[data-task-id="${props.focusId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  }, [props.focusId, props.tasks])

  const beginDrag = (event: ReactPointerEvent, item: TimedItem, mode: DragState['mode']) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const state: DragState = {
      taskId: item.task.id,
      mode,
      pointerY: event.clientY,
      start: item.start,
      end: item.end,
      previewStart: item.start,
      previewEnd: item.end,
      moved: false,
    }
    dragRef.current = state
    setDrag(state)

    const onMove = (ev: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      const deltaMinutes = ((ev.clientY - current.pointerY) / HOUR_HEIGHT) * 60
      const delta = Math.round(deltaMinutes / SNAP) * SNAP
      let start = current.start
      let end = current.end
      if (current.mode === 'move') {
        const duration = current.end - current.start
        start = clamp(current.start + delta, 0, 24 * 60 - duration)
        end = start + duration
      } else if (current.mode === 'start') {
        start = clamp(current.start + delta, 0, current.end - SNAP)
        end = current.end
      } else {
        start = current.start
        end = clamp(current.end + delta, current.start + SNAP, 24 * 60)
      }
      const next: DragState = {
        ...current,
        previewStart: start,
        previewEnd: end,
        moved: current.moved || start !== current.start || end !== current.end,
      }
      dragRef.current = next
      setDrag(next)
    }

    const finish = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      cleanupRef.current = null
      const current = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!current) return
      if (current.previewStart !== current.start || current.previewEnd !== current.end) {
        props.onScheduleRange(
          current.taskId,
          props.date,
          toTime(current.previewStart),
          toTime(current.previewEnd),
        )
      } else if (current.mode === 'move') {
        props.onOpen(current.taskId)
      }
    }

    cleanupRef.current = finish
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
  }

  /** 拖到左侧未安排区 / 跨天拖动时写入统一拖拽载荷。 */
  const beginTaskDrag = (event: ReactDragEvent, id: string) => {
    setDragPayload({ type: 'task', id })
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      try {
        event.dataTransfer.setData('text/plain', id)
      } catch {
        /* ignore */
      }
    }
  }

  const onTimelineDrop = (event: ReactDragEvent) => {
    event.preventDefault()
    const payload = getDragPayload()
    setDragPayload(null)
    if (payload?.type !== 'task') return
    const rect = innerRef.current?.getBoundingClientRect()
    if (!rect) return
    const y = event.clientY - rect.top
    const minutes = clamp(Math.round((y / HOUR_HEIGHT) * 60 / SNAP) * SNAP, 0, 24 * 60 - DEFAULT_DURATION)
    props.onScheduleRange(payload.id, props.date, toTime(minutes), toTime(minutes + DEFAULT_DURATION))
  }

  const addFromTimeline = (event: ReactMouseEvent) => {
    if ((event.target as HTMLElement).closest('.tl-event')) return
    const rect = innerRef.current?.getBoundingClientRect()
    if (!rect) return
    const y = event.clientY - rect.top
    const minutes = clamp(Math.round((y / HOUR_HEIGHT) * 60 / SNAP) * SNAP, 0, 24 * 60 - DEFAULT_DURATION)
    props.onAddAt(props.date, toTime(minutes), toTime(minutes + DEFAULT_DURATION))
  }

  const snapMinutes = (y: number): number =>
    clamp(Math.round((y / HOUR_HEIGHT) * 60 / SNAP) * SNAP, 0, 24 * 60)

  /** 在空白时间轴上按下并拖拽，圈选一段固定时间。 */
  const beginSelect = (event: ReactMouseEvent) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.tl-event')) return
    const el = innerRef.current
    if (!el) return
    // 贴近事项卡片边缘时不启动选区，避免抢走上下边界的缩放操作
    const nearCard = Array.from(el.querySelectorAll<HTMLElement>('.tl-event')).some((node) => {
      const r = node.getBoundingClientRect()
      return (
        event.clientX >= r.left - 4 &&
        event.clientX <= r.right + 4 &&
        event.clientY >= r.top - 4 &&
        event.clientY <= r.bottom + 4
      )
    })
    if (nearCard) return
    event.preventDefault()
    const rect = el.getBoundingClientRect()
    const startMin = snapMinutes(event.clientY - rect.top)
    const first: SelectState = { startMin, curMin: startMin, dragging: false }
    selectRef.current = first
    setSelect(first)

    const onMove = (ev: MouseEvent) => {
      const current = selectRef.current
      if (!current) return
      const curMin = snapMinutes(ev.clientY - rect.top)
      if (curMin === current.curMin) return
      const next: SelectState = { ...current, curMin, dragging: true }
      selectRef.current = next
      setSelect(next)
    }

    const finish = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', finish)
      selectCleanupRef.current = null
      const current = selectRef.current
      selectRef.current = null
      setSelect(null)
      if (!current || !current.dragging) return
      const from = Math.min(current.startMin, current.curMin)
      const to = Math.max(current.startMin, current.curMin)
      if (to - from < SNAP) return
      props.onAddAt(props.date, toTime(from), toTime(to))
    }

    selectCleanupRef.current = finish
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', finish)
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="dayview">
      <div className="day-bar">
        <button className="wk-btn" onClick={() => props.onDateChange(shiftDay(props.date, -1))} title="前一天">
          ‹
        </button>
        <DateField value={props.date} onChange={(value) => value && props.onDateChange(value)} />
        <button className="wk-btn" onClick={() => props.onDateChange(shiftDay(props.date, 1))} title="后一天">
          ›
        </button>
        {props.date !== today() && (
          <button className="wk-btn" onClick={() => props.onDateChange(today())}>
            回到今天
          </button>
        )}
        <span className="day-count">{timed.length} 项已排时间 · {untimed.length} 项待安排</span>
        <button
          className="btn btn-ghost day-add-btn"
          onClick={() => props.onAddDay(props.date)}
        >
          ＋ 新增
        </button>
      </div>

      <div className="timeline-wrap">
        <aside className="tl-side">
          <div className="tl-side-head">
            未安排时间 <span>{untimed.length}</span>
          </div>
          <div className="tl-side-hint">拖到右侧时间轴即可排期，默认 30 分钟</div>
          <div className="tl-side-list">
            {untimed.map((t) => {
              const project = props.projects.find((p) => p.id === t.projectId)
              return (
                <div
                  key={t.id}
                  data-task-id={t.id}
                  className={
                    'tl-chip pri-' + (t.priority || 'none') + (props.focusId === t.id ? ' flash' : '')
                  }
                  draggable={!props.batchMode}
                  onDragStart={(e) => beginTaskDrag(e, t.id)}
                  onDragEnd={() => setDragPayload(null)}
                  onClick={() => props.onOpen(t.id)}
                  title="拖到右侧时间轴安排时间"
                >
                  <div className="tl-chip-main">
                    <div className="tl-chip-title">{t.title}</div>
                    <div className="tl-chip-meta">
                      <span>{project?.name || '未归类'}</span>
                      {t.dueDate === props.date && t.planDate !== props.date && <span className="tl-due">当日截止</span>}
                      {t.priority && <span>· {PRIORITY_LABEL[t.priority]}优先级</span>}
                    </div>
                  </div>
                  <span className="tl-chip-actions">
                    <button
                      className={'tl-check small ' + t.status}
                      title={t.status === 'done' ? '标记为未处理' : '标记为已处理'}
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onToggleStatus(t)
                      }}
                    >
                      {t.status === 'done' ? '✓' : ''}
                    </button>
                    <button
                      className="tl-chip-del"
                      title="删除事项"
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onDeleteTask(t)
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              )
            })}
            {untimed.length === 0 && <div className="tl-side-empty">当天事项都已排好时间</div>}
          </div>
        </aside>

        <div className="timeline" ref={scrollRef}>
          <div
            className="tl-inner"
            ref={innerRef}
            style={{ height: 24 * HOUR_HEIGHT }}
            onDragOver={(e) => {
              if (getDragPayload()?.type === 'task') e.preventDefault()
            }}
            onDrop={onTimelineDrop}
            onDoubleClick={addFromTimeline}
            onMouseDown={beginSelect}
          >
            {hours.map((h) => (
              <div className="tl-hour" key={h} style={{ top: h * HOUR_HEIGHT }}>
                <span>{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
            {props.date === today() && (
              <div
                className="tl-now"
                style={{ top: ((new Date().getHours() * 60 + new Date().getMinutes()) / 60) * HOUR_HEIGHT }}
              >
                <i />
              </div>
            )}
            {select && (
              <div
                className="tl-select"
                style={{
                  top: (Math.min(select.startMin, select.curMin) / 60) * HOUR_HEIGHT,
                  height: Math.max(2, (Math.abs(select.curMin - select.startMin) / 60) * HOUR_HEIGHT),
                }}
              >
                <span className="tl-select-label">
                  {toTime(Math.min(select.startMin, select.curMin))}
                  {select.dragging
                    ? ` – ${toTime(Math.max(select.startMin, select.curMin))}`
                    : ' 开始'}
                </span>
              </div>
            )}
            {timed.map((item) => {
              const preview = drag && drag.taskId === item.task.id ? drag : null
              const start = preview ? preview.previewStart : item.start
              const end = preview ? preview.previewEnd : item.end
              const top = (start / 60) * HOUR_HEIGHT
              const height = Math.max(24, ((end - start) / 60) * HOUR_HEIGHT)
              const size = height < 36 ? ' compact' : height < 56 ? ' mid' : ''
              const project = props.projects.find((p) => p.id === item.task.projectId)
              return (
                <div
                  key={item.task.id}
                  data-task-id={item.task.id}
                  className={
                    'tl-event' +
                    (item.task.status === 'done' ? ' done' : '') +
                    (item.conflict ? ' conflict' : '') +
                    (preview ? ' dragging' : '') +
                    (props.focusId === item.task.id ? ' flash' : '') +
                    size
                  }
                  style={{ top, height, left: 2, right: 2, borderLeftColor: projectColor(project?.shade) }}
                  onPointerDown={(e) => beginDrag(e, item, 'move')}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="tl-handle top"
                    onPointerDown={(e) => beginDrag(e, item, 'start')}
                    title="拖动调整开始时间"
                  />
                  <div className="tl-event-head">
                    <button
                      className={'tl-check small ' + item.task.status}
                      title={item.task.status === 'done' ? '标记为未处理' : '标记为已处理'}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onToggleStatus(item.task)
                      }}
                    >
                      {item.task.status === 'done' ? '✓' : ''}
                    </button>
                    <span className="tl-event-title">{item.task.title}</span>
                    {item.conflict && (
                      <span className="tl-event-flag" title="与其它事项时间冲突">
                        冲突
                      </span>
                    )}
                    <span className="tl-event-time">
                      {toTime(start)} – {toTime(end)}
                    </span>
                  </div>
                  <div className="tl-actions" onPointerDown={(e) => e.stopPropagation()}>
                    <button
                      className="tact-mini danger"
                      title="删除事项"
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onDeleteTask(item.task)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div
                    className="tl-handle bottom"
                    onPointerDown={(e) => beginDrag(e, item, 'end')}
                    title="拖动调整结束时间"
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
