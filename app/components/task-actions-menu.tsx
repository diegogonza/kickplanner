'use client'

import { useRef, useState, useTransition } from 'react'
import { deleteTask, duplicateTask } from '@/app/projects/actions'
import Popover from '@/app/components/popover'

/**
 * Menú "⋯" del encabezado del modal: duplicar, copiar enlace y eliminar.
 * Antes estas acciones solo existían en el clic derecho de la vista Lista.
 */
export default function TaskActionsMenu({
  taskId,
  projectId,
  onDeleted,
  onDuplicated,
}: {
  taskId: string
  projectId: string
  onDeleted: () => void
  onDuplicated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const btnRef = useRef<HTMLButtonElement>(null)

  const fd = () => {
    const f = new FormData()
    f.set('id', taskId)
    f.set('project_id', projectId)
    return f
  }

  const doDuplicate = () => {
    setOpen(false)
    startTransition(async () => {
      await duplicateTask(fd())
      onDuplicated()
    })
  }

  const doDelete = () => {
    if (!confirm('¿Eliminar esta tarea y sus subtareas? Esta acción no se puede deshacer.')) return
    setOpen(false)
    startTransition(async () => {
      await deleteTask(fd())
      onDeleted()
    })
  }

  const doCopy = async () => {
    const url = `${window.location.origin}/projects/${projectId}?task=${taskId}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* sin portapapeles: se ignora */
    }
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      setOpen(false)
    }, 900)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn-ghost"
        title="Más acciones"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
        </svg>
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchor={btnRef} align="right" minWidth={230}>
        <button type="button" className="dropdown-item" onClick={doDuplicate}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span style={{ marginLeft: 8 }}>Duplicar tarea</span>
        </button>

        <button type="button" className="dropdown-item" onClick={doCopy}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
          </svg>
          <span style={{ marginLeft: 8 }}>{copied ? 'Enlace copiado' : 'Copiar enlace de la tarea'}</span>
        </button>

        <div className="ctxmenu-sep" />

        <button type="button" className="dropdown-item danger" onClick={doDelete}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
          <span style={{ marginLeft: 8 }}>Eliminar tarea</span>
        </button>
      </Popover>
    </>
  )
}
