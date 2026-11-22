import type { Priority, Status, Task } from './types'

export const STATUS: Record<Status, string> = { todo: '未处理', done: '已处理' }
export const PRIORITY_LABEL: Record<string, string> = { high: '高', mid: '中', low: '低', '': '无' }
export const PRIORITY_RANK: Record<string, number> = { high: 0, mid: 1, low: 2, '': 3 }

export function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function today(): string {
  return fmt(new Date())
}

export function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

export function isOverdue(task: Task, ref = today()): boolean {
  return !!task.dueDate && task.status !== 'done' && task.dueDate < ref
}

export function esc(s: string): string {
  return s
}

export function byDate(a: Task, b: Task): number {
  return (a.planDate || '9999-99-99').localeCompare(b.planDate || '9999-99-99')
}

export type DragPayload =
  | { type: 'task'; id: string }
  | { type: 'project'; id: string }
  | { type: 'folder'; id: string }

let dragPayload: DragPayload | null = null

export function setDragPayload(payload: DragPayload | null): void {
  dragPayload = payload
}

export function getDragPayload(): DragPayload | null {
  return dragPayload
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface MonthCell {
  iso: string
  day: number
  other: boolean
  today: boolean
}

export function monthCells(cursor: Date): MonthCell[] {
  const y = cursor.getFullYear()
  const m = cursor.getMonth()
  const startOffset = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells: MonthCell[] = []
  const t = today()
  for (let i = 0; i < startOffset; i++) {
    const d = new Date(y, m, 1 - startOffset + i)
    cells.push({ iso: fmt(d), day: d.getDate(), other: true, today: fmt(d) === t })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(y, m, d)
    cells.push({ iso: fmt(dt), day: d, other: false, today: fmt(dt) === t })
  }
  while (cells.length % 7 !== 0) {
    const dt = new Date(y, m, 1 + cells.length - startOffset)
    cells.push({ iso: fmt(dt), day: dt.getDate(), other: true, today: fmt(dt) === t })
  }
  return cells
}

export function weekDays(offset: number): { iso: string; label: string; weekday: string; isToday: boolean }[] {
  const now = new Date()
  const dow = now.getDay() || 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - dow + 1 + offset * 7)
  const names = ['一', '二', '三', '四', '五', '六', '日']
  const t = today()
  return names.map((name, i) => {
    const dt = new Date(monday)
    dt.setDate(monday.getDate() + i)
    return {
      iso: fmt(dt),
      label: `${dt.getMonth() + 1}/${dt.getDate()}`,
      weekday: `周${name}`,
      isToday: fmt(dt) === t,
    }
  })
}

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: '', label: '无' },
  { value: 'high', label: '高' },
  { value: 'mid', label: '中' },
  { value: 'low', label: '低' },
]
