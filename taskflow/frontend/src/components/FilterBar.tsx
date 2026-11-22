import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Priority, StatusFilter } from '../types'
import { PRIORITY_LABEL, parseDate } from '../utils'
import DateField from './DateField'

interface Props {
  statusFilter: StatusFilter
  showDone: boolean
  dateFilter: string
  priorityFilter: '' | Priority
  overdueOnly: boolean
  prioritySort: boolean
  onStatusFilter: (value: StatusFilter) => void
  onShowDone: (value: boolean) => void
  onDateFilter: (value: string) => void
  onPriorityFilter: (value: '' | Priority) => void
  onOverdueOnly: (value: boolean) => void
  onPrioritySort: (value: boolean) => void
  onReset: () => void
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'todo', label: '未处理' },
  { value: 'done', label: '已处理' },
  { value: 'unplanned', label: '未排期' },
]

const PRIORITY_OPTIONS: { value: '' | Priority; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'high', label: '高' },
  { value: 'mid', label: '中' },
  { value: 'low', label: '低' },
]

const POP_WIDTH = 300
const POP_MIN_HEIGHT = 320

function shortDate(iso: string): string {
  const d = parseDate(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export default function FilterBar(props: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const active = useMemo(() => {
    const list: { key: string; label: string; onRemove: () => void }[] = []
    if (props.statusFilter !== 'all') {
      const label = STATUS_OPTIONS.find((o) => o.value === props.statusFilter)?.label || ''
      list.push({ key: 'status', label, onRemove: () => props.onStatusFilter('all') })
    }
    if (props.showDone) {
      list.push({ key: 'showDone', label: '展示已处理', onRemove: () => props.onShowDone(false) })
    }
    if (props.dateFilter) {
      list.push({
        key: 'date',
        label: `日期 ${shortDate(props.dateFilter)}`,
        onRemove: () => props.onDateFilter(''),
      })
    }
    if (props.priorityFilter) {
      list.push({
        key: 'priority',
        label: `优先级 ${PRIORITY_LABEL[props.priorityFilter]}`,
        onRemove: () => props.onPriorityFilter(''),
      })
    }
    if (props.overdueOnly) {
      list.push({ key: 'overdue', label: '仅看逾期', onRemove: () => props.onOverdueOnly(false) })
    }
    if (props.prioritySort) {
      list.push({ key: 'sort', label: '按优先级排序', onRemove: () => props.onPrioritySort(false) })
    }
    return list
  }, [props])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      const inRoot = rootRef.current?.contains(target)
      const inPop = popRef.current?.contains(target)
      const inDatePop = !!(target as Element).closest?.('.date-pop')
      if (!inRoot && !inPop && !inDatePop) setOpen(false)
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
      const rect = btnRef.current?.getBoundingClientRect()
      if (rect) {
        let left = rect.right - POP_WIDTH
        left = Math.max(8, Math.min(left, window.innerWidth - POP_WIDTH - 8))
        let top = rect.bottom + 6
        if (top + POP_MIN_HEIGHT > window.innerHeight - 8) {
          top = Math.max(8, rect.top - POP_MIN_HEIGHT - 6)
        }
        setPos({ top, left })
      }
    }
    setOpen((v) => !v)
  }

  return (
    <div ref={rootRef} className="filterbar">
      {active.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="filter-chip"
          onClick={chip.onRemove}
          title="点击移除该筛选"
        >
          {chip.label}
          <span className="filter-chip-x">×</span>
        </button>
      ))}
      <button
        ref={btnRef}
        type="button"
        className={'filter-trigger' + (active.length ? ' has-filter' : '') + (open ? ' open' : '')}
        onClick={toggle}
      >
        <span className="ft-icon">⌕</span>
        <span>筛选</span>
        {active.length > 0 && <span className="ft-badge">{active.length}</span>}
        <span className="ft-caret">▾</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            className="filter-pop"
            style={{ top: pos.top, left: pos.left, width: POP_WIDTH }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="fp-section">
              <div className="fp-label">状态</div>
              <div className="fp-chips">
                {STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={'fp-chip' + (props.statusFilter === o.value ? ' active' : '')}
                    onClick={() => props.onStatusFilter(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="fp-row">
              <label className="fp-check">
                <input
                  type="checkbox"
                  checked={props.showDone}
                  onChange={(e) => props.onShowDone(e.target.checked)}
                />
                展示已处理
              </label>
            </div>

            <div className="fp-section">
              <div className="fp-label">日期</div>
              <DateField
                value={props.dateFilter}
                onChange={props.onDateFilter}
                placeholder="按日期筛选"
                clearable
                compact
                align="left"
              />
            </div>

            <div className="fp-section">
              <div className="fp-label">优先级</div>
              <div className="fp-chips">
                {PRIORITY_OPTIONS.map((o) => (
                  <button
                    key={o.value || 'none'}
                    type="button"
                    className={'fp-chip' + (props.priorityFilter === o.value ? ' active' : '')}
                    onClick={() => props.onPriorityFilter(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="fp-row">
              <label className="fp-check">
                <input
                  type="checkbox"
                  checked={props.overdueOnly}
                  onChange={(e) => props.onOverdueOnly(e.target.checked)}
                />
                仅看逾期
              </label>
              <label className="fp-check">
                <input
                  type="checkbox"
                  checked={props.prioritySort}
                  onChange={(e) => props.onPrioritySort(e.target.checked)}
                />
                按优先级排序
              </label>
            </div>

            <div className="fp-foot">
              <button
                type="button"
                className="fp-reset"
                disabled={active.length === 0}
                onClick={() => {
                  props.onReset()
                }}
              >
                清除全部
              </button>
              <button type="button" className="fp-done" onClick={() => setOpen(false)}>
                完成
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
