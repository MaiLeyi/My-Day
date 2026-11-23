import { useRef, useState } from 'react'
import type { Attachment, Folder, Project, Task, TaskDraft, TaskInput } from '../types'
import { api } from '../api'
import DateField from './DateField'
import Lightbox from './Lightbox'
import Modal from './Modal'
import Select from './Select'

interface Props {
  task: Task | null
  draft?: TaskDraft
  projects: Project[]
  folders: Folder[]
  onClose: () => void
  onChanged: (message?: string) => void
  onSaved?: (task: Task) => void
  onToast: (message: string) => void
}

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
  needReview: task?.needReview ?? false,
})

function formatSize(size: number): string {
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export default function DetailModal(props: Props) {
  const [draft, setDraft] = useState<TaskDraft>(() => props.draft || emptyDraft(props.task, props.projects))
  const [remarkOpen, setRemarkOpen] = useState(() => !!draft.remark)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'' | 'image' | 'file'>('')
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [errors, setErrors] = useState<{ title?: string; time?: string }>({})
  const imgRef = useRef<HTMLInputElement>(null)
  const attRef = useRef<HTMLInputElement>(null)

  const project = props.projects.find((p) => p.id === draft.projectId)
  const folder = props.folders.find((f) => f.id === draft.folderId)

  const patchDraft = (patch: Partial<TaskDraft>) => setDraft((prev) => ({ ...prev, ...patch }))

  const close = () => props.onClose()

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
      needReview: draft.needReview,
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

  const foldersOfDraftProject = props.folders.filter((f) => f.projectId === draft.projectId)

  return (
    <>
      <Modal size="md" onClose={close}>
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
        <div className="ed-grid">
          <div className="ed-field">
            <label>项目</label>
            <Select
              value={draft.projectId}
              placeholder="未归类"
              options={[
                { value: '', label: '未归类' },
                ...props.projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name })),
              ]}
              onChange={(value) => patchDraft({ projectId: value, folderId: '' })}
            />
          </div>
          <div className="ed-field">
            <label>分组</label>
            <Select
              value={draft.folderId}
              placeholder="未分组"
              disabled={!draft.projectId}
              options={[
                { value: '', label: '未分组' },
                ...foldersOfDraftProject.map((f) => ({ value: f.id, label: f.name })),
              ]}
              onChange={(value) => patchDraft({ folderId: value })}
            />
          </div>
        </div>
        <div className="ed-field">
          <label>安排日期与时间（时间填写后会进入日程时间轴）</label>
          <DateField
            value={draft.planDate}
            start={draft.start}
            end={draft.end}
            clearable
            placeholder="选择日期与时间"
            onChange={(value) => {
              patchDraft({ planDate: value })
              if (errors.time) setErrors((prev) => ({ ...prev, time: undefined }))
            }}
            onStartChange={(value) => {
              patchDraft({ start: value })
              if (errors.time) setErrors((prev) => ({ ...prev, time: undefined }))
            }}
            onEndChange={(value) => {
              patchDraft({ end: value })
              if (errors.time) setErrors((prev) => ({ ...prev, time: undefined }))
            }}
          />
        </div>
        {errors.time && <div className="field-error schedule-error">{errors.time}</div>}
        <div className="ed-field">
          <label>事项描述（文字，可不填）</label>
          <textarea
            value={draft.desc}
            placeholder="写清楚要做什么、背景、链接……"
            onChange={(e) => patchDraft({ desc: e.target.value })}
          />
        </div>
        <div className="editor-tools">
          <button
            type="button"
            className="editor-tool"
            title="添加图片"
            aria-label="添加图片"
            disabled={!!uploading}
            onClick={() => imgRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="8.5" cy="9.5" r="1.6" />
              <path d="m21 15-4.6-4.6L7 20" />
            </svg>
          </button>
          <button
            type="button"
            className="editor-tool"
            title="添加附件"
            aria-label="添加附件"
            disabled={!!uploading}
            onClick={() => attRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <button
            type="button"
            className={'editor-tool' + (remarkOpen ? ' active' : '')}
            title="备注"
            aria-label="备注"
            aria-expanded={remarkOpen}
            onClick={() => setRemarkOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6M8 13h8M8 17h5" />
            </svg>
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
        {uploading && (
          <div className="img-hint">{uploading === 'image' ? '图片上传中…' : '附件上传中…'}</div>
        )}
        {draft.images.length > 0 && (
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
        )}
        {draft.attachments.map((att, i) => (
          <div className="att" key={i}>
            <span>📎</span>
            {att.url ? (
              <a className="an" href={att.url} download={att.name} title={'下载 ' + att.name}>
                {att.name}
              </a>
            ) : (
              <span className="an">{att.name}</span>
            )}
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
        {remarkOpen && (
          <div className="ed-field remark-editor">
            <textarea
              value={draft.remark}
              placeholder="备注：补充说明，仅自己可见"
              onChange={(e) => patchDraft({ remark: e.target.value })}
            />
          </div>
        )}
        <div className="d-foot">
          <button className="btn btn-ghost" onClick={close}>
            取消
          </button>
          <button className="btn btn-pri" onClick={save} disabled={saving || !!uploading}>
            {saving ? '保存中…' : uploading ? '上传中…' : '保存'}
          </button>
        </div>
      </Modal>
      {lightbox !== null && (
        <Lightbox
          images={draft.images}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  )
}
