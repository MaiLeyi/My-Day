import type { View } from '../types'

interface Props {
  view: View
  query: string
  batchMode: boolean
  selectedCount: number
  onChangeView: (view: View) => void
  onQuery: (value: string) => void
  onToggleNav: () => void
  onBatchDelete: () => void
  onCancelBatch: () => void
}

const VIEWS: { key: View; label: string }[] = [
  { key: 'list', label: '清单' },
  { key: 'month', label: '日历' },
  { key: 'week', label: '本周' },
  { key: 'day', label: '日程' },
]

export default function TopBar(props: Props) {
  return (
    <header className="topbar">
      <button className="menu-btn" onClick={props.onToggleNav}>
        ☰
      </button>
      <div className="brand">
        <div className="logo">M</div>任务流
      </div>
      <div className="search">
        <input
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          placeholder="搜索事项"
        />
      </div>
      <div className="spacer" />
      <div className="seg">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            className={props.view === v.key ? 'active' : ''}
            onClick={() => props.onChangeView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="batchbar">
        <span>
          已选 <b>{props.selectedCount}</b> 项
        </span>
        <button className="btn btn-danger" onClick={props.onBatchDelete}>
          批量删除
        </button>
        <button className="btn btn-ghost" onClick={props.onCancelBatch}>
          取消
        </button>
      </div>
    </header>
  )
}
