import { useState } from 'react'
import type { Folder, Project } from '../types'
import { api } from '../api'

interface Props {
  taskId: string
  projects: Project[]
  folders: Folder[]
  onClose: () => void
  onMoved: (message: string) => void
  onToast: (message: string) => void
}

export default function MoveModal(props: Props) {
  const [busy, setBusy] = useState(false)

  const move = async (projectId: string, folderId: string) => {
    if (busy) return
    setBusy(true)
    try {
      await api.moveTask(props.taskId, projectId, folderId)
      props.onMoved('已移动')
      props.onClose()
    } catch (err) {
      props.onToast((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="mask" onClick={props.onClose} />
      <div className="modal sm">
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="d-head">
            <h3>移动到…</h3>
            <button className="d-close" onClick={props.onClose}>
              ×
            </button>
          </div>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {props.projects
              .filter((p) => !p.archived)
              .map((p) => (
                <div key={p.id}>
                  <div className="move-item" onClick={() => move(p.id, '')}>
                    <span className="dot" />
                    <span style={{ flex: 1 }}>{p.name}</span>
                  </div>
                  {props.folders
                    .filter((f) => f.projectId === p.id)
                    .map((f) => (
                      <div
                        key={f.id}
                        className="move-item"
                        style={{ marginLeft: 26 }}
                        onClick={() => move(p.id, f.id)}
                      >
                        <span className="f-icon">–</span>
                        <span style={{ flex: 1 }}>{f.name}</span>
                      </div>
                    ))}
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  )
}
