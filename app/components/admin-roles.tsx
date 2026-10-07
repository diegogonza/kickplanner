'use client'

import { useState, useTransition } from 'react'
import Avatar from '@/app/components/avatar'
import { confirmDialog } from '@/app/components/confirm-dialog'
import { toast, toastIfFailed } from '@/app/components/toast'
import { setMemberRole } from '@/app/admin/actions'

export type AdminMember = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  job_title: string | null
  role: 'admin' | 'member'
}

const ROLES: { key: AdminMember['role']; label: string }[] = [
  { key: 'admin', label: 'Admin' },
  { key: 'member', label: 'Miembro' },
]

export default function AdminRoles({ members, currentUserId }: { members: AdminMember[]; currentUserId: string }) {
  // Estado local para que el cambio se vea al instante; si falla se revierte.
  const [roles, setRoles] = useState<Record<string, AdminMember['role']>>(
    () => Object.fromEntries(members.map((m) => [m.id, m.role]))
  )
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const admins = Object.values(roles).filter((r) => r === 'admin').length

  async function change(m: AdminMember, next: AdminMember['role']) {
    const prev = roles[m.id]
    if (prev === next) return

    if (m.id === currentUserId && next === 'member') {
      const ok = await confirmDialog({
        title: '¿Quitarte el rol de administrador?',
        body: 'Dejarás de ver Pagos, Semana del equipo y esta página. Solo otro administrador podrá devolverte el rol.',
        confirmLabel: 'Quitarme admin',
        tone: 'alert',
      })
      if (!ok) return
    }

    setRoles((r) => ({ ...r, [m.id]: next }))
    setPendingId(m.id)
    startTransition(async () => {
      const res = await setMemberRole(m.id, next)
      setPendingId(null)
      if (toastIfFailed(res)) {
        setRoles((r) => ({ ...r, [m.id]: prev }))
        return
      }
      toast(`${m.full_name || m.email} ahora es ${next === 'admin' ? 'administrador' : 'miembro'}.`, 'info')
    })
  }

  return (
    <div className="ptable-wrap">
      <table className="ptable adm-table">
        <thead>
          <tr>
            <th>Miembro</th>
            <th>Cargo</th>
            <th>Rol</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const role = roles[m.id]
            // El único admin no puede bajarse: lo bloquea también la base.
            const lastAdmin = role === 'admin' && admins === 1
            return (
              <tr key={m.id}>
                <td>
                  <div className="adm-member">
                    <Avatar name={m.full_name} email={m.email} url={m.avatar_url} size={30} />
                    <div className="adm-member-text">
                      <span className="adm-name">
                        {m.full_name || m.email.split('@')[0]}
                        {m.id === currentUserId && <span className="adm-you">Tú</span>}
                      </span>
                      <span className="adm-email">{m.email}</span>
                    </div>
                  </div>
                </td>
                <td>{m.job_title || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                <td>
                  <div
                    className="adm-seg"
                    role="radiogroup"
                    aria-label={`Rol de ${m.full_name || m.email}`}
                    aria-busy={pendingId === m.id}
                  >
                    {ROLES.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        role="radio"
                        aria-checked={role === r.key}
                        className={`adm-seg-btn ${role === r.key ? 'on' : ''}`}
                        disabled={pendingId === m.id || (lastAdmin && r.key === 'member')}
                        title={lastAdmin && r.key === 'member' ? 'Debe quedar al menos un administrador' : undefined}
                        onClick={() => change(m, r.key)}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
