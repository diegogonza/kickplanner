'use client'

import { useState } from 'react'
import { PRIORITIES, type Priority } from '@/app/projects/statuses'
import { setPriority } from '@/app/projects/actions'

export default function PrioritySelect({
  taskId,
  projectId,
  current,
}: {
  taskId: string
  projectId: string
  current: Priority | null
}) {
  const [open, setOpen] = useState(false)
  const cur = PRIORITIES.find((p) => p.key === current)

  return (
    <div className="dropdown">
      <button type="button" className="dropdown-trigger" onClick={() => setOpen((o) => !o)}>
        {cur ? (
          <span className={`pill ${cur.pill}`}>{cur.label}</span>
        ) : (
          <span className="text-[13px]" style={{ color: 'var(--text-3)' }}>
            Sin prioridad
          </span>
        )}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="dropdown-menu">
          {PRIORITIES.map((p) => (
            <form key={p.key} action={setPriority} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="id" value={taskId} />
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="priority" value={p.key} />
              <button type="submit" className="dropdown-item">
                <span className={`pill ${p.pill}`}>{p.label}</span>
              </button>
            </form>
          ))}
          {current && (
            <form action={setPriority} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="id" value={taskId} />
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="priority" value="" />
              <button type="submit" className="dropdown-item">
                Sin prioridad
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
