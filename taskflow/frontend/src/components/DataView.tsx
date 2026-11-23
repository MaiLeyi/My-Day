import type { DataDrill, Project, Status, Task } from '../types'
import { isOverdue, projectColor, today } from '../utils'

interface Props {
  tasks: Task[]
  projects: Project[]
  onDrill: (drill: DataDrill) => void
}

interface StatCardProps {
  label: string
  value: number
  hint?: string
  tone?: 'normal' | 'good' | 'warn'
  onClick?: () => void
}

function StatCard(props: StatCardProps) {
  const className =
    'dv-card' + (props.tone && props.tone !== 'normal' ? ' ' + props.tone : '') + (props.onClick ? ' clickable' : '')
  const body = (
    <>
      <div className="dv-card-label">{props.label}</div>
      <div className="dv-card-value">{props.value}</div>
      {props.hint && <div className="dv-card-hint">{props.hint}</div>}
    </>
  )
  if (props.onClick) {
    return (
      <button type="button" className={className} onClick={props.onClick} title="在清单中查看明细">
        {body}
      </button>
    )
  }
  return <div className={className}>{body}</div>
}

function percent(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0
}

export default function DataView(props: Props) {
  const day = today()
  const archivedIds = new Set(props.projects.filter((p) => p.archived).map((p) => p.id))
  // 已归档项目下的事项不计入任何统计
  const liveTasks = props.tasks.filter((t) => !archivedIds.has(t.projectId))

  const doneCount = liveTasks.filter((t) => t.status === 'done').length
  const todoCount = liveTasks.length - doneCount
  const todayDone = liveTasks.filter((t) => t.planDate === day && t.status === 'done').length
  const todayTodo = liveTasks.filter((t) => t.planDate === day && t.status !== 'done').length
  const overdueCount = liveTasks.filter((t) => isOverdue(t, day)).length
  // 待安排 = 未处理且没有计划日期；今日待安排额外要求截止日为今天
  const todoUnscheduled = liveTasks.filter((t) => t.status !== 'done' && !t.planDate)
  const todayUnscheduled = todoUnscheduled.filter((t) => t.dueDate === day).length

  const activeProjects = props.projects.filter((p) => !p.archived)
  const rows = activeProjects.map((p) => {
    const list = liveTasks.filter((t) => t.projectId === p.id)
    const done = list.filter((t) => t.status === 'done').length
    return { id: p.id, name: p.name, shade: p.shade, done, todo: list.length - done, total: list.length }
  })
  const looseTasks = liveTasks.filter((t) => !activeProjects.some((p) => p.id === t.projectId))
  if (looseTasks.length) {
    const done = looseTasks.filter((t) => t.status === 'done').length
    rows.push({ id: '__loose', name: '未归类', shade: -1, done, todo: looseTasks.length - done, total: looseTasks.length })
  }

  const stat = (label: string, extra: Omit<DataDrill, 'label'> = {}) => () => props.onDrill({ label, ...extra })

  /** 未归类项目在清单页用空 projectId 表示。 */
  const drillRow = (row: (typeof rows)[number], status?: Status) => (event?: { stopPropagation: () => void }) => {
    event?.stopPropagation()
    const suffix = status === 'done' ? '已处理' : status === 'todo' ? '未处理' : '全部'
    props.onDrill({
      label: `${row.name} · ${suffix}`,
      projectId: row.id === '__loose' ? '' : row.id,
      status,
    })
  }

  return (
    <div className="dataview">
      <section className="dv-section">
        <div className="dv-section-title">
          总览
          <span className="dv-section-note">仅统计未归档项目</span>
        </div>
        <div className="dv-cards">
          <StatCard
            label="已处理"
            value={doneCount}
            hint={`完成度 ${percent(doneCount, liveTasks.length)}%`}
            tone="good"
            onClick={stat('总览 · 已处理', { status: 'done' })}
          />
          <StatCard
            label="未处理"
            value={todoCount}
            hint={`占 ${percent(todoCount, liveTasks.length)}%`}
            onClick={stat('总览 · 未处理', { status: 'todo' })}
          />
          <StatCard label="全部事项" value={liveTasks.length} onClick={stat('总览 · 全部事项')} />
        </div>
      </section>

      <section className="dv-section">
        <div className="dv-section-title">
          今日
          <span className="dv-section-note">按计划日期统计</span>
        </div>
        <div className="dv-cards">
          <StatCard
            label="今日已处理"
            value={todayDone}
            tone="good"
            onClick={stat('今日已处理', { status: 'done', planDate: day })}
          />
          <StatCard
            label="今日未处理"
            value={todayTodo}
            onClick={stat('今日未处理', { status: 'todo', planDate: day })}
          />
          <StatCard
            label="截止今日超期"
            value={overdueCount}
            hint="截止日已过且未处理"
            tone="warn"
            onClick={stat('截止今日超期', { overdue: true })}
          />
        </div>
      </section>

      <section className="dv-section">
        <div className="dv-section-title">
          待安排
          <span className="dv-section-note">未处理且没有计划日期</span>
        </div>
        <div className="dv-cards">
          <StatCard
            label="今日待安排"
            value={todayUnscheduled}
            hint="截止日为今天"
            onClick={stat('今日待安排', { status: 'todo', unscheduled: true, dueDate: day })}
          />
          <StatCard
            label="全部待安排"
            value={todoUnscheduled.length}
            onClick={stat('全部待安排', { status: 'todo', unscheduled: true })}
          />
        </div>
      </section>

      <section className="dv-section">
        <div className="dv-section-title">按项目</div>
        {rows.length ? (
          <div className="dv-table">
            <div className="dv-tr head">
              <span>项目</span>
              <span className="dv-num">已处理</span>
              <span className="dv-num">未处理</span>
              <span className="dv-num dv-col-total">合计</span>
              <span className="dv-bar-col">完成度</span>
            </div>
            {rows.map((row) => (
              <div
                key={row.id}
                className="dv-tr clickable"
                onClick={drillRow(row)}
                title="在清单中查看该项目明细"
              >
                <span className="dv-proj">
                  <span
                    className="dv-proj-dot"
                    style={{ background: row.shade < 0 ? 'var(--gray3)' : projectColor(row.shade) }}
                  />
                  <span className="dv-proj-name">{row.name}</span>
                </span>
                <button type="button" className="dv-num dv-num-btn" onClick={drillRow(row, 'done')} title="查看已处理明细">
                  {row.done}
                </button>
                <button type="button" className="dv-num dv-num-btn dv-muted" onClick={drillRow(row, 'todo')} title="查看未处理明细">
                  {row.todo}
                </button>
                <span className="dv-num dv-col-total">{row.total}</span>
                <span className="dv-bar-col">
                  <span className="dv-bar" title={`${percent(row.done, row.total)}%`}>
                    <span className="dv-bar-fill" style={{ width: `${percent(row.done, row.total)}%` }} />
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">暂无未归档项目</div>
        )}
      </section>
    </div>
  )
}
