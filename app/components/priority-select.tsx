'use client'

import { useRef, useState, useTransition } from 'react'
import { PRIORITIES, type Priority } from '@/app/projects/statuses'
import { setPriority } from '@/app/projects/actions'
import Popover from '@/app/components/popover'

/**
 * Selector de prioridad.
 * - Sin `onChange`: persiste solo, con la server action (vista Lista, Mis tareas).
 * - Con `onChange`: delega en el padre (el modal maneja su propio estado).
 */
export default function PrioritySelect({
  taskId,
  projectId,
  current,
  onChange,
}: {
  taskId: string
  projectId: string
  current: Priority | null
  onChange?: (value: Priority | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const btnRef = useRef<HTMLButtonElement>(null)
  const cur = PRIORITIES.find((p) => p.key === current)

  const apply = (value: Priority | null) => {
    setOpen(false)
    if (onChange) {
      onChange(value)
      return
    }
    const fd = new FormData()
    fd.set('id', taskId)
    fd.set('project_id', projectId)
    fd.set('priority', value ?? '')
    startTransition(() => {
      setPriority(fd)
    })
  }

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

      <Popover open={open} onClose={() => setOpen(false)} anchor={btnRef} minWidth={190}>
        {PRIORITIES.map((p) => (
          <button key={p.key} type="button" className="dropdown-item" onClick={() => apply(p.key)}>
            <span className={`pill ${p.pill}`}>{p.label}</span>
          </button>
        ))}
        {current && (
          <button type="button" className="dropdown-item" style={{ color: 'var(--text-3)' }} onClick={() => apply(null)}>
            Sin prioridad
          </button>
        )}
      </Popover>
    </>
  )
}
