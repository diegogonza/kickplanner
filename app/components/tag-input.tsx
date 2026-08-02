'use client'

import { useState } from 'react'
import { addTag } from '@/app/projects/actions'
import type { Tag } from '@/app/projects/statuses'

export default function TagInput({
  taskId,
  projectId,
  allTags,
  assignedIds,
}: {
  taskId: string
  projectId: string
  allTags: Tag[]
  assignedIds: string[]
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const query = q.trim().toLowerCase()
  const available = allTags.filter((t) => !assignedIds.includes(t.id))
  const filtered = available.filter((t) => t.name.toLowerCase().includes(query))
  const exactExists = allTags.some((t) => t.name.toLowerCase() === query)

  const reset = () => {
    setOpen(false)
    setQ('')
  }

  return (
    <div className="dropdown" style={{ display: 'block' }}>
      {/* Escribir + Enter: usa/crea la etiqueta tipeada */}
      <form
        action={addTag}
        onSubmit={reset}
        className="add-row"
        style={{ border: '1px solid var(--border-strong)' }}
      >
        <input type="hidden" name="task_id" value={taskId} />
        <input type="hidden" name="project_id" value={projectId} />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <input
          name="name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar o crear etiqueta…"
          autoComplete="off"
        />
      </form>

      {open && (
        <div
          className="dropdown-menu"
          style={{ width: '100%', maxHeight: 240, overflowY: 'auto' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.map((t) => (
            <form key={t.id} action={addTag} onSubmit={reset}>
              <input type="hidden" name="task_id" value={taskId} />
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="name" value={t.name} />
              <button type="submit" className="dropdown-item">
                <span className="tag-pill" style={{ background: `${t.color}1A`, color: t.color }}>
                  {t.name}
                </span>
              </button>
            </form>
          ))}

          {query && !exactExists && (
            <form action={addTag} onSubmit={reset}>
              <input type="hidden" name="task_id" value={taskId} />
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="name" value={q.trim()} />
              <button type="submit" className="dropdown-item">
                Crear “{q.trim()}”
              </button>
            </form>
          )}

          {filtered.length === 0 && !query && (
            <div className="dropdown-item" style={{ cursor: 'default' }}>
              No hay más etiquetas
            </div>
          )}
        </div>
      )}
    </div>
  )
}
