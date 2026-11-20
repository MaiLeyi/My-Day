import { useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import type { Folder, Project, Task } from '../types'
import { PRIORITY_LABEL, STATUS, getDragPayload, isOverdue, setDragPayload } from '../utils'

interface Props {
  task: Task
  projects: Project[]
  folders: Folder[]
  showPath?: boolean
  batchMode: boolean
  selected: boolean
  onOpen: (id: string) => void
  onToggleSelect: (id: string) => void
  onDropTask?: (sourceId: string, targetId: string) => void
}

export default function TaskRow(props: Props) {
  const [dragOver, setDragOver] = useState(false)
  const { task } = props
  const project = props.projects.find((p) => p.id === task.projectId)
  const folder = props.folders.find((f) => f.id === task.folderId)
  const overdue = isOverdue(task)

  const drop = (event: ReactDragEvent) => {
    event.preventDefault()
    setDragOver(false)
    const payload = getDragPayload()
    setDragPayload(null)
    if (payload?.type === 'task' && payload.id !== task.id) {
      props.onDropTask?.(payload.id, task.id)
    }
  }

  return (
    <div
      className={'trow' + (task.status === 'done' ? ' done' : '') + (dragOver ? ' drag-over' : '')}
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
        if ((e.target as HTMLElement).closest('.chk')) return
        props.onOpen(task.id)
      }}
    >
      <div className={'pri ' + (task.priority || '')} title={'优先级：' + PRIORITY_LABEL[task.priority || '']} />
      <div className="tbody">
        <div className="ttitle">{task.title}</div>
        <div className="tmeta">
          <span>{STATUS[task.status]}</span>
          {task.planDate ? <span>计划 {task.planDate}</span> : <span style={{ color: 'var(--sub2)' }}>未排期</span>}
          {task.dueDate && (
            <span className={overdue ? 'overdue' : ''}>
              截止 {task.dueDate}
              {overdue ? ' ⚠' : ''}
            </span>
          )}
          {task.start && (
            <span>
              {task.start}
              {task.end ? '–' + task.end : ''}
            </span>
          )}
          {props.showPath && (
            <span className="path">
              {project?.name || '未归类'}
              {folder ? ' / ' + folder.name : ''}
            </span>
          )}
        </div>
      </div>
      <div className="tright">
        <span className={'sdot ' + task.status} title={STATUS[task.status]}>
          {task.status === 'done' ? '✓' : ''}
        </span>
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
