import { useState } from 'react'
import type { Folder, Project, Task } from '../types'
import { PRIORITY_RANK, byDate } from '../utils'
import TaskRow from './TaskRow'

interface Props {
  tasks: Task[]
  projects: Project[]
  folders: Folder[]
  prioritySort: boolean
  batchMode: boolean
  selected: Set<string>
  onOpen: (id: string) => void
  onToggleSelect: (id: string) => void
  onDropTask: (sourceId: string, targetId: string) => void
  onSchedule: (taskId: string, iso: string, start?: string, end?: string) => void
  onEdit: (id: string) => void
  onToggleStatus: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onToggleReview: (task: Task) => void
  isLeaving?: (id: string) => boolean
}

export default function ListView(props: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const sortTasks = (list: Task[]) =>
    list.slice().sort((a, b) => {
      if (props.prioritySort) {
        const diff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        if (diff !== 0) return diff
      }
      return byDate(a, b)
    })

  const rows = (list: Task[], showPath = false) => (
    <div className="task-grid">
      {sortTasks(list).map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          projects={props.projects}
          folders={props.folders}
          showPath={showPath}
          batchMode={props.batchMode}
          selected={props.selected.has('t:' + t.id)}
          onOpen={props.onOpen}
          onToggleSelect={props.onToggleSelect}
          onDropTask={props.onDropTask}
          onSchedule={props.onSchedule}
          onEdit={props.onEdit}
          onToggleStatus={props.onToggleStatus}
          onDeleteTask={props.onDeleteTask}
          onToggleReview={props.onToggleReview}
          leaving={props.isLeaving?.(t.id)}
        />
      ))}
    </div>
  )

  if (!props.tasks.length) {
    return (
      <div className="listview">
        <div className="empty">
          没有符合条件的事项
          <br />
          <span style={{ fontSize: 12.5 }}>可调整上方筛选，或到日历 / 本周点选日期安排新事项</span>
        </div>
      </div>
    )
  }

  const byProject = new Map<string, Task[]>()
  props.tasks.forEach((t) => {
    const list = byProject.get(t.projectId) || []
    list.push(t)
    byProject.set(t.projectId, list)
  })

  return (
    <div className="listview">
      {[...byProject.entries()].map(([pid, list]) => {
        const project = props.projects.find((p) => p.id === pid)
        const isOpen = !collapsed.has(pid)
        const byFolder = new Map<string, Task[]>()
        const loose: Task[] = []
        list.forEach((t) => {
          if (!t.folderId) {
            loose.push(t)
            return
          }
          const arr = byFolder.get(t.folderId) || []
          arr.push(t)
          byFolder.set(t.folderId, arr)
        })
        return (
          <div key={pid} className={'grp' + (isOpen ? ' open' : '')}>
            <div className="grp-head" onClick={() => toggle(pid)}>
              <span className="caret">▶</span>
              <span className={'grp-icon shade-' + (project?.shade ?? 0)}>
                {(project?.name || '未').charAt(0)}
              </span>
              <span className="grp-name">{project?.name || '未归类'}</span>
              <span className="grp-count">{list.length}</span>
            </div>
            {isOpen && (
              <div className="grp-body">
                {[...byFolder.entries()].map(([fid, folderTasks]) => {
                  const folder = props.folders.find((f) => f.id === fid)
                  return (
                    <div key={fid}>
                      <div className="sub-group-title">{folder?.name || '未分组'}</div>
                      {rows(folderTasks)}
                    </div>
                  )
                })}
                {rows(loose)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
