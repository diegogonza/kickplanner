'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  crearOrotar,
  crearTodosLosFaltantes,
  activarPortal,
  desbloquearPortal,
  eliminarPortal,
  type AccesoCreado,
} from '@/app/portales/actions'

export type PortalRow = {
  client_id: string
  cliente: string
  contact_name: string | null
  contact_email: string | null
  slug: string | null
  enabled: boolean | null
  bloqueado: boolean
  locked_until: string | null
  failed_attempts: number | null
  created_at: string | null
  rotated_at: string | null
  sesiones_activas: number
  /** Momento del último login. NO es "última visita": portal_session_client()
   *  no actualiza la sesión en cada carga, así que lo único que se sabe es
   *  cuándo entró con contraseña la última vez. */
  ultimo_ingreso: string | null
  num_projects: number
  proyectos: string[] | null
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

function minutosRestantes(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000))
}

/** Estado de una fila, en una sola palabra. */
function estadoDe(p: PortalRow): { texto: string; clase: string } {
  if (!p.slug) return { texto: 'Sin portal', clase: 'pv-none' }
  if (!p.enabled) return { texto: 'Desactivado', clase: 'pv-off' }
  if (p.bloqueado) return { texto: 'Bloqueado', clase: 'pv-lock' }
  return { texto: 'Activo', clase: 'pv-on' }
}

