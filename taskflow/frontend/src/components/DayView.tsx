import { useEffect, useRef, useState } from 'react'
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
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
  onCopyTask: (task: Task) => void
  onPaste: (iso: string, start?: string) => void
}

/** 与本周视图保持一致：半小时占 42px，事项最小单位为半小时。 */
const HOUR_HEIGHT = 84
const SNAP = 30
const MIN_DURATION = 30
const DEFAULT_DURATION = 30
const MIN_EVENT_HEIGHT = (MIN_DURATION / 60) * HOUR_HEIGHT

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

interface ContextState {
  x: number
  y: number
  task?: Task
  minute?: number
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
  const [ctx, setCtx] = useState<ContextState | null>(null)

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
  const starts = new Set(timed.map((i) => i.start))
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

  // 右键菜单：点击空白、滚动或 Esc 关闭
  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCtx(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctx])

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
        start = clamp(current.start + delta, 0, current.end - MIN_DURATION)
        end = current.end
      } else {
        start = current.start
        end = clamp(current.end + delta, current.start + MIN_DURATION, 24 * 60)
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

  const openContext = (event: ReactMouseEvent, task: Task) => {
    event.preventDefault()
    event.stopPropagation()
    setCtx({
      x: Math.min(event.clientX, window.innerWidth - 170),
      y: Math.min(event.clientY, window.innerHeight - 110),
      task,
    })
  }

  /** 在时间轴空白处右键：可在当前位置新增或粘贴事项。 */
  const openEmptyContext = (event: ReactMouseEvent) => {
    if ((event.target as HTMLElement).closest('.tl-event')) return
    event.preventDefault()
    const rect = innerRef.current?.getBoundingClientRect()
    const minute = rect ? snapMinutes(event.clientY - rect.top) : 9 * 60
    setCtx({
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 130),
      minute,
    })
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
                  style={{ ['--ev-c' as string]: projectColor(project?.shade) }}
                  draggable={!props.batchMode}
                  onDragStart={(e) => beginTaskDrag(e, t.id)}
                  onDragEnd={() => setDragPayload(null)}
                  onClick={() => props.onOpen(t.id)}
                  onContextMenu={(e) => openContext(e, t)}
                  title="拖到右侧时间轴安排时间"
                >
                  <div className="tl-chip-main">
                    <div className="tl-chip-head">
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
                      <div className="tl-chip-title">{t.title}</div>
                    </div>
                    <div className="tl-chip-time">
                      {t.start ? t.start + (t.end ? ' – ' + t.end : '') : '未排期'}
                    </div>
                    <div className="tl-chip-meta">
                      <span>{project?.name || '未归类'}</span>
                      {t.dueDate === props.date && t.planDate !== props.date && <span className="tl-due">当日截止</span>}
                      {t.priority && <span>· {PRIORITY_LABEL[t.priority]}优先级</span>}
                    </div>
                  </div>
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
            onContextMenu={openEmptyContext}
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
              // 下一个事项恰好从本事项结束时刻开始时，贴在一起不留空
              const touchBelow = starts.has(end)
              const height = Math.max(
                MIN_EVENT_HEIGHT,
                ((end - start) / 60) * HOUR_HEIGHT - (touchBelow ? 0 : 6),
              )
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
                    (props.focusId === item.task.id ? ' flash' : '')
                  }
                  style={{
                    top,
                    height,
                    left: 2,
                    right: 2,
                    ['--ev-c' as string]: projectColor(project?.shade),
                  }}
                  onPointerDown={(e) => beginDrag(e, item, 'move')}
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => openContext(e, item.task)}
                >
                  <div
                    className="tl-handle top"
                    onPointerDown={(e) => beginDrag(e, item, 'start')}
                    title="拖动调整开始时间"
                  />
                  <div className="tl-event-body">
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
                      <span className="tl-event-title">
                        {item.conflict && <i className="tl-conflict-dot" title="与其它事项时间冲突" />}
                        {item.task.title}
                      </span>
                    </div>
                    <div className="tl-event-time">
                      {toTime(start)} – {toTime(end)}
                    </div>
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

      {ctx &&
        createPortal(
          <>
            <div className="ctx-backdrop" onMouseDown={() => setCtx(null)} />
            <div
              className="ctx-menu"
              style={{ left: ctx.x, top: ctx.y }}
              onMouseDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              {ctx.task ? (
                <>
                  <button
                    onClick={() => {
                      const task = ctx.task!
                      setCtx(null)
                      props.onCopyTask(task)
                    }}
                  >
                    ⧉ 复制事项
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      const task = ctx.task!
                      setCtx(null)
                      props.onDeleteTask(task)
                    }}
                  >
                    ✕ 删除事项
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      const minute = ctx.minute ?? 9 * 60
                      setCtx(null)
                      props.onAddAt(props.date, toTime(minute), toTime(minute + DEFAULT_DURATION))
                    }}
                  >
                    ＋ 在此新增
                  </button>
                  <button
                    onClick={() => {
                      const minute = ctx.minute ?? 9 * 60
                      setCtx(null)
                      props.onPaste(props.date, toTime(minute))
                    }}
                  >
                    ⧉ 粘贴事项
                  </button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
