'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createCliente, updateCliente, deleteCliente } from '@/app/clientes/actions'

export type ClientOverview = {
  id: string
  name: string
  address: string | null
  phone: string | null
  website: string | null
  num_projects: number
  seo_count: number
  web_count: number
  created_at: string
}

function Fields({ c }: { c?: ClientOverview }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="k">Nombre del cliente</span>
        <input name="name" className="field" defaultValue={c?.name ?? ''} placeholder="p. ej. Vitaliah SAS" autoComplete="off" required autoFocus />
      </label>

      <div className="cli-nap-label">NAP (para SEO local)</div>
      <label className="flex flex-col gap-1">
        <span className="k">Dirección</span>
        <input name="address" className="field" defaultValue={c?.address ?? ''} placeholder="Calle, ciudad, país" autoComplete="off" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="k">Teléfono</span>
          <input name="phone" className="field" defaultValue={c?.phone ?? ''} placeholder="+00 000 000 000" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="k">Sitio web</span>
          <input name="website" className="field" defaultValue={c?.website ?? ''} placeholder="https://…" autoComplete="off" />
        </label>
      </div>
    </div>
  )
}

export default function ClientesView({ clients }: { clients: ClientOverview[] }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ClientOverview | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  return (
    <div>
      <div className="proj-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          Nuevo cliente
        </button>
      </div>

      {clients.length === 0 ? (
        <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
          <p className="card-title mb-1">Aún no tienes clientes</p>
          <p className="card-desc">Crea una ficha de cliente para agrupar sus proyectos (web, SEO…) y guardar su NAP.</p>
        </div>
      ) : (
        <div className="cli-grid">
          {clients.map((c) => (
            <div className="cli-card" key={c.id}>
              <div className="cli-head">
                <div className="min-w-0">
                  <div className="cli-name">{c.name}</div>
                  <div className="cli-services">
                    {c.web_count > 0 && <span className="ptype pt-web">WEB · {c.web_count}</span>}
                    {c.seo_count > 0 && <span className="ptype pt-seo">SEO · {c.seo_count}</span>}
                    {c.num_projects === 0 && <span className="cli-noproj">Sin proyectos</span>}
                  </div>
                </div>
                <div className="dropdown">
                  <button type="button" className="proj-more" onClick={() => setMenuOpen(menuOpen === c.id ? null : c.id)} title="Acciones">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                  </button>
                  {menuOpen === c.id && (
                    <div className="dropdown-menu" style={{ right: 0, left: 'auto' }}>
                      <button type="button" className="dropdown-item" onClick={() => { setEditing(c); setMenuOpen(null) }}>Editar</button>
                      <form action={deleteCliente} onSubmit={(e) => { if (!confirm('¿Eliminar el cliente? Sus proyectos quedarán sin cliente.')) e.preventDefault(); else setMenuOpen(null) }}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="dropdown-item" style={{ color: 'var(--urgent-fg)' }}>Eliminar</button>
                      </form>
                    </div>
                  )}
                </div>
              </div>

              <div className="cli-nap">
                {c.address && (
                  <div className="cli-nap-row" title="Dirección">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                    <span>{c.address}</span>
                  </div>
                )}
                {c.phone && (
                  <div className="cli-nap-row" title="Teléfono">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                    <span>{c.phone}</span>
                  </div>
                )}
                {c.website && (
                  <div className="cli-nap-row" title="Sitio web">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                    <a href={c.website} target="_blank" rel="noreferrer" className="cli-link">{c.website.replace(/^https?:\/\//, '')}</a>
                  </div>
                )}
                {!c.address && !c.phone && !c.website && <div className="cli-nap-empty">NAP sin completar</div>}
              </div>

              <div className="cli-foot">
                <Link href={`/?client=${c.id}`} className="cli-projects-link">
                  {c.num_projects} {c.num_projects === 1 ? 'proyecto' : 'proyectos'}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Nuevo cliente</h2>
            <p className="modal-sub">Ficha del cliente y su NAP.</p>
            <form action={async (fd) => { await createCliente(fd); setCreateOpen(false) }}>
              <Fields />
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Crear cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Editar cliente</h2>
            <form action={async (fd) => { await updateCliente(fd); setEditing(null) }}>
              <input type="hidden" name="id" value={editing.id} />
              <Fields c={editing} />
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
