import { useState } from 'react'
import type { Project } from '../types'
import { PROJECT_COLORS } from '../utils'
import Modal from './Modal'

interface Props {
  project?: Project | null
  onClose: () => void
  onSubmit: (name: string, shade: number) => Promise<void> | void
  onToast: (message: string) => void
}

export default function ProjectModal(props: Props) {
  const editing = !!props.project
  const [name, setName] = useState(props.project?.name || '')
  const [shade, setShade] = useState(props.project?.shade ?? 0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const value = name.trim()
    if (!value) {
      setError('先填写项目名称')
      props.onToast('先填写项目名称')
      return
    }
    setBusy(true)
    try {
      await props.onSubmit(value, shade)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal size="sm" onClose={props.onClose}>
      <div className="d-head">
        <h3>{editing ? '编辑项目' : '新建项目'}</h3>
        <button className="d-close" onClick={props.onClose}>
          ×
        </button>
      </div>
      <div className="ed-field">
        <label>项目名称</label>
        <input
          autoFocus
          className={error ? 'invalid' : ''}
          value={name}
          placeholder="给项目起个名字"
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) submit()
          }}
        />
        {error && <div className="field-error">{error}</div>}
      </div>
      <div className="ed-field">
        <label>项目颜色</label>
        <div className="proj-colors">
          {PROJECT_COLORS.map((color, index) => (
            <button
              key={color}
              type="button"
              className={'proj-color' + (shade === index ? ' active' : '')}
              style={{ background: color }}
              title={'颜色 ' + (index + 1)}
              onClick={() => setShade(index)}
            >
              {shade === index ? '✓' : ''}
            </button>
          ))}
        </div>
      </div>
      <div className="d-foot">
        <button className="btn btn-ghost" onClick={props.onClose}>
          取消
        </button>
        <button className="btn btn-pri" onClick={submit} disabled={busy}>
          {busy ? '保存中…' : editing ? '保存' : '创建'}
        </button>
      </div>
    </Modal>
  )
}
