'use client'

import { useEffect, useId, useRef, useState } from 'react'

/**
 * Diálogo de confirmación con el estilo del planner, en reemplazo del
 * `window.confirm` nativo. Se usa desde cualquier componente de cliente:
 *
 *   const ok = await confirmDialog({ title: '…', body: '…', confirmLabel: '…' })
 *
 * Igual que los toasts, funciona por evento de window: el <ConfirmHost/> vive
 * una sola vez en el layout raíz y no hace falta envolver nada en providers.
 *
 * - Escape y clic afuera cancelan. Se capturan antes que el modal de tarea,
 *   así cancelar el aviso no cierra también la tarea de atrás.
 * - El foco va al botón de confirmar (a Cancelar si es destructivo), queda
 *   atrapado en el diálogo y vuelve adonde estaba al cerrar.
 */

export type ConfirmOptions = {
  title: string
  body: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Ícono del encabezado: 'check' (completar) o 'alert' (destructivo) */
  tone?: 'check' | 'alert'
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void }

const EVENT = 'kp-confirm'

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<Request>(EVENT, { detail: { ...opts, resolve } }))
  })
}

export default function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null)
  const titleId = useId()
  const bodyId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const prevFocus = useRef<HTMLElement | null>(null)
  const downOnOverlay = useRef(false)

  // Un pedido nuevo con otro abierto: el anterior se da por cancelado
  useEffect(() => {
    const onReq = (e: Event) => {
      const next = (e as CustomEvent<Request>).detail
      setReq((cur) => {
        cur?.resolve(false)
        return next
      })
    }
    window.addEventListener(EVENT, onReq)
    return () => window.removeEventListener(EVENT, onReq)
  }, [])

  const close = (ok: boolean) => {
    setReq((cur) => {
      cur?.resolve(ok)
      return null
    })
  }
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  // Foco inicial, devolución del foco, Escape y trampa de Tab (en captura)
  useEffect(() => {
    if (!req) return
    prevFocus.current = document.activeElement as HTMLElement | null
    // Acción destructiva: el foco arranca en Cancelar, así un Enter o un clic
    // de más no borra nada. En el resto, en el botón de confirmar.
    if (req.tone === 'alert') cancelRef.current?.focus()
    else okRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeRef.current(false)
        return
      }
      if (e.key !== 'Tab') return
      e.stopPropagation()
      const items = Array.from(boxRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prevFocus.current?.focus?.({ preventScroll: true })
    }
  }, [req])

  if (!req) return null
  const tone = req.tone ?? 'check'

  return (
    <div
      className="cdlg-overlay"
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        const ok = downOnOverlay.current && e.target === e.currentTarget
        downOnOverlay.current = false
        if (ok) close(false)
      }}
    >
      <div
        ref={boxRef}
        className="cdlg"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <div className={`cdlg-icon ${tone === 'alert' ? 'is-alert' : ''}`} aria-hidden="true">
          {tone === 'alert' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3 8-8" />
              <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
            </svg>
          )}
        </div>

        <h2 id={titleId} className="cdlg-title">
          {req.title}
        </h2>
        <div id={bodyId} className="cdlg-body">
          {req.body}
        </div>

        <div className="cdlg-actions">
          <button ref={cancelRef} type="button" className="btn btn-outline" onClick={() => close(false)}>
            {req.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            ref={okRef}
            type="button"
            className={`btn ${tone === 'alert' ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => close(true)}
          >
            {req.confirmLabel ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  )
}
