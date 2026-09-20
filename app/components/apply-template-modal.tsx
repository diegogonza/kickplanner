'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { applyTemplate } from '@/app/plantillas/actions'
import { createClient } from '@/utils/supabase/client'
import { toast, toastIfFailed } from '@/app/components/toast'
import { todayISO } from '@/app/projects/statuses'

export type TemplateOption = { id: string; name: string; type: string; num_tasks: number }

/**
 * Modal para aplicar una plantilla de tareas a un proyecto. Se abre desde el
 * menú del título del proyecto (ítem "Plantillas").
 *
 * Las plantillas se piden al abrir el modal, no en cada render de la página
 * del proyecto (antes era una consulta más por clic, casi nunca usada).
 *
 * Va a <body> con un portal para no heredar los estilos de la barra oscura.
 */
export default function ApplyTemplateModal({
  projectId,
  projectType,
  onClose,
}: {
  projectId: string
  projectType: string
  onClose: () => void
}) {
  // Fecha local (zona de la operación), no UTC: después de las 7 p. m. en
  // Colombia, toISOString() ya devuelve el día siguiente.
  const today = todayISO()
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [applying, setApplying] = useState(false)

  const load = useCallback(async () => {
    setLoadError(false)
    const { data, error } = await createClient().rpc('templates_overview')
    if (error) {
      console.error('ApplyTemplateModal:', error.message)
      setLoadError(true)
      return
    }
    setTemplates((data ?? []) as TemplateOption[])
  }, [])

  useEffect(() => {
    // Carga inicial al montar (datos externos, no estado derivado)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !applying) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, applying])

  // Solo se monta tras un clic, así que siempre corre en el navegador.
  if (typeof document === 'undefined') return null

  const options = (templates ?? []).filter((t) => t.type === projectType || t.type === 'general')

  return createPortal(
    <div className="modal-overlay" onClick={() => !applying && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Aplicar plantilla" onClick={(e) => e.stopPropagation()}>
        <h2>Aplicar plantilla</h2>
        <p className="modal-sub">Se agregarán las tareas de la plantilla a este proyecto.</p>

        {loadError ? (
          <>
            <p className="card-desc" role="alert">No se pudieron cargar las plantillas.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={onClose}>Cerrar</button>
              <button type="button" className="btn btn-primary" onClick={() => void load()}>Reintentar</button>
            </div>
          </>
        ) : templates === null ? (
          <p className="card-desc" aria-busy="true">Cargando plantillas…</p>
        ) : options.length === 0 ? (
          <>
            <p className="card-desc">
              No hay plantillas para este tipo de proyecto. Crea una en la sección Plantillas.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={onClose}>Cerrar</button>
            </div>
          </>
        ) : (
          <form
            action={async (fd) => {
              setApplying(true)
              const res = await applyTemplate(fd)
              setApplying(false)
              if (toastIfFailed(res)) return
              const n = 'count' in res ? res.count : undefined
              toast(n != null ? `Se agregaron ${n} tareas al proyecto.` : 'Plantilla aplicada.')
              // applyTemplate revalida la ruta del proyecto: se refresca sola.
              onClose()
            }}
          >
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
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={applying}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={applying}>
                {applying ? 'Aplicando…' : 'Aplicar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
