'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

type Member = { user_id: string; email: string; role: string }

export default function ShareButton({
  projectId,
  isOwner,
  currentUserId,
}: {
  projectId: string
  isOwner: boolean
  currentUserId: string
}) {
  const supabase = createClient()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const loadMembers = async () => {
    const { data } = await supabase.rpc('project_members_list', { p_project_id: projectId })
    setMembers((data ?? []) as Member[])
  }

  useEffect(() => {
    if (open) {
      loadMembers()
      setMsg(null)
      setEmail('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('invite_member', {
      p_project_id: projectId,
      p_email: value,
    })
    setBusy(false)

    if (error) {
      setMsg({ type: 'error', text: 'Ocurrió un error al invitar.' })
      return
    }
    if (data === 'not_found') {
      setMsg({ type: 'error', text: 'No existe un usuario registrado con ese email.' })
      return
    }
    if (data === 'forbidden') {
      setMsg({ type: 'error', text: 'Solo el dueño del proyecto puede invitar.' })
      return
    }
    setMsg({ type: 'ok', text: '¡Miembro agregado!' })
    setEmail('')
    loadMembers()
    router.refresh()
  }

  const removeMember = async (userId: string) => {
    await supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId)
    loadMembers()
    router.refresh()
  }

  return (
    <>
      <button className="btn btn-outline" type="button" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6M22 11h-6" />
        </svg>
        Compartir
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Compartir proyecto</h2>
            <p className="modal-sub">Invitá a personas con cuenta para colaborar en este proyecto.</p>

            {isOwner && (
              <form onSubmit={invite} className="flex gap-2">
                <input
                  className="field"
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                />
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  {busy ? 'Invitando…' : 'Invitar'}
                </button>
              </form>
            )}

            {msg && (
              <p
                className="mt-2 rounded p-2 text-sm"
                style={{
                  background: msg.type === 'ok' ? 'var(--low-bg)' : 'var(--urgent-bg)',
                  color: msg.type === 'ok' ? 'var(--low-fg)' : 'var(--urgent-fg)',
                }}
              >
                {msg.text}
              </p>
            )}

            <div className="section-label">Miembros ({members.length})</div>
            <div className="flex flex-col gap-2">
              {members.map((m) => {
                const isMemberOwner = m.role === 'owner'
                return (
                  <div key={m.user_id} className="flex items-center gap-3">
                    <span className="avatar">{m.email[0]?.toUpperCase() ?? '?'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium" style={{ color: 'var(--text)' }}>
                        {m.email}
                        {m.user_id === currentUserId && ' (vos)'}
                      </div>
                    </div>
                    <span className={`pill ${isMemberOwner ? 'pill-info' : 'pill-low'}`}>
                      {isMemberOwner ? 'Dueño' : 'Miembro'}
                    </span>
                    {isOwner && !isMemberOwner && (
                      <button
                        type="button"
                        className="btn-ghost"
                        title="Quitar del proyecto"
                        onClick={() => removeMember(m.user_id)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
