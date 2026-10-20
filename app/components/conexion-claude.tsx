import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { revocarAplicacion } from '@/app/ajustes/actions'

/**
 * Tarjeta "Conexión con Claude", en Ajustes.
 *
 * Ya no hay tokens que generar: Claude se conecta por OAuth. Acá se muestra la
 * URL del conector para pegar en Claude y la lista de aplicaciones a las que el
 * miembro les dio acceso, con la opción de quitárselo. Si el servidor OAuth no
 * está activo en Supabase la lista no carga, pero la tarjeta se dibuja igual.
 */
export default async function ConexionClaude() {
  const sitio = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '')
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const protocolo = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  const endpoint = `${sitio ?? `${protocolo}://${host}`}/api/mcp`

  let apps: { id: string; nombre: string; desde: string }[] = []
  let disponible = true
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.oauth.listGrants()
    if (error) throw error
    apps = (data ?? []).map((g) => ({
      id: g.client.id,
      nombre: g.client.name || 'Aplicación sin nombre',
      desde: new Date(g.granted_at).toLocaleDateString('es', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    }))
  } catch {
    disponible = false
  }

  return (
    <div className="st-card">
      <div className="st-head">
        <h2 className="st-title">Conexión con Claude</h2>
        <p className="st-desc">
          En Claude, andá a <strong>Ajustes → Conectores → Agregar conector personalizado</strong>,
          pegá esta URL y autorizá con tu cuenta. Claude va a ver y modificar exactamente lo mismo
          que vos en KickPlanner, ni más ni menos.
        </p>
      </div>

      <div
        style={{
          padding: 'var(--space-3) var(--space-4)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          background: 'var(--panel)',
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: 13,
          wordBreak: 'break-all',
          userSelect: 'all',
        }}
      >
        {endpoint}
      </div>

      <div style={{ marginTop: 'var(--space-4)' }}>
        <b style={{ fontSize: 13.5 }}>Aplicaciones con acceso</b>
        {!disponible ? (
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-3)' }}>
            No se pudo consultar la lista. Revisá que el servidor OAuth esté activo en Supabase.
          </p>
        ) : apps.length === 0 ? (
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-3)' }}>
            Todavía no conectaste ninguna.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 8 }}>
            {apps.map((app) => (
              <li
                key={app.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 14 }}>{app.nombre}</b>
                  <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-3)' }}>
                    Con acceso desde el {app.desde}
                  </p>
                </div>
                <form action={revocarAplicacion}>
                  <input type="hidden" name="client_id" value={app.id} />
                  <button type="submit" className="btn btn-ghost">Quitar acceso</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
