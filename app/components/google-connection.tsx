import { createClient } from '@/utils/supabase/server'

/**
 * Tarjeta de conexión con Google, en Ajustes.
 *
 * Es una sola cuenta para toda la agencia: el job de Search Console usa este
 * permiso para todas las propiedades a las que esa cuenta tiene acceso.
 *
 * Si la consulta de estado falla, la tarjeta se dibuja igual en modo "sin
 * conectar". Nunca rompe la página de Ajustes.
 */
export default async function GoogleConnection({
  ok,
  error,
}: {
  ok?: boolean
  error?: string
}) {
  let conectado = false
  let email: string | null = null
  let desde: string | null = null

  try {
    const supabase = await createClient()
    const { data } = await supabase.rpc('google_oauth_estado')
    const e = (data ?? {}) as { conectado?: boolean; email?: string; desde?: string }
    conectado = e.conectado === true
    email = e.email ?? null
    desde = e.desde ?? null
  } catch {
    // Se queda en "sin conectar"; el botón sigue disponible.
  }

  const fecha = desde
    ? new Date(desde).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="st-card">
      <div className="st-head">
        <h2 className="st-title">Google Search Console</h2>
        <p className="st-desc">
          Conectá la cuenta de Google de la agencia para que los portales de los clientes
          muestren sus resultados de búsqueda. Se pide permiso de <strong>solo lectura</strong>:
          no se puede modificar nada en las propiedades.
        </p>
      </div>

      {error && (
        <p className="st-alert st-alert-error" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16h.01" />
          </svg>
          {error}
        </p>
      )}
      {ok && !error && (
        <p className="st-alert st-alert-ok" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Cuenta de Google conectada.
        </p>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--space-4)',
          justifyContent: 'space-between',
          padding: 'var(--space-4)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          background: conectado ? 'var(--brand-50)' : 'var(--panel)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: conectado ? 'var(--low-fg)' : 'var(--text-3)',
                flex: 'none',
              }}
            />
            <b style={{ fontSize: 14 }}>{conectado ? 'Conectada' : 'Sin conectar'}</b>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-3)' }}>
            {conectado
              ? `${email ?? 'Cuenta de Google'}${fecha ? ` · desde el ${fecha}` : ''}`
              : 'Ningún portal va a mostrar datos de búsqueda hasta que se conecte.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <a className="btn btn-primary" href="/api/google/start">
            {conectado ? 'Volver a conectar' : 'Conectar con Google'}
          </a>
        </div>
      </div>
    </div>
  )
}
