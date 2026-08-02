'use client'

import { useEffect, useState } from 'react'
import { createField } from '@/app/portfolios/actions'

export default function AddFieldButton({ portfolioId }: { portfolioId: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button className="btn btn-outline" type="button" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Campo
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Nuevo campo personalizado</h2>
            <p className="modal-sub">Agregá una columna a la tabla del portfolio.</p>
            <form action={createField} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="portfolio_id" value={portfolioId} />
              <label className="mb-1 block text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>
                Nombre
              </label>
              <input name="name" className="field" placeholder="Ej: Fee" autoFocus autoComplete="off" required />

              <label className="mb-1 mt-3 block text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>
                Tipo
              </label>
              <select name="type" className="field" defaultValue="text">
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="money">Moneda</option>
              </select>

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Crear campo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
