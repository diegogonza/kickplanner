'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setAssignee } from '@/app/projects/actions'
import { displayName, type Member } from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'
import Popover from '@/app/components/popover'

/**
 * Selector de responsable.
 * - Sin `onChange`: persiste solo, con la server action (vista Lista).
 * - Con `onChange`: delega en el padre (el modal maneja su propio estado).
 */
export default function AssigneeSelect({
  taskId,
  projectId,
  current,
  members,
  onChange,
}: {
  taskId: string
  projectId: string
  current: string | null
  members: Member[]
  onChange?: (userId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const btnRef = useRef<HTMLButtonElement>(null)
  const cur = members.find((m) => m.user_id === current)

  const apply = (userId: string | null) => {
    setOpen(false)
    setQ('')
    setError(null)
    if (onChange) {
      onChange(userId)
      return
    }
    const fd = new FormData()
    fd.set('id', taskId)
    fd.set('project_id', projectId)
    fd.set('assignee_id', userId ?? '')
    // `setAssignee` puede rechazar (el RPC valida que la persona sea miembro del
    // proyecto). Sin await ni catch quedaba una promesa suelta: el fallo no se
    // veía y React lo reportaba como rechazo no atrapado.
    startTransition(async () => {
      try {
        await setAssignee(fd)
      } catch {
        setError('No se pudo cambiar el responsable.')
        router.refresh()
      }
    })
  }

  const query = q.trim().toLowerCase()
  const shown = query
    ? members.filter((m) => displayName(m).toLowerCase().includes(query) || m.email.toLowerCase().includes(query))
    : members

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="dropdown-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {cur ? (
          <span className="flex items-center gap-2">
            <Avatar name={cur.full_name} email={cur.email} url={cur.avatar_url} size={24} />
            <span className="text-[13px]" style={{ color: 'var(--text)' }}>{displayName(cur)}</span>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="ava-empty" aria-hidden>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            </span>
            <span className="text-[13px]" style={{ color: 'var(--text-3)' }}>Sin responsable</span>
          </span>
        )}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {error && (
        <p className="side-error" role="alert" style={{ margin: '6px 0 0' }}>
          {error}
        </p>
      )}

      <Popover open={open} onClose={() => setOpen(false)} anchor={btnRef} minWidth={230}>
        {members.length > 6 && (
          <input
            className="pop-search"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar persona…"
            aria-label="Buscar persona"
          />
        )}
        {shown.map((m) => (
          <button key={m.user_id} type="button" className="dropdown-item" onClick={() => apply(m.user_id)}>
            <span className="flex items-center gap-2">
              <Avatar name={m.full_name} email={m.email} url={m.avatar_url} size={22} />
              {displayName(m)}
            </span>
          </button>
        ))}
        {shown.length === 0 && (
          <div className="dropdown-item" style={{ cursor: 'default' }}>Sin resultados</div>
        )}
        {current && (
          <button type="button" className="dropdown-item" style={{ color: 'var(--text-3)' }} onClick={() => apply(null)}>
            Quitar responsable
          </button>
        )}
      </Popover>
    </>
  )
}
