export type Status = 'todo' | 'doing' | 'done'
export type Priority = '' | 'high' | 'mid' | 'low'
export type View = 'list' | 'month' | 'week' | 'day'
export type Theme = 'soft' | 'warm' | 'blue' | 'dark'

export interface Project {
  id: string
  name: string
  shade: number
  archived: boolean
  sort: number
  createdAt: string
}

export interface Folder {
  id: string
  projectId: string
  name: string
  sort: number
  createdAt: string
}

export interface Attachment {
  name: string
  size: number
  fileId?: string
  url?: string
  mime?: string
}

export interface UploadedFile {
  id: string
  name: string
  size: number
  mime: string
  url: string
}

export interface Task {
  id: string
  title: string
  projectId: string
  folderId: string
  status: Status
  priority: Priority
  planDate: string
  dueDate: string
  start: string
  end: string
  desc: string
  remark: string
  images: string[]
  attachments: Attachment[]
  sort: number
  createdAt: string
  completedAt: string
}

export interface AiSettings {
  apiKey: string
  baseUrl: string
  model: string
}

export interface Settings {
  ai: AiSettings
  defaultView: View
  theme: Theme
}

export interface Bootstrap {
  projects: Project[]
  folders: Folder[]
  tasks: Task[]
  settings: Settings
}

export interface TaskInput {
  title: string
  projectId: string
  folderId: string
  status: Status
  priority: Priority
  planDate: string
  dueDate: string
  start: string
  end: string
  desc: string
  remark: string
  images: string[]
  attachments: Attachment[]
}

export interface TaskDraft extends TaskInput {
  id?: string
}

export interface Scope {
  type: 'project' | 'folder'
  id: string
}

export interface AiCandidate {
  title: string
  priority: Priority
  planDate: string
  checked: boolean
}

export interface AiContext {
  projectId: string
  folderId: string
  projectSplit: boolean
}

export type StatusFilter = 'all' | 'todo' | 'doing' | 'done' | 'unplanned'
