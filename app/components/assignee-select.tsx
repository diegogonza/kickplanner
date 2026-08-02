'use client'

import { useState } from 'react'
import { setAssignee } from '@/app/projects/actions'
import type { Member } from '@/app/projects/statuses'

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
            <span className="avatar" style={{ width: 24, height: 24, fontSize: 11 }}>
              {cur.email[0]?.toUpperCase()}
            </span>
            <span className="text-[13px]" style={{ color: 'var(--text)' }}>{cur.email}</span>
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
                  <span className="avatar" style={{ width: 22, height: 22, fontSize: 10 }}>
                    {m.email[0]?.toUpperCase()}
                  </span>
                  {m.email}
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
