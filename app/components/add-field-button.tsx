'use client'

import { useEffect, useState } from 'react'
import { createField } from '@/app/portfolios/actions'

/** Modal para crear un campo personalizado (columna) del portafolio. */
export function AddFieldModal({ portfolioId, onClose }: { portfolioId: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pf-field-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="pf-field-title">Nuevo campo personalizado</h2>
        <p className="modal-sub">Agrega una columna a la tabla del portafolio.</p>
        <form action={createField} onSubmit={() => onClose()}>
          <input type="hidden" name="portfolio_id" value={portfolioId} />
          <label htmlFor="pf-field-name" className="mb-1 block text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>
            Nombre
          </label>
          <input id="pf-field-name" name="name" className="field" placeholder="Ej: Plan" autoFocus autoComplete="off" required />

          <label htmlFor="pf-field-type" className="mb-1 mt-3 block text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>
            Tipo
          </label>
          <select id="pf-field-type" name="type" className="field" defaultValue="text">
            <option value="text">Texto</option>
            <option value="number">Número</option>
            <option value="money">Moneda</option>
          </select>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Crear campo
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AddFieldButton({ portfolioId }: { portfolioId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn btn-outline" type="button" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Campo
      </button>
      {open && <AddFieldModal portfolioId={portfolioId} onClose={() => setOpen(false)} />}
    </>
  )
}
