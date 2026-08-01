'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Envoltorio cliente del panel: overlay, cerrar con Escape o clic afuera.
// El contenido (server-rendered) llega como children.
export default function TaskPanel({
  closeHref,
  children,
}: {
  closeHref: string
  children: React.ReactNode
}) {
  const router = useRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push(closeHref)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeHref, router])

  return (
    <div className="panel-overlay" onClick={() => router.push(closeHref)}>
      <aside
        className="panel"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </aside>
    </div>
  )
}
