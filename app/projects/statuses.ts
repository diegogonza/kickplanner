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
  created_at: string
}

export const STATUSES: { key: Status; label: string; color: string }[] = [
  { key: 'todo', label: 'Por hacer', color: 'var(--info-fg)' },
  { key: 'doing', label: 'En curso', color: 'var(--mod-fg)' },
  { key: 'done', label: 'Hecho', color: 'var(--low-fg)' },
]

export const PRIORITIES: { key: Priority; label: string; pill: string }[] = [
  { key: 'media', label: 'Media', pill: 'pill-info' },
  { key: 'alta', label: 'Alta', pill: 'pill-mod' },
  { key: 'urgente', label: 'Urgente', pill: 'pill-urgent' },
]
