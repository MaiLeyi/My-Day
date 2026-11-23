import { useEffect, useRef, useState } from 'react'
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
} from 'react'
import type { Project, Task } from '../types'
import { STATUS, getDragPayload, markConflicts, projectColor, setDragPayload, weekDays } from '../utils'

interface Props {
  offset: number
  tasks: Task[]
  projects: Project[]
  focusId?: string
  onPrev: () => void
  onNext: () => void
  onBack: () => void
  onOpenDay: (iso: string) => void
  onAddDay: (iso: string) => void
  onAddAt: (iso: string, start: string, end: string) => void
  onOpen: (id: string) => void
  onScheduleRange: (taskId: string, iso: string, start: string, end: string) => void
  onToggleStatus: (task: Task) => void
  onDeleteTask: (task: Task) => void
}

const HOUR_HEIGHT = 42
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

interface SelectState {
  day: string
  startMin: number
  curMin: number
  dragging: boolean
}

export default function WeekView(props: Props) {
  const days = weekDays(props.offset)
  const label = props.offset === 0 ? '本周' : props.offset > 0 ? `未来第 ${props.offset} 周` : `过去第 ${-props.offset} 周`
  const [dragOver, setDragOver] = useState('')
  const [select, setSelect] = useState<SelectState | null>(null)
  const selectRef = useRef<SelectState | null>(null)
  const selectCleanupRef = useRef<(() => void) | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = 7.5 * HOUR_HEIGHT
  }, [])

  // 新建事项后滚动到它出现的位置
  useEffect(() => {
    if (!props.focusId) return
    const el = document.querySelector<HTMLElement>(`[data-task-id="${props.focusId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }, [props.focusId, props.tasks])

  useEffect(() => () => selectCleanupRef.current?.(), [])

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

  /** 根据落点换算成 15 分钟对齐的开始时间。 */
  const minutesAt = (event: ReactDragEvent | ReactMouseEvent, duration: number): number => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const y = event.clientY - rect.top
    const raw = Math.round((y / HOUR_HEIGHT) * 60 / SNAP) * SNAP
    return clamp(raw, 0, 24 * 60 - Math.max(SNAP, duration))
  }

  const dropOnColumn = (event: ReactDragEvent, iso: string) => {
    event.preventDefault()
    setDragOver('')
    const payload = getDragPayload()
    setDragPayload(null)
    if (payload?.type !== 'task') return
    const task = props.tasks.find((t) => t.id === payload.id)
    let duration = DEFAULT_DURATION
    if (task?.start) {
      const start = toMinutes(task.start)
      const end = task.end ? toMinutes(task.end) : start + DEFAULT_DURATION
      duration = Math.max(SNAP, end - start)
    }
    const start = minutesAt(event, duration)
    props.onScheduleRange(payload.id, iso, toTime(start), toTime(start + duration))
  }

  const dropOnAllDay = (event: ReactDragEvent, iso: string) => {
    event.preventDefault()
    const payload = getDragPayload()
    setDragPayload(null)
    if (payload?.type !== 'task') return
    props.onScheduleRange(payload.id, iso, '', '')
  }

  const addFromColumn = (event: ReactMouseEvent, iso: string) => {
    if ((event.target as HTMLElement).closest('.tl-event')) return
    const start = minutesAt(event, DEFAULT_DURATION)
    props.onAddAt(iso, toTime(start), toTime(start + DEFAULT_DURATION))
  }

  const snapMinutes = (y: number): number =>
    clamp(Math.round((y / HOUR_HEIGHT) * 60 / SNAP) * SNAP, 0, 24 * 60)

  /** 在空白时间列上按下并拖拽，圈选一段固定时间。 */
  const beginSelect = (event: ReactMouseEvent, iso: string) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.tl-event')) return
    event.preventDefault()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const startMin = snapMinutes(event.clientY - rect.top)
    const first: SelectState = { day: iso, startMin, curMin: startMin, dragging: false }
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
      props.onAddAt(current.day, toTime(from), toTime(to))
    }

    selectCleanupRef.current = finish
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', finish)
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const now = new Date()
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT

  return (
    <div className="weekview">
      <div className="week-nav">
        <button className="wk-btn" onClick={props.onPrev}>
          ‹ 上一周
        </button>
        <span className="wk-label">
          {label}
          <span className="wk-range">
            {days[0].label} – {days[6].label}
          </span>
        </span>
        <button className="wk-btn" onClick={props.onNext}>
          下一周 ›
        </button>
        <button className="wk-btn wk-today" onClick={props.onBack}>
          回到本周
        </button>
      </div>

      <div className="wk-scroll" ref={scrollRef}>
        <div className="wk-inner">
          <div className="wk-head">
            <div className="wk-corner">全天</div>
            {days.map((day) => {
              const timedCount = props.tasks.filter((t) => t.planDate === day.iso && t.start).length
              const allDayCount = props.tasks.filter(
                (t) =>
                  (t.planDate === day.iso && !t.start) ||
                  (t.dueDate === day.iso && t.planDate !== day.iso),
              ).length
              const total = timedCount + allDayCount
              return (
                <div key={day.iso} className={'wk-dayhead' + (day.isToday ? ' today' : '')}>
                  <button
                    className="wk-dayname"
                    onClick={() => props.onOpenDay(day.iso)}
                    title="查看当天日程"
                  >
                    <b>{day.weekday}</b>
                    <span>{day.label}</span>
                  </button>
                  {total > 0 && <span className="wk-daycount">{total}</span>}
                  <button
                    className="wk-dayadd"
                    title="在此日新增"
                    onClick={() => props.onAddDay(day.iso)}
                  >
                    ＋
                  </button>
                </div>
              )
            })}
          </div>

          <div className="wk-allday-row">
            <div className="wk-allday-gutter">未安排</div>
            {days.map((day) => {
              const allDay = props.tasks.filter(
                (t) =>
                  (t.planDate === day.iso && !t.start) ||
                  (t.dueDate === day.iso && t.planDate !== day.iso),
              )
              return (
                <div
                  key={day.iso}
                  className={'wk-allday' + (day.isToday ? ' today' : '')}
                  onDragOver={(e) => {
                    if (getDragPayload()?.type === 'task') e.preventDefault()
                  }}
                  onDrop={(e) => dropOnAllDay(e, day.iso)}
                >
                  {allDay.map((t) => (
                    <div
                      key={t.id}
                      data-task-id={t.id}
                      className={
                        'wk-chip pri-' +
                        (t.priority || 'none') +
                        (props.focusId === t.id ? ' flash' : '')
                      }
                      draggable
                      onDragStart={(e) => beginTaskDrag(e, t.id)}
                      onDragEnd={() => setDragPayload(null)}
                      onClick={() => props.onOpen(t.id)}
                      title={t.title}
                    >
                      <span className="wk-chip-title">{t.title}</span>
                      {t.dueDate === day.iso && t.planDate !== day.iso && (
                        <span className="wk-chip-tag">截止</span>
                      )}
                    </div>
                  ))}
                  {allDay.length === 0 && <span className="wk-allday-empty">—</span>}
                </div>
              )
            })}
          </div>

          <div className="wk-time" style={{ height: 24 * HOUR_HEIGHT }}>
            <div className="wk-hours">
              {hours.map((h) => (
                <div className="wk-hour" key={h} style={{ top: h * HOUR_HEIGHT }}>
                  <span>{String(h).padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>
            {days.map((day) => {
              const timedSource = props.tasks
                .filter((t) => t.planDate === day.iso && !!t.start)
                .map((t) => {
                  const start = toMinutes(t.start)
                  const end = t.end ? toMinutes(t.end) : start + DEFAULT_DURATION
                  return { task: t, start, end: end > start ? end : start + DEFAULT_DURATION }
                })
              const timed = markConflicts(timedSource)
              return (
                <div
                  key={day.iso}
                  className={
                    'wk-col' +
                    (day.isToday ? ' today' : '') +
                    (dragOver === day.iso ? ' drag-over' : '')
                  }
                  data-day={day.iso}
                  onDragOver={(e) => {
                    if (getDragPayload()?.type === 'task') {
                      e.preventDefault()
                      setDragOver(day.iso)
                    }
                  }}
                  onDragLeave={() => setDragOver('')}
                  onDrop={(e) => dropOnColumn(e, day.iso)}
                  onDoubleClick={(e) => addFromColumn(e, day.iso)}
                  onMouseDown={(e) => beginSelect(e, day.iso)}
                >
                  {day.isToday && (
                    <div className="tl-now" style={{ top: nowTop }}>
                      <i />
                    </div>
                  )}
                  {select && select.day === day.iso && (
                    <div
                      className="tl-select"
                      style={{
                        top: (Math.min(select.startMin, select.curMin) / 60) * HOUR_HEIGHT,
                        height: Math.max(
                          2,
                          (Math.abs(select.curMin - select.startMin) / 60) * HOUR_HEIGHT,
                        ),
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
                    const top = (item.start / 60) * HOUR_HEIGHT
                    const height = Math.max(20, ((item.end - item.start) / 60) * HOUR_HEIGHT)
                    const size = height < 30 ? ' compact' : height < 44 ? ' mid' : ''
                    const project = props.projects.find((p) => p.id === item.task.projectId)
                    return (
                      <div
                        key={item.task.id}
                        data-task-id={item.task.id}
                        className={
                          'tl-event wk-ev' +
                          (item.task.status === 'done' ? ' done' : '') +
                          (item.conflict ? ' conflict' : '') +
                          (props.focusId === item.task.id ? ' flash' : '') +
                          size
                        }
                        style={{ top, height, left: 2, right: 2, borderLeftColor: projectColor(project?.shade) }}
                        draggable
                        onDragStart={(e) => beginTaskDrag(e, item.task.id)}
                        onDragEnd={() => setDragPayload(null)}
                        onClick={() => props.onOpen(item.task.id)}
                        title={`${item.task.title} ${toTime(item.start)}–${toTime(item.end)}${item.conflict ? '（时间冲突）' : ''}`}
                      >
                        <div className="tl-event-head">
                          <button
                            className={'tl-check small ' + item.task.status}
                            title={item.task.status === 'done' ? '标记为未处理' : '标记为已处理'}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation()
                              props.onToggleStatus(item.task)
                            }}
                          >
                            {item.task.status === 'done' ? '✓' : ''}
                          </button>
                          <span className="tl-event-title">
                            {item.conflict && <i className="tl-conflict-dot" />}
                            {item.task.title}
                          </span>
                        </div>
                        <div className="tl-event-time">
                          {toTime(item.start)} – {toTime(item.end)}
                        </div>
                        <div className="tl-event-status">{STATUS[item.task.status]}</div>
                        <div className="tl-actions" onClick={(e) => e.stopPropagation()}>
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
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
