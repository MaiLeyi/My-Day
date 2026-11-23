import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmt, monthCells, parseDate, today } from '../utils'

interface Props {
  value: string
  onChange: (value: string) => void
  start?: string
  end?: string
  onStartChange?: (value: string) => void
  onEndChange?: (value: string) => void
  placeholder?: string
  clearable?: boolean
  compact?: boolean
  iconOnly?: boolean
  icon?: string
  align?: 'left' | 'right'
  className?: string
  title?: string
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const POP_WIDTH = 252
const POP_HEIGHT = 316

function display(value: string): string {
  if (!value) return ''
  const d = parseDate(value)
  if (Number.isNaN(d.getTime())) return value
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`
}

function shiftMonth(value: string, delta: number): string {
  const base = value ? parseDate(value) : new Date()
  const d = new Date(base.getFullYear(), base.getMonth() + delta, 1)
  return fmt(d)
}

export default function DateField(props: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [cursor, setCursor] = useState(() => {
    const base = props.value ? parseDate(props.value) : new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const hasTime = !!(props.onStartChange && props.onEndChange)
  const timeText = hasTime && (props.start || props.end) ? `${props.start || '--:--'} – ${props.end || '--:--'}` : ''
  const valueText = [props.value ? display(props.value) : '', timeText].filter(Boolean).join(' ')
  const hasValue = !!valueText

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
    if (!open) {
      const base = props.value ? parseDate(props.value) : new Date()
      setCursor(new Date(base.getFullYear(), base.getMonth(), 1))
      const rect = btnRef.current?.getBoundingClientRect()
      if (rect) {
        let left = props.align === 'right' ? rect.right - POP_WIDTH : rect.left
        left = Math.max(8, Math.min(left, window.innerWidth - POP_WIDTH - 8))
        const popHeight = hasTime ? 390 : POP_HEIGHT
        let top = rect.bottom + 6
        if (top + popHeight > window.innerHeight - 8) top = Math.max(8, rect.top - popHeight - 6)
        setPos({ top, left })
      }
    }
    setOpen((v) => !v)
  }

  const pick = (iso: string) => {
    props.onChange(iso)
    if (!hasTime) setOpen(false)
  }

  const clear = () => {
    props.onChange('')
    if (hasTime) {
      props.onStartChange?.('')
      props.onEndChange?.('')
    }
    setOpen(false)
  }

  const cells = monthCells(cursor)

  return (
    <div
      ref={rootRef}
      className={
        'datefield' +
        (props.compact ? ' compact' : '') +
        (props.iconOnly ? ' icon-only' : '') +
        (props.className ? ' ' + props.className : '')
      }
    >
      <button
        ref={btnRef}
        type="button"
        title={props.title}
        className={'datefield-btn' + (hasValue ? ' has-value' : '')}
        onClick={toggle}
      >
        <span className="df-icon">{props.icon || '▦'}</span>
        <span className={'df-text' + (hasValue ? '' : ' placeholder')}>
          {hasValue ? valueText : props.placeholder || '选择日期'}
        </span>
        {props.clearable && hasValue && (
          <span
            className="df-clear"
            role="button"
            title={hasTime ? '清除日期与时间' : '清除日期'}
            onClick={(e) => {
              e.stopPropagation()
              clear()
            }}
          >
            ×
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="date-pop"
            style={{ top: pos.top, left: pos.left, width: POP_WIDTH }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="dp-head">
              <button
                type="button"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              >
                ‹
              </button>
              <span>
                {cursor.getFullYear()}年{cursor.getMonth() + 1}月
              </span>
              <button
                type="button"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              >
                ›
              </button>
            </div>
            <div className="dp-week">
              {WEEK.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="dp-grid">
              {cells.map((cell) => (
                <button
                  type="button"
                  key={cell.iso}
                  className={
                    'dp-day' +
                    (cell.other ? ' other' : '') +
                    (cell.today ? ' today' : '') +
                    (cell.iso === props.value ? ' active' : '')
                  }
                  onClick={() => pick(cell.iso)}
                >
                  {cell.day}
                </button>
              ))}
            </div>
            {hasTime && (
              <div className="dp-times">
                <label className="dp-time">
                  <span>开始</span>
                  <input
                    type="time"
                    value={props.start || ''}
                    onChange={(e) => props.onStartChange?.(e.target.value)}
                  />
                </label>
                <label className="dp-time">
                  <span>结束</span>
                  <input
                    type="time"
                    value={props.end || ''}
                    onChange={(e) => props.onEndChange?.(e.target.value)}
                  />
                </label>
              </div>
            )}
            <div className="dp-foot">
              <button type="button" onClick={() => pick(today())}>
                今天
              </button>
              {!hasTime && (
                <button type="button" onClick={() => pick(shiftMonth(props.value || today(), 1))}>
                  下月同日
                </button>
              )}
              {props.clearable && (
                <button type="button" className="dp-clear" onClick={clear}>
                  清除
                </button>
              )}
              {hasTime && (
                <button type="button" onClick={() => setOpen(false)}>
                  完成
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
