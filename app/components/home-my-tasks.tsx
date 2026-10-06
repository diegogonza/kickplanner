'use client'

import { useState } from 'react'
import Link from 'next/link'
import Avatar from '@/app/components/avatar'
import { toggleComplete } from '@/app/projects/actions'
import { guardComplete } from '@/app/lib/complete-subtasks'
import { formatDateShort } from '@/app/projects/statuses'

export type HomeTask = {
  id: string
  title: string
  status: string
  due_date: string | null
  project_id: string
  project_name: string
  project_hue: number | null
}

// Tono de respaldo si el proyecto no tiene color_hue (mismo criterio que el calendario)
function hashHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % 360
}

const VISIBLE = 6

/**
 * Módulo "Mis tareas" de la portada: tareas del usuario que vencen hoy y,
 * aparte, las atrasadas. Nunca muestra finalizadas (llegan filtradas).
 */
export default function HomeMyTasks({
  today,
  overdue,
  user,
}: {
  today: HomeTask[]
  overdue: HomeTask[]
  user: { name: string | null; email: string; avatarUrl: string | null }
}) {
  const [tab, setTab] = useState<'hoy' | 'retraso'>('hoy')
  const [expanded, setExpanded] = useState(false)
  const list = tab === 'hoy' ? today : overdue
  const shown = expanded ? list : list.slice(0, VISIBLE)

  const tabs = [
    { key: 'hoy' as const, label: 'Hoy', count: today.length },
    { key: 'retraso' as const, label: 'Con retraso', count: overdue.length },
  ]

  return (
    <section className="card hm-card" aria-labelledby="hm-tasks-title">
      <header className="hm-head">
        <Avatar name={user.name} email={user.email} url={user.avatarUrl} size={26} />
        <h2 className="hm-title" id="hm-tasks-title">Mis tareas</h2>
      </header>

      <div className="hm-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`hm-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => {
              setTab(t.key)
              setExpanded(false)
            }}
          >
            {t.label}
            {t.count > 0 && <span className="hm-tab-count"> ({t.count})</span>}
          </button>
        ))}
      </div>

      <div className="hm-body">
        {list.length === 0 ? (
          <p className="hm-empty">
            {tab === 'hoy' ? 'No tienes tareas para hoy.' : 'No tienes tareas atrasadas.'}
          </p>
        ) : (
          <ul className="hm-tasks">
            {shown.map((t) => {
              const hue = t.project_hue ?? hashHue(t.project_id)
              return (
                <li key={t.id} className="hm-task">
                  <form action={toggleComplete} onSubmit={guardComplete(t.id)}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="project_id" value={t.project_id} />
                    <input type="hidden" name="status" value={t.status} />
                    <button type="submit" className="task-check" title="Marcar como completada" aria-label={`Completar ${t.title}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </button>
                  </form>

                  <Link href={`/projects/${t.project_id}?task=${t.id}`} className="hm-task-title" title={t.title}>
                    {t.title}
                  </Link>

                  <Link href={`/projects/${t.project_id}`} className="hm-proj-chip" title={t.project_name}>
                    <span className="hm-proj-sq" style={{ background: `hsl(${hue} 70% 68%)` }} />
                    <span className="hm-proj-name">{t.project_name}</span>
                  </Link>

                  {t.due_date && (
                    <span className={`hm-due ${tab === 'retraso' ? 'late' : ''}`}>
                      {tab === 'hoy' ? 'Hoy' : formatDateShort(t.due_date)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {list.length > VISIBLE ? (
        <button type="button" className="hm-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Mostrar menos' : 'Mostrar más'}
        </button>
      ) : (
        <Link href="/mis-tareas" className="hm-more">Ver todas mis tareas</Link>
      )}
    </section>
  )
}
