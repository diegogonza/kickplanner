'use client'

import { useEffect, useState } from 'react'
import { createPortfolio } from '@/app/portfolios/actions'

export default function NewPortfolioButton({ label = 'Nuevo portfolio' }: { label?: string }) {
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
        {label}
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Crear portfolio</h2>
            <p className="modal-sub">Agrupá varios proyectos bajo un mismo portfolio.</p>
            <form action={createPortfolio}>
              <input
                name="name"
                className="field"
                placeholder="Ej: Iniciativas Q3"
                autoFocus
                autoComplete="off"
                required
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Crear portfolio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
