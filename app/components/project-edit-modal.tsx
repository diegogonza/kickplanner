'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { updateProject } from '@/app/projects/actions'
import { toastIfFailed } from '@/app/components/toast'
import { PROJECT_STATUSES, PROJECT_TYPES, displayName } from '@/app/projects/statuses'

export type EditableProject = {
  id: string
  name: string
  type: string
  status: string
  client_id: string | null
  manager_id: string | null
  start_date: string | null
  fee: number | null
  currency: string | null
  url: string | null
  description: string | null
}

import type { ClientOption as Client, WorkspaceMember } from '@/app/lib/types'

/**
 * Modal único de "Editar proyecto". Lo usan la vista Proyectos (menú ⋯ de la
 * fila) y la vista del proyecto (menú del título).
 *
 * Usa el mismo asistente visual que "Crear proyecto" (clases .wizard-*), pero
 * como edita algo que ya existe los pasos del lateral son navegables en
 * cualquier orden y "Guardar cambios" está disponible desde cualquier paso.
 *
 * Se renderiza en <body> con un portal: si viviera dentro de la barra oscura
 * del proyecto heredaría sus estilos (.topbar .btn-outline, colores de texto)
 * y se vería distinto según desde dónde se abra.
 */
const EDIT_STEPS = [
  {
    key: 'basico',
    label: 'Lo esencial',
    title: 'Lo básico del proyecto',
    desc: 'Cómo se llama, para quién es y quién lo lidera.',
  },
  {
    key: 'comercial',
    label: 'Términos',
    title: 'Condiciones comerciales',
    desc: 'Cuándo arrancó, cuánto vale y dónde vive el sitio.',
  },
  {
    key: 'estado',
    label: 'Estado y notas',
    title: 'Cómo va el proyecto',
    desc: 'Estado actual y el contexto que el equipo debe tener a mano.',
  },
]

