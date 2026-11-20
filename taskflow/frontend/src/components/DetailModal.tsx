import { useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Attachment, Folder, Project, Status, Task, TaskDraft, TaskInput } from '../types'
import { PRIORITY_LABEL, PRIORITY_OPTIONS, STATUS, isOverdue } from '../utils'
import { api } from '../api'

interface Props {
  task: Task | null
  mode: 'view' | 'edit'
  draft?: TaskDraft
  projects: Project[]
  folders: Folder[]
  onClose: () => void
  onChanged: (message?: string) => void
  onToast: (message: string) => void
  onMove: (taskId: string) => void
}

type ViewField = 'title' | 'desc' | 'planDate' | 'dueDate' | 'start' | 'end'

const emptyDraft = (task: Task | null, projects: Project[]): TaskDraft => ({
  id: task?.id,
  title: task?.title || '',
  projectId: task?.projectId || projects[0]?.id || '',
  folderId: task?.folderId || '',
  status: task?.status || 'todo',
  priority: task?.priority || '',
  planDate: task?.planDate || '',
  dueDate: task?.dueDate || '',
  start: task?.start || '',
  end: task?.end || '',
  desc: task?.desc || '',
  remark: task?.remark || '',
  images: [...(task?.images || [])],
  attachments: [...(task?.attachments || [])],
})

function readFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

