import { useState } from 'react'
import type { Folder, Project, Task } from '../types'
import { getDragPayload, setDragPayload, weekDays } from '../utils'
import TaskRow from './TaskRow'

interface Props {
  offset: number
  tasks: Task[]
  projects: Project[]
  folders: Folder[]
  selDay: string
  batchMode: boolean
  selected: Set<string>
  onPrev: () => void
  onNext: () => void
  onBack: () => void
  onSelectDay: (iso: string) => void
  onAddDay: (iso: string) => void
  onOpen: (id: string) => void
  onToggleSelect: (id: string) => void
  onSchedule: (taskId: string, iso: string) => void
  onDropTask: (sourceId: string, targetId: string) => void
}

export default function WeekView(props: Props) {
  const [hint, setHint] = useState('')
  const days = weekDays(props.offset)
  const label = props.offset === 0 ? '本周' : props.offset > 0 ? `未来第 ${props.offset} 周` : `过去第 ${-props.offset} 周`

  return (
    <div className="weekview">
      <div className="week-nav">
        <button className="wk-btn" onClick={props.onPrev}>
          ‹ 上一周
        </button>
        <span className="wk-label">{label}</span>
        <button className="wk-btn" onClick={props.onNext}>
          下一周 ›
        </button>
        <button className="wk-btn wk-today" onClick={props.onBack}>
          回到本周
        </button>
      </div>
      {days.map((day) => {
        const planned = props.tasks
          .filter((t) => t.planDate === day.iso)
          .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
        const dueItems = props.tasks.filter((t) => t.dueDate === day.iso && t.planDate !== day.iso)
        return (
          <div
            key={day.iso}
            className={
              'wday' +
              (day.isToday ? ' today' : '') +
              (day.iso === props.selDay ? ' selected' : '') +
              (hint === day.iso ? ' drop-hint' : '')
            }
            onDragOver={(e) => {
              if (getDragPayload()?.type === 'task') {
                e.preventDefault()
                setHint(day.iso)
              }
            }}
            onDragLeave={() => setHint('')}
            onDrop={(e) => {
              e.preventDefault()
              setHint('')
              const payload = getDragPayload()
              setDragPayload(null)
              if (payload?.type === 'task') props.onSchedule(payload.id, day.iso)
            }}
          >
            <h4>
              <span
                style={{ cursor: 'pointer' }}
                onClick={() => props.onSelectDay(day.iso)}
                title="选中当天"
              >
                {day.weekday} {day.label}
                {day.isToday ? ' · 今天' : ''}
              </span>
              <button
                className="wday-add"
                title="在此日新增"
                onClick={() => {
                  props.onSelectDay(day.iso)
                  props.onAddDay(day.iso)
                }}
              >
                ＋
              </button>
            </h4>
            {planned.length || dueItems.length ? (
              <>
                {planned.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    projects={props.projects}
                    folders={props.folders}
                    batchMode={props.batchMode}
                    selected={props.selected.has('t:' + t.id)}
                    onOpen={props.onOpen}
                    onToggleSelect={props.onToggleSelect}
                    onDropTask={props.onDropTask}
                  />
                ))}
                {dueItems.map((t) => (
                  <TaskRow
                    key={'due-' + t.id}
                    task={t}
                    projects={props.projects}
                    folders={props.folders}
                    batchMode={props.batchMode}
                    selected={props.selected.has('t:' + t.id)}
                    onOpen={props.onOpen}
                    onToggleSelect={props.onToggleSelect}
                    onDropTask={props.onDropTask}
                  />
                ))}
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--sub2)', padding: '4px 12px' }}>—</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
