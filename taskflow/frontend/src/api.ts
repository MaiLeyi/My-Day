import type {
  AiCandidate,
  Attachment,
  Bootstrap,
  Folder,
  Project,
  Settings,
  Task,
  TaskInput,
} from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!resp.ok) {
    let message = `请求失败（${resp.status}）`
    try {
      const body = await resp.json()
      message = body.detail || body.message || message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  if (resp.status === 204) return undefined as T
  return resp.json() as Promise<T>
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body),
})

export const api = {
  bootstrap: () => request<Bootstrap>('/api/bootstrap'),

  createProject: (name: string) => request<Project>('/api/projects', json({ name })),
  updateProject: (id: string, patch: { name?: string; archived?: boolean }) =>
    request<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),

  createFolder: (projectId: string, name: string) =>
    request<Folder>('/api/folders', json({ projectId, name })),
  updateFolder: (id: string, patch: { name?: string; projectId?: string }) =>
    request<Folder>(`/api/folders/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteFolder: (id: string) => request<void>(`/api/folders/${id}`, { method: 'DELETE' }),

  createTask: (input: TaskInput) => request<Task>('/api/tasks', json(input)),
  updateTask: (id: string, patch: Partial<TaskInput>) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTask: (id: string) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  moveTask: (id: string, projectId: string, folderId: string) =>
    request<Task>(`/api/tasks/${id}/move`, json({ projectId, folderId })),
  scheduleTask: (id: string, planDate: string) =>
    request<Task>(`/api/tasks/${id}/schedule`, json({ planDate })),

  reorder: (kind: 'project' | 'folder' | 'task', id: string, targetId: string) =>
    request<{ ok: boolean }>('/api/reorder', json({ kind, id, targetId })),

  batchDelete: (payload: { projectIds: string[]; folderIds: string[]; taskIds: string[] }) =>
    request<{ ok: boolean }>('/api/batch/delete', json(payload)),

  saveSettings: (settings: Settings) =>
    request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  aiTest: (cfg: { apiKey: string; baseUrl: string; model: string }) =>
    request<{ ok: boolean; message: string }>('/api/ai/test', json(cfg)),

  aiSplit: (payload: { desc: string; projectId: string; folderId: string; projectSplit: boolean }) =>
    request<{ candidates: AiCandidate[] }>('/api/ai/split', json(payload)),

  exportTasks: async (ids: string[], format: 'csv' | 'json'): Promise<Blob> => {
    const resp = await fetch('/api/export', {
      ...json({ ids, format }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!resp.ok) throw new Error('导出失败')
    return resp.blob()
  },
}

export type { Attachment }
