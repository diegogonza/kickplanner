'use client'

import { useEffect, useState } from 'react'
import { addProjectToPortfolio } from '@/app/portfolios/actions'

type Project = { id: string; name: string }

export default function AddProjectToPortfolio({
  portfolioId,
  available,
}: {
  portfolioId: string
  available: Project[]
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
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Agregar proyecto
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Agregar proyecto</h2>
            <p className="modal-sub">Elegí un proyecto para sumar a este portfolio.</p>

            {available.length === 0 ? (
              <p className="card-desc">Todos tus proyectos ya están en este portfolio.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {available.map((p) => (
                  <form key={p.id} action={addProjectToPortfolio}>
                    <input type="hidden" name="portfolio_id" value={portfolioId} />
                    <input type="hidden" name="project_id" value={p.id} />
                    <button type="submit" className="dropdown-item" style={{ width: '100%' }}>
                      <span className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--brand-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                        {p.name}
                      </span>
                    </button>
                  </form>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
