import Modal from './Modal'

export interface ConfirmDetail {
  label: string
  value: string
  tone?: 'normal' | 'warn'
}

export interface AskConfirmOptions {
  title: string
  message?: string
  details?: ConfirmDetail[]
  confirmText?: string
  danger?: boolean
  action: () => void | Promise<void>
}

/** App 层提供的确认框：统一替代 window.confirm。 */
export type AskConfirm = (options: AskConfirmOptions) => void

interface Props {
  title: string
  message?: string
  details?: ConfirmDetail[]
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog(props: Props) {
  return (
    <Modal size="sm" onClose={props.onCancel} className="confirm-card">
      <div className="confirm-head">
        <span className={'confirm-icon' + (props.danger ? ' danger' : '')}>{props.danger ? '!' : '?'}</span>
        <div>
          <h3>{props.title}</h3>
          {props.message && <p className="confirm-msg">{props.message}</p>}
        </div>
      </div>
      {props.details && props.details.length > 0 && (
        <div className="confirm-details">
          {props.details.map((d) => (
            <div className={'confirm-line' + (d.tone === 'warn' ? ' warn' : '')} key={d.label}>
              <span>{d.label}</span>
              <b>{d.value}</b>
            </div>
          ))}
        </div>
      )}
      <div className="confirm-foot">
        <button className="btn btn-ghost" onClick={props.onCancel}>
          {props.cancelText || '取消'}
        </button>
        <button className={'btn ' + (props.danger ? 'btn-danger-solid' : 'btn-pri')} onClick={props.onConfirm}>
          {props.confirmText || '确定'}
        </button>
      </div>
    </Modal>
  )
}
