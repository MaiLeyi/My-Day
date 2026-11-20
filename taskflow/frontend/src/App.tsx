import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import AiModal from './components/AiModal'
import DayView from './components/DayView'
import DetailModal from './components/DetailModal'
import ExportModal from './components/ExportModal'
import ListView from './components/ListView'
import MonthView from './components/MonthView'
import MoveModal from './components/MoveModal'
import PromptModal from './components/PromptModal'
import SettingsModal from './components/SettingsModal'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import WeekView from './components/WeekView'
import type {
  AiContext,
  Bootstrap,
  Priority,
  Scope,
  Settings,
  StatusFilter,
  Task,
  TaskDraft,
  Theme,
  View,
} from './types'
import type { DragPayload } from './utils'
import { isOverdue, today } from './utils'

type DetailState = { mode: 'view' | 'edit'; taskId?: string; draft?: TaskDraft } | null

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
})

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todo')
  const [showDone, setShowDone] = useState(false)
  const [dateFilter, setDateFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'' | Priority>('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [prioritySort, setPrioritySort] = useState(false)
  const [listLayout, setListLayout] = useState<'group' | 'flat'>('group')
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [monthCursor, setMonthCursor] = useState(new Date())
  const [weekOffset, setWeekOffset] = useState(0)
  const [dayDate, setDayDate] = useState(today())
  const [selDay, setSelDay] = useState(today())
  const [detail, setDetail] = useState<DetailState>(null)
  const [moveTaskId, setMoveTaskId] = useState('')
  const [projPrompt, setProjPrompt] = useState(false)
  const [folderPromptProject, setFolderPromptProject] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiCtx, setAiCtx] = useState<AiContext | null>(null)
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null)

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
    return () => window.clearTimeout(toastTimer.current)
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
    if (statusFilter === 'todo') return t.status === 'todo'
    if (statusFilter === 'doing') return t.status === 'doing'
    if (statusFilter === 'done') return t.status === 'done'
    return true
  }

  const listTasks = tasks.filter((t) => {
    if (!matchStatus(t) || !inScope(t)) return false
    if (!showDone && statusFilter !== 'done' && t.status === 'done') return false
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
  const selectScope = (next: Scope | null) => {
    setScope(next)
    setDateFilter('')
    setStatusFilter('todo')
    setShowDone(false)
    setPriorityFilter('')
    setOverdueOnly(false)
    setNavOpen(false)
  }

  const openNew = (opts: { projectId?: string; folderId?: string; planDate?: string; start?: string; end?: string } = {}) => {
    setDetail({ mode: 'edit', draft: newDraft(projects, opts) })
  }

  const openTask = (id: string) => setDetail({ mode: 'view', taskId: id })

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

  const schedule = async (taskId: string, iso: string) => {
    try {
      await api.scheduleTask(taskId, iso)
      await reload('已排到 ' + iso)
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const deleteProject = async (id: string) => {
    const project = projects.find((p) => p.id === id)
    if (!project) return
    const folderCount = folders.filter((f) => f.projectId === id).length
    const taskCount = tasks.filter((t) => t.projectId === id).length
    if (
      !window.confirm(
        `删除项目「${project.name}」？\n将同时删除 ${folderCount} 个分组、${taskCount} 个事项，此操作不可撤销。`,
      )
    )
      return
    try {
      await api.deleteProject(id)
      if (scope && (scope.id === id || (scope.type === 'folder' && folders.find((f) => f.id === scope.id)?.projectId === id))) {
        setScope(null)
      }
      await reload('已删除项目')
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const deleteFolder = async (id: string) => {
    const folder = folders.find((f) => f.id === id)
    if (!folder) return
    const count = tasks.filter((t) => t.folderId === id).length
    const message = count
      ? `删除分组「${folder.name}」？\n其中 ${count} 个事项会保留在项目下（不再归组）。`
      : `删除分组「${folder.name}」？`
    if (!window.confirm(message)) return
    try {
      await api.deleteFolder(id)
      if (scope?.type === 'folder' && scope.id === id) setScope(null)
      await reload('已删除分组')
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const archiveProject = async (id: string) => {
    const project = projects.find((p) => p.id === id)
    if (!project) return
    const count = tasks.filter((t) => t.projectId === id).length
    if (!window.confirm(`归档项目「${project.name}」？\n将从主列表隐藏，其 ${count} 个事项暂时不显示，可随时恢复。`))
      return
    try {
      await api.updateProject(id, { archived: true })
      if (scope?.id === id) setScope(null)
      await reload('已归档')
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const unarchiveProject = async (id: string) => {
    try {
      await api.updateProject(id, { archived: false })
      await reload('已恢复项目')
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const batchDelete = async () => {
    if (!selected.size) {
      showToast('先勾选项目、分组或事项')
      return
    }
    const projectIds = [...selected].filter((k) => k.startsWith('p:')).map((k) => k.slice(2))
    const folderIds = [...selected].filter((k) => k.startsWith('f:')).map((k) => k.slice(2))
    const taskIds = [...selected].filter((k) => k.startsWith('t:')).map((k) => k.slice(2))
    const projSet = new Set(projectIds)
    const taskInProj = tasks.filter((t) => projSet.has(t.projectId)).length
    const message =
      `将删除 ${projectIds.length} 个项目、${folderIds.length} 个分组、${taskIds.length} 个事项？` +
      (taskInProj ? `\n项目下 ${taskInProj} 个事项将一并删除。` : '') +
      (folderIds.length ? '\n分组下事项会保留为未分组。' : '')
    if (!window.confirm(message)) return
    try {
      await api.batchDelete({ projectIds, folderIds, taskIds })
      setSelected(new Set())
      setBatchMode(false)
      await reload('已批量删除')
    } catch (err) {
      showToast((err as Error).message)
    }
  }

  const openAi = (ctx: AiContext) => {
    if (!aiReady) {
      showToast('请先在左下角设置中配置 AI API Key')
      return
    }
    setAiCtx(ctx)
  }

  const addOnDay = (iso: string) => openNew({ planDate: iso })
  const addOnDayWithTime = () => {
    const hour = new Date().getHours()
    const start = String(hour).padStart(2, '0') + ':00'
    const end = String(Math.min(23, hour + 1)).padStart(2, '0') + ':00'
    openNew({ planDate: dayDate, start, end })
  }

  const viewTitle = view === 'list' ? '清单' : view === 'week' ? '本周' : view === 'day' ? '日程' : '日历'

  return (
    <div className={'app' + (batchMode ? ' batch' : '') + (navOpen ? ' nav-open' : '')}>
      <TopBar
        view={view}
        query={query}
        batchMode={batchMode}
        selectedCount={selected.size}
        onChangeView={setView}
        onQuery={setQuery}
        onToggleNav={() => setNavOpen((v) => !v)}
        onBatchDelete={batchDelete}
        onCancelBatch={() => {
          setBatchMode(false)
          setSelected(new Set())
        }}
      />
      <div className="layout">
        <Sidebar
          projects={projects}
          folders={folders}
          tasks={tasks}
          scope={scope}
          batchMode={batchMode}
          aiReady={aiReady}
          selected={selected}
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
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleBatch={() => {
            setBatchMode((v) => !v)
            setSelected(new Set())
          }}
          onExport={() => setExportOpen(true)}
        />

        <main className="main">
          <div className="main-inner">
            {view !== 'month' && (
              <div className="main-head">
                <h2>{viewTitle}</h2>
                {scope && (
                  <button className="scope-tag" onClick={() => selectScope(null)}>
                    范围：{scopeName} ✕
                  </button>
                )}
                {view === 'list' && !scope && (
                  <div className="layout-toggle">
                    <button className={listLayout === 'group' ? 'active' : ''} onClick={() => setListLayout('group')}>
                      分层
                    </button>
                    <button className={listLayout === 'flat' ? 'active' : ''} onClick={() => setListLayout('flat')}>
                      平铺
                    </button>
                  </div>
                )}
                <div className="spacer" />
                {view === 'list' && (
                  <>
                    <input
                      type="date"
                      className="date-filter"
                      title="按日期筛选（清单）"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                    />
                    <div className="chips">
                      {(
                        [
                          ['todo', '待办'],
                          ['doing', '进行中'],
                          ['done', '已完成'],
                          ['unplanned', '未规划'],
                        ] as [StatusFilter, string][]
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          className={'chip' + (statusFilter === key ? ' active' : '')}
                          onClick={() => setStatusFilter(key)}
                        >
                          {label}
                        </button>
                      ))}
                      <label className="show-done">
                        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
                        展示已完成
                      </label>
                    </div>
                    <select
                      className="date-filter"
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value as '' | Priority)}
                    >
                      <option value="">全部优先级</option>
                      <option value="high">高优先级</option>
                      <option value="mid">中优先级</option>
                      <option value="low">低优先级</option>
                    </select>
                    <label className="show-done">
                      <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
                      仅看逾期
                    </label>
                    <button
                      className={'chip' + (prioritySort ? ' active' : '')}
                      onClick={() => setPrioritySort((v) => !v)}
                      title="按优先级高低排序"
                    >
                      优先级排序
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
                flat={listLayout === 'flat'}
                scopeActive={!!scope}
                prioritySort={prioritySort}
                batchMode={batchMode}
                selected={selected}
                onOpen={openTask}
                onToggleSelect={(id) => toggleSel('t', id)}
                onDropTask={dropTaskOnTask}
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
                onOpen={openTask}
                onSchedule={schedule}
              />
            )}

            {view === 'week' && (
              <WeekView
                offset={weekOffset}
                tasks={boardTasks}
                projects={projects}
                folders={folders}
                selDay={selDay}
                batchMode={batchMode}
                selected={selected}
                onPrev={() => setWeekOffset((v) => v - 1)}
                onNext={() => setWeekOffset((v) => v + 1)}
                onBack={() => setWeekOffset(0)}
                onSelectDay={setSelDay}
                onAddDay={addOnDay}
                onOpen={openTask}
                onToggleSelect={(id) => toggleSel('t', id)}
                onSchedule={schedule}
                onDropTask={dropTaskOnTask}
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
                onAdd={addOnDayWithTime}
                onOpen={openTask}
                onToggleSelect={(id) => toggleSel('t', id)}
                onDropTask={dropTaskOnTask}
              />
            )}
          </div>
        </main>
      </div>

      {detail && (detail.mode === 'view' ? detailTask : true) && (
        <DetailModal
          key={detail.taskId || 'new'}
          task={detailTask}
          mode={detail.mode}
          draft={detail.draft}
          projects={projects}
          folders={folders}
          onClose={() => setDetail(null)}
          onChanged={reload}
          onToast={showToast}
          onMove={setMoveTaskId}
        />
      )}

      {moveTaskId && (
        <MoveModal
          taskId={moveTaskId}
          projects={projects}
          folders={folders}
          onClose={() => setMoveTaskId('')}
          onMoved={reload}
          onToast={showToast}
        />
      )}

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

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  )
}
