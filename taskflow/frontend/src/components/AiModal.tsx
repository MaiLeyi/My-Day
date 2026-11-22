import { useState } from 'react'
import type { AiCandidate, AiContext, Folder, Project } from '../types'
import { PRIORITY_OPTIONS } from '../utils'
import { api } from '../api'
import DateField from './DateField'
import Modal from './Modal'

interface Props {
  ctx: AiContext
  projects: Project[]
  folders: Folder[]
  onClose: () => void
  onCreated: (message: string) => void
  onToast: (message: string) => void
}

export default function AiModal(props: Props) {
  const [desc, setDesc] = useState('')
  const [stage, setStage] = useState(props.ctx.projectSplit)
  const [candidates, setCandidates] = useState<AiCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const targetProject = props.projects.find((p) => p.id === props.ctx.projectId)
  const targetFolder = props.folders.find((f) => f.id === props.ctx.folderId)
  const target = targetProject
    ? `项目「${targetProject.name}」${targetFolder ? ' / 分组「' + targetFolder.name + '」' : ''}`
    : '未指定（拆到第一个项目）'

  const generate = async () => {
    if (!desc.trim()) {
      props.onToast('先输入目标或任务描述')
      return
    }
    setLoading(true)
    try {
      const result = await api.aiSplit({
        desc: desc.trim(),
        projectId: props.ctx.projectId,
        folderId: props.ctx.folderId,
        projectSplit: stage && props.ctx.projectSplit,
      })
      setCandidates(result.candidates.map((c) => ({ ...c, checked: true })))
      props.onToast(`已生成 ${result.candidates.length} 条候选，可编辑/勾选`)
    } catch (err) {
      props.onToast((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const patch = (index: number, changes: Partial<AiCandidate>) =>
    setCandidates((prev) => prev.map((c, i) => (i === index ? { ...c, ...changes } : c)))

  const confirm = async () => {
    const picked = candidates.filter((c) => c.checked && c.title.trim())
    if (!picked.length) {
      props.onToast('没有可录入的候选')
      return
    }
    setSaving(true)
    try {
      const projectId = props.ctx.projectId || props.projects[0]?.id || ''
      for (const c of picked) {
        let folderId = props.ctx.folderId
        if (stage && props.ctx.projectSplit) {
          const folder = await api.createFolder(projectId, c.title.slice(0, 12))
          folderId = folder.id
        }
        await api.createTask({
          title: c.title.trim(),
          projectId,
          folderId,
          status: 'todo',
          priority: c.priority,
          planDate: c.planDate,
          dueDate: '',
          start: '',
          end: '',
          desc: 'AI 拆分生成',
          remark: '',
          images: [],
          attachments: [],
          needReview: false,
        })
      }
      props.onCreated(`已录入 ${picked.length} 条`)
      props.onClose()
    } catch (err) {
      props.onToast((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal size="lg" onClose={props.onClose}>
          <div className="ai-head">
            <h3>✂ AI 拆分</h3>
            <button className="d-close" onClick={props.onClose}>
              ×
            </button>
          </div>
          <div className="ai-target">目标位置：{target}</div>
          <div className="ai-body">
            <textarea
              value={desc}
              placeholder="描述目标或任务，例如：两周内上线个人网站，依次完成需求梳理、页面设计、前后端开发、测试部署。"
              onChange={(e) => setDesc(e.target.value)}
            />
            <div className="ai-opts">
              <label>
                <input
                  type="checkbox"
                  checked={stage}
                  disabled={!props.ctx.projectSplit}
                  onChange={(e) => setStage(e.target.checked)}
                />{' '}
                按阶段生成分组（拆分项目时）
              </label>
            </div>
            <button className="btn btn-ghost" onClick={generate} disabled={loading}>
              {loading ? '生成中…' : '生成拆分候选'}
            </button>
            <div className="ai-list">
              {candidates.length === 0 && <div className="ai-empty">生成后候选列在此，确认勾选再录入</div>}
              {candidates.map((c, i) => (
                <div className="ai-item" key={i}>
                  <input
                    type="checkbox"
                    checked={c.checked}
                    onChange={(e) => patch(i, { checked: e.target.checked })}
                  />
                  <input type="text" value={c.title} onChange={(e) => patch(i, { title: e.target.value })} />
                  <select
                    value={c.priority}
                    onChange={(e) => patch(i, { priority: e.target.value as AiCandidate['priority'] })}
                  >
                    {PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.value ? o.label : '优先级'}
                      </option>
                    ))}
                  </select>
                  <DateField
                    value={c.planDate}
                    compact
                    clearable
                    placeholder="计划日"
                    onChange={(value) => patch(i, { planDate: value })}
                  />
                  <button
                    className="rm"
                    onClick={() => setCandidates((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="ai-foot">
            <button className="btn btn-ghost" onClick={props.onClose}>
              取消
            </button>
            <button className="btn btn-pri" onClick={confirm} disabled={saving}>
              确认录入 {candidates.filter((c) => c.checked && c.title.trim()).length} 条
            </button>
          </div>
    </Modal>
  )
}
