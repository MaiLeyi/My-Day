import { useEffect, useMemo, useState } from 'react'
import type { Folder, Project, Settings, StorageInfo, Task, Theme, View } from '../types'
import { api } from '../api'
import { download, projectColor, today } from '../utils'
import Modal from './Modal'

interface Props {
  settings: Settings
  tasks: Task[]
  projects: Project[]
  folders: Folder[]
  onClose: () => void
  onSaved: (settings: Settings) => void
  onPreviewTheme: (theme: Theme | null) => void
  onImported?: () => void
  onToast: (message: string) => void
}

const MODELS = ['gpt-4o', 'gpt-4o-mini', 'deepseek-chat', 'qwen-plus', 'claude-3.5-sonnet']

type Tab = 'ai' | 'general' | 'storage' | 'export' | 'backup'

const TABS: { key: Tab; label: string }[] = [
  { key: 'ai', label: 'AI 配置' },
  { key: 'general', label: '通用' },
  { key: 'storage', label: '数据存储' },
  { key: 'export', label: '导出事项' },
  { key: 'backup', label: '备份与迁移' },
]

const UNASSIGNED = ''

export default function SettingsModal(props: Props) {
  const [form, setForm] = useState<Settings>(() => ({
    ai: { ...props.settings.ai },
    defaultView: props.settings.defaultView,
    theme: props.settings.theme,
  }))
  const [tab, setTab] = useState<Tab>('ai')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [appDir, setAppDir] = useState('')
  const [migrating, setMigrating] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ projects: number; folders: number; tasks: number; files: number } | null>(null)

  // ---- 导出事项 ----
  const projectIds = useMemo(() => {
    const ids = props.projects.map((p) => p.id)
    if (props.tasks.some((t) => !t.projectId)) ids.push(UNASSIGNED)
    return ids
  }, [props.projects, props.tasks])
  const [pickedProjects, setPickedProjects] = useState<Set<string>>(() => new Set(projectIds))
  const [format, setFormat] = useState<'json' | 'csv'>('json')
  const [pickedTasks, setPickedTasks] = useState<Set<string> | null>(null)
  const [exporting, setExporting] = useState(false)

  const exportCandidates = useMemo(
    () => props.tasks.filter((t) => pickedProjects.has(t.projectId)),
    [props.tasks, pickedProjects],
  )

  const checkedTasks = useMemo(() => {
    if (pickedTasks) return new Set([...pickedTasks].filter((id) => exportCandidates.some((t) => t.id === id)))
    return new Set(exportCandidates.map((t) => t.id))
  }, [pickedTasks, exportCandidates])

  const allProjectsChecked = projectIds.length > 0 && pickedProjects.size === projectIds.length
  const allTasksChecked = exportCandidates.length > 0 && checkedTasks.size === exportCandidates.length

  const toggleExportProject = (id: string, on: boolean) => {
    const next = new Set(pickedProjects)
    if (on) next.add(id)
    else next.delete(id)
    setPickedProjects(next)
    setPickedTasks(null)
  }

  const toggleExportTask = (id: string) => {
    const next = new Set(checkedTasks)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPickedTasks(next)
  }

  const doExport = async () => {
    const ids = exportCandidates.filter((t) => checkedTasks.has(t.id)).map((t) => t.id)
    if (!ids.length) {
      props.onToast('先勾选要导出的事项')
      return
    }
    setExporting(true)
    try {
      const blob = await api.exportTasks(ids, format)
      download(blob, `事项导出_${today()}.${format === 'csv' ? 'csv' : 'json'}`)
      props.onToast(`已导出 ${ids.length} 条`)
    } catch (err) {
      props.onToast((err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const desktop = typeof window !== 'undefined' && !!window.taskflow

  useEffect(() => {
    api
      .storage()
      .then(setStorage)
      .catch(() => {})
    window.taskflow?.paths?.().then((paths) => setAppDir(paths.appDir)).catch(() => {})
  }, [])

  const copyPath = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      props.onToast('路径已复制')
    } catch {
      props.onToast('复制失败，请手动选择复制')
    }
  }

  const patchAi = (patch: Partial<Settings['ai']>) =>
    setForm((prev) => ({ ...prev, ai: { ...prev.ai, ...patch } }))

  const changeDataDir = async () => {
    if (!window.taskflow?.chooseDataDir) return
    setMigrating(true)
    try {
      const result = await window.taskflow.chooseDataDir()
      if (result.ok && result.paths) {
        setStorage((prev) => (prev ? { ...prev, ...result.paths } : prev))
        api.storage().then(setStorage).catch(() => {})
        props.onToast('数据已迁移到新目录')
      } else if (!result.canceled && result.message) {
        props.onToast(result.message)
      }
    } catch (err) {
      props.onToast((err as Error).message)
    } finally {
      setMigrating(false)
    }
  }

  const exportBackup = async () => {
    setBackingUp(true)
    try {
      const blob = await api.backup()
      download(blob, `任务流备份_${today()}.zip`)
      props.onToast('备份已导出')
    } catch (err) {
      props.onToast((err as Error).message)
    } finally {
      setBackingUp(false)
    }
  }

  const importBackup = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const result = await api.importBackup(file)
      setImportResult(result)
      props.onImported?.()
      props.onToast(`已导入 ${result.tasks} 个事项`)
    } catch (err) {
      props.onToast((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const test = async () => {
    if (!form.ai.apiKey.trim()) {
      setTestResult({ ok: false, text: '请先填写 API Key' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.aiTest(form.ai)
      setTestResult({ ok: result.ok, text: result.message })
    } catch (err) {
      setTestResult({ ok: false, text: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    try {
      const saved = await api.saveSettings(form)
      props.onSaved(saved)
      props.onPreviewTheme(null)
      props.onClose()
      props.onToast('设置已保存')
    } catch (err) {
      props.onToast((err as Error).message)
    }
  }

  const cancel = () => {
    props.onPreviewTheme(null)
    props.onClose()
  }

  return (
    <Modal size="md" className="settings-modal" onClose={cancel}>
      <div className="d-head">
        <h3>设置</h3>
        <button className="d-close" onClick={cancel}>
          ×
        </button>
      </div>

      <div className="settings-body">
        <nav className="settings-nav">
          {TABS.map((item) => (
            <button
              key={item.key}
              className={tab === item.key ? 'active' : ''}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="settings-pane">
          {tab === 'ai' && (
            <>
              <div className="ed-field">
                <label>API Key</label>
                <input
                  type="password"
                  value={form.ai.apiKey}
                  placeholder="sk-..."
                  onChange={(e) => patchAi({ apiKey: e.target.value })}
                />
              </div>
              <div className="ed-field">
                <label>接口地址 Base URL（可选）</label>
                <input
                  value={form.ai.baseUrl}
                  placeholder="https://api.openai.com/v1"
                  onChange={(e) => patchAi({ baseUrl: e.target.value })}
                />
              </div>
              <div className="ed-field">
                <label>模型</label>
                <input
                  value={form.ai.model}
                  placeholder="如 gpt-4o、deepseek-chat"
                  list="ai-model-options"
                  onChange={(e) => patchAi({ model: e.target.value })}
                />
                <datalist id="ai-model-options">
                  {MODELS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="ai-test-row">
                <button className="btn btn-ghost" onClick={test} disabled={testing}>
                  {testing ? '测试中…' : '测试连通性'}
                </button>
                {testResult && (
                  <span className={'test-result ' + (testResult.ok ? 'ok' : 'err')}>
                    {testResult.ok ? '✓ ' : '✕ '}
                    {testResult.text}
                  </span>
                )}
              </div>
            </>
          )}

          {tab === 'general' && (
            <>
              <div className="ed-field">
                <label>默认启动视图</label>
                <select
                  value={form.defaultView}
                  onChange={(e) => setForm((prev) => ({ ...prev, defaultView: e.target.value as View }))}
                >
                  <option value="list">清单</option>
                  <option value="month">日历</option>
                  <option value="week">本周</option>
                  <option value="day">日程</option>
                </select>
              </div>
              <div className="ed-field">
                <label>外观主题</label>
                <select
                  value={form.theme}
                  onChange={(e) => {
                    const theme = e.target.value as Theme
                    setForm((prev) => ({ ...prev, theme }))
                    props.onPreviewTheme(theme)
                  }}
                >
                  <option value="soft">柔和灰（默认）</option>
                  <option value="warm">米纸暖调</option>
                  <option value="blue">雾蓝清爽</option>
                  <option value="dark">夜墨深色</option>
                </select>
              </div>
            </>
          )}

          {tab === 'storage' && (
            <>
              <div className="storage-list">
                <div className="storage-row">
                  <span className="storage-k">应用位置</span>
                  <span className="storage-v">
                    {desktop ? appDir || '读取中…' : '网页端（浏览器访问，无本地安装）'}
                  </span>
                  {desktop && appDir && (
                    <button className="storage-copy" onClick={() => copyPath(appDir)}>
                      复制
                    </button>
                  )}
                </div>
                <div className="storage-row">
                  <span className="storage-k">数据目录</span>
                  <span className="storage-v">{storage?.dataDir || '读取中…'}</span>
                  {storage && (
                    <button className="storage-copy" onClick={() => copyPath(storage.dataDir)}>
                      复制
                    </button>
                  )}
                </div>
                <div className="storage-row">
                  <span className="storage-k">数据库</span>
                  <span className="storage-v">{storage?.dbPath || '读取中…'}</span>
                  {storage && (
                    <button className="storage-copy" onClick={() => copyPath(storage.dbPath)}>
                      复制
                    </button>
                  )}
                </div>
                <div className="storage-row">
                  <span className="storage-k">附件目录</span>
                  <span className="storage-v">{storage?.filesDir || '读取中…'}</span>
                  {storage && (
                    <button className="storage-copy" onClick={() => copyPath(storage.filesDir)}>
                      复制
                    </button>
                  )}
                </div>
              </div>
              {desktop && window.taskflow?.openPath && (
                <div className="storage-actions">
                  <button className="btn btn-ghost" onClick={() => window.taskflow?.openPath?.('app')}>
                    打开应用目录
                  </button>
                  <button className="btn btn-ghost" onClick={() => window.taskflow?.openPath?.('data')}>
                    打开数据目录
                  </button>
                  {window.taskflow?.chooseDataDir && (
                    <button className="btn btn-ghost" onClick={changeDataDir} disabled={migrating}>
                      {migrating ? '迁移中…' : '更改数据目录'}
                    </button>
                  )}
                </div>
              )}
              {desktop && (
                <div className="place-hint" style={{ marginTop: 10 }}>
                  更改数据目录会把现有数据库与附件复制到新位置，原目录数据保留。安装位置不提供修改。
                </div>
              )}
            </>
          )}

          {tab === 'export' && (
            <>
              <div className="exp-hint">默认导出全部事项，可按项目多选缩小范围。</div>
              <div className="exp-projects">
                <label className="exp-proj">
                  <input
                    type="checkbox"
                    checked={allProjectsChecked}
                    onChange={(e) => {
                      setPickedProjects(e.target.checked ? new Set(projectIds) : new Set())
                      setPickedTasks(null)
                    }}
                  />
                  <span>全部项目</span>
                </label>
                {props.projects.map((p) => (
                  <label className="exp-proj" key={p.id}>
                    <input
                      type="checkbox"
                      checked={pickedProjects.has(p.id)}
                      onChange={(e) => toggleExportProject(p.id, e.target.checked)}
                    />
                    <i className="exp-dot" style={{ background: projectColor(p.shade) }} />
                    <span>{p.name}</span>
                  </label>
                ))}
                {projectIds.includes(UNASSIGNED) && (
                  <label className="exp-proj">
                    <input
                      type="checkbox"
                      checked={pickedProjects.has(UNASSIGNED)}
                      onChange={(e) => toggleExportProject(UNASSIGNED, e.target.checked)}
                    />
                    <span>未分组</span>
                  </label>
                )}
              </div>
              <div className="exp-bar">
                <label className="exp-all">
                  <input
                    type="checkbox"
                    checked={allTasksChecked}
                    onChange={(e) =>
                      setPickedTasks(e.target.checked ? new Set(exportCandidates.map((t) => t.id)) : new Set())
                    }
                  />
                  全选
                </label>
                <select id="expFmt" value={format} onChange={(e) => setFormat(e.target.value as 'json' | 'csv')}>
                  <option value="json">JSON</option>
                  <option value="csv">Excel（CSV）</option>
                </select>
              </div>
              <div className="exp-list">
                {exportCandidates.map((t) => {
                  const project = props.projects.find((p) => p.id === t.projectId)
                  const folder = props.folders.find((f) => f.id === t.folderId)
                  return (
                    <label className="exp-item" key={t.id}>
                      <input
                        type="checkbox"
                        checked={checkedTasks.has(t.id)}
                        onChange={() => toggleExportTask(t.id)}
                      />
                      <span style={{ flex: 1 }}>{t.title}</span>
                      <span className="meta">
                        {project?.name || '未分组'}
                        {folder ? ' · ' + folder.name : ''}
                        {t.planDate ? ' · ' + t.planDate : ''}
                      </span>
                    </label>
                  )
                })}
                {exportCandidates.length === 0 && <div className="ai-empty">当前选择下没有可导出的事项</div>}
              </div>
              <div className="exp-actions">
                <button className="btn btn-pri" onClick={doExport} disabled={exporting}>
                  {exporting ? '导出中…' : `导出 ${checkedTasks.size} 条`}
                </button>
              </div>
            </>
          )}

          {tab === 'backup' && (
            <>
              <div className="place-hint">
                导出会把全部项目、分组、事项和附件打包为 zip；导入只新增内容，不会覆盖或删除现有数据，适合备份与换机迁移。
              </div>
              <div className="backup-actions">
                <button className="btn btn-ghost" onClick={exportBackup} disabled={backingUp || importing}>
                  {backingUp ? '打包中…' : '⇩ 导出完整备份'}
                </button>
                <label className={'btn btn-ghost backup-import' + (importing ? ' disabled' : '')}>
                  {importing ? '导入中…' : '⇧ 导入备份'}
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    hidden
                    disabled={importing}
                    onChange={(e) => {
                      importBackup(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
              {importResult && (
                <div className="import-result">
                  已导入：项目 {importResult.projects} 个 · 分组 {importResult.folders} 个 · 事项{' '}
                  {importResult.tasks} 个 · 附件 {importResult.files} 个
                </div>
              )}
              <div className="place-hint" style={{ marginTop: 10 }}>
                导入的备份不会带入 AI 配置；重复导入会生成新的项目与事项，请按需清理。
              </div>
            </>
          )}
        </div>
      </div>

      <div className="d-foot">
        <button className="btn btn-ghost" onClick={cancel}>
          取消
        </button>
        <button className="btn btn-pri" onClick={save}>
          保存
        </button>
      </div>
    </Modal>
  )
}
