import Link from 'next/link'
import Avatar from '@/app/components/avatar'
import ClientLogo from '@/app/components/client-logo'
import PortfolioMenu from '@/app/components/portfolio-menu'
import { isCover } from '@/app/portfolios/covers'

export type PortfolioCardData = {
  id: string
  name: string
  description: string | null
  cover: string
  owner_id: string
  owner_name: string | null
  created_at: string
  last_activity: string | null
  project_count: number
  active_count: number
  seo_count: number
  web_count: number
  open_tasks: number
  overdue_tasks: number
  managers: { id: string; name: string | null; avatar_url: string | null }[]
  clients: { name: string; url: string | null }[]
  seo_fees: Record<string, number> | null
}

const MAX_PEOPLE = 3
const MAX_CLIENTS = 3

/** "Actualizado hoy", "ayer", "hace 5 días", "hace 3 semanas"… (hora de Bogotá) */
export function relativeUpdate(iso: string | null): string {
  if (!iso) return 'Sin actividad'
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const diff = Math.round((Date.parse(day(new Date())) - Date.parse(day(new Date(iso)))) / 86_400_000)
  if (diff <= 0) return 'Actualizado hoy'
  if (diff === 1) return 'Actualizado ayer'
  if (diff < 14) return `Hace ${diff} días`
  if (diff < 60) return `Hace ${Math.round(diff / 7)} semanas`
  return `Hace ${Math.round(diff / 30)} meses`
}

/** { COP: 14800000, USD: 1200 } → "$14,8 M COP + US$1.200" */
export function formatFees(fees: Record<string, number> | null): string | null {
  if (!fees) return null
  const parts: string[] = []
  for (const [cur, raw] of Object.entries(fees).sort(([a], [b]) => (a === 'COP' ? -1 : b === 'COP' ? 1 : a.localeCompare(b)))) {
    const n = Number(raw)
    if (!n) continue
    if (cur === 'COP') {
      parts.push(
        n >= 1_000_000
          ? `$${(n / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M COP`
          : `$${n.toLocaleString('es-CO')} COP`
      )
    } else if (cur === 'USD') {
      parts.push(`US$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`)
    } else {
      parts.push(`${n.toLocaleString('es-CO')} ${cur}`)
    }
  }
  return parts.length ? parts.join(' + ') : null
}

/**
 * Tarjeta de portafolio. En reposo: actividad, proyectos activos, nombre,
 * encargados y clientes. Con hover o foco de teclado (y siempre en pantallas
 * táctiles) el panel sube sobre la portada y muestra la mezcla
 * SEO/WEB, tareas abiertas y vencidas y, solo a admins, los retainers.
 *
 * Todo el dibujo vive en globals.css (sección PORTAFOLIOS · TARJETAS).
 */
export default function PortfolioCard({ p, canManage }: { p: PortfolioCardData; canManage: boolean }) {
  const cover = isCover(p.cover) ? p.cover : 'bosque'
  const fees = formatFees(p.seo_fees)
  const people = p.managers.slice(0, MAX_PEOPLE)
  const morePeople = p.managers.length - people.length
  const clients = p.clients.slice(0, MAX_CLIENTS)
  const moreClients = p.clients.length - clients.length
  const active =
    p.project_count === 0
      ? 'Sin proyectos'
      : p.active_count === p.project_count
        ? `${p.active_count} ${p.active_count === 1 ? 'activo' : 'activos'}`
        : `${p.active_count} de ${p.project_count} activos`

  return (
    <article className="pf-card">
      {/* La portada también abre el portafolio (fuera del orden de tabulación:
          el enlace accesible es el título). */}
      <Link
        href={`/portfolios/${p.id}`}
        className={`pf-cover pf-cover--${cover}`}
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="pf-panel">
        <PortfolioMenu
          portfolio={{ id: p.id, name: p.name, description: p.description, cover, projectCount: p.project_count }}
          canManage={canManage}
        />

        <p className="pf-meta">
          <span>{relativeUpdate(p.last_activity)}</span>
          <span aria-hidden="true">•</span>
          <span className="pf-meta-active">
            <span className={`pf-dot ${p.active_count > 0 ? '' : 'is-idle'}`} aria-hidden="true" />
            {active}
          </span>
        </p>

        <h2 className="pf-title">
          <Link href={`/portfolios/${p.id}`} className="pf-title-link">
            {p.name}
          </Link>
        </h2>

        <div className="pf-extra">
          <div className="pf-tags">
            {p.seo_count > 0 && <span className="pf-tag pf-tag--seo">SEO · {p.seo_count}</span>}
            {p.web_count > 0 && <span className="pf-tag pf-tag--web">WEB · {p.web_count}</span>}
            <span className="pf-tag pf-tag--plain">
              {p.open_tasks} {p.open_tasks === 1 ? 'abierta' : 'abiertas'}
            </span>
            {p.overdue_tasks > 0 && (
              <span className="pf-tag pf-tag--late">
                {p.overdue_tasks} {p.overdue_tasks === 1 ? 'vencida' : 'vencidas'}
              </span>
            )}
          </div>
          {fees && (
            <p className="pf-fee">
              Retainers SEO: <b>{fees}</b> / mes
            </p>
          )}
        </div>

        <div className="pf-foot">
          <div className="pf-stack" aria-label="Encargados">
            {people.length === 0 ? (
              <span className="pf-empty">Sin encargados</span>
            ) : (
              people.map((m) => (
                <span key={m.id} className="pf-stack-item">
                  <Avatar name={m.name} url={m.avatar_url} size={22} />
                </span>
              ))
            )}
            {morePeople > 0 && <span className="pf-more">+{morePeople}</span>}
          </div>
          <div className="pf-stack" aria-label="Clientes">
            {clients.map((c, i) => (
              <span key={c.name + i} className="pf-stack-item">
                <ClientLogo name={c.name} url={c.url} index={i} />
              </span>
            ))}
            {moreClients > 0 && <span className="pf-more">+{moreClients}</span>}
          </div>
        </div>
      </div>
    </article>
  )
}
