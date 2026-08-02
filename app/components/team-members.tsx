'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

type Member = { user_id: string; email: string; role: string }

export default function TeamMembers({
  teamId,
  currentUserId,
}: {
  teamId: string
  currentUserId: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await supabase.rpc('team_members_list', { p_team_id: teamId })
    setMembers((data ?? []) as Member[])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('add_team_member', {
      p_team_id: teamId,
      p_email: value,
    })
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: 'Error al agregar.' })
    if (data === 'not_found')
      return setMsg({ type: 'error', text: 'No existe un usuario registrado con ese email.' })
    if (data === 'forbidden')
      return setMsg({ type: 'error', text: 'Solo miembros del equipo pueden agregar.' })
    setMsg({ type: 'ok', text: '¡Miembro agregado!' })
    setEmail('')
    load()
    router.refresh()
  }

  const remove = async (userId: string) => {
    await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId)
    load()
    router.refresh()
  }

  return (
    <div className="card">
      <form onSubmit={add} className="flex gap-2">
        <input
          className="field"
          type="email"
          placeholder="email@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
        />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Agregando…' : 'Agregar'}
        </button>
      </form>

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

      <div className="mt-4 flex flex-col gap-2">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3">
            <span className="avatar">{m.email[0]?.toUpperCase() ?? '?'}</span>
            <span className="flex-1 truncate text-[13px]" style={{ color: 'var(--text)' }}>
              {m.email}
              {m.user_id === currentUserId && ' (vos)'}
            </span>
            <button
              type="button"
              className="btn-ghost"
              title="Quitar del equipo"
              onClick={() => remove(m.user_id)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
