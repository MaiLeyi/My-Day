import { useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Attachment, Folder, Project, Status, Task, TaskDraft, TaskInput } from '../types'
import { PRIORITY_LABEL, PRIORITY_OPTIONS, STATUS, isOverdue } from '../utils'
import { api } from '../api'
import type { AskConfirm } from './ConfirmDialog'
import DateField from './DateField'
import Lightbox from './Lightbox'
import Modal from './Modal'

interface Props {
  task: Task | null
  mode: 'view' | 'edit'
  draft?: TaskDraft
  projects: Project[]
  folders: Folder[]
  onClose: () => void
  onChanged: (message?: string) => void
  onSaved?: (task: Task) => void
  onToast: (message: string) => void
  onMove: (taskId: string) => void
  onConfirm: AskConfirm
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

function formatSize(size: number): string {
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export default function DetailModal(props: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>(props.mode)
  const [draft, setDraft] = useState<TaskDraft>(() => props.draft || emptyDraft(props.task, props.projects))
  const [editing, setEditing] = useState<{ field: ViewField; value: string } | null>(null)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [remarkOpen, setRemarkOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'' | 'image' | 'file'>('')
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [errors, setErrors] = useState<{ title?: string; time?: string }>({})
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

  const removeTask = () => {
    if (!task) return
    props.onConfirm({
      title: `删除事项「${task.title}」？`,
      message: '事项及其上传的图片、附件都会被删除，无法恢复。',
      confirmText: '删除事项',
      danger: true,
      action: async () => {
        await api.deleteTask(task.id)
        props.onChanged('已删除')
        close()
      },
    })
  }

  const startEdit = () => {
    if (!task) return
    setDraft(emptyDraft(task, props.projects))
    setErrors({})
    setMediaOpen(!!(task.images.length || task.attachments.length))
    setRemarkOpen(!!task.remark)
    setDetailsOpen(true)
    setMode('edit')
  }

  const validate = (): boolean => {
    const next: { title?: string; time?: string } = {}
    if (!draft.title.trim()) next.title = '请填写事项标题'
    const hasStart = !!draft.start
    const hasEnd = !!draft.end
    if (hasStart !== hasEnd) {
      next.time = '开始和结束时间需要同时填写'
    } else if (hasStart && hasEnd && draft.start >= draft.end) {
      next.time = '结束时间需要晚于开始时间'
    } else if ((hasStart || hasEnd) && !draft.planDate) {
      next.time = '填写了时间，请同时选择计划日'
    }
    setErrors(next)
    if (next.title) {
      props.onToast(next.title)
      return false
    }
    if (next.time) {
      props.onToast(next.time)
      return false
    }
    return true
  }

  const save = async () => {
    if (saving || uploading) return
    if (!validate()) return
    setSaving(true)
    const payload: TaskInput = {
      title: draft.title.trim(),
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
      const saved = draft.id ? await api.updateTask(draft.id, payload) : await api.createTask(payload)
      props.onChanged('已保存')
      props.onSaved?.(saved)
      close()
    } catch (err) {
      props.onToast((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const onImages = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading('image')
    try {
      const urls: string[] = []
      for (const file of [...files]) {
        if (!file.type.startsWith('image/')) {
          props.onToast(`${file.name} 不是图片，已跳过`)
          continue
        }
        const uploaded = await api.uploadFile(file)
        urls.push(uploaded.url)
      }
      if (urls.length) setDraft((prev) => ({ ...prev, images: [...prev.images, ...urls] }))
    } catch (err) {
      props.onToast((err as Error).message)
    } finally {
      setUploading('')
    }
  }

  const onAttachments = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading('file')
    try {
      const list: Attachment[] = []
      for (const file of [...files]) {
        const uploaded = await api.uploadFile(file)
        list.push({
          name: uploaded.name,
          size: uploaded.size,
          fileId: uploaded.id,
          url: uploaded.url,
          mime: uploaded.mime,
        })
      }
      if (list.length) setDraft((prev) => ({ ...prev, attachments: [...prev.attachments, ...list] }))
    } catch (err) {
      props.onToast((err as Error).message)
    } finally {
      setUploading('')
    }
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
      <Modal size="md" onClose={close}>
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
              {(['todo', 'done'] as Status[]).map((st) => (
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
              <>
                <div className="img-grid">
                  {task.images.map((img, i) => (
                    <img
                      key={i}
                      className="thumb"
                      src={img}
                      alt={`图片 ${i + 1}`}
                      title="点击查看大图"
                      onClick={() => setLightbox(i)}
                    />
                  ))}
                </div>
                <div className="img-hint">点击图片查看大图，支持左右切换</div>
              </>
            )}
            {task.attachments.map((att, i) =>
              att.url ? (
                <a
                  className="att att-link"
                  key={i}
                  href={att.url}
                  download={att.name}
                  title={'下载 ' + att.name}
                >
                  <span>📎</span>
                  <span className="an">{att.name}</span>
                  <span className="asz">{formatSize(att.size)}</span>
                  <span className="adl">下载</span>
                </a>
              ) : (
                <div className="att" key={i} title="旧版本只保存了文件名，原文件未保存">
                  <span>📎</span>
                  <span className="an">{att.name}</span>
                  <span className="asz">文件未存储</span>
                </div>
              ),
            )}
            <div className="sec-label">排期与归属</div>
            <div className="d-badges">
              <span
                className={'badge editable' + (task.planDate ? '' : ' muted')}
                onClick={() => setEditing({ field: 'planDate', value: task.planDate })}
              >
                {task.planDate ? '计划 ' + task.planDate : '计划日期'}
              </span>
              <span
                className={'badge editable' + (task.dueDate ? '' : ' muted')}
                onClick={() => setEditing({ field: 'dueDate', value: task.dueDate })}
              >
                {task.dueDate ? '截止 ' + task.dueDate + (overdue ? ' ⚠ 逾期' : '') : '截止日期'}
              </span>
              <span
                className={'badge editable' + (task.start ? '' : ' muted')}
                onClick={() => setEditing({ field: 'start', value: task.start })}
              >
                {task.start ? '开始 ' + task.start : '开始时间'}
              </span>
              <span
                className={'badge editable' + (task.end ? '' : ' muted')}
                onClick={() => setEditing({ field: 'end', value: task.end })}
              >
                {task.end ? '结束 ' + task.end : '结束时间'}
              </span>
              <span className="badge editable" onClick={() => props.onMove(task.id)}>
                {project?.name || '未归类'}
                {folder ? ' · ' + folder.name : ''}
              </span>
            </div>
            {editing && (editing.field === 'planDate' || editing.field === 'dueDate') && (
              <div style={{ marginTop: 8 }}>
                <DateField
                  value={editing.value}
                  clearable
                  onChange={(value) => {
                    const field = editing.field
                    setEditing(null)
                    commitInline(field, value)
                  }}
                />
              </div>
            )}
            {editing && (editing.field === 'start' || editing.field === 'end') && (
              <div style={{ marginTop: 8 }}>{inlineInput(editing.field, 'time')}</div>
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
              <label>
                事项标题 <span className="req">*</span>
              </label>
              <input
                autoFocus
                className={errors.title ? 'invalid' : ''}
                value={draft.title}
                placeholder="给事项起个标题"
                onChange={(e) => {
                  patchDraft({ title: e.target.value })
                  if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }))
                }}
              />
              {errors.title && <div className="field-error">{errors.title}</div>}
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
                  <button className="add-chip" onClick={() => imgRef.current?.click()} disabled={!!uploading}>
                    {uploading === 'image' ? '图片上传中…' : '＋ 添加图片'}
                  </button>
                  <button className="add-chip" onClick={() => attRef.current?.click()} disabled={!!uploading}>
                    {uploading === 'file' ? '附件上传中…' : '＋ 添加附件'}
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
                    <div key={i} className="thumb-wrap">
                      <img className="thumb" src={img} alt="待保存图片" onClick={() => setLightbox(i)} />
                      <button
                        className="mini-x img-x"
                        title="移除图片"
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
                    <span className="asz">{formatSize(att.size)}</span>
                    <button
                      className="mini-x"
                      title="移除附件"
                      onClick={() => patchDraft({ attachments: draft.attachments.filter((_, idx) => idx !== i) })}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="img-hint">图片和附件会保存到本地数据目录，删除事项时一并清理。</div>
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
            <div className="ed-field">
              <label>安排日期与时间（时间填写后会进入日程时间轴）</label>
              <DateField
                value={draft.planDate}
                clearable
                placeholder="选择计划日"
                onChange={(value) => {
                  patchDraft({ planDate: value })
                  if (errors.time) setErrors((prev) => ({ ...prev, time: undefined }))
                }}
              />
            </div>
            <div className="ed-grid">
              <div className="ed-field">
                <label>开始</label>
                <input
                  type="time"
                  value={draft.start}
                  onChange={(e) => {
                    patchDraft({ start: e.target.value })
                    if (errors.time) setErrors((prev) => ({ ...prev, time: undefined }))
                  }}
                />
              </div>
              <div className="ed-field">
                <label>结束</label>
                <input
                  type="time"
                  value={draft.end}
                  onChange={(e) => {
                    patchDraft({ end: e.target.value })
                    if (errors.time) setErrors((prev) => ({ ...prev, time: undefined }))
                  }}
                />
              </div>
            </div>
            {errors.time && <div className="field-error">{errors.time}</div>}
            <details
              className="ed-field"
              style={{ marginTop: 6 }}
              open={detailsOpen}
              onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
            >
              <summary className="link-btn">更多属性（可选）</summary>
              <div className="ed-grid" style={{ marginTop: 8 }}>
                <div className="ed-field">
                  <label>状态</label>
                  <select
                    value={draft.status}
                    onChange={(e) => patchDraft({ status: e.target.value as Status })}
                  >
                    <option value="todo">未处理</option>
                    <option value="done">已处理</option>
                  </select>
                </div>
                <div className="ed-field">
                  <label>优先级</label>
                  <select
                    value={draft.priority}
                    onChange={(e) => patchDraft({ priority: e.target.value as Task['priority'] })}
                  >
                    {PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ed-field">
                  <label>截止日</label>
                  <DateField
                    value={draft.dueDate}
                    clearable
                    placeholder="选择截止日"
                    onChange={(value) => patchDraft({ dueDate: value })}
                  />
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
              <button className="btn btn-pri" onClick={save} disabled={saving || !!uploading}>
                {saving ? '保存中…' : uploading ? '上传中…' : '保存'}
              </button>
            </div>
          </>
        )}
      </Modal>
      {lightbox !== null && (
        <Lightbox
          images={mode === 'view' && task ? task.images : draft.images}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  )
}
