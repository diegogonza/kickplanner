'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createCliente, updateCliente, deleteCliente } from '@/app/clientes/actions'

export type ClientOverview = {
  id: string
  name: string
  address: string | null
  phone: string | null
  contact_name: string | null
  contact_email: string | null
  tier: string | null
  billing_code: string | null
  num_projects: number
  seo_count: number
  web_count: number
  /** Sitios de SUS PROYECTOS. El cliente ya no guarda una web propia: un
   *  cliente puede tener varios proyectos y cada uno su sitio. */
  sites: string[] | null
  /** Si tiene portal, borrar el cliente también destruye el acceso. */
  has_portal: boolean
  created_at: string
}

const NIVELES = ['Premium', 'Estandar', 'Basico']
const COBROS = ['FE', 'CC', 'LP']

function Fields({ c }: { c?: ClientOverview }) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="k">Nombre del cliente</span>
        <input name="name" className="field" defaultValue={c?.name ?? ''} placeholder="p. ej. Vitaliah SAS" autoComplete="off" required autoFocus />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="k">Nivel</span>
          <select name="tier" className="field" defaultValue={c?.tier ?? ''}>
            <option value="">Sin definir</option>
            {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="k">Forma de cobro</span>
          <select name="billing_code" className="field" defaultValue={c?.billing_code ?? ''}>
            <option value="">Sin definir</option>
            {COBROS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="cli-nap-label">Contacto</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="k">Nombre</span>
          <input name="contact_name" className="field" defaultValue={c?.contact_name ?? ''} placeholder="Nombre y apellido" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="k">E-mail</span>
          <input name="contact_email" type="email" className="field" defaultValue={c?.contact_email ?? ''} placeholder="nombre@empresa.com" autoComplete="off" />
        </label>
      </div>

      <div className="cli-nap-label">NAP (para SEO local)</div>
      <label className="flex flex-col gap-1">
        <span className="k">Dirección</span>
        <input name="address" className="field" defaultValue={c?.address ?? ''} placeholder="Calle, ciudad, país" autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="k">Teléfono</span>
        <input name="phone" className="field" defaultValue={c?.phone ?? ''} placeholder="+00 000 000 000" autoComplete="off" />
      </label>

      {/* El sitio web NO se edita acá: vive en cada proyecto. Un cliente con
          dos proyectos tiene dos sitios, y una sola casilla mentía. */}
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
        El sitio web se configura en cada proyecto, no en la ficha del cliente.
      </p>
    </div>
  )
}

export default function ClientesView({ clients }: { clients: ClientOverview[] }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ClientOverview | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  return (
    <div>
      {aviso && (
        <div
          className="card"
          role="status"
          style={{
            marginBottom: 'var(--space-4)',
            borderColor: aviso.ok ? 'var(--low-fg)' : 'var(--urgent-fg)',
            background: aviso.ok ? 'var(--low-bg)' : 'var(--urgent-bg)',
          }}
        >
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: aviso.ok ? 'var(--low-fg)' : 'var(--urgent-text)' }}>
            {aviso.texto}
          </p>
        </div>
      )}

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
                    {c.tier && <span className="cli-tier">{c.tier}</span>}
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
                      {/* Con proyectos asignados, la base rechaza el borrado
                          (ON DELETE RESTRICT). Se avisa acá en vez de dejar
                          apretar un botón que solo puede fallar. */}
                      {c.num_projects > 0 ? (
                        <button
                          type="button"
                          className="dropdown-item"
                          disabled
                          style={{ color: 'var(--text-3)', cursor: 'not-allowed' }}
                          title={`Tiene ${c.num_projects} ${c.num_projects === 1 ? 'proyecto' : 'proyectos'}. Reasignalos a otro cliente antes de eliminar.`}
                        >
                          Eliminar
                        </button>
                      ) : (
                        <form
                          action={async (fd) => {
                            const r = await deleteCliente(fd)
                            setAviso({ ok: r.ok, texto: r.mensaje })
                          }}
                          onSubmit={(e) => {
                            const extra = c.has_portal
                              ? '\n\nOJO: también se elimina su acceso al portal. Si lo volvés a crear, hay que generarle otra contraseña y reenviársela.'
                              : ''
                            if (!confirm(`¿Eliminar a ${c.name}?${extra}`)) e.preventDefault()
                            else setMenuOpen(null)
                          }}
                        >
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="dropdown-item" style={{ color: 'var(--urgent-fg)' }}>Eliminar</button>
                        </form>
                      )}
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
                {c.contact_name && (
                  <div className="cli-nap-row" title="Contacto">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    <span>{c.contact_name}</span>
                  </div>
                )}
                {c.contact_email && (
                  <div className="cli-nap-row" title="E-mail">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>
                    <a href={`mailto:${c.contact_email}`} className="cli-link">{c.contact_email}</a>
                  </div>
                )}
                {(c.sites ?? []).map((s) => (
                  <div className="cli-nap-row" title="Sitio del proyecto" key={s}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                    <a href={s} target="_blank" rel="noreferrer" className="cli-link">{s.replace(/^https?:\/\//, '')}</a>
                  </div>
                ))}
                {!c.address && !c.phone && !c.contact_name && (c.sites ?? []).length === 0 && (
                  <div className="cli-nap-empty">Ficha sin completar</div>
                )}
              </div>

              <div className="cli-foot">
                <Link href={`/projects?client=${c.id}`} className="cli-projects-link">
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
            {/* El modal solo se cierra si el alta funcionó. Cerrarlo siempre
                era lo que hacía que un fallo se viera idéntico a un éxito. */}
            <form
              action={async (fd) => {
                const r = await createCliente(fd)
                setAviso({ ok: r.ok, texto: r.mensaje })
                if (r.ok) setCreateOpen(false)
              }}
            >
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
            <form
              action={async (fd) => {
                const r = await updateCliente(fd)
                setAviso({ ok: r.ok, texto: r.mensaje })
                if (r.ok) setEditing(null)
              }}
            >
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
