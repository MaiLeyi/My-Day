import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './api'
import AiModal from './components/AiModal'
import ConfirmDialog from './components/ConfirmDialog'
import type { AskConfirmOptions } from './components/ConfirmDialog'
import DayView from './components/DayView'
import DetailModal from './components/DetailModal'
import ExportModal from './components/ExportModal'
import FilterBar from './components/FilterBar'
import ListView from './components/ListView'
import MonthView from './components/MonthView'
import PromptModal from './components/PromptModal'
import SettingsModal from './components/SettingsModal'
import Sidebar from './components/Sidebar'
import WeekView from './components/WeekView'
import type {
  AiContext,
  Bootstrap,
  Priority,
  Scope,
  Settings,
  Status,
  StatusFilter,
  Task,
  TaskDraft,
  Theme,
  View,
} from './types'
import type { DragPayload } from './utils'
import { isOverdue, today } from './utils'

type DetailState = { taskId?: string; draft?: TaskDraft } | null

type ConfirmState = AskConfirmOptions | null

const newDraft = (projects: Bootstrap['projects'], opts: { projectId?: string; folderId?: string; planDate?: string; start?: string; end?: string }): TaskDraft => ({
  title: '',
  projectId: opts.projectId || projects[0]?.id || '',
  folderId: opts.folderId || '',
  status: 'todo',
  priority: '',
  planDate: opts.planDate || '',
  dueDate: '',
  start: opts.start || '',
  end: opts.end || '',
  desc: '',
  remark: '',
  images: [],
  attachments: [],
  needReview: false,
})

const NAV_ITEMS: { key: View; label: string; icon: ReactNode }[] = [
  {
    key: 'list',
    label: '清单',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    ),
  },
  {
    key: 'month',
    label: '日历',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2M8 17h2" />
      </svg>
    ),
  },
  {
    key: 'week',
    label: '本周',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="3" />
        <path d="M8 8v9M12 8v9M16 8v9" />
      </svg>
    ),
  },
  {
    key: 'day',
    label: '日程',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
]

function ViewRail(props: { view: View; onChangeView: (view: View) => void; onOpenSettings: () => void }) {
  return (
    <nav className="view-rail" aria-label="工作台视图">
      <div className="rail-avatar" title="我过一天">
        我
      </div>
      <div className="rail-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={'rail-item' + (props.view === item.key ? ' active' : '')}
            onClick={() => props.onChangeView(item.key)}
          >
            <span className="rail-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <button className="rail-item rail-settings" title="设置" onClick={props.onOpenSettings}>
        <span className="rail-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3v-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.6 1h.09v4H21a1.7 1.7 0 0 0-1.6 1Z" />
          </svg>
        </span>
        <span>设置</span>
      </button>
    </nav>
  )
}

