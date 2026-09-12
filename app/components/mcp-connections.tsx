'use client'

import { useActionState, useState } from 'react'
import { conectarClaude, desconectarClaude, type EstadoConexionMcp } from '@/app/ajustes/actions'

export type ConexionMcp = {
  id: string
  name: string
  token_prefix: string
  created_at: string
  last_used_at: string | null
}

const fecha = (valor: string | null) =>
  valor
    ? new Date(valor).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

export default function McpConnections({
  conexiones,
  endpoint,
}: {
  conexiones: ConexionMcp[]
  endpoint: string
}) {
  const [estado, accion, enviando] = useActionState<EstadoConexionMcp, FormData>(conectarClaude, {})
  const [copiado, setCopiado] = useState<string | null>(null)
  // Guardamos el token ya descartado para poder volver al formulario sin recargar,
  // y que uno nuevo (distinto) vuelva a mostrarse solo.
  const [descartado, setDescartado] = useState<string | null>(null)
  const tokenVisible = estado.token && estado.token !== descartado ? estado.token : null

  const copiar = async (texto: string, cual: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(cual)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      setCopiado(null)
    }
  }

  const comando = tokenVisible
    ? `claude mcp add --transport http kickplanner ${endpoint} --header "Authorization: Bearer ${tokenVisible}"`
    : ''

  return (
    <>
      <div className="section-label">Conexion con Claude</div>

      <div className="card mb-4" style={{ padding: 'var(--space-5)' }}>
        <p className="card-desc" style={{ marginTop: 0 }}>
          Genera un token para que Claude entre a KickPlanner <strong>con tu identidad</strong>: vera
          y modificara exactamente los mismos proyectos que ves tu. El token se muestra una sola vez.
        </p>

        {tokenVisible ? (
          <div
            className="card"
            style={{ padding: 'var(--space-4)', background: 'var(--panel)', marginTop: 'var(--space-4)' }}
          >
            <div className="k" style={{ marginBottom: 6 }}>
              Copialo ahora, no vuelve a mostrarse
            </div>
            <code
              style={{
                display: 'block',
                wordBreak: 'break-all',
                fontSize: 13,
                lineHeight: 1.5,
                marginBottom: 10,
              }}
            >
              {tokenVisible}
            </code>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary" onClick={() => copiar(tokenVisible, 'token')}>
                {copiado === 'token' ? 'Copiado' : 'Copiar token'}
              </button>
              <button type="button" className="btn" onClick={() => copiar(comando, 'comando')}>
                {copiado === 'comando' ? 'Copiado' : 'Copiar comando para Claude Code'}
              </button>
              <button
                type="button"
                onClick={() => setDescartado(tokenVisible)}
                style={{ background: 'transparent', border: 0, color: 'var(--text-3)', cursor: 'pointer', fontSize: 13 }}
              >
                Ya lo copie
              </button>
            </div>
            <p className="card-desc" style={{ marginBottom: 0, marginTop: 10 }}>
              Endpoint: <code>{endpoint}</code>
            </p>
          </div>
        ) : (
          <form action={accion} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="k">Nombre de la conexion</span>
              <input name="name" className="field" placeholder="p. ej. Claude en mi portatil" autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="k">Tu contrasena</span>
              <input
                name="password"
                type="password"
                className="field"
                placeholder="Para confirmar que eres tu"
                autoComplete="current-password"
              />
            </label>
            <div className="sm:col-span-2 flex items-center justify-between gap-3">
              <span className="card-desc" style={{ margin: 0 }}>
                Tu contrasena no se guarda: solo se usa para abrir la sesion que usara Claude.
              </span>
              <button type="submit" className="btn btn-primary" disabled={enviando}>
                {enviando ? 'Conectando...' : 'Conectar Claude'}
              </button>
            </div>
            {estado.error && (
              <p className="sm:col-span-2" style={{ color: 'var(--urgent-fg)', fontSize: 13, margin: 0 }}>
                {estado.error}
              </p>
            )}
          </form>
        )}
      </div>

      {conexiones.length > 0 && (
        <div className="card mb-4" style={{ padding: 'var(--space-5)' }}>
          <div className="k" style={{ marginBottom: 10 }}>
            Conexiones activas
          </div>
          <div className="flex flex-col gap-3">
            {conexiones.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4">
                <div>
                  <div style={{ fontSize: 14 }}>{c.name}</div>
                  <div className="card-desc" style={{ margin: 0 }}>
                    <code>{c.token_prefix}…</code> · creada el {fecha(c.created_at)} ·{' '}
                    {c.last_used_at ? `usada el ${fecha(c.last_used_at)}` : 'sin usar todavia'}
                  </div>
                </div>
                <form action={desconectarClaude}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    style={{
                      background: 'transparent',
                      border: 0,
                      color: 'var(--urgent-fg)',
                      cursor: 'pointer',
                      fontSize: 13,
                      padding: 0,
                    }}
                  >
                    Desconectar
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
