'use client'

import { useEffect, useState } from 'react'
import { createTask } from '@/app/projects/actions'

export default function NewTaskButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Agregar tarea
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Nueva tarea</h2>
            <p className="modal-sub">Se creará en estado “Por hacer”. Podés completar el resto abriéndola.</p>
            <form action={createTask} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="status" value="todo" />
              <input
                name="title"
                className="field"
                placeholder="¿Qué hay que hacer?"
                autoFocus
                autoComplete="off"
                required
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Crear tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
