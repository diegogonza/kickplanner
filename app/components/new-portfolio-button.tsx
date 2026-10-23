'use client'

import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createPortfolio } from '@/app/portfolios/actions'
import PortfolioFormFields from '@/app/components/portfolio-form-fields'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Creando…' : 'Crear portafolio'}
    </button>
  )
}

/**
 * Crear portafolio. `variant="button"` es el botón de la barra superior;
 * `variant="card"` es la tarjeta punteada al final de la cuadrícula.
 */
export default function NewPortfolioButton({
  label = 'Nuevo portafolio',
  variant = 'button',
}: {
  label?: string
  variant?: 'button' | 'card'
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {variant === 'card' ? (
        <button className="pf-newcard" type="button" onClick={() => setOpen(true)}>
          <span className="pf-newcard-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" width="16" height="16">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          {label}
          <span className="pf-newcard-sub">Agrupa clientes por responsable o servicio</span>
        </button>
      ) : (
        <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {label}
        </button>
      )}

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pf-new-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="pf-new-title">Crear portafolio</h2>
            <p className="modal-sub">Agrupa varios proyectos bajo un mismo portafolio.</p>
            <form action={createPortfolio}>
              <PortfolioFormFields />
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <SubmitButton />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
