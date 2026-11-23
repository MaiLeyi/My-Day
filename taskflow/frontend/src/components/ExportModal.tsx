import { useMemo, useState } from 'react'
import type { Folder, Project, Task } from '../types'
import { download, projectColor, today } from '../utils'
import { api } from '../api'
import Modal from './Modal'

interface Props {
  tasks: Task[]
  projects: Project[]
  folders: Folder[]
  onClose: () => void
  onToast: (message: string) => void
}

const UNASSIGNED = ''

export default function ExportModal(props: Props) {
  const projectIds = useMemo(() => {
    const ids = props.projects.map((p) => p.id)
    if (props.tasks.some((t) => !t.projectId)) ids.push(UNASSIGNED)
    return ids
  }, [props.projects, props.tasks])

  const [pickedProjects, setPickedProjects] = useState<Set<string>>(() => new Set(projectIds))
  const [format, setFormat] = useState<'json' | 'csv'>('json')
  const [picked, setPicked] = useState<Set<string> | null>(null)

  const candidates = useMemo(
    () => props.tasks.filter((t) => pickedProjects.has(t.projectId)),
    [props.tasks, pickedProjects],
  )

  const checked = useMemo(() => {
    if (picked) return new Set([...picked].filter((id) => candidates.some((t) => t.id === id)))
    return new Set(candidates.map((t) => t.id))
  }, [picked, candidates])

  const toggleProject = (id: string, on: boolean) => {
    const next = new Set(pickedProjects)
    if (on) next.add(id)
    else next.delete(id)
    setPickedProjects(next)
    setPicked(null)
  }

  const toggleItem = (id: string) => {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  const allChecked = candidates.length > 0 && checked.size === candidates.length
  const allProjects = projectIds.length > 0 && pickedProjects.size === projectIds.length

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
      <div className="exp-hint">默认导出全部事项，可按项目多选缩小范围。</div>
      <div className="exp-projects">
        <label className="exp-proj">
          <input
            type="checkbox"
            checked={allProjects}
            onChange={(e) => {
              setPickedProjects(e.target.checked ? new Set(projectIds) : new Set())
              setPicked(null)
            }}
          />
          <span>全部项目</span>
        </label>
        {props.projects.map((p) => (
          <label className="exp-proj" key={p.id}>
            <input
              type="checkbox"
              checked={pickedProjects.has(p.id)}
              onChange={(e) => toggleProject(p.id, e.target.checked)}
            />
            <i className="exp-dot" style={{ background: projectColor(p.shade) }} />
            <span>{p.name}</span>
          </label>
        ))}
        {projectIds.includes(UNASSIGNED) && (
          <label className="exp-proj">
            <input
              type="checkbox"
              checked={pickedProjects.has(UNASSIGNED)}
              onChange={(e) => toggleProject(UNASSIGNED, e.target.checked)}
            />
            <span>未分组</span>
          </label>
        )}
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
                {project?.name || '未分组'}
                {folder ? ' · ' + folder.name : ''}
                {t.planDate ? ' · ' + t.planDate : ''}
              </span>
            </label>
          )
        })}
        {candidates.length === 0 && <div className="ai-empty">当前选择下没有可导出的事项</div>}
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
