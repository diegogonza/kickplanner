'use client'

import { useEffect, useState } from 'react'
import { NO_PERMISSION_MESSAGE } from '@/app/lib/permission-copy'

/**
 * Avisos flotantes de la app. Se disparan desde cualquier componente de
 * cliente con `toast('mensaje')` o `toast('mensaje', 'error')`; el <Toaster/>
 * vive una sola vez en el layout raíz.
 *
 * Por evento de window y no por contexto: así cualquier componente (incluso
 * uno montado con un portal) puede avisar sin envolver nada en providers.
 */

type Kind = 'info' | 'error'
type Item = { id: number; text: string; kind: Kind }

const EVENT = 'kp-toast'

export function toast(text: string, kind: Kind = 'info') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<{ text: string; kind: Kind }>(EVENT, { detail: { text, kind } }))
}

/** Aviso estándar de "sin permisos" (rol member intentando algo de admin). */
export function toastNoPermission() {
  toast(NO_PERMISSION_MESSAGE, 'error')
}

export default function Toaster() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    let seq = 0
    const onToast = (e: Event) => {
      const { text, kind } = (e as CustomEvent<{ text: string; kind: Kind }>).detail
      const id = ++seq
      // El mismo aviso dos veces seguidas no se apila: se reemplaza.
      setItems((prev) => [...prev.filter((i) => i.text !== text), { id, text, kind }])
      window.setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4500)
    }
    window.addEventListener(EVENT, onToast)
    return () => window.removeEventListener(EVENT, onToast)
  }, [])

  return (
    <div className="toasts">
      {items.map((i) => (
        // Errores: role="alert" (se anuncian de inmediato); el resto, "status".
        <div
          key={i.id}
          className={`toast${i.kind === 'error' ? ' is-error' : ''}`}
          role={i.kind === 'error' ? 'alert' : 'status'}
          aria-live={i.kind === 'error' ? 'assertive' : 'polite'}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {i.kind === 'error' ? (
              <>
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8h.01M11 12h1v4h1" />
              </>
            )}
          </svg>
          <span>{i.text}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="Cerrar aviso"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== i.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/** Muestra el aviso si una server action devolvió { ok: false }. */
export function toastIfFailed(res: unknown): boolean {
  if (res && typeof res === 'object' && 'ok' in res && (res as { ok: boolean }).ok === false) {
    toast((res as { message?: string }).message ?? 'No se pudo completar la acción.', 'error')
    return true
  }
  return false
}
