'use client'

import { useState, useTransition } from 'react'
import {
  vincularPropiedad,
  desvincularPropiedad,
  sincronizarAhora,
  propiedadesDisponibles,
  type PropiedadGoogle,
} from '@/app/projects/seo-actions'

export type EstadoPropiedad = {
  site_url: string | null
  backfilled_at: string | null
  last_sync_at: string | null
  last_error: string | null
}

function hace(iso: string | null): string {
  if (!iso) return 'nunca'
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 2) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

export default function SeoPropertyPanel({
  projectId,
  estado,
  googleConectado,
}: {
  projectId: string
  estado: EstadoPropiedad | null
  googleConectado: boolean
}) {
  const [valor, setValor] = useState(estado?.site_url ?? '')
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [trabajando, start] = useTransition()
  const [lista, setLista] = useState<PropiedadGoogle[] | null>(null)
  const [cargandoLista, setCargandoLista] = useState(false)

  // Las propiedades se piden a demanda: son una llamada a Google y la pantalla
  // tiene que abrir igual de rápido aunque la cuenta no esté conectada.
  const traerLista = () => {
    if (cargandoLista) return
    setCargandoLista(true)
    setAviso(null)
    propiedadesDisponibles()
      .then((r) => {
        if (r.ok) setLista(r.propiedades)
        else setAviso({ ok: false, texto: r.mensaje })
      })
      .catch(() => setAviso({ ok: false, texto: 'No se pudo leer la lista de propiedades.' }))
      .finally(() => setCargandoLista(false))
  }

  const correr = (fn: () => Promise<{ ok: boolean; mensaje: string }>) =>
    start(async () => {
      setAviso(null)
      const r = await fn()
      setAviso({ ok: r.ok, texto: r.mensaje })
    })

  // Coincide con el umbral de portal_seo y del aviso del panel: 8 días, que
  // es un día más que el intervalo del cron semanal.
  const desactualizado =
    estado?.last_sync_at != null &&
    Date.now() - new Date(estado.last_sync_at).getTime() > 8 * 86400000

  return (
    <div className="flex flex-col gap-4">
      {!googleConectado && (
        <div className="card" style={{ borderColor: 'var(--mod-fg)' }}>
          <p className="card-title mb-1">La cuenta de Google no está conectada</p>
          <p className="card-desc">
            Podés vincular la propiedad igual, pero no se van a poder traer datos hasta
            que conectes la cuenta en <a href="/ajustes" style={{ color: 'var(--brand-700)' }}>Ajustes</a>.
          </p>
        </div>
      )}

      {aviso && (
        <div
          className="card"
          role="status"
          style={{
            borderColor: aviso.ok ? 'var(--low-fg)' : 'var(--urgent-fg)',
            background: aviso.ok ? 'var(--low-bg)' : 'var(--urgent-bg)',
          }}
        >
          <p style={{ margin: 0, fontSize: 13.5, color: aviso.ok ? 'var(--low-fg)' : 'var(--urgent-text)' }}>
            {aviso.texto}
          </p>
        </div>
      )}

      {/* Propiedad */}
      <div className="card">
        <div className="section-head" style={{ margin: '0 0 var(--space-3)' }}>
          Propiedad de Search Console
        </div>
        <p className="card-desc" style={{ marginBottom: 'var(--space-4)' }}>
          Elegí la propiedad de la lista de la cuenta conectada. El nombre tiene que
          coincidir exactamente con el de Search Console, y no es evidente: un mismo
          dominio puede estar como <code>sc-domain:ejemplo.com</code> o como{' '}
          <code>https://ejemplo.com/</code>, y son propiedades distintas.
        </p>

        {lista === null ? (
          <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 'var(--space-4)' }}>
            <button
              type="button"
              className="btn btn-outline"
              disabled={cargandoLista}
              onClick={traerLista}
            >
              {cargandoLista ? 'Consultando a Google…' : 'Ver propiedades de la cuenta'}
            </button>
            {estado?.site_url && (
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Vinculada: <b>{estado.site_url}</b>
              </span>
            )}
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label="Propiedades de Search Console"
            style={{
              display: 'grid',
              gap: 6,
              maxHeight: 280,
              overflowY: 'auto',
              marginBottom: 'var(--space-4)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              padding: 6,
            }}
          >
            {lista.map((s) => {
              // Una propiedad sin verificar no devuelve datos: se puede ver,
              // pero elegirla solo produciría un 403 más adelante.
              const sinVerificar = s.permissionLevel === 'siteUnverifiedUser'
              const elegida = valor === s.siteUrl
              return (
                <button
                  key={s.siteUrl}
                  type="button"
                  role="radio"
                  aria-checked={elegida}
                  disabled={sinVerificar}
                  onClick={() => setValor(s.siteUrl)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    textAlign: 'left',
                    font: 'inherit',
                    fontSize: 13,
                    cursor: sinVerificar ? 'not-allowed' : 'pointer',
                    opacity: sinVerificar ? 0.5 : 1,
                    padding: '8px 11px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid',
                    borderColor: elegida ? 'var(--brand-600)' : 'transparent',
                    background: elegida ? 'var(--brand-50)' : 'transparent',
                    color: 'var(--text)',
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.siteUrl}
                  </span>
                  <span style={{ flex: 'none', fontSize: 11.5, color: 'var(--text-3)' }}>
                    {sinVerificar ? 'sin verificar' : s.permissionLevel.replace('site', '')}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            id="seo-site"
            className="field"
            style={{ flex: '1 1 320px', minWidth: 0 }}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Elegí una propiedad de la lista"
            aria-label="Propiedad de Search Console"
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={trabajando || !valor.trim()}
            onClick={() => correr(() => vincularPropiedad(projectId, valor))}
          >
            {estado?.site_url ? 'Actualizar' : 'Vincular'}
          </button>
          {estado?.site_url && (
            <button
              type="button"
              className="btn btn-outline"
              disabled={trabajando}
              onClick={() => correr(() => desvincularPropiedad(projectId))}
            >
              Desvincular
            </button>
          )}
        </div>
      </div>

      {/* Estado */}
      {estado?.site_url && (
        <div className="card">
          <div className="section-head" style={{ margin: '0 0 var(--space-3)' }}>
            Sincronización
          </div>

          <div className="flex flex-wrap items-center gap-6" style={{ marginBottom: 'var(--space-4)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{hace(estado.last_sync_at)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>última vez</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {estado.backfilled_at ? 'Completo' : 'Pendiente'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>historial de 16 meses</div>
            </div>
            <div className="flex flex-1 justify-end">
              <button
                type="button"
                className="btn btn-outline"
                disabled={trabajando}
                onClick={() => correr(() => sincronizarAhora(projectId))}
              >
                {trabajando ? 'Sincronizando…' : 'Sincronizar ahora'}
              </button>
            </div>
          </div>

          {estado.last_error && (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--urgent-text)',
                background: 'var(--urgent-bg)',
                borderRadius: 'var(--r-sm)',
                padding: '9px 12px',
              }}
            >
              <b>Último error:</b> {estado.last_error}
            </p>
          )}

          {!estado.last_error && desactualizado && (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--mod-fg)',
                background: 'var(--mod-bg)',
                borderRadius: 'var(--r-sm)',
                padding: '9px 12px',
              }}
            >
              Hace más de 8 días que no se sincroniza — o sea que se saltó al menos una
              corrida semanal. El portal del cliente avisa que los datos están
              desactualizados en vez de mostrarlos como actuales.
            </p>
          )}

          {!estado.backfilled_at && (
            <p style={{ margin: 'var(--space-3) 0 0', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.55 }}>
              La primera sincronización trae los 16 meses que Search Console conserva, así que
              tarda más que las siguientes. Sin ella, la línea de tendencia del portal arrancaría
              con un solo punto.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
