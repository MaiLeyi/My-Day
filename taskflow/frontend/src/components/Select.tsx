import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Option {
  value: string
  label: string
}

interface Props {
  value: string
  options: Option[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  align?: 'left' | 'right'
}

const POP_WIDTH = 220
const OPT_HEIGHT = 36

export default function Select(props: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const selected = props.options.find((o) => o.value === props.value)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  const toggle = () => {
    if (props.disabled) return
    if (!open) {
      const rect = btnRef.current?.getBoundingClientRect()
      if (rect) {
        let left = props.align === 'right' ? rect.right - POP_WIDTH : rect.left
        left = Math.max(8, Math.min(left, window.innerWidth - POP_WIDTH - 8))
        const popHeight = Math.min(320, 12 + props.options.length * OPT_HEIGHT)
        let top = rect.bottom + 6
        if (top + popHeight > window.innerHeight - 8) top = Math.max(8, rect.top - popHeight - 6)
        setPos({ top, left })
      }
    }
    setOpen((v) => !v)
  }

  const choose = (value: string) => {
    props.onChange(value)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={'select' + (props.className ? ' ' + props.className : '')}>
      <button
        ref={btnRef}
        type="button"
        className={
          'select-btn' +
          (selected ? '' : ' placeholder') +
          (props.disabled ? ' disabled' : '') +
          (open ? ' open' : '')
        }
        disabled={props.disabled}
        onClick={toggle}
      >
        <span className="select-label">{selected ? selected.label : props.placeholder || '请选择'}</span>
        <span className="select-caret">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="select-pop"
            style={{ top: pos.top, left: pos.left, width: POP_WIDTH }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {props.options.length === 0 && <div className="select-empty">暂无选项</div>}
            {props.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={'select-opt' + (o.value === props.value ? ' active' : '')}
                onClick={() => choose(o.value)}
              >
                <span className="select-opt-label">{o.label}</span>
                {o.value === props.value && <span className="select-opt-check">✓</span>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
