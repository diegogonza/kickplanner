'use client'

import { useState } from 'react'
import { applyTemplate } from '@/app/plantillas/actions'

type Tpl = { id: string; name: string; type: string; num_tasks: number }

export default function ApplyTemplateButton({
  projectId,
  projectType,
  templates,
}: {
  projectId: string
  projectType: string
  templates: Tpl[]
}) {
  const [open, setOpen] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const options = templates.filter((t) => t.type === projectType || t.type === 'general')

  return (
    <>
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)} title="Aplicar plantilla de tareas">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16v4H4zM4 12h10v8H4zM17 12h3v8h-3z" />
        </svg>
        Aplicar plantilla
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Aplicar plantilla</h2>
            <p className="modal-sub">Se agregarán las tareas de la plantilla a este proyecto.</p>

            {options.length === 0 ? (
              <p className="card-desc">
                No hay plantillas para este tipo de proyecto. Crea una en la sección Plantillas.
              </p>
            ) : (
              <form action={async (fd) => { await applyTemplate(fd); setOpen(false) }}>
                <input type="hidden" name="project_id" value={projectId} />
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="k">Plantilla</span>
                    <select name="template_id" className="field" required defaultValue="">
                      <option value="" disabled>Elige una plantilla…</option>
                      {options.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} · {t.num_tasks} tareas</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="k">Fecha de inicio (día 0)</span>
                    <input type="date" name="start_date" className="field" defaultValue={today} />
                    <span className="card-desc">Las fechas relativas de la plantilla se calculan desde aquí.</span>
                  </label>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary">Aplicar</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
