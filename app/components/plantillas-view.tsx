'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createTemplate, updateTemplate, deleteTemplate } from '@/app/plantillas/actions'

export type TemplateOverview = {
  id: string
  name: string
  description: string | null
  type: string
  num_tasks: number
  created_at: string
}

const TYPES = [
  { key: 'seo', label: 'SEO', cls: 'pt-seo' },
  { key: 'web', label: 'WEB', cls: 'pt-web' },
  { key: 'general', label: 'General', cls: 'pt-general' },
]
const typeOf = (k: string) => TYPES.find((t) => t.key === k) ?? TYPES[2]

function Fields({ t }: { t?: TemplateOverview }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="k">Nombre de la plantilla</span>
        <input name="name" className="field" defaultValue={t?.name ?? ''} placeholder="p. ej. Onboarding SEO" autoComplete="off" required autoFocus />
      </label>
      <label className="flex flex-col gap-1">
        <span className="k">Tipo</span>
        <select name="type" className="field" defaultValue={t?.type ?? 'general'}>
          {TYPES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="k">Descripción</span>
        <textarea name="description" className="field" defaultValue={t?.description ?? ''} placeholder="¿Para qué sirve esta plantilla? (opcional)" rows={2} />
      </label>
    </div>
  )
}

export default function PlantillasView({ templates }: { templates: TemplateOverview[] }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<TemplateOverview | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  return (
    <div>
      <div className="proj-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          Nueva plantilla
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
          <p className="card-title mb-1">Aún no tienes plantillas</p>
          <p className="card-desc">Crea una plantilla y define su paquete de tareas para reutilizarlo en tus proyectos.</p>
        </div>
      ) : (
        <div className="cli-grid">
          {templates.map((t) => {
            const ty = typeOf(t.type)
            return (
              <div className="cli-card" key={t.id}>
                <div className="cli-head">
                  <div className="min-w-0">
                    <div className="cli-name">{t.name}</div>
                    <div className="cli-services">
                      <span className={`ptype ${ty.cls}`}>{ty.label}</span>
                      <span className="cli-noproj">{t.num_tasks} {t.num_tasks === 1 ? 'tarea' : 'tareas'}</span>
                    </div>
                  </div>
                  <div className="dropdown">
                    <button type="button" className="proj-more" onClick={() => setMenuOpen(menuOpen === t.id ? null : t.id)} title="Acciones">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                    </button>
                    {menuOpen === t.id && (
                      <div className="dropdown-menu" style={{ right: 0, left: 'auto' }}>
                        <button type="button" className="dropdown-item" onClick={() => { setEditing(t); setMenuOpen(null) }}>Editar datos</button>
                        <form action={deleteTemplate} onSubmit={(e) => { if (!confirm('¿Eliminar la plantilla y sus tareas?')) e.preventDefault(); else setMenuOpen(null) }}>
                          <input type="hidden" name="id" value={t.id} />
                          <button type="submit" className="dropdown-item" style={{ color: 'var(--urgent-fg)' }}>Eliminar</button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>

                {t.description && <p className="card-desc" style={{ margin: 0 }}>{t.description}</p>}

                <div className="cli-foot">
                  <Link href={`/plantillas/${t.id}`} className="btn btn-outline" style={{ width: '100%', justifyContent: 'center' }}>
                    Editar tareas
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Nueva plantilla</h2>
            <p className="modal-sub">Luego defines su paquete de tareas.</p>
            <form action={async (fd) => { await createTemplate(fd); setCreateOpen(false) }}>
              <Fields />
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Crear plantilla</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Editar plantilla</h2>
            <form action={async (fd) => { await updateTemplate(fd); setEditing(null) }}>
              <input type="hidden" name="id" value={editing.id} />
              <Fields t={editing} />
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
