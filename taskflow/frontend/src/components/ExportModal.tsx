import { useMemo, useState } from 'react'
import type { Folder, Project, Scope, StatusFilter, Task } from '../types'
import { download, today } from '../utils'
import { api } from '../api'
import Modal from './Modal'

interface Props {
  tasks: Task[]
  projects: Project[]
  folders: Folder[]
  scope: Scope | null
  query: string
  dateFilter: string
  statusFilter: StatusFilter
  selected: Set<string>
  onClose: () => void
  onToast: (message: string) => void
}

const EXP_STATUS: Record<string, string> = {
  todo: '未处理',
  done: '已处理',
  unplanned: '未排期',
}

export default function ExportModal(props: Props) {
  const initialStatuses = () => {
    if (props.statusFilter === 'unplanned') return new Set(['unplanned'])
    if (['todo', 'done'].includes(props.statusFilter)) return new Set([props.statusFilter])
    return new Set(['todo', 'done', 'unplanned'])
  }
  const [statuses, setStatuses] = useState<Set<string>>(initialStatuses)
  const [format, setFormat] = useState<'json' | 'csv'>('json')
  const [picked, setPicked] = useState<Set<string> | null>(null)

  const selectedTaskIds = useMemo(() => {
    const projectIds = new Set([...props.selected].filter((k) => k.startsWith('p:')).map((k) => k.slice(2)))
    const folderIds = new Set([...props.selected].filter((k) => k.startsWith('f:')).map((k) => k.slice(2)))
    const taskIds = new Set([...props.selected].filter((k) => k.startsWith('t:')).map((k) => k.slice(2)))
    return new Set(
      props.tasks
        .filter((t) => projectIds.has(t.projectId) || folderIds.has(t.folderId) || taskIds.has(t.id))
        .map((t) => t.id),
    )
  }, [props.tasks, props.selected])

  const candidates = useMemo(() => {
    const q = props.query.trim().toLowerCase()
    return props.tasks.filter((t) => {
      const project = props.projects.find((p) => p.id === t.projectId)
      if (project?.archived) return false
      const key = t.status === 'done' ? 'done' : 'todo'
      const unplanned = !t.planDate && !t.dueDate
      if (!(statuses.has(key) || (unplanned && statuses.has('unplanned')))) return false
      if (props.scope) {
        const inScope =
          props.scope.type === 'project'
            ? t.projectId === props.scope.id
            : t.folderId === props.scope.id
        if (!inScope) return false
      }
      if (props.dateFilter && !(t.planDate === props.dateFilter || t.dueDate === props.dateFilter)) return false
      if (q && !t.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [props.tasks, props.projects, props.scope, props.query, props.dateFilter, statuses])

  const checked = useMemo(() => {
    if (picked) return new Set([...picked].filter((id) => candidates.some((t) => t.id === id)))
    const base = props.selected.size
      ? candidates.filter((t) => selectedTaskIds.has(t.id)).map((t) => t.id)
      : candidates.map((t) => t.id)
    return new Set(base)
  }, [picked, candidates, props.selected, selectedTaskIds])

  const toggleStatus = (key: string, on: boolean) => {
    const next = new Set(statuses)
    if (on) next.add(key)
    else next.delete(key)
    setStatuses(next)
    setPicked(null)
  }

  const toggleItem = (id: string) => {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  const allChecked = candidates.length > 0 && checked.size === candidates.length

  const doExport = async () => {
    const ids = candidates.filter((t) => checked.has(t.id)).map((t) => t.id)
    if (!ids.length) {
      props.onToast('先勾选要导出的事项')
      return
    }
    try {
      const blob = await api.exportTasks(ids, format)
      download(blob, `事项导出_${today()}.${format === 'csv' ? 'csv' : 'json'}`)
      props.onToast(`已导出 ${ids.length} 条`)
      props.onClose()
    } catch (err) {
      props.onToast((err as Error).message)
    }
  }

  return (
    <Modal size="sm" onClose={props.onClose}>
      <div className="d-head">
        <h3>导出事项</h3>
        <button className="d-close" onClick={props.onClose}>
          ×
        </button>
      </div>
      <div className="exp-hint">
        导出状态：{[...statuses].map((s) => EXP_STATUS[s]).join('、')}（可勾选调整，再逐条增减）
      </div>
      <div className="exp-filters">
        {Object.entries(EXP_STATUS).map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={statuses.has(key)}
              onChange={(e) => toggleStatus(key, e.target.checked)}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="exp-bar">
        <label className="exp-all">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => setPicked(e.target.checked ? new Set(candidates.map((t) => t.id)) : new Set())}
          />
          全选
        </label>
        <select id="expFmt" value={format} onChange={(e) => setFormat(e.target.value as 'json' | 'csv')}>
          <option value="json">JSON</option>
          <option value="csv">Excel（CSV）</option>
        </select>
      </div>
      <div className="exp-list">
        {candidates.map((t) => {
          const project = props.projects.find((p) => p.id === t.projectId)
          const folder = props.folders.find((f) => f.id === t.folderId)
          return (
            <label className="exp-item" key={t.id}>
              <input type="checkbox" checked={checked.has(t.id)} onChange={() => toggleItem(t.id)} />
              <span style={{ flex: 1 }}>{t.title}</span>
              <span className="meta">
                {project?.name || ''}
                {folder ? ' · ' + folder.name : ''}
                {t.planDate ? ' · ' + t.planDate : ''}
              </span>
            </label>
          )
        })}
        {candidates.length === 0 && <div className="ai-empty">当前筛选下没有可导出的事项</div>}
      </div>
      <div className="d-foot">
        <button className="btn btn-ghost" onClick={props.onClose}>
          取消
        </button>
        <button className="btn btn-pri" onClick={doExport}>
          导出 {checked.size} 条
        </button>
      </div>
    </Modal>
  )
}
