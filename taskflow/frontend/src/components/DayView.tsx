import { useEffect, useRef, useState } from 'react'
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { Folder, Project, Task } from '../types'
import { PRIORITY_LABEL, STATUS, fmt, getDragPayload, parseDate, setDragPayload, today } from '../utils'
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
  onAddAt: (iso: string, start: string, end: string) => void
  onScheduleRange: (taskId: string, iso: string, start: string, end: string) => void
  onOpen: (id: string) => void
  onToggleSelect: (id: string) => void
  onDropTask: (sourceId: string, targetId: string) => void
  onEdit: (id: string) => void
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
  lane: number
  laneCount: number
}

/** 把时间重叠的事项分到不同泳道，避免互相遮挡。 */
function layoutTimed(items: { task: Task; start: number; end: number }[]): TimedItem[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end)
  const result: TimedItem[] = []
  let cluster: { task: Task; start: number; end: number; lane: number }[] = []
  let clusterEnd = -1

  const flush = () => {
    if (!cluster.length) return
    const laneCount = Math.max(...cluster.map((c) => c.lane)) + 1
    cluster.forEach((c) => result.push({ ...c, laneCount }))
    cluster = []
    clusterEnd = -1
  }

  for (const item of sorted) {
    if (cluster.length && item.start >= clusterEnd) flush()
    const used = new Set(
      cluster.filter((c) => c.start < item.end && item.start < c.end).map((c) => c.lane),
    )
    let lane = 0
    while (used.has(lane)) lane += 1
    cluster.push({ ...item, lane })
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flush()
  return result
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

export default function DayView(props: Props) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
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
  const timed = layoutTimed(timedSource)
  const untimed = dayTasks.filter((t) => !(t.planDate === props.date && t.start))

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = 7 * HOUR_HEIGHT
  }, [props.date])

  useEffect(() => () => cleanupRef.current?.(), [])

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
          onClick={() => {
            const hour = new Date().getHours()
            props.onAddAt(props.date, toTime(hour * 60), toTime(hour * 60 + DEFAULT_DURATION))
          }}
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
                  onDragStart={() => setDragPayload({ type: 'task', id: t.id })}
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
                  <span className="tl-chip-drag">⠿</span>
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
            {timed.map((item) => {
              const preview = drag && drag.taskId === item.task.id ? drag : null
              const start = preview ? preview.previewStart : item.start
              const end = preview ? preview.previewEnd : item.end
              const top = (start / 60) * HOUR_HEIGHT
              const height = Math.max(24, ((end - start) / 60) * HOUR_HEIGHT)
              const width = 100 / item.laneCount
              const size = height < 36 ? ' compact' : height < 56 ? ' mid' : ''
              const project = props.projects.find((p) => p.id === item.task.projectId)
              return (
                <div
                  key={item.task.id}
                  data-task-id={item.task.id}
                  className={
                    'tl-event g' +
                    (project?.shade ?? 0) +
                    (item.task.status === 'done' ? ' done' : '') +
                    (preview ? ' dragging' : '') +
                    (props.focusId === item.task.id ? ' flash' : '') +
                    size
                  }
                  style={{
                    top,
                    height,
                    left: `calc(${item.lane * width}% + 2px)`,
                    width: `calc(${width}% - 4px)`,
                  }}
                  onPointerDown={(e) => beginDrag(e, item, 'move')}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="tl-handle top"
                    onPointerDown={(e) => beginDrag(e, item, 'start')}
                    title="拖动调整开始时间"
                  />
                  <div className="tl-event-title">{item.task.title}</div>
                  <div className="tl-event-time">
                    {toTime(start)} – {toTime(end)}
                  </div>
                  <div className="tl-event-status">{STATUS[item.task.status]}</div>
                  <div className="tl-actions" onPointerDown={(e) => e.stopPropagation()}>
                    <button
                      className="tact-mini"
                      title="编辑事项"
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onEdit(item.task.id)
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="tact-mini"
                      title={item.task.status === 'done' ? '标记为未处理' : '标记为已处理'}
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onToggleStatus(item.task)
                      }}
                    >
                      {item.task.status === 'done' ? '↺' : '✓'}
                    </button>
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
