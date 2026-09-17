import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'

/**
 * Aviso de sincronizaciones de Search Console caídas.
 *
 * Por qué existe: el portal del cliente NUNCA muestra un error. Si una
 * propiedad deja de sincronizar, el cliente sigue viendo el último dato bueno
 * con una nota chiquita de "datos actualizados al X". Eso es correcto de cara
 * al cliente y peligroso de cara al equipo: un refresh token revocado puede
 * pasar semanas sin que nadie lo note, y cuando se nota ya se le mostraron
 * números viejos a alguien en una reunión.
 *
 * Este aviso es la contraparte: el problema se ve acá, en la pantalla que el
 * equipo abre todos los días.
 *
 * Si todo está bien no dibuja nada. Un panel con un cartel verde permanente
 * de "todo OK" enseña a ignorar esa zona de la pantalla.
 */

type Prop = {
  project_id: string
  site_url: string
  last_sync_at: string | null
  last_error: string | null
}

// La sincronización es SEMANAL (lunes 7am). El umbral tiene que ser mayor que
// el intervalo del cron: con 3 días, este aviso se encendía solo todas las
// semanas y en un mes nadie lo miraría.
const LIMITE_SIN_SYNC = 8 * 86400000

function hace(iso: string | null): string {
  if (!iso) return 'nunca'
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dias < 1) return 'hoy'
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`
}

export default async function SeoHealth() {
  let props: Prop[] = []
  let nombres = new Map<string, string>()
  let googleConectado = true

  // Todo tolera fallos: este aviso no puede tumbar el panel.
  try {
    const supabase = await createClient()

    const { data } = await supabase
      .from('gsc_properties')
      .select('project_id, site_url, last_sync_at, last_error')
    props = (data ?? []) as Prop[]
    if (props.length === 0) return null

    const { data: proys } = await supabase
      .from('projects')
      .select('id, name')
      .in('id', props.map((p) => p.project_id))
    nombres = new Map(((proys ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]))

    const { data: estado } = await supabase.rpc('google_oauth_estado')
    googleConectado = ((estado ?? {}) as { conectado?: boolean }).conectado === true
  } catch {
    return null
  }

  const conError = props.filter((p) => p.last_error)
  const desactualizadas = props.filter(
    (p) => !p.last_error && (!p.last_sync_at || Date.now() - new Date(p.last_sync_at).getTime() > LIMITE_SIN_SYNC)
  )

  if (googleConectado && conError.length === 0 && desactualizadas.length === 0) return null

  // Un solo aviso, del color del problema más grave.
  const grave = !googleConectado || conError.length > 0

  return (
    <div
      className="card"
      role="status"
      style={{
        marginBottom: 'var(--space-4)',
        borderColor: grave ? 'var(--urgent-fg)' : 'var(--mod-fg)',
        background: grave ? 'var(--urgent-bg)' : 'var(--mod-bg)',
      }}
    >
      <div
        className="section-head"
        style={{ margin: '0 0 var(--space-3)', color: grave ? 'var(--urgent-text)' : 'var(--mod-fg)' }}
      >
        Search Console necesita atención
      </div>

      {!googleConectado && (
        <p style={{ margin: '0 0 var(--space-3)', fontSize: 13.5, lineHeight: 1.55 }}>
          La cuenta de Google no está conectada, así que ninguna propiedad puede
          sincronizar. Los portales muestran el último dato que alcanzaron a traer.{' '}
          <Link href="/ajustes" style={{ color: 'var(--brand-700)', fontWeight: 600 }}>
            Conectar desde Ajustes
          </Link>
        </p>
      )}

      <div className="flex flex-col gap-2">
        {[...conError, ...desactualizadas].map((p) => (
          <div
            key={p.project_id}
            className="flex flex-wrap items-baseline gap-2"
            style={{ fontSize: 13, lineHeight: 1.5 }}
          >
            <Link
              href={`/projects/${p.project_id}/seo`}
              style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}
            >
              {nombres.get(p.project_id) ?? p.site_url}
            </Link>
            <span style={{ color: 'var(--text-3)' }}>
              {p.last_error
                ? p.last_error.length > 140
                  ? `${p.last_error.slice(0, 140)}…`
                  : p.last_error
                : `Sin sincronizar desde ${hace(p.last_sync_at)}.`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
