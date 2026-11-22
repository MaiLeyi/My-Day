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

const USER_NAME = '我过一天'
const USER_TITLE = '我的工作台'

// 清单与日历类视图（日历 / 本周 / 日程）分成两组展示
const VIEWS: { key: View; label: string; group: 'list' | 'calendar' }[] = [
  { key: 'list', label: '清单', group: 'list' },
  { key: 'month', label: '日历', group: 'calendar' },
  { key: 'week', label: '本周', group: 'calendar' },
  { key: 'day', label: '日程', group: 'calendar' },
]

export default function TopBar(props: Props) {
  const renderGroup = (group: 'list' | 'calendar') => (
    <div className="seg">
      {VIEWS.filter((v) => v.group === group).map((v) => (
        <button
          key={v.key}
          className={props.view === v.key ? 'active' : ''}
          onClick={() => props.onChangeView(v.key)}
        >
          {v.label}
        </button>
      ))}
    </div>
  )

  return (
    <header className="topbar">
      <button className="menu-btn" onClick={props.onToggleNav}>
        ☰
      </button>
      <div className="top-user">
        <div className="avatar">{USER_NAME.charAt(0)}</div>
        <div className="top-user-text">
          <div className="un">{USER_NAME}</div>
          <div className="ur">{USER_TITLE}</div>
        </div>
      </div>
      <div className="search">
        <input
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          placeholder="搜索事项"
        />
      </div>
      <div className="spacer" />
      <div className="view-tabs">
        {renderGroup('list')}
        {renderGroup('calendar')}
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
