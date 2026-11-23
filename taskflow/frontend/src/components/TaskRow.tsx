import { useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import type { Folder, Project, Task } from '../types'
import { PRIORITY_LABEL, getDragPayload, setDragPayload, today } from '../utils'
import DateField from './DateField'

interface Props {
  task: Task
  projects: Project[]
  folders: Folder[]
  showPath?: boolean
  flash?: boolean
  leaving?: boolean
  batchMode: boolean
  selected: boolean
  onOpen: (id: string) => void
  onToggleSelect: (id: string) => void
  onDropTask?: (sourceId: string, targetId: string) => void
  onToggleStatus: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onSchedule?: (id: string, iso: string, start?: string, end?: string) => void
  onToggleReview?: (task: Task) => void
}

const DURATION = 30

const toMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const toTime = (mins: number): string => {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** 保证存入的时间成对且合法，避免出现只有开始/结束、或结束早于开始的脏数据。 */
function normalizeTime(planDate: string, start: string, end: string) {
  if (!planDate) return { planDate: '', start: '', end: '' }
  let s = start
  let e = end
  if (s && !e) e = toTime(toMinutes(s) + DURATION)
  else if (!s && e) s = toTime(toMinutes(e) - DURATION)
  if (s && e && s >= e) e = toTime(toMinutes(s) + DURATION)
  return { planDate, start: s, end: e }
}

export default function TaskRow(props: Props) {
  const [dragOver, setDragOver] = useState(false)
  const { task } = props

  const drop = (event: ReactDragEvent) => {
    event.preventDefault()
    setDragOver(false)
    const payload = getDragPayload()
    setDragPayload(null)
    if (payload?.type === 'task' && payload.id !== task.id) {
      props.onDropTask?.(payload.id, task.id)
    }
  }

  const commitSchedule = (planDate: string, start: string, end: string) => {
    const next = normalizeTime(planDate, start, end)
    props.onSchedule?.(task.id, next.planDate, next.start, next.end)
  }

  return (
    <div
      data-task-id={task.id}
      className={
        'trow' +
        (task.status === 'done' ? ' done' : '') +
        (dragOver ? ' drag-over' : '') +
        (props.flash ? ' flash' : '') +
        (props.leaving ? ' leaving' : '')
      }
      draggable={!props.batchMode}
      onDragStart={(e) => {
        setDragPayload({ type: 'task', id: task.id })
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          try {
            e.dataTransfer.setData('text/plain', task.id)
          } catch {
            /* ignore */
          }
        }
      }}
      onDragEnd={() => setDragPayload(null)}
      onDragOver={(e) => {
        if (props.onDropTask && getDragPayload()?.type === 'task') {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={drop}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.chk,.sbox,.tact,.datefield')) return
        props.onOpen(task.id)
      }}
    >
      <button
        className={'sbox ' + task.status}
        title={task.status === 'done' ? '标记为未处理' : '标记为已处理'}
        onClick={(e) => {
          e.stopPropagation()
          props.onToggleStatus(task)
        }}
      >
        {task.status === 'done' ? '✓' : ''}
      </button>
      <div className={'pri ' + (task.priority || '')} title={'优先级：' + PRIORITY_LABEL[task.priority || '']} />
      <div className="tbody">
        <div className="ttitle">
          {task.needReview && <span className="review-dot" title="待复盘">⚑</span>}
          {task.title}
        </div>
        <div className="tmeta">
          {task.planDate ? <span>{task.planDate}</span> : <span style={{ color: 'var(--sub2)' }}>未排期</span>}
          {task.start && (
            <span>
              {task.start}
              {task.end ? '–' + task.end : ''}
            </span>
          )}
        </div>
      </div>
      <div className="tright">
        {!props.batchMode && (
          <div className="trow-actions">
            <DateField
              compact
              iconOnly
              icon="⏱"
              clearable
              align="right"
              title="排到某天 / 安排时间"
              value={task.planDate}
              start={task.start}
              end={task.end}
              onChange={(iso) => commitSchedule(iso, task.start, task.end)}
              onStartChange={(start) => commitSchedule(task.planDate || today(), start, task.end)}
              onEndChange={(end) => commitSchedule(task.planDate || today(), task.start, end)}
            />
            <button
              className="tact danger"
              title="删除事项"
              onClick={(e) => {
                e.stopPropagation()
                props.onDeleteTask(task)
              }}
            >
              ✕
            </button>
          </div>
        )}
        {props.batchMode && (
          <input
            type="checkbox"
            className="chk"
            checked={props.selected}
            onChange={() => props.onToggleSelect(task.id)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  )
}