export default function DetailModal(props: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>(props.mode)
  const [draft, setDraft] = useState<TaskDraft>(() => props.draft || emptyDraft(props.task, props.projects))
  const [editing, setEditing] = useState<{ field: ViewField; value: string } | null>(null)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [remarkOpen, setRemarkOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(props.mode === 'edit' && !!props.draft?.planDate)
  const [saving, setSaving] = useState(false)
  const imgRef = useRef<HTMLInputElement>(null)
  const attRef = useRef<HTMLInputElement>(null)

  const task = props.task
  const project = props.projects.find((p) => p.id === (task?.projectId ?? draft.projectId))
  const folder = props.folders.find((f) => f.id === (task?.folderId ?? draft.folderId))
  const overdue = task ? isOverdue(task) : false

  const patchDraft = (patch: Partial<TaskDraft>) => setDraft((prev) => ({ ...prev, ...patch }))

  const close = () => props.onClose()

  const commitInline = async (field: ViewField, value: string) => {
    setEditing(null)
    if (!task) return
    const current = field === 'desc' ? task.desc : field === 'title' ? task.title : task[field]
    if (value === current) return
    try {
      await api.updateTask(task.id, { [field]: value } as Partial<TaskInput>)
      props.onChanged(field === 'title' ? '已保存标题' : '已保存')
    } catch (err) {
      props.onToast((err as Error).message)
    }
  }

  const changeStatus = async (status: Status) => {
    if (!task || task.status === status) return
    try {
      await api.updateTask(task.id, { status })
      props.onChanged('已标记为' + STATUS[status])
    } catch (err) {
      props.onToast((err as Error).message)
    }
  }

  const removeTask = async () => {
    if (!task) return
    if (!window.confirm(`删除事项「${task.title}」？此操作不可撤销。`)) return
    try {
      await api.deleteTask(task.id)
      props.onChanged('已删除')
      close()
    } catch (err) {
      props.onToast((err as Error).message)
    }
  }

  const startEdit = () => {
    if (!task) return
    setDraft(emptyDraft(task, props.projects))
    setMediaOpen(!!(task.images.length || task.attachments.length))
    setRemarkOpen(!!task.remark)
    setDetailsOpen(true)
    setMode('edit')
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    const payload: TaskInput = {
      title: draft.title.trim() || '未命名事项',
      projectId: draft.projectId,
      folderId: draft.folderId,
      status: draft.status,
      priority: draft.priority,
      planDate: draft.planDate,
      dueDate: draft.dueDate,
      start: draft.start,
      end: draft.end,
      desc: draft.desc,
      remark: draft.remark,
      images: draft.images,
      attachments: draft.attachments,
    }
    try {
      if (draft.id) await api.updateTask(draft.id, payload)
      else await api.createTask(payload)
      props.onChanged('已保存')
      close()
    } catch (err) {
      props.onToast((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const onImages = async (files: FileList | null) => {
    if (!files) return
    const results = await Promise.all([...files].map(readFile))
    patchDraft({ images: [...draft.images, ...results] })
  }

  const onAttachments = (files: FileList | null) => {
    if (!files) return
    const list: Attachment[] = [...files].map((f) => ({ name: f.name, size: f.size }))
    patchDraft({ attachments: [...draft.attachments, ...list] })
  }

  const inlineInput = (field: ViewField, type: 'text' | 'date' | 'time' | 'textarea') => {
    if (!editing) return null
    const className =
      'inline-input' + (field === 'desc' ? ' desc-edit' : field === 'title' ? ' title-edit' : '')
    const handleKey = (e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && field !== 'desc') {
        e.preventDefault()
        commitInline(field, editing.value)
      }
      if (e.key === 'Escape') setEditing(null)
    }
    if (type === 'textarea') {
      return (
        <textarea
          className={className}
          value={editing.value}
          autoFocus
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEditing({ field, value: e.target.value })}
          onBlur={() => commitInline(field, editing.value)}
          onKeyDown={handleKey}
        />
      )
    }
    return (
      <input
        type={type}
        className={className}
        value={editing.value}
        autoFocus
        onChange={(e: ChangeEvent<HTMLInputElement>) => setEditing({ field, value: e.target.value })}
        onBlur={() => commitInline(field, editing.value)}
        onKeyDown={handleKey}
      />
    )
  }

  const foldersOfDraftProject = props.folders.filter((f) => f.projectId === draft.projectId)

  return (
    <>
      <div className="mask" onClick={close} />
      <div className="modal">
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          {mode === 'view' && task ? (
            <>
              <div className="d-head">
                <h3>事项详情</h3>
                <button className="d-close" onClick={close}>
                  ×
                </button>
              </div>
              {editing?.field === 'title' ? (
                inlineInput('title', 'text')
              ) : (
                <div
                  className="d-title-view"
                  title="点击编辑标题"
                  onClick={() => setEditing({ field: 'title', value: task.title })}
                >
                  {task.title}
                </div>
              )}
              <div className="status-seg">
                {(['todo', 'doing', 'done'] as Status[]).map((st) => (
                  <button
                    key={st}
                    className={task.status === st ? 'active' : ''}
                    onClick={() => changeStatus(st)}
                  >
                    {STATUS[st]}
                  </button>
                ))}
              </div>
              <div className="d-badges">
                {task.priority && <span className="badge">优先级·{PRIORITY_LABEL[task.priority]}</span>}
                {overdue && <span className="badge b-ink">已逾期</span>}
              </div>
              <div className="sec-label">描述</div>
              {editing?.field === 'desc' ? (
                inlineInput('desc', 'textarea')
              ) : task.desc ? (
                <div
                  className="desc-view"
                  title="点击编辑描述"
                  onClick={() => setEditing({ field: 'desc', value: task.desc })}
                >
                  {task.desc}
                </div>
              ) : (
                <div className="desc-empty" onClick={() => setEditing({ field: 'desc', value: '' })}>
                  暂无描述，点击补充
                </div>
              )}
              {task.images.length > 0 && (
                <div className="img-grid">
                  {task.images.map((img, i) => (
                    <img key={i} className="thumb" src={img} alt="附件图片" />
                  ))}
                </div>
              )}
              {task.attachments.map((att, i) => (
                <div className="att" key={i}>
                  <span>📎</span>
                  <span className="an">{att.name}</span>
                </div>
              ))}
              <div className="sec-label">排期与归属</div>
              <div className="d-badges">
                <span
                  className="badge editable"
                  onClick={() => setEditing({ field: 'planDate', value: task.planDate })}
                >
                  {task.planDate ? '计划 ' + task.planDate : '计划日期'}
                </span>
                <span
                  className="badge editable"
                  onClick={() => setEditing({ field: 'dueDate', value: task.dueDate })}
                >
                  {task.dueDate ? '截止 ' + task.dueDate + (overdue ? ' ⚠ 逾期' : '') : '截止日期'}
                </span>
                <span className="badge editable" onClick={() => setEditing({ field: 'start', value: task.start })}>
                  {task.start ? '开始 ' + task.start : '开始时间'}
                </span>
                <span className="badge editable" onClick={() => setEditing({ field: 'end', value: task.end })}>
                  {task.end ? '结束 ' + task.end : '结束时间'}
                </span>
                <span className="badge editable" onClick={() => props.onMove(task.id)}>
                  {project?.name || '未归类'}
                  {folder ? ' · ' + folder.name : ''}
                </span>
              </div>
              {editing &&
                (editing.field === 'planDate' || editing.field === 'dueDate' || editing.field === 'start' || editing.field === 'end') && (
                  <div style={{ marginTop: 8 }}>{inlineInput(editing.field, editing.field === 'start' || editing.field === 'end' ? 'time' : 'date')}</div>
                )}
              {task.remark && <div className="remark-box">{task.remark}</div>}
              <div className="meta-time">
                创建于 {task.createdAt || '—'}
                {task.completedAt ? ` · 完成于 ${task.completedAt}` : ''}
              </div>
              <div className="d-foot">
                <span style={{ flex: 1 }} />
                <button className="btn btn-danger" onClick={removeTask}>
                  删除
                </button>
                <button className="btn btn-pri" onClick={startEdit}>
                  编辑
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="d-head">
                <h3>{draft.id ? '编辑事项' : '新建事项'}</h3>
                <button className="d-close" onClick={close}>
                  ×
                </button>
              </div>
              {!draft.id && (
                <div className="place-hint">
                  将存入：{project?.name || '未归类'}
                  {folder ? ' · ' + folder.name : ''}（保存后可在详情移动）
                </div>
              )}
              <div className="ed-field">
                <label>事项标题</label>
                <input
                  autoFocus
                  value={draft.title}
                  placeholder="给事项起个标题"
                  onChange={(e) => patchDraft({ title: e.target.value })}
                />
              </div>
              <div className="ed-field">
                <label>事项描述（文字，可不填）</label>
                <textarea
                  value={draft.desc}
                  placeholder="写清楚要做什么、背景、链接……"
                  onChange={(e) => patchDraft({ desc: e.target.value })}
                />
              </div>
              <div className="ed-field">
                <button className="add-chip" onClick={() => setMediaOpen((v) => !v)}>
                  {draft.images.length || draft.attachments.length || mediaOpen
                    ? '收起图片 / 附件'
                    : '＋ 图片 / 附件（可选）'}
                </button>
              </div>
              {(draft.images.length > 0 || draft.attachments.length > 0 || mediaOpen) && (
                <div>
                  <div className="attach-row">
                    <button className="add-chip" onClick={() => imgRef.current?.click()}>
                      ＋ 添加图片
                    </button>
                    <button className="add-chip" onClick={() => attRef.current?.click()}>
                      ＋ 添加附件
                    </button>
                    <input
                      ref={imgRef}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => {
                        onImages(e.target.files)
                        e.target.value = ''
                      }}
                    />
                    <input
                      ref={attRef}
                      type="file"
                      hidden
                      onChange={(e) => {
                        onAttachments(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </div>
                  <div className="img-grid">
                    {draft.images.map((img, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img className="thumb" src={img} alt="待上传图片" />
                        <button
                          className="mini-x"
                          style={{ position: 'absolute', top: 2, right: 4, background: '#fff', borderRadius: '50%', padding: '0 5px', lineHeight: '16px' }}
                          onClick={() => patchDraft({ images: draft.images.filter((_, idx) => idx !== i) })}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  {draft.attachments.map((att, i) => (
                    <div className="att" key={i}>
                      <span>📎</span>
                      <span className="an">{att.name}</span>
                      <button
                        className="mini-x"
                        onClick={() => patchDraft({ attachments: draft.attachments.filter((_, idx) => idx !== i) })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="ed-field" style={{ marginTop: 10 }}>
                <button className="add-chip" onClick={() => setRemarkOpen((v) => !v)}>
                  {draft.remark || remarkOpen ? '收起备注' : '＋ 添加备注（可选，默认收起）'}
                </button>
              </div>
              {(draft.remark || remarkOpen) && (
                <div className="ed-field">
                  <textarea
                    value={draft.remark}
                    placeholder="备注：补充说明，仅自己可见"
                    onChange={(e) => patchDraft({ remark: e.target.value })}
                  />
                </div>
              )}
              <div className="ed-grid" style={{ marginTop: 10 }}>
                <div className="ed-field">
                  <label>开始</label>
                  <input type="time" value={draft.start} onChange={(e) => patchDraft({ start: e.target.value })} />
                </div>
                <div className="ed-field">
                  <label>结束</label>
                  <input type="time" value={draft.end} onChange={(e) => patchDraft({ end: e.target.value })} />
                </div>
              </div>
              <details
                className="ed-field"
                style={{ marginTop: 6 }}
                open={detailsOpen}
                onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
              >
                <summary className="link-btn">排期与属性（可选）</summary>
                <div className="ed-grid" style={{ marginTop: 8 }}>
                  <div className="ed-field">
                    <label>状态</label>
                    <select
                      value={draft.status}
                      onChange={(e) => patchDraft({ status: e.target.value as Status })}
                    >
                      <option value="todo">待办</option>
                      <option value="doing">进行中</option>
                      <option value="done">已完成</option>
                    </select>
                  </div>
                  <div className="ed-field">
                    <label>优先级</label>
                    <select value={draft.priority} onChange={(e) => patchDraft({ priority: e.target.value as Task['priority'] })}>
                      {PRIORITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ed-field">
                    <label>计划日</label>
                    <input type="date" value={draft.planDate} onChange={(e) => patchDraft({ planDate: e.target.value })} />
                  </div>
                  <div className="ed-field">
                    <label>截止日</label>
                    <input type="date" value={draft.dueDate} onChange={(e) => patchDraft({ dueDate: e.target.value })} />
                  </div>
                  <div className="ed-field">
                    <label>项目</label>
                    <select
                      value={draft.projectId}
                      onChange={(e) => patchDraft({ projectId: e.target.value, folderId: '' })}
                    >
                      {props.projects
                        .filter((p) => !p.archived)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      {draft.projectId === '' && <option value="">未归类</option>}
                    </select>
                  </div>
                  <div className="ed-field">
                    <label>分组</label>
                    <select value={draft.folderId} onChange={(e) => patchDraft({ folderId: e.target.value })}>
                      <option value="">未分组</option>
                      {foldersOfDraftProject.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </details>
              <div className="d-foot">
                <button className="btn btn-ghost" onClick={close}>
                  取消
                </button>
                <button className="btn btn-pri" onClick={save} disabled={saving}>
                  保存
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