export default function ProjectEditModal({
  project,
  clients,
  members,
  loadError = false,
  onRetry,
  onClose,
}: {
  project: EditableProject
  /** null = todavía cargando (el menú del proyecto los pide al abrir). */
  clients: Client[] | null
  members: WorkspaceMember[] | null
  loadError?: boolean
  onRetry?: () => void
  onClose: () => void
}) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(project.name)
  const [type, setType] = useState(project.type)
  const [saving, setSaving] = useState(false)
  const isLastStep = step === EDIT_STEPS.length - 1
  // Validación a mano: los pasos ocultos romperían la validación nativa
  // (un campo required oculto no se puede enfocar y el navegador bloquea).
  const canSave = name.trim().length > 0 && !saving
  // Mientras cliente/encargado no cargaron, sus selectores van deshabilitados:
  // un <select disabled> no viaja en el FormData, así que guardar no los toca
  // (antes caían en "Sin encargado" y borraban el dato).
  const listsReady = clients !== null && members !== null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Solo se monta tras un clic, así que siempre corre en el navegador.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wizard" role="dialog" aria-modal="true" aria-label="Editar proyecto" onClick={(e) => e.stopPropagation()}>
        <aside className="wizard-aside">
          <div className="wizard-glow" />
          <div className="wizard-aside-inner">
            <span className="wizard-kicker">Editar proyecto</span>
            <h2 className="wizard-headline">{EDIT_STEPS[step].title}</h2>
            <p className="wizard-desc">{EDIT_STEPS[step].desc}</p>
            <ol className="wizard-steps">
              {EDIT_STEPS.map((s, i) => (
                <li key={s.key} className={`wizard-step${i === step ? ' is-active' : ''}`}>
                  <button
                    type="button"
                    className="wizard-step-btn"
                    aria-current={i === step ? 'step' : undefined}
                    onClick={() => setStep(i)}
                  >
                    <span className="wizard-step-dot">{i + 1}</span>
                    {s.label}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        <form
          className="wizard-form"
          action={async (fd) => {
            if (!name.trim()) return
            setSaving(true)
            // El estado solo viaja si cambió: updateProject registra cada envío
            // en el historial, y guardar otro campo no debe dejar una entrada.
            if (fd.get('status') === project.status) fd.delete('status')
            const res = await updateProject(fd)
            if (toastIfFailed(res)) {
              setSaving(false)
              return
            }
            // updateProject revalida la ruta: la página se refresca sola.
            onClose()
          }}
          onKeyDown={(e) => {
            // Enter avanza de paso; en el último, guarda
            if (e.key === 'Enter' && !isLastStep && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
              e.preventDefault()
              setStep((s) => s + 1)
            }
          }}
        >
          <input type="hidden" name="id" value={project.id} />
          <div className="wizard-body">
            {/* Paso 1 · Lo esencial */}
            <div className="wizard-panel" hidden={step !== 0}>
              <div className="wizard-field">
                <label className="k" htmlFor="pe-name">Nombre del proyecto</label>
                <input
                  id="pe-name"
                  name="name"
                  className="field"
                  autoComplete="off"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="wizard-grid">
                <div className="wizard-field">
                  <label className="k" htmlFor="pe-client">Cliente</label>
                  <select
                    key={listsReady ? 'ready' : 'loading'}
                    id="pe-client"
                    name="client_id"
                    className="field"
                    defaultValue={project.client_id ?? ''}
                    disabled={!listsReady}
                  >
                    <option value="" disabled>{listsReady ? 'Elige un cliente…' : 'Cargando…'}</option>
                    {(clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="wizard-field">
                  <label className="k" htmlFor="pe-manager">Encargado</label>
                  <select
                    key={listsReady ? 'ready' : 'loading'}
                    id="pe-manager"
                    name="manager_id"
                    className="field"
                    defaultValue={project.manager_id ?? ''}
                    disabled={!listsReady}
                  >
                    <option value="">{listsReady ? 'Sin encargado' : 'Cargando…'}</option>
                    {(members ?? []).map((m) => (
                      <option key={m.user_id} value={m.user_id}>{displayName(m)}</option>
                    ))}
                  </select>
                </div>
              </div>
              {loadError && (
                <p className="wizard-help" role="alert">
                  No se pudieron cargar los clientes y el equipo. Puedes guardar el resto sin tocarlos, o{' '}
                  <button type="button" className="link-btn" onClick={onRetry}>reintentar</button>.
                </p>
              )}
              <div className="wizard-field">
                <label className="k" htmlFor="pe-type">Tipo de proyecto</label>
                <select id="pe-type" name="type" className="field" value={type} onChange={(e) => setType(e.target.value)}>
                  {PROJECT_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Paso 2 · Términos */}
            <div className="wizard-panel" hidden={step !== 1}>
              <div className="wizard-grid">
                <div className="wizard-field">
                  <label className="k" htmlFor="pe-start">Fecha de inicio</label>
                  <input id="pe-start" type="date" name="start_date" className="field" defaultValue={project.start_date ?? ''} />
                </div>
                <div className="wizard-field">
                  <label className="k" htmlFor="pe-currency">Moneda</label>
                  <select id="pe-currency" name="currency" className="field" defaultValue={project.currency ?? 'COP'}>
                    <option value="COP">COP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div className="wizard-field">
                <label className="k" htmlFor="pe-fee">Fee {type === 'web' ? '(total del proyecto)' : '(mensual)'}</label>
                <input id="pe-fee" type="number" name="fee" className="field" placeholder="0" defaultValue={project.fee ?? ''} min="0" step="any" />
                <p className="wizard-help">
                  {type === 'web'
                    ? 'Se divide en cuotas desde la sección de Pagos.'
                    : 'Se cobra por mes anticipado en el aniversario de la fecha de inicio.'}
                </p>
              </div>
              <div className="wizard-field">
                <label className="k" htmlFor="pe-url">URL del proyecto</label>
                <input id="pe-url" name="url" className="field" placeholder="https://…" defaultValue={project.url ?? ''} autoComplete="off" />
              </div>
            </div>

            {/* Paso 3 · Estado y notas */}
            <div className="wizard-panel" hidden={step !== 2}>
              <div className="wizard-field">
                <label className="k" htmlFor="pe-status">Estado</label>
                <select id="pe-status" name="status" className="field" defaultValue={project.status}>
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
                <p className="wizard-help">Si lo cambias, queda registrado en el historial de estado del proyecto.</p>
              </div>
              <div className="wizard-field">
                <label className="k" htmlFor="pe-desc">Descripción (opcional)</label>
                <textarea id="pe-desc" name="description" className="field" placeholder="Contexto, alcance, acuerdos…" defaultValue={project.description ?? ''} rows={4} />
              </div>
            </div>
          </div>

          <div className="wizard-footer">
            <span className="wizard-progress">Paso {step + 1} de {EDIT_STEPS.length}</span>
            <div className="wizard-actions">
              {step === 0 ? (
                <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
              ) : (
                <button type="button" className="btn btn-outline" onClick={() => setStep((s) => s - 1)}>Atrás</button>
              )}
              {!isLastStep && (
                <button type="button" className="btn btn-outline" onClick={() => setStep((s) => s + 1)}>Siguiente</button>
              )}
              <button type="submit" className="btn btn-primary" disabled={!canSave}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
