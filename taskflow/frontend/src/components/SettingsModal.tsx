import { useEffect, useState } from 'react'
import type { Settings, StorageInfo, Theme, View } from '../types'
import { api } from '../api'
import Modal from './Modal'

interface Props {
  settings: Settings
  onClose: () => void
  onSaved: (settings: Settings) => void
  onPreviewTheme: (theme: Theme | null) => void
  onToast: (message: string) => void
}

const MODELS = ['gpt-4o', 'gpt-4o-mini', 'deepseek-chat', 'qwen-plus', 'claude-3.5-sonnet']

type Tab = 'ai' | 'general' | 'storage'

const TABS: { key: Tab; label: string }[] = [
  { key: 'ai', label: 'AI 配置' },
  { key: 'general', label: '通用' },
  { key: 'storage', label: '数据存储' },
]

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
