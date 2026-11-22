import { useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import type { Folder, Project, Task } from '../types'
import {
  PRIORITY_LABEL,
  fmt,
  getDragPayload,
  parseDate,
  setDragPayload,
  today,
} from '../utils'

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
  onEdit: (id: string) => void
  onToggleStatus: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onSchedule?: (id: string, iso: string) => void
  onToggleReview?: (task: Task) => void
}

function shiftDay(iso: string, delta: number): string {
  const d = iso ? parseDate(iso) : new Date()
  d.setDate(d.getDate() + delta)
  return fmt(d)
}

export default function TaskRow(props: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [schedOpen, setSchedOpen] = useState(false)
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

  const pickDate = (iso: string) => {
    setSchedOpen(false)
    props.onSchedule?.(task.id, iso)
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
      onDragStart={() => setDragPayload({ type: 'task', id: task.id })}
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
        if ((e.target as HTMLElement).closest('.chk,.sbox,.tact,.quick-sched')) return
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
          <button
            className={'tact review-btn' + (task.needReview ? ' active' : '')}
            title={task.needReview ? '取消待复盘' : '标记待复盘'}
            onClick={(e) => {
              e.stopPropagation()
              props.onToggleReview?.(task)
            }}
          >
            ⚑
          </button>
          <button
            className="tact"
            title="编辑事项"
            onClick={(e) => {
              e.stopPropagation()
              props.onEdit(task.id)
            }}
          >
            ✎
          </button>
          <button
            className="tact"
            title="排到某天"
            onClick={(e) => {
              e.stopPropagation()
              setSchedOpen((v) => !v)
            }}
          >
            ⏱
          </button>
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
      {schedOpen && (
        <div className="quick-sched" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => pickDate(today())}>今天</button>
          <button onClick={() => pickDate(shiftDay(today(), 1))}>明天</button>
          <button onClick={() => pickDate(shiftDay(today(), 7))}>下周今天</button>
          <label>
            选择日期
            <input
              type="date"
              value={task.planDate}
              onChange={(e) => e.target.value && pickDate(e.target.value)}
            />
          </label>
          {task.planDate && (
            <button className="danger" onClick={() => pickDate('')}>
              清除排期
            </button>
          )}
        </div>
      )}
    </div>
  )
}
