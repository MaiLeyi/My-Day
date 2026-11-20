import { useState } from 'react'

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

  const submit = () => {
    const value = name.trim()
    if (!value) {
      props.onToast('先填写' + props.label)
      return
    }
    props.onConfirm(value)
  }

  return (
    <>
      <div className="mask" onClick={props.onClose} />
      <div className="modal sm">
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
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
              value={name}
              placeholder={props.placeholder}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
          </div>
          <div className="d-foot">
            <button className="btn btn-ghost" onClick={props.onClose}>
              取消
            </button>
            <button className="btn btn-pri" onClick={submit}>
              {props.confirmText || '创建'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
