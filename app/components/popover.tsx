'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * Menú flotante que se renderiza en <body> (portal) y se posiciona respecto de
 * un ancla. Al vivir fuera del contenedor con scroll, NO lo recorta el panel
 * del modal ni la vista con scroll de la lista.
 *
 * La posición se escribe directamente sobre el nodo en un layout effect (antes
 * del pintado) en vez de guardarla en estado: evita un render extra y que un
 * re-render del contenido lo devuelva a su posición inicial. Por eso `.pop`
 * arranca oculto en el CSS y este efecto lo muestra ya ubicado.
 *
 * Cierra con clic afuera y con Escape. El Escape se captura y se detiene, así
 * que cierra el menú sin cerrar también el modal que lo contiene.
 */
export default function Popover({
  open,
  onClose,
  anchor,
  align = 'left',
  minWidth = 200,
  maxHeight = 280,
  className = '',
  children,
}: {
  open: boolean
  onClose: () => void
  anchor: React.RefObject<HTMLElement | null>
  align?: 'left' | 'right'
  minWidth?: number
  maxHeight?: number
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return

    const place = () => {
      const el = ref.current
      const a = anchor.current?.getBoundingClientRect()
      if (!el || !a) return

      const GAP = 6
      const EDGE = 8
      const below = window.innerHeight - a.bottom - GAP - EDGE
      const above = a.top - GAP - EDGE
      const flip = below < 160 && above > below
      const maxH = Math.max(120, Math.min(maxHeight, flip ? above : below))

      const w = Math.max(minWidth, el.offsetWidth)
      let left = align === 'right' ? a.right - w : a.left
      left = Math.min(Math.max(EDGE, left), Math.max(EDGE, window.innerWidth - w - EDGE))
      const top = flip ? Math.max(EDGE, a.top - GAP - maxH) : a.bottom + GAP

      el.style.top = `${top}px`
      el.style.left = `${left}px`
      el.style.maxHeight = `${maxH}px`
      el.style.visibility = 'visible'
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, align, minWidth, maxHeight, anchor])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (anchor.current?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, onClose, anchor])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div ref={ref} className={`pop ${className}`} role="menu" style={{ minWidth }}>
      {children}
    </div>,
    document.body
  )
}
