import type { Folder, Project, Task } from '../types'
import { PRIORITY_RANK, byDate } from '../utils'
import TaskRow from './TaskRow'

interface Props {
  tasks: Task[]
  projects: Project[]
  folders: Folder[]
  flat: boolean
  scopeActive: boolean
  prioritySort: boolean
  batchMode: boolean
  selected: Set<string>
  onOpen: (id: string) => void
  onToggleSelect: (id: string) => void
  onDropTask: (sourceId: string, targetId: string) => void
  onSchedule: (taskId: string, iso: string) => void
  onEdit: (id: string) => void
  onToggleStatus: (task: Task) => void
  onDeleteTask: (task: Task) => void
}

export default function ListView(props: Props) {
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

  if (!props.scopeActive && props.flat) {
    return <div className="listview">{rows(props.tasks, true)}</div>
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
          <div key={pid}>
            <div className="group-title">
              <span className="dot" style={{ background: 'var(--gray3)' }} />
              {project?.name || '未归类'}
            </div>
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
        )
      })}
    </div>
  )
}
