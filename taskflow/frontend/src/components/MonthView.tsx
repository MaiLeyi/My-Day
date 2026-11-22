import { useEffect, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Project, Task } from '../types'
import { getDragPayload, monthCells, setDragPayload } from '../utils'

interface Props {
  cursor: Date
  tasks: Task[]
  projects: Project[]
  selDay: string
  focusId?: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onSelectDay: (iso: string) => void
  onAddDay: (iso: string) => void
  onOpen: (id: string) => void
  onSchedule: (taskId: string, iso: string) => void
  onEdit: (id: string) => void
  onToggleStatus: (task: Task) => void
  onDeleteTask: (task: Task) => void
}

export default function MonthView(props: Props) {
  const [hint, setHint] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; task?: Task; iso?: string } | null>(null)
  const cells = monthCells(props.cursor)
  const shadeOf = (pid: string) => props.projects.find((p) => p.id === pid)?.shade ?? 0

  const openMenu = (event: ReactMouseEvent, payload: { task?: Task; iso?: string }) => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - 180),
      y: Math.min(event.clientY, window.innerHeight - 168),
      ...payload,
    })
  }

  // 右键菜单：点击空白、滚动或 Esc 关闭
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // 新建事项后滚动到它所在的日期卡片
  useEffect(() => {
    if (!props.focusId) return
    const el = document.querySelector<HTMLElement>(`[data-task-id="${props.focusId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [props.focusId, props.tasks])

  return (
    <div className="cal">
      <div className="main-head" style={{ padding: '10px 18px' }}>
        <h2>
          {props.cursor.getFullYear()}年{props.cursor.getMonth() + 1}月
        </h2>
        <div className="spacer" />
        <div className="navbtns">
          <button onClick={props.onPrev} title="上个月">
            ‹
          </button>
          <button onClick={props.onNext} title="下个月">
            ›
          </button>
          <button onClick={props.onToday} title="回到本月">
            今
          </button>
        </div>
      </div>
      <div className="cal-week">
        {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
          <div key={w}>周{w}</div>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((cell) => {
          const planned = props.tasks.filter((t) => t.planDate === cell.iso)
          const dueItems = props.tasks.filter((t) => t.dueDate === cell.iso && t.planDate !== cell.iso)
          return (
            <div
              key={cell.iso}
              className={
                'day' +
                (cell.other ? ' other' : '') +
                (cell.today ? ' today' : '') +
                (cell.iso === props.selDay ? ' selected' : '') +
                (hint === cell.iso ? ' drop-hint' : '')
              }
              onDragOver={(e) => {
                if (getDragPayload()?.type === 'task') {
                  e.preventDefault()
                  setHint(cell.iso)
                }
              }}
              onDragLeave={() => setHint('')}
              onDrop={(e) => {
                e.preventDefault()
                setHint('')
                const payload = getDragPayload()
                setDragPayload(null)
                if (payload?.type === 'task') props.onSchedule(payload.id, cell.iso)
              }}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('.tcard,.day-add')) return
                props.onSelectDay(cell.iso)
              }}
              onContextMenu={(e) => {
                if ((e.target as HTMLElement).closest('.tcard')) return
                openMenu(e, { iso: cell.iso })
              }}
            >
              <div className="dnum">{cell.day}</div>
              <button
                className="day-add"
                title="在此日新增"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onSelectDay(cell.iso)
                  props.onAddDay(cell.iso)
                }}
              >
                ＋
              </button>
              <div className="cards">
                {planned.map((t) => (
                  <button
                    key={t.id}
                    data-task-id={t.id}
                    className={
                      'tcard g' +
                      shadeOf(t.projectId) +
                      (t.status === 'done' ? ' done' : '') +
                      (props.focusId === t.id ? ' flash' : '')
                    }
                    draggable
                    onDragStart={() => setDragPayload({ type: 'task', id: t.id })}
                    onDragEnd={() => setDragPayload(null)}
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onOpen(t.id)
                    }}
                    onContextMenu={(e) => openMenu(e, { task: t })}
                  >
                    <div className="tcard-top">
                      <span className="time">
                        {t.start}
                        {t.end ? '–' + t.end : ''}
                      </span>
                      <span
                        className={'cdot ' + t.status}
                        style={{ marginLeft: 'auto' }}
                        title={t.status === 'done' ? '标记为未处理' : '标记为已处理'}
                        onClick={(e) => {
                          e.stopPropagation()
                          props.onToggleStatus(t)
                        }}
                      >
                        {t.status === 'done' ? '✓' : ''}
                      </span>
                    </div>
                    <div className="ctitle">{t.title}</div>
                  </button>
                ))}
                {dueItems.map((t) => (
                  <button
                    key={'due-' + t.id}
                    data-task-id={t.id}
                    className={'tcard due' + (props.focusId === t.id ? ' flash' : '')}
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onOpen(t.id)
                    }}
                    onContextMenu={(e) => openMenu(e, { task: t })}
                  >
                    <div className="ctitle">⏰ {t.title}</div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {menu &&
        createPortal(
          <div
            className="ctx-menu"
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {menu.task ? (
              <>
                <button
                  onClick={() => {
                    const t = menu.task!
                    setMenu(null)
                    props.onEdit(t.id)
                  }}
                >
                  ✎ 编辑事项
                </button>
                <button
                  onClick={() => {
                    const t = menu.task!
                    setMenu(null)
                    props.onToggleStatus(t)
                  }}
                >
                  {menu.task.status === 'done' ? '↺ 标记为未处理' : '✓ 标记为已处理'}
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    const t = menu.task!
                    setMenu(null)
                    props.onDeleteTask(t)
                  }}
                >
                  ✕ 删除事项
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  const iso = menu.iso!
                  setMenu(null)
                  props.onSelectDay(iso)
                  props.onAddDay(iso)
                }}
              >
                ＋ 在此日新增
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
