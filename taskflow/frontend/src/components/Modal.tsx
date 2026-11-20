import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  children: ReactNode
  onClose?: () => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
  closeOnBackdrop?: boolean
}

/** 统一弹窗容器：Portal 到 body，避免被侧边栏的 overflow / 层级影响。 */
export default function Modal(props: Props) {
  const { onClose, closeOnBackdrop = true } = props

  useEffect(() => {
    if (!onClose) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="modal-layer"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.()
      }}
    >
      <div className={'modal-card ' + props.size + (props.className ? ' ' + props.className : '')}>
        {props.children}
      </div>
    </div>,
    document.body,
  )
}
