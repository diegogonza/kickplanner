import * as XLSX from 'xlsx'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

const STATUS: Record<string, string> = { todo: 'Por hacer', doing: 'En curso', done: 'Hecho' }
const PRIORITY: Record<string, string> = { media: 'Media', alta: 'Alta', urgente: 'Urgente' }

type Row = {
  project_name: string | null
  title: string | null
  status: string | null
  priority: string | null
  assignee_name: string | null
  assignee_email: string | null
  due_date: string | null
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('No autorizado', { status: 401 })

  const url = new URL(request.url)
  const g = (k: string, d = '') => url.searchParams.get(k) ?? d
  const query = g('q').trim()
  const status = g('status', 'all')
  const assignee = g('assignee')
  const project = g('project')
  const due = g('due', 'any')
  const type = g('type', 'all')
  const from = g('from')
  const to = g('to')

  const { data } = await supabase.rpc('search_tasks_adv', {
    p_q: query,
    p_status: status,
    p_assignee: assignee && assignee !== 'me' ? assignee : null,
    p_assignee_me: assignee === 'me',
    p_project: project || null,
    p_due: due,
    p_include_subtasks: type !== 'top',
    p_from: due === 'range' && from ? from : null,
    p_to: due === 'range' && to ? to : null,
  })
  const tasks = (data ?? []) as Row[]

  const rows = tasks.map((t) => ({
    Proyecto: t.project_name ?? '',
    Tarea: t.title ?? '',
    Estado: t.status ? STATUS[t.status] ?? t.status : '',
    Prioridad: t.priority ? PRIORITY[t.priority] ?? t.priority : '',
    Responsable: t.assignee_name?.trim() || t.assignee_email || '',
    Email: t.assignee_email ?? '',
    'Fecha de entrega': t.due_date ?? '',
  }))

  const header = ['Proyecto', 'Tarea', 'Estado', 'Prioridad', 'Responsable', 'Email', 'Fecha de entrega']
  const ws = XLSX.utils.json_to_sheet(rows, { header })
  ws['!cols'] = [{ wch: 22 }, { wch: 42 }, { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 28 }, { wch: 16 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Tareas')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  const today = new Date().toISOString().slice(0, 10)
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="tareas-${today}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
