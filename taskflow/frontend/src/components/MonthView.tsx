import { useState } from 'react'
import type { Project, Task } from '../types'
import { getDragPayload, monthCells, setDragPayload } from '../utils'

interface Props {
  cursor: Date
  tasks: Task[]
  projects: Project[]
  selDay: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onSelectDay: (iso: string) => void
  onAddDay: (iso: string) => void
  onOpen: (id: string) => void
  onSchedule: (taskId: string, iso: string) => void
}

export default function MonthView(props: Props) {
  const [hint, setHint] = useState('')
  const cells = monthCells(props.cursor)
  const shadeOf = (pid: string) => props.projects.find((p) => p.id === pid)?.shade ?? 0

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
                    className={'tcard g' + shadeOf(t.projectId) + (t.status === 'done' ? ' done' : '')}
                    draggable
                    onDragStart={() => setDragPayload({ type: 'task', id: t.id })}
                    onDragEnd={() => setDragPayload(null)}
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onOpen(t.id)
                    }}
                  >
                    <div className="tcard-top">
                      <span className="time">
                        {t.start}
                        {t.end ? '–' + t.end : ''}
                      </span>
                      <span className={'cdot ' + t.status} style={{ marginLeft: 'auto' }}>
                        {t.status === 'done' ? '✓' : ''}
                      </span>
                    </div>
                    <div className="ctitle">{t.title}</div>
                  </button>
                ))}
                {dueItems.map((t) => (
                  <button
                    key={'due-' + t.id}
                    className="tcard due"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onOpen(t.id)
                    }}
                  >
                    <div className="ctitle">⏰ {t.title}</div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
