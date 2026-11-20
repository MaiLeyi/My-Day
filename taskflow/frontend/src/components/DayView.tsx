import type { Folder, Project, Task } from '../types'
import { parseDate } from '../utils'
import TaskRow from './TaskRow'

interface Props {
  date: string
  tasks: Task[]
  projects: Project[]
  folders: Folder[]
  batchMode: boolean
  selected: Set<string>
  onDateChange: (iso: string) => void
  onAdd: () => void
  onOpen: (id: string) => void
  onToggleSelect: (id: string) => void
  onDropTask: (sourceId: string, targetId: string) => void
}

export default function DayView(props: Props) {
  const d = parseDate(props.date)
  const weekday = '日一二三四五六'[d.getDay()]
  const items = props.tasks
    .filter((t) => t.planDate === props.date || (t.dueDate === props.date && t.planDate !== props.date))
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))

  return (
    <div className="dayview">
      <div className="day-bar">
        <input
          type="date"
          className="date-filter"
          value={props.date}
          onChange={(e) => props.onDateChange(e.target.value || props.date)}
        />
        <span className="day-wk">周{weekday}</span>
        <span className="day-count">{items.length} 项安排</span>
        <button className="btn btn-ghost day-add-btn" onClick={props.onAdd}>
          ＋ 新增
        </button>
      </div>
      {items.length === 0 ? (
        <div className="empty">这一天没有安排，点右上角「＋新增」安排一项</div>
      ) : (
        items.map((t) => (
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
        ))
      )}
    </div>
  )
}
