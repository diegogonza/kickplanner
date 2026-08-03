import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import Avatar from '@/app/components/avatar'
import { displayName } from '@/app/projects/statuses'
import { openNotification, markAllRead } from './actions'

type Notif = {
  id: string
  type: string
  read: boolean
  created_at: string
  actor_name: string | null
  actor_avatar: string | null
  actor_email: string | null
  task_id: string | null
  task_title: string | null
  project_id: string | null
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'hace un momento'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es')
}

function verbFor(type: string): string {
  if (type === 'mention') return 'te mencionó en'
  if (type === 'assigned') return 'te asignó la tarea'
  return 'actualizó'
}

export default async function NotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase.rpc('notifications_feed')
  const items = (data ?? []) as Notif[]
  const unread = items.filter((n) => !n.read).length

  return (
    <div className="flex h-screen">
      <Sidebar active="notificaciones" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">
              Notificaciones
              {unread > 0 && <span className="count-badge">{unread}</span>}
            </h1>
          </div>
          {unread > 0 && (
            <form action={markAllRead}>
              <button type="submit" className="btn btn-outline">Marcar todas como leídas</button>
            </form>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl">
            {items.length === 0 ? (
              <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
                <p className="card-title mb-1">Sin notificaciones</p>
                <p className="card-desc">Aquí verás cuando te mencionen o te asignen una tarea.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((n) => {
                  const who = displayName({ full_name: n.actor_name, email: n.actor_email ?? '' })
                  return (
                    <form key={n.id} action={openNotification}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="task_id" value={n.task_id ?? ''} />
                      <input type="hidden" name="project_id" value={n.project_id ?? ''} />
                      <button type="submit" className={`notif-item ${n.read ? '' : 'unread'}`}>
                        <Avatar name={n.actor_name} email={n.actor_email ?? ''} url={n.actor_avatar} size={34} />
                        <span className="notif-text">
                          <span>
                            <b>{who}</b> {verbFor(n.type)}{' '}
                            <b>{n.task_title ?? 'una tarea'}</b>
                          </span>
                          <div className="notif-sub">{n.type === 'mention' ? 'Mención en un comentario' : 'Asignación de tarea'}</div>
                        </span>
                        <span className="notif-time">{timeAgo(n.created_at)}</span>
                        {!n.read && <span className="notif-dot" />}
                      </button>
                    </form>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
