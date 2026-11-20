import { useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import type { AiContext, Folder, Project, Scope, Task } from '../types'
import type { DragPayload } from '../utils'
import { getDragPayload, setDragPayload } from '../utils'

interface Props {
  projects: Project[]
  folders: Folder[]
  tasks: Task[]
  scope: Scope | null
  batchMode: boolean
  aiReady: boolean
  selected: Set<string>
  onSelectScope: (scope: Scope | null) => void
  onToggleSelect: (type: 'p' | 'f', id: string) => void
  onNewProject: () => void
  onNewFolder: (projectId: string) => void
  onNewTask: (projectId: string, folderId?: string) => void
  onAi: (ctx: AiContext) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onDeleteProject: (id: string) => void
  onDeleteFolder: (id: string) => void
  onReorder: (src: DragPayload, targetType: 'project' | 'folder', targetId: string) => void
  onOpenSettings: () => void
  onToggleBatch: () => void
  onExport: () => void
}

export default function Sidebar(props: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState('')
  const [menu, setMenu] = useState<{ projectId: string; top: number; left: number } | null>(null)

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openMenu = (projectId: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    setMenu({ projectId, top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 170) })
  }

  const allowDrop = (event: ReactDragEvent) => {
    if (getDragPayload()) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const drop = (event: ReactDragEvent, type: 'project' | 'folder', id: string) => {
    event.preventDefault()
    event.stopPropagation()
    setDragOver('')
    const src = getDragPayload()
    setDragPayload(null)
    if (src) props.onReorder(src, type, id)
  }

  const activeProjects = props.projects.filter((p) => !p.archived)
  const archived = props.projects.filter((p) => p.archived)

  return (
    <aside className="sidebar">
      <div className="usercard">
        <div className="avatar">周</div>
        <div>
          <div className="un">周正义</div>
          <div className="ur">我的工作台</div>
        </div>
      </div>
      <div className="side-tools">
        <button className="btn btn-ghost" onClick={props.onToggleBatch}>
          ☑ 选择
        </button>
        <button className="btn btn-ghost" onClick={props.onExport}>
          导出
        </button>
      </div>
      <div className="tree">
        <div
          className={'row all-row' + (props.scope === null ? ' active' : '')}
          onClick={() => props.onSelectScope(null)}
        >
          <span className="f-icon">▦</span>
          <span style={{ flex: 1 }}>全部事项({props.tasks.length})</span>
        </div>

        {activeProjects.map((p) => {
          const projectFolders = props.folders.filter((f) => f.projectId === p.id)
          const projectTasks = props.tasks.filter((t) => t.projectId === p.id)
          const isOpen = !collapsed.has(p.id)
          return (
            <div key={p.id} className={'pnode' + (isOpen ? ' open' : '')}>
              <div
                className={
                  'row' +
                  (props.scope?.type === 'project' && props.scope.id === p.id ? ' active' : '') +
                  (dragOver === 'project:' + p.id ? ' drag-over' : '')
                }
                draggable={!props.batchMode}
                onDragStart={() => setDragPayload({ type: 'project', id: p.id })}
                onDragEnd={() => setDragPayload(null)}
                onDragOver={(e) => {
                  allowDrop(e)
                  setDragOver('project:' + p.id)
                }}
                onDragLeave={() => setDragOver('')}
                onDrop={(e) => drop(e, 'project', p.id)}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button,input')) return
                  if ((e.target as HTMLElement).closest('.caret')) {
                    toggleCollapse(p.id)
                    return
                  }
                  props.onSelectScope({ type: 'project', id: p.id })
                }}
              >
                {props.batchMode && (
                  <input
                    type="checkbox"
                    className="tree-chk"
                    checked={props.selected.has('p:' + p.id)}
                    onChange={() => props.onToggleSelect('p', p.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <button className="caret">▶</button>
                <span className="dot" />
                <span className="pname">
                  {p.name}({projectTasks.length})
                </span>
                <span className="row-actions">
                  <button
                    className="mini"
                    title="新建分组 / 事项"
                    onClick={(e) => {
                      e.stopPropagation()
                      openMenu(p.id, e.currentTarget)
                    }}
                  >
                    ＋
                  </button>
                  <button
                    className={'mini' + (props.aiReady ? '' : ' ai-off')}
                    title="AI 拆分此项目"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onAi({ projectId: p.id, folderId: '', projectSplit: true })
                    }}
                  >
                    ✂
                  </button>
                  <button
                    className="mini"
                    title="归档项目"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onArchive(p.id)
                    }}
                  >
                    ⤓
                  </button>
                  <button
                    className="mini"
                    title="删除项目"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onDeleteProject(p.id)
                    }}
                  >
                    ×
                  </button>
                </span>
              </div>
              <div className="sub">
                {projectFolders.map((f) => {
                  const count = props.tasks.filter((t) => t.folderId === f.id).length
                  return (
                    <div key={f.id} className="fnode">
                      <div
                        className={
                          'row' +
                          (props.scope?.type === 'folder' && props.scope.id === f.id ? ' active' : '') +
                          (dragOver === 'folder:' + f.id ? ' drag-over' : '')
                        }
                        draggable={!props.batchMode}
                        onDragStart={() => setDragPayload({ type: 'folder', id: f.id })}
                        onDragEnd={() => setDragPayload(null)}
                        onDragOver={(e) => {
                          allowDrop(e)
                          setDragOver('folder:' + f.id)
                        }}
                        onDragLeave={() => setDragOver('')}
                        onDrop={(e) => drop(e, 'folder', f.id)}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button,input')) return
                          props.onSelectScope({ type: 'folder', id: f.id })
                        }}
                      >
                        {props.batchMode && (
                          <input
                            type="checkbox"
                            className="tree-chk"
                            checked={props.selected.has('f:' + f.id)}
                            onChange={() => props.onToggleSelect('f', f.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <span className="f-icon">–</span>
                        <span style={{ flex: 1 }}>
                          {f.name}({count})
                        </span>
                        <span className="row-actions">
                          <button
                            className="mini"
                            title="在此分组下新建事项"
                            onClick={(e) => {
                              e.stopPropagation()
                              props.onNewTask(f.projectId, f.id)
                            }}
                          >
                            ＋
                          </button>
                          <button
                            className={'mini' + (props.aiReady ? '' : ' ai-off')}
                            title="AI 拆分到本分组"
                            onClick={(e) => {
                              e.stopPropagation()
                              props.onAi({ projectId: f.projectId, folderId: f.id, projectSplit: false })
                            }}
                          >
                            ✂
                          </button>
                          <button
                            className="mini"
                            title="删除分组"
                            onClick={(e) => {
                              e.stopPropagation()
                              props.onDeleteFolder(f.id)
                            }}
                          >
                            ×
                          </button>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {archived.length > 0 && (
          <div className="archive-section">
            <div className="archive-title">已归档 ({archived.length})</div>
            {archived.map((p) => (
              <div key={p.id} className="row archived-row">
                <span className="f-icon">⤓</span>
                <span style={{ flex: 1, color: 'var(--sub2)' }}>{p.name}</span>
                <span className="row-actions">
                  <button className="mini" title="恢复项目" onClick={() => props.onUnarchive(p.id)}>
                    ↺
                  </button>
                  <button className="mini" title="删除项目" onClick={() => props.onDeleteProject(p.id)}>
                    ×
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="add-proj" onClick={props.onOpenSettings}>
        ⚙ 设置
      </button>
      <button className="add-proj" onClick={props.onNewProject}>
        ＋ 新建项目
      </button>

      {menu && (
        <>
          <div className="mask" onClick={() => setMenu(null)} style={{ background: 'transparent' }} />
          <div className="ctx-menu" style={{ top: menu.top, left: menu.left }}>
            <button
              onClick={() => {
                props.onNewFolder(menu.projectId)
                setMenu(null)
              }}
            >
              新建分组
            </button>
            <button
              onClick={() => {
                props.onNewTask(menu.projectId)
                setMenu(null)
              }}
            >
              新建事项
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
