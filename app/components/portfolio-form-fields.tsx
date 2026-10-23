'use client'

import { useState } from 'react'
import { PORTFOLIO_COVERS, DESCRIPTION_MAX, type PortfolioCover } from '@/app/portfolios/covers'

/**
 * Campos compartidos de crear y editar portafolio: nombre, descripción y
 * portada. Van dentro de un <form>; envían `name`, `description` y `cover`.
 */
export default function PortfolioFormFields({
  name = '',
  description = '',
  cover = 'bosque',
}: {
  name?: string
  description?: string | null
  cover?: PortfolioCover
}) {
  const [picked, setPicked] = useState<PortfolioCover>(cover)
  const [desc, setDesc] = useState(description ?? '')

  return (
    <div className="pf-form">
      <label className="pf-label" htmlFor="pf-name">
        Nombre
      </label>
      <input
        id="pf-name"
        name="name"
        className="field"
        placeholder="Ej: Cartera de Oscar"
        defaultValue={name}
        autoFocus
        autoComplete="off"
        required
      />

      <label className="pf-label" htmlFor="pf-desc">
        Descripción <span className="pf-label-hint">opcional</span>
      </label>
      <textarea
        id="pf-desc"
        name="description"
        className="field pf-textarea"
        placeholder="Qué agrupa este portafolio"
        rows={2}
        maxLength={DESCRIPTION_MAX}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <span className="pf-counter" aria-live="polite">
        {desc.length}/{DESCRIPTION_MAX}
      </span>

      <fieldset className="pf-covers">
        <legend className="pf-label">Portada</legend>
        <input type="hidden" name="cover" value={picked} />
        <div className="pf-covers-grid">
          {PORTFOLIO_COVERS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`pf-cover-opt pf-cover--${c.key} ${picked === c.key ? 'is-picked' : ''}`}
              aria-pressed={picked === c.key}
              aria-label={`Portada ${c.label}`}
              title={c.label}
              onClick={() => setPicked(c.key)}
            >
              {picked === c.key && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
