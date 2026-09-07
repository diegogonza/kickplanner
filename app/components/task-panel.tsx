'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

/**
 * Contenedor del modal: overlay, foco y cierre.
 *
 * - Cierra con Escape, salvo que haya un menú flotante abierto (el Popover
 *   captura y detiene el Escape antes de que llegue acá).
 * - El clic en el overlay solo cierra si el gesto empezó Y terminó en el
 *   overlay: arrastrar para seleccionar texto y soltar afuera ya no cierra.
 * - Atrapa el foco, lo lleva al panel al abrir y lo devuelve al cerrar.
 */
export default function TaskPanel({
  labelledBy,
  onClose,
  children,
}: {
  labelledBy?: string
  onClose: () => void
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const downOnOverlay = useRef(false)

  // Foco inicial + devolución del foco + bloqueo del scroll de fondo
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus({ preventScroll: true })
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      previous?.focus?.({ preventScroll: true })
    }
  }, [])

  // Escape + trampa de foco
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      // Con un menú flotante abierto el foco puede salir del panel a propósito
      if (document.querySelector('.pop')) return
      const root = panelRef.current
      if (!root) return
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )
      if (items.length === 0) {
        e.preventDefault()
        root.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="panel-overlay"
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        const ok = downOnOverlay.current && e.target === e.currentTarget
        downOnOverlay.current = false
        if (ok) onClose()
      }}
    >
      <aside
        ref={panelRef}
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </aside>
    </div>
  )
}
