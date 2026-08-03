'use client'

import { useState } from 'react'
import { setAssignee } from '@/app/projects/actions'
import { displayName, type Member } from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'

export default function AssigneeSelect({
  taskId,
  projectId,
  current,
  members,
}: {
  taskId: string
  projectId: string
  current: string | null
  members: Member[]
}) {
  const [open, setOpen] = useState(false)
  const cur = members.find((m) => m.user_id === current)

  return (
    <div className="dropdown">
      <button type="button" className="dropdown-trigger" onClick={() => setOpen((o) => !o)}>
        {cur ? (
          <span className="flex items-center gap-2">
            <Avatar name={cur.full_name} email={cur.email} url={cur.avatar_url} size={24} />
            <span className="text-[13px]" style={{ color: 'var(--text)' }}>{displayName(cur)}</span>
          </span>
        ) : (
          <span className="text-[13px]" style={{ color: 'var(--text-3)' }}>Sin responsable</span>
        )}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="dropdown-menu" style={{ minWidth: 220, maxHeight: 240, overflowY: 'auto' }}>
          {members.map((m) => (
            <form key={m.user_id} action={setAssignee} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="id" value={taskId} />
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="assignee_id" value={m.user_id} />
              <button type="submit" className="dropdown-item">
                <span className="flex items-center gap-2">
                  <Avatar name={m.full_name} email={m.email} url={m.avatar_url} size={22} />
                  {displayName(m)}
                </span>
              </button>
            </form>
          ))}
          {current && (
            <form action={setAssignee} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="id" value={taskId} />
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="assignee_id" value="" />
              <button type="submit" className="dropdown-item">Quitar responsable</button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
