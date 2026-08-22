'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { duplicateTask, deleteTask } from '@/app/projects/actions'

export type CtxTask = { id: string; projectId: string }

type MenuState = { x: number; y: number; task: CtxTask } | null

// Hook: agrega clic derecho a cualquier elemento de tarea y renderiza un único menú.
export function useTaskContextMenu() {
  const [state, setState] = useState<MenuState>(null)

  const onContextMenu = useCallback((e: React.MouseEvent, task: CtxTask) => {
    e.preventDefault()
    e.stopPropagation()
    setState({ x: e.clientX, y: e.clientY, task })
  }, [])

  const close = useCallback(() => setState(null), [])
  const menu = state ? <TaskContextMenu {...state} onClose={close} /> : null

  return { onContextMenu, menu }
}

const MW = 240
const MH = 168

function TaskContextMenu({ x, y, task, onClose }: { x: number; y: number; task: CtxTask; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  if (typeof document === 'undefined') return null

  const left = Math.max(8, Math.min(x, window.innerWidth - MW - 8))
  const top = Math.max(8, Math.min(y, window.innerHeight - MH - 8))

  const fd = () => {
    const f = new FormData()
    f.set('id', task.id)
    f.set('project_id', task.projectId)
    return f
  }

  const doDuplicate = () =>
    startTransition(async () => {
      await duplicateTask(fd())
      router.refresh()
      onClose()
    })

  const doDelete = () => {
    if (!confirm('¿Eliminar esta tarea y sus subtareas? Esta acción no se puede deshacer.')) return
    startTransition(async () => {
      await deleteTask(fd())
      router.refresh()
      onClose()
    })
  }

  const doOpen = () => {
    router.push(`/projects/${task.projectId}?task=${task.id}`)
    onClose()
  }

  const doCopy = async () => {
    const url = `${window.location.origin}/projects/${task.projectId}?task=${task.id}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // fallback silencioso
    }
    setCopied(true)
    setTimeout(onClose, 650)
  }

  return createPortal(
    <div ref={ref} className="ctxmenu" style={{ left, top }} role="menu">
      <button type="button" className="ctxmenu-item" onClick={doDuplicate} disabled={pending}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        Duplicar tarea
      </button>

      <button type="button" className="ctxmenu-item" onClick={doOpen}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
        </svg>
        Abrir los detalles
      </button>

      <button type="button" className="ctxmenu-item" onClick={doCopy}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
        </svg>
        {copied ? 'Enlace copiado' : 'Copiar enlace de la tarea'}
      </button>

      <div className="ctxmenu-sep" />

      <button type="button" className="ctxmenu-item danger" onClick={doDelete} disabled={pending}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </svg>
        Eliminar tarea
      </button>
    </div>,
    document.body
  )
}