export default function PortalesView({
  rows,
  baseUrl,
}: {
  rows: PortalRow[]
  baseUrl: string
}) {
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  // Las contraseñas recién generadas viven SOLO acá, en memoria, hasta que se
  // recargue la página. No se guardan ni se pueden volver a pedir.
  const [nuevos, setNuevos] = useState<AccesoCreado[]>([])
  const [menu, setMenu] = useState<string | null>(null)
  const [trabajando, start] = useTransition()

  const sinPortal = rows.filter((r) => !r.slug).length
  const bloqueados = rows.filter((r) => r.bloqueado).length

  const link = (slug: string) => `${baseUrl}/portal/${slug}`

  const copiar = async (texto: string, queEs: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setAviso({ ok: true, texto: `${queEs} copiado.` })
    } catch {
      setAviso({ ok: false, texto: 'El navegador no dejó copiar. Seleccioná el texto a mano.' })
    }
  }

  const correr = (fn: () => Promise<{ ok: boolean; mensaje: string }>) =>
    start(async () => {
      setAviso(null)
      const r = await fn()
      setAviso({ ok: r.ok, texto: r.mensaje })
      setMenu(null)
    })

  const generar = (p: PortalRow) =>
    start(async () => {
      setAviso(null)
      setMenu(null)
      const r = await crearOrotar(p.client_id, p.cliente)
      if (r.ok) {
        setNuevos((prev) => [r.acceso, ...prev.filter((a) => a.slug !== r.acceso.slug)])
        setAviso({
          ok: true,
          texto: `Contraseña generada para ${p.cliente}. Copiala ahora: no se vuelve a mostrar.`,
        })
      } else {
        setAviso({ ok: false, texto: r.mensaje })
      }
    })

  const generarTodos = () =>
    start(async () => {
      setAviso(null)
      const r = await crearTodosLosFaltantes()
      setNuevos((prev) => [...r.accesos, ...prev])
      setAviso({ ok: r.ok, texto: r.mensaje })
    })

  const textoParaCopiar = (a: AccesoCreado) =>
    `Portal de ${a.cliente}\n${link(a.slug)}\nContraseña: ${a.password}`

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

      {/* Contraseñas recién generadas. Este bloque es la única oportunidad de
          verlas: al recargar desaparecen para siempre. */}
      {nuevos.length > 0 && (
        <div className="card pv-nuevos">
          <div className="pv-nuevos-head">
            <div>
              <b>Contraseñas nuevas ({nuevos.length})</b>
              <span>
                Se muestran una sola vez. Al recargar la página desaparecen y
                habrá que generar otras.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => copiar(nuevos.map(textoParaCopiar).join('\n\n'), 'Todo')}
              >
                Copiar todo
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setNuevos([])}>
                Ya las guardé
              </button>
            </div>
          </div>

          <div className="pv-nuevos-list">
            {nuevos.map((a) => (
              <div className="pv-nuevo" key={a.slug}>
                <div className="min-w-0">
                  <div className="pv-nuevo-cli">{a.cliente}</div>
                  <div className="pv-nuevo-link">{link(a.slug)}</div>
                </div>
                <code className="pv-pass">{a.password}</code>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => copiar(textoParaCopiar(a), `Acceso de ${a.cliente}`)}
                >
                  Copiar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="proj-toolbar">
        {sinPortal > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={trabajando}
            onClick={generarTodos}
          >
            {trabajando ? 'Creando…' : `Crear los ${sinPortal} portales que faltan`}
          </button>
        )}
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
          {rows.length - sinPortal} de {rows.length} clientes con portal
          {bloqueados > 0 && ` · ${bloqueados} bloqueado${bloqueados === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="pv-scroll">
          <table className="pv-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Enlace</th>
                <th>Estado</th>
                <th>Sesiones</th>
                <th title="Último login con contraseña, no última carga de página">Último ingreso</th>
                <th>Contraseña</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const est = estadoDe(p)
                return (
                  <tr key={p.client_id}>
                    <td>
                      <div className="pv-cli">{p.cliente}</div>
                      <div className="pv-sub">
                        {p.num_projects} {p.num_projects === 1 ? 'proyecto' : 'proyectos'}
                        {p.contact_name && ` · ${p.contact_name}`}
                      </div>
                    </td>

                    <td>
                      {p.slug ? (
                        <div className="flex items-center gap-2">
                          <a href={`/portal/${p.slug}`} target="_blank" rel="noreferrer" className="pv-link">
                            /portal/{p.slug}
                          </a>
                          <button
                            type="button"
                            className="pv-copy"
                            title="Copiar enlace"
                            onClick={() => copiar(link(p.slug!), 'Enlace')}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <span className="pv-sub">—</span>
                      )}
                    </td>

                    <td>
                      <span className={`pv-estado ${est.clase}`}>{est.texto}</span>
                      {p.bloqueado && (
                        <div className="pv-sub">
                          {minutosRestantes(p.locked_until)} min restantes
                        </div>
                      )}
                    </td>

                    <td>
                      {p.slug ? (
                        <span className={p.sesiones_activas > 0 ? 'pv-ses-on' : 'pv-sub'}>
                          {p.sesiones_activas}
                        </span>
                      ) : (
                        <span className="pv-sub">—</span>
                      )}
                    </td>

                    <td className="pv-sub">{p.slug ? fecha(p.ultimo_ingreso) : '—'}</td>

                    <td className="pv-sub">
                      {p.slug ? `cambiada ${fecha(p.rotated_at ?? p.created_at)}` : '—'}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div className="dropdown">
                        <button
                          type="button"
                          className="proj-more"
                          disabled={trabajando}
                          onClick={() => setMenu(menu === p.client_id ? null : p.client_id)}
                          title="Acciones"
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                            <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                          </svg>
                        </button>

                        {menu === p.client_id && (
                          <div className="dropdown-menu" style={{ right: 0, left: 'auto' }}>
                            <button type="button" className="dropdown-item" onClick={() => generar(p)}>
                              {p.slug ? 'Generar contraseña nueva' : 'Crear portal'}
                            </button>

                            {p.slug && p.bloqueado && (
                              <button
                                type="button"
                                className="dropdown-item"
                                onClick={() => correr(() => desbloquearPortal(p.slug!))}
                              >
                                Desbloquear
                              </button>
                            )}

                            {p.slug && (
                              <button
                                type="button"
                                className="dropdown-item"
                                onClick={() => correr(() => activarPortal(p.client_id, !p.enabled))}
                              >
                                {p.enabled ? 'Desactivar' : 'Activar'}
                              </button>
                            )}

                            {p.slug && (
                              <button
                                type="button"
                                className="dropdown-item"
                                style={{ color: 'var(--urgent-fg)' }}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `¿Eliminar el acceso de ${p.cliente}?\n\nEl enlace deja de funcionar. Si después lo volvés a crear, será con otra contraseña y habrá que reenviársela.`
                                    )
                                  ) {
                                    correr(() => eliminarPortal(p.client_id))
                                  }
                                }}
                              >
                                Eliminar acceso
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ margin: 'var(--space-4) 0 0', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
        El portal es <b>por cliente</b>, no por proyecto: si un cliente tiene varios
        proyectos, los ve todos con un selector, en el mismo enlace y con la misma
        contraseña. Tras <b>2 intentos fallidos</b> el acceso se bloquea 40 minutos;
        desde acá se desbloquea al instante.{' '}
        <Link href="/clientes" style={{ color: 'var(--brand-700)' }}>Ver clientes</Link>
      </p>
    </div>
  )
}
