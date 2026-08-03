export type Status = 'todo' | 'doing' | 'done'
export type Priority = 'media' | 'alta' | 'urgente'

export type Tag = { id: string; name: string; color: string }

export type Task = {
  id: string
  title: string
  status: Status
  parent_id: string | null
  description: string | null
  priority: Priority | null
  due_date: string | null
  assignee_id: string | null
  drive_url: string | null
  created_at: string
}

export type Member = { user_id: string; email: string; role: string }

export const STATUSES: { key: Status; label: string; color: string }[] = [
  { key: 'todo', label: 'Por hacer', color: 'var(--info-fg)' },
  { key: 'doing', label: 'En curso', color: 'var(--mod-fg)' },
  { key: 'done', label: 'Hecho', color: 'var(--low-fg)' },
]

export const PRIORITIES: { key: Priority; label: string; pill: string; color: string }[] = [
  { key: 'media', label: 'Media', pill: 'pill-info', color: '#2E77E6' },
  { key: 'alta', label: 'Alta', pill: 'pill-mod', color: '#E0890B' },
  { key: 'urgente', label: 'Urgente', pill: 'pill-urgent', color: '#E5484D' },
]