export default function App() {
  const [data, setData] = useState<Bootstrap | null>(null)
  const [loadError, setLoadError] = useState('')
  const [toastMsg, setToastMsg] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast = useCallback((message: string) => {
    setToastMsg(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 1800)
  }, [])

  const reload = useCallback(
    async (message?: string) => {
      try {
        const next = await api.bootstrap()
        setData(next)
        if (message) showToast(message)
      } catch (err) {
        showToast((err as Error).message)
      }
    },
    [showToast],
  )

  // ---- UI 状态 ----
  const [view, setView] = useState<View>('list')
  const [navOpen, setNavOpen] = useState(false)
  const [scope, setScope] = useState<Scope | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showDone, setShowDone] = useState(false)
  const [keepDoneIds, setKeepDoneIds] = useState<Set<string>>(new Set())
  const [dateFilter, setDateFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'' | Priority>('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [prioritySort, setPrioritySort] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [monthCursor, setMonthCursor] = useState(new Date())
  const [weekOffset, setWeekOffset] = useState(0)
  const [dayDate, setDayDate] = useState(today())
  const [selDay, setSelDay] = useState(today())
  const [detail, setDetail] = useState<DetailState>(null)
  const [focusId, setFocusId] = useState('')
  const focusTimer = useRef<number | undefined>(undefined)
  const [projPrompt, setProjPrompt] = useState(false)
  const [folderPromptProject, setFolderPromptProject] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiCtx, setAiCtx] = useState<AiContext | null>(null)
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)

  useEffect(() => {
    api
      .bootstrap()
      .then((b) => {
        setData(b)
        setView(b.settings.defaultView)
      })
      .catch((err) => setLoadError((err as Error).message))
  }, [])

  useEffect(() => {
    const theme = previewTheme || data?.settings.theme || 'soft'
    document.documentElement.dataset.theme = theme
  }, [previewTheme, data?.settings.theme])

  useEffect(() => {
    return () => {
      window.clearTimeout(toastTimer.current)
      window.clearTimeout(focusTimer.current)
    }
  }, [])

  if (loadError) {
    return (
      <div className="app">
        <div className="empty" style={{ margin: 'auto' }}>
          无法连接后端服务：{loadError}
          <br />
          <span style={{ fontSize: 12.5 }}>请先启动 backend（uvicorn app.main:app --reload）后刷新</span>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="app">
        <div className="empty" style={{ margin: 'auto' }}>
          正在加载…
        </div>
      </div>
    )
  }

  const { projects, folders, tasks, settings } = data
  const archivedIds = new Set(projects.filter((p) => p.archived).map((p) => p.id))
  const aiReady = !!settings.ai.apiKey.trim()
  const q = query.trim().toLowerCase()

  const inScope = (t: Task) =>
    !scope || (scope.type === 'project' ? t.projectId === scope.id : t.folderId === scope.id)

  const matchStatus = (t: Task) => {
    if (statusFilter === 'unplanned') return !t.planDate && !t.dueDate
    if (statusFilter === 'all') return true
    return t.status === statusFilter
  }

  const listTasks = tasks.filter((t) => {
    if (!matchStatus(t) || !inScope(t)) return false
    if (statusFilter !== 'done' && !showDone && t.status === 'done' && !keepDoneIds.has(t.id)) return false
    if (archivedIds.has(t.projectId)) return false
    if (dateFilter && statusFilter !== 'unplanned' && !(t.planDate === dateFilter || t.dueDate === dateFilter))
      return false
    if (priorityFilter && t.priority !== priorityFilter) return false
    if (overdueOnly && !isOverdue(t)) return false
    if (q && !t.title.toLowerCase().includes(q)) return false
    return true
  })

  const boardTasks = tasks.filter((t) => {
    if (!inScope(t)) return false
    if (archivedIds.has(t.projectId)) return false
    if (q && !t.title.toLowerCase().includes(q)) return false
    return true
  })

  const scopeName = scope
    ? scope.type === 'project'
      ? projects.find((p) => p.id === scope.id)?.name || ''
      : folders.find((f) => f.id === scope.id)?.name || ''
    : ''

  // ---- 通用操作 ----
  // 注意：此处位于 `if (!data) return` 之后，只能定义普通函数，不能调用 Hook
  // （如 useCallback），否则会因条件渲染导致 Hook 数量变化而崩溃。
  const resetFilters = () => {
    setStatusFilter('all')
    setShowDone(false)
    setDateFilter('')
    setPriorityFilter('')
    setOverdueOnly(false)
    setPrioritySort(false)
  }

  const selectScope = (next: Scope | null) => {
    setScope(next)
    resetFilters()
    setNavOpen(false)
  }

  const openNew = (opts: { projectId?: string; folderId?: string; planDate?: string; start?: string; end?: string } = {}) => {
    setDetail({ draft: newDraft(projects, opts) })
  }

  const openTask = (id: string) => setDetail({ taskId: id })

  const changeView = (next: View) => {
    if (next !== view) setQuery('')
    setView(next)
    setDetail(null)
    setNavOpen(false)
    if (next !== 'list') {
      setBatchMode(false)
      setSelected(new Set())
    }
  }

  const openNewInScope = () => {
    if (scope?.type === 'project') {
      openNew({ projectId: scope.id })
    } else if (scope?.type === 'folder') {
      const folder = folders.find((f) => f.id === scope.id)
      openNew({ projectId: folder?.projectId, folderId: scope.id })
    } else {
      openNew()
    }
  }

  /** 新建成功后高亮并滚动到新事项，避免"保存了却看不见"。 */
  const focusTask = (task: Task) => {
    setFocusId(task.id)
    window.clearTimeout(focusTimer.current)
    focusTimer.current = window.setTimeout(() => setFocusId(''), 2600)
  }

  const detailTask = detail?.taskId ? tasks.find((t) => t.id === detail.taskId) || null : null
  const toggleSel = (type: 'p' | 'f' | 't', id: string) => {
    setSelected((prev) => {
      const key = `${type}:${id}`
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const dropTaskOnTask = async (sourceId: string, targetId: string) => {
    try {
      await api.reorder('task', sourceId, targetId)
      await reload()
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const handleTreeReorder = async (src: DragPayload, targetType: 'project' | 'folder', targetId: string) => {
    try {
      if (src.type === 'project' && targetType === 'project') {
        await api.reorder('project', src.id, targetId)
      } else if (src.type === 'folder' && targetType === 'folder') {
        await api.reorder('folder', src.id, targetId)
      } else if (src.type === 'folder' && targetType === 'project') {
        await api.updateFolder(src.id, { projectId: targetId })
      } else {
        return
      }
      await reload('已调整')
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const schedule = async (taskId: string, iso: string, start?: string, end?: string) => {
    try {
      if (start !== undefined || end !== undefined) {
        await api.updateTask(taskId, { planDate: iso, start: start || '', end: end || '' })
      } else {
        await api.scheduleTask(taskId, iso)
      }
      await reload(iso ? '已排到 ' + iso : '已清除排期')
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  /** 卡片上一键切换未处理 / 已处理。 */
  const toggleStatus = async (task: Task) => {
    const next: Status = task.status === 'done' ? 'todo' : 'done'
    try {
      await api.updateTask(task.id, { status: next })
      await reload(next === 'done' ? '已处理' : '已恢复为未处理')
      // 完成后若会被筛选隐藏，先短暂保留以展示"已完成"态，再淡出移除，避免瞬间消失
      const willHide = next === 'done' && statusFilter !== 'done' && !showDone
      if (willHide) {
        setKeepDoneIds((prev) => new Set(prev).add(task.id))
        window.setTimeout(() => {
          setKeepDoneIds((prev) => {
            const n = new Set(prev)
            n.delete(task.id)
            return n
          })
        }, 600)
      } else {
        setKeepDoneIds((prev) => {
          if (!prev.has(task.id)) return prev
          const n = new Set(prev)
          n.delete(task.id)
          return n
        })
      }
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const toggleReview = async (task: Task) => {
    try {
      await api.updateTask(task.id, { needReview: !task.needReview })
      await reload(task.needReview ? '已取消待复盘' : '已标记待复盘')
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const askDeleteTask = (task: Task) => {
    setConfirm({
      title: `删除事项「${task.title}」？`,
      message: '事项及其上传的图片、附件都会被删除，无法恢复。',
      confirmText: '删除事项',
      danger: true,
      action: async () => {
        await api.deleteTask(task.id)
        await reload('已删除')
      },
    })
  }

  const runConfirm = async (state: ConfirmState) => {
    if (!state) return
    setConfirm(null)
    try {
      await state.action()
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const deleteProject = (id: string) => {
    const project = projects.find((p) => p.id === id)
    if (!project) return
    const projectFolders = folders.filter((f) => f.projectId === id)
    const projectTasks = tasks.filter((t) => t.projectId === id)
    setConfirm({
      title: `删除项目「${project.name}」？`,
      message: '项目及其下的分组、事项都会被永久删除，无法撤销。',
      details: [
        { label: '分组', value: `${projectFolders.length} 个` },
        { label: '事项', value: `${projectTasks.length} 个`, tone: projectTasks.length ? 'warn' : 'normal' },
      ],
      confirmText: '删除项目',
      danger: true,
      action: async () => {
        await api.deleteProject(id)
        if (
          scope &&
          (scope.id === id || (scope.type === 'folder' && projectFolders.some((f) => f.id === scope.id)))
        ) {
          setScope(null)
        }
        await reload('已删除项目')
      },
    })
  }

  const deleteFolder = (id: string) => {
    const folder = folders.find((f) => f.id === id)
    if (!folder) return
    const count = tasks.filter((t) => t.folderId === id).length
    setConfirm({
      title: `删除分组「${folder.name}」？`,
      message: count ? '分组下的事项不会被删除，会保留在项目下并转为未分组。' : '该分组下暂无事项。',
      details: [{ label: '分组内事项', value: `${count} 个` }],
      confirmText: '删除分组',
      danger: true,
      action: async () => {
        await api.deleteFolder(id)
        if (scope?.type === 'folder' && scope.id === id) setScope(null)
        await reload('已删除分组')
      },
    })
  }

  const archiveProject = (id: string) => {
    const project = projects.find((p) => p.id === id)
    if (!project) return
    const count = tasks.filter((t) => t.projectId === id).length
    setConfirm({
      title: `归档项目「${project.name}」？`,
      message: '归档后项目会从主列表隐藏，可随时在「已归档」中恢复。',
      details: [{ label: '涉及事项', value: `${count} 个` }],
      confirmText: '归档',
      action: async () => {
        await api.updateProject(id, { archived: true })
        if (scope?.id === id) setScope(null)
        await reload('已归档')
      },
    })
  }

  const unarchiveProject = async (id: string) => {
    try {
      await api.updateProject(id, { archived: false })
      await reload('已恢复项目')
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const batchDelete = () => {
    if (!selected.size) {
      showToast('先勾选项目、分组或事项')
      return
    }
    const projectIds = [...selected].filter((k) => k.startsWith('p:')).map((k) => k.slice(2))
    const folderIds = [...selected].filter((k) => k.startsWith('f:')).map((k) => k.slice(2))
    const taskIds = [...selected].filter((k) => k.startsWith('t:')).map((k) => k.slice(2))
    const projSet = new Set(projectIds)
    const folderSet = new Set(folderIds)
    const taskSet = new Set(taskIds)

    // 项目下的分组/事项本来就会随项目删除，不再重复计数
    const foldersToDelete = folders.filter((f) => projSet.has(f.projectId) || folderSet.has(f.id))
    const tasksToDelete = tasks.filter((t) => projSet.has(t.projectId) || taskSet.has(t.id))
    const keptTasks = tasks.filter(
      (t) => folderSet.has(t.folderId) && !projSet.has(t.projectId) && !taskSet.has(t.id),
    )
    const details = [
      { label: '删除项目', value: `${projectIds.length} 个` },
      { label: '删除分组', value: `${foldersToDelete.length} 个` },
      { label: '删除事项', value: `${tasksToDelete.length} 个`, tone: tasksToDelete.length ? ('warn' as const) : ('normal' as const) },
      ...(keptTasks.length
        ? [{ label: '保留事项', value: `${keptTasks.length} 个（转为未分组）` }]
        : []),
    ].filter((_d, i) => i > 0 || projectIds.length > 0)

    setConfirm({
      title: '确认批量删除？',
      message: '删除后无法恢复；仅删除分组时，分组下的事项会保留。',
      details,
      confirmText: '全部删除',
      danger: true,
      action: async () => {
        await api.batchDelete({ projectIds, folderIds, taskIds })
        setSelected(new Set())
        setBatchMode(false)
        await reload('已批量删除')
      },
    })
  }

  const openAi = (ctx: AiContext) => {
    if (!aiReady) {
      showToast('请先在左下角设置中配置 AI API Key')
      return
    }
    setAiCtx(ctx)
  }

  const addOnDay = (iso: string) => openNew({ planDate: iso })
  const addOnDayAt = (iso: string, start: string, end: string) => openNew({ planDate: iso, start, end })

  const updateTaskTime = async (taskId: string, planDate: string, start: string, end: string) => {
    try {
      await api.updateTask(taskId, { planDate, start, end })
      await reload()
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const viewTitle = view === 'list' ? '全部事项' : view === 'week' ? '本周' : view === 'day' ? '日程' : '日历'

  return (
    <div className={'app' + (batchMode ? ' batch' : '') + (navOpen ? ' nav-open' : '')}>
      <div className="layout">
        <ViewRail view={view} onChangeView={changeView} onOpenSettings={() => setSettingsOpen(true)} />
        {view === 'list' && (
          <Sidebar
            projects={projects}
            folders={folders}
            tasks={tasks}
            scope={scope}
            query={query}
            batchMode={batchMode}
            aiReady={aiReady}
            selected={selected}
            onQuery={setQuery}
            onSelectScope={selectScope}
            onToggleSelect={toggleSel}
            onNewProject={() => setProjPrompt(true)}
            onNewFolder={(projectId) => setFolderPromptProject(projectId)}
            onNewTask={(projectId, folderId) => openNew({ projectId, folderId })}
            onAi={openAi}
            onArchive={archiveProject}
            onUnarchive={unarchiveProject}
            onDeleteProject={deleteProject}
            onDeleteFolder={deleteFolder}
            onReorder={handleTreeReorder}
            onToggleBatch={() => {
              setBatchMode((v) => !v)
              setSelected(new Set())
            }}
            onBatchDelete={batchDelete}
            onCancelBatch={() => {
              setBatchMode(false)
              setSelected(new Set())
            }}
            onExport={() => setExportOpen(true)}
          />
        )}

        <main className="main">
          <div className="main-inner">
            {view !== 'month' && (
              <div className="main-head">
                {view === 'list' && (
                  <button className="menu-btn" title="打开分组" onClick={() => setNavOpen((v) => !v)}>
                    ☰
                  </button>
                )}
                <h2>{viewTitle}</h2>
                {scope && (
                  <button className="scope-tag" onClick={() => selectScope(null)}>
                    范围：{scopeName} ✕
                  </button>
                )}
                <div className="spacer" />
                {view === 'list' && (
                  <>
                    <FilterBar
                      statusFilter={statusFilter}
                      showDone={showDone}
                      dateFilter={dateFilter}
                      priorityFilter={priorityFilter}
                      overdueOnly={overdueOnly}
                      prioritySort={prioritySort}
                      onStatusFilter={setStatusFilter}
                      onShowDone={setShowDone}
                      onDateFilter={setDateFilter}
                      onPriorityFilter={setPriorityFilter}
                      onOverdueOnly={setOverdueOnly}
                      onPrioritySort={setPrioritySort}
                      onReset={resetFilters}
                    />
                    <button className="btn btn-pri new-task-main" onClick={openNewInScope}>
                      ＋ 新建事项
                    </button>
                  </>
                )}
              </div>
            )}

            {view === 'list' && (
              <ListView
                tasks={listTasks}
                projects={projects}
                folders={folders}
                prioritySort={prioritySort}
                batchMode={batchMode}
                selected={selected}
                onOpen={openTask}
                onToggleSelect={(id) => toggleSel('t', id)}
                onDropTask={dropTaskOnTask}
                onSchedule={schedule}
                onToggleStatus={toggleStatus}
                onDeleteTask={askDeleteTask}
                onToggleReview={toggleReview}
                isLeaving={(id) => keepDoneIds.has(id)}
              />
            )}

            {view === 'month' && (
              <MonthView
                cursor={monthCursor}
                tasks={boardTasks}
                projects={projects}
                selDay={selDay}
                onPrev={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
                onNext={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
                onToday={() => setMonthCursor(new Date())}
                onSelectDay={setSelDay}
                onAddDay={addOnDay}
                focusId={focusId}
                onOpen={openTask}
                onSchedule={schedule}
                onEdit={openTask}
                onToggleStatus={toggleStatus}
                onDeleteTask={askDeleteTask}
              />
            )}

            {view === 'week' && (
              <WeekView
                offset={weekOffset}
                tasks={boardTasks}
                projects={projects}
                focusId={focusId}
                onPrev={() => setWeekOffset((v) => v - 1)}
                onNext={() => setWeekOffset((v) => v + 1)}
                onBack={() => setWeekOffset(0)}
                onOpenDay={(iso) => {
                  setDayDate(iso)
                  setView('day')
                }}
                onAddDay={addOnDay}
                onAddAt={addOnDayAt}
                onOpen={openTask}
                onScheduleRange={updateTaskTime}
                onToggleStatus={toggleStatus}
                onDeleteTask={askDeleteTask}
              />
            )}

            {view === 'day' && (
              <DayView
                date={dayDate}
                tasks={boardTasks}
                projects={projects}
                folders={folders}
                batchMode={batchMode}
                selected={selected}
                onDateChange={setDayDate}
                onAddAt={addOnDayAt}
                focusId={focusId}
                onScheduleRange={updateTaskTime}
                onOpen={openTask}
                onToggleSelect={(id) => toggleSel('t', id)}
                onDropTask={dropTaskOnTask}
                onToggleStatus={toggleStatus}
                onDeleteTask={askDeleteTask}
              />
            )}
          </div>
          {detail && (detail.taskId ? detailTask : true) && (
            <DetailModal
              key={detail.taskId || 'new'}
              task={detailTask}
              draft={detail.draft}
              projects={projects}
              folders={folders}
              onClose={() => setDetail(null)}
              onChanged={reload}
              onSaved={focusTask}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      {projPrompt && (
        <PromptModal
          title="新建项目"
          label="项目名称"
          placeholder="给项目起个名字"
          onClose={() => setProjPrompt(false)}
          onToast={showToast}
          onConfirm={async (name) => {
            try {
              await api.createProject(name)
              setProjPrompt(false)
              await reload('已新建项目')
            } catch (err) {
              showToast((err as Error).message)
            }
          }}
        />
      )}

      {folderPromptProject && (
        <PromptModal
          title="新建分组"
          label="分组名称"
          placeholder="给分组起个名字"
          onClose={() => setFolderPromptProject('')}
          onToast={showToast}
          onConfirm={async (name) => {
            try {
              await api.createFolder(folderPromptProject, name)
              setFolderPromptProject('')
              await reload('已新建分组')
            } catch (err) {
              showToast((err as Error).message)
            }
          }}
        />
      )}

      {exportOpen && (
        <ExportModal
          tasks={tasks}
          projects={projects}
          folders={folders}
          scope={scope}
          query={query}
          dateFilter={dateFilter}
          statusFilter={statusFilter}
          selected={selected}
          onClose={() => setExportOpen(false)}
          onToast={showToast}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next: Settings) => setData((prev) => (prev ? { ...prev, settings: next } : prev))}
          onPreviewTheme={setPreviewTheme}
          onToast={showToast}
        />
      )}

      {aiCtx && (
        <AiModal
          ctx={aiCtx}
          projects={projects}
          folders={folders}
          onClose={() => setAiCtx(null)}
          onCreated={reload}
          onToast={showToast}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          details={confirm.details}
          confirmText={confirm.confirmText}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => runConfirm(confirm)}
        />
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  )
}
