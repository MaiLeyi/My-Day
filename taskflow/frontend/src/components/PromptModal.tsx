import { useState } from 'react'
import Modal from './Modal'

interface Props {
  title: string
  label: string
  placeholder: string
  confirmText?: string
  onClose: () => void
  onConfirm: (name: string) => void
  onToast: (message: string) => void
}

export default function PromptModal(props: Props) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    const value = name.trim()
    if (!value) {
      setError('先填写' + props.label)
      props.onToast('先填写' + props.label)
      return
    }
    props.onConfirm(value)
  }

  return (
    <Modal size="sm" onClose={props.onClose}>
      <div className="d-head">
        <h3>{props.title}</h3>
        <button className="d-close" onClick={props.onClose}>
          ×
        </button>
      </div>
      <div className="ed-field">
        <label>{props.label}</label>
        <input
          autoFocus
          className={error ? 'invalid' : ''}
          value={name}
          placeholder={props.placeholder}
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        {error && <div className="field-error">{error}</div>}
      </div>
      <div className="d-foot">
        <button className="btn btn-ghost" onClick={props.onClose}>
          取消
        </button>
        <button className="btn btn-pri" onClick={submit}>
          {props.confirmText || '创建'}
        </button>
      </div>
    </Modal>
  )
}
