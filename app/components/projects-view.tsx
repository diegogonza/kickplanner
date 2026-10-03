'use client'

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { useStickyHead } from './use-sticky-head'
import Link from 'next/link'
import {
  createProject,
  setProjectStatus,
  setProjectManager,
  toggleFavorite,
  deleteProject,
} from '@/app/projects/actions'
import {
  PROJECT_STATUSES as STATUSES,
  projectStatusOf as statusOf,
  PROJECT_TYPES,
  projectTypeOf,
  money,
  moneyCompact,
  projectAge,
  nextBilling,
  formatDateLong,
  formatDateShort,
  activeAgo,
  type StatusChange,
} from '@/app/projects/statuses'
import { OPEN_NEW_PROJECT } from '@/app/lib/ui-events'
import Avatar from '@/app/components/avatar'
import ProjectEditModal from '@/app/components/project-edit-modal'
import { toastIfFailed, toastNoPermission } from '@/app/components/toast'

export type ProjectOverview = {
  id: string
  name: string
  client_id: string | null
  client: string | null
  description: string | null
  status: string
  type: string
  status_note: string | null
  overdue: number
  created_at: string
  last_activity: string
  favorite: boolean
  num_tasks: number
  manager_id: string | null
  manager: string | null
  manager_avatar: string | null
  start_date: string | null
  fee: number | null
  currency: string
  url: string | null
  /**
   * Atraso de pagos (cobros vencidos sin pagar). Solo llega para admin, desde
   * payments_overdue_by_project(); para el resto es undefined.
   */
  pay_overdue?: { count: number; amount: number; since: string } | null
  /** Último mes recurrente pagado (solo admin): la cuenta regresiva lo salta. */
  pay_paid_through?: string | null
  /** Cambios de estado (fecha en TZ, ascendente) para descontar las pausas. */
  status_history?: StatusChange[]
}

type Member = { user_id: string; email: string; full_name: string | null; avatar_url: string | null }

const memberName = (m: Member) => m.full_name?.trim() || m.email

// Pasos del asistente de creación de proyecto
const CREATE_STEPS = [
  {
    key: 'basico',
    label: 'Lo esencial',
    title: 'Empecemos por lo básico',
    desc: 'Cómo se llama el proyecto, para quién es y quién lo lidera.',
  },
  {
    key: 'comercial',
    label: 'Términos',
    title: 'Condiciones comerciales',
    desc: 'Cuándo arranca, cuánto vale y dónde vive el sitio.',
  },
  {
    key: 'config',
    label: 'Puesta en marcha',
    title: 'Listo para arrancar',
    desc: 'Plantilla de tareas, estado inicial y notas del arranque.',
  },
]

/**
 * Orden de la lista: SIEMPRE por nombre, A→Z, sin importar favoritos ni
 * actividad. Es una decisión fija de producto: las cabeceras no ordenan.
 * `localeCompare` en 'es' con sensibilidad base: "Árbol" va junto a "arbol" y
 * mayúsculas/minúsculas no separan grupos.
 */
const porNombre = (a: ProjectOverview, b: ProjectOverview) =>
  a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })

/**
 * Contexto que cada fila necesita.
 *
 * Los subcomponentes viven a nivel de módulo y reciben esto por props, NO
 * declarados dentro de ProjectsView: un componente definido en el cuerpo de
 * otro es una función nueva en cada render, así que React desmonta y remonta su
 * subárbol. En una tabla eso significa perder el foco del teclado al ordenar y
 * reconstruir las doce celdas de cada fila cada vez que corre el reloj de
 * "Activo hace…". `use-sticky-head.ts` ya advertía de esto en sus comentarios.
 */
type RowCtx = {
  now: number | null
  isAdmin: boolean
  members: Member[]
  open: string | null
  toggleOpen: (kind: string, id: string) => void
  closeAll: () => void
  onEdit: (p: ProjectOverview) => void
  confirmDelete: string | null
  setConfirmDelete: (id: string | null) => void
}

const abierto = (ctx: RowCtx, kind: string, id: string) => ctx.open === `${kind}:${id}`

/**
 * Botón de envío que se bloquea mientras la acción está en curso. Sin esto un
 * doble clic en "Crear proyecto" creaba dos proyectos (createProject no es
 * atómico), y un doble clic en "Eliminar" hacía que el segundo envío no
 * encontrara la fila y mostrara un "sin permisos" falso.
 */
function SubmitBtn({ className, children }: { className: string; children: ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {children}
    </button>
  )
}

function Star({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={on ? 'var(--mod-fg)' : 'none'} stroke={on ? 'var(--mod-fg)' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function StatusPill({ p, ctx }: { p: ProjectOverview; ctx: RowCtx }) {
  const s = statusOf(p.status)
  const open = abierto(ctx, 'status', p.id)
  return (
    <div className="dropdown">
      <button
        type="button"
        className={`pstatus ${s.cls}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => ctx.toggleOpen('status', p.id)}
      >
        {s.label}
      </button>
      {open && (
        <div className="dropdown-menu" style={{ right: 0, left: 'auto' }}>
          {STATUSES.map((opt) => (
            <form
              key={opt.key}
              action={async (fd) => {
                toastIfFailed(await setProjectStatus(fd))
              }}
              onSubmit={ctx.closeAll}
            >
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="status" value={opt.key} />
              <button type="submit" className="dropdown-item">
                <span className={`pstatus ${opt.cls}`}>{opt.label}</span>
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  )
}

// Celda de encargado: avatar + nombre, con menú para reasignar
function ManagerCell({ p, ctx }: { p: ProjectOverview; ctx: RowCtx }) {
  const open = abierto(ctx, 'manager', p.id)
  return (
    <div className="dropdown proj-manager">
      <button
        type="button"
        className="proj-manager-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (ctx.isAdmin ? ctx.toggleOpen('manager', p.id) : toastNoPermission())}
        title={p.manager ? `Encargado: ${p.manager}` : 'Sin encargado'}
      >
        {p.manager_id ? (
          <Avatar name={p.manager} url={p.manager_avatar} size={26} />
        ) : (
          <span className="proj-manager-none">
            <span className="proj-manager-dot" />
          </span>
        )}
      </button>
      {open && (
        <div className="dropdown-menu" style={{ left: 0, minWidth: 210, maxHeight: 260, overflowY: 'auto' }}>
          <div className="dropdown-label">Encargado</div>
          {ctx.members.map((m) => (
            <form key={m.user_id} action={async (fd) => { toastIfFailed(await setProjectManager(fd)) }} onSubmit={ctx.closeAll}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="manager_id" value={m.user_id} />
              <button type="submit" className="dropdown-item">
                <span className="flex items-center gap-2">
                  <Avatar name={m.full_name} email={m.email} url={m.avatar_url} size={22} />
                  {memberName(m)}
                </span>
              </button>
            </form>
          ))}
          {p.manager_id && (
            <form action={async (fd) => { toastIfFailed(await setProjectManager(fd)) }} onSubmit={ctx.closeAll}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="manager_id" value="" />
              <button type="submit" className="dropdown-item" style={{ color: 'var(--text-3)' }}>
                Quitar encargado
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

function RiskHint({ p }: { p: ProjectOverview }) {
  return (
    <Link
      className="risk-hint"
      href={`/projects/${p.id}?view=lista&overdue=1`}
      title={`${p.overdue} ${p.overdue === 1 ? 'tarea vencida' : 'tareas vencidas'} · ver`}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      {p.overdue}
    </Link>
  )
}

function TypeBadge({ p }: { p: ProjectOverview }) {
  const t = projectTypeOf(p.type)
  return <span className={`ptype ${t.cls}`} title={`Proyecto ${t.label}`}>{t.label}</span>
}

function UrlCell({ p, ctx }: { p: ProjectOverview; ctx: RowCtx }) {
  if (p.url) {
    return (
      <a href={p.url} target="_blank" rel="noopener noreferrer" className="proj-url-icon" title={`Abrir ${p.url}`}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
        </svg>
      </a>
    )
  }
  return (
    <button
      type="button"
      className="proj-url-icon none"
      onClick={() => (ctx.isAdmin ? ctx.onEdit(p) : toastNoPermission())}
      title="Sin web definida · clic para agregarla"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
        <path d="M4 4l16 16" />
      </svg>
    </button>
  )
}

/**
 * Qué muestra la celda de cobro.
 *
 * Lo primero es el atraso: si hay cobros vencidos sin pagar (dato de /pagos,
 * solo para admin) eso manda, sea SEO o Web y aunque el proyecto esté
 * detenido, porque la deuda sigue existiendo. Si no hay atraso, los retainers
 * SEO muestran la cuenta regresiva al próximo cobro (mes anticipado); un
 * proyecto detenido no cobra y uno Web se paga por cuotas.
 */
type Cobro =
  | { kind: 'late'; count: number; amount: number; since: string }
  | { kind: 'next'; days: number; date: string }
  | { kind: 'paused' }
  | { kind: 'none' }
function cobroDe(p: ProjectOverview): Cobro {
  if (p.pay_overdue && p.pay_overdue.count > 0) return { kind: 'late', ...p.pay_overdue }
  if (p.type !== 'seo') return { kind: 'none' }
  if (p.status === 'on_hold') return { kind: 'paused' }
  const nb = nextBilling(p.start_date, undefined, p.pay_paid_through ?? null)
  return nb ? { kind: 'next', ...nb } : { kind: 'none' }
}

/** Con 3 días o menos la celda se resalta: es el aviso para preparar el cobro. */
const COBRO_PRONTO = 3

function BillingCell({ p }: { p: ProjectOverview }) {
  const c = cobroDe(p)
  if (c.kind === 'late') {
    const proximo =
      p.type === 'seo' && p.status !== 'on_hold'
        ? nextBilling(p.start_date, undefined, p.pay_paid_through ?? null)
        : null
    const detalle =
      `Debe ${money(c.amount, p.currency)} desde el ${formatDateLong(c.since)}` +
      (proximo ? ` · próximo cobro: ${formatDateLong(proximo.date)}` : '') +
      // La base no cuenta los cobros de cuando el proyecto ya estaba detenido.
      (p.status === 'on_hold' ? ' · detenido: la deuda llega hasta la pausa' : '') +
      ' · ver en Pagos'
    return (
      <Link href="/pagos" className="proj-bill is-late" title={detalle} aria-label={detalle}>
        <b className="proj-bill-when">{c.count} {c.count === 1 ? 'vencido' : 'vencidos'}</b>
        <span className="proj-bill-date">{moneyCompact(c.amount, p.currency)}</span>
      </Link>
    )
  }
  if (c.kind === 'none') return <span className="projtable-muted">—</span>
  if (c.kind === 'paused') {
    return <span className="proj-bill proj-bill-paused" title="Proyecto detenido: no genera cobro">En pausa</span>
  }
  const cuando = c.days === 0 ? 'Hoy' : c.days === 1 ? 'Mañana' : `${c.days} días`
  return (
    <span
      className={`proj-bill${c.days <= COBRO_PRONTO ? ' is-soon' : ''}`}
      title={`Próximo cobro (mes anticipado): ${formatDateLong(c.date)}`}
    >
      <b className="proj-bill-when">{cuando}</b>
      <span className="proj-bill-date">{formatDateShort(c.date)}</span>
    </span>
  )
}

function AgeCell({ p, ctx }: { p: ProjectOverview; ctx: RowCtx }) {
  const a = projectAge(p.start_date, p.status_history)
  if (!a) {
    return (
      <button
        type="button"
        className="proj-age-empty"
        onClick={() => (ctx.isAdmin ? ctx.onEdit(p) : toastNoPermission())}
        title="Definir fecha de inicio"
      >
        Definir inicio
      </button>
    )
  }
  if (a.future) {
    return (
      <span className="proj-age" title={`Inicio previsto: ${formatDateLong(p.start_date!)}`}>
        <b className="proj-age-month">Sin arrancar</b>
        <span className="proj-age-days">
          {a.days === 1 ? 'empieza mañana' : `empieza en ${a.days} días`}
        </span>
      </span>
    )
  }
  const dias = `${a.days} ${a.days === 1 ? 'día' : 'días'} activo`
  const pausa = a.pausedDays > 0 ? ` · ${a.pausedDays} ${a.pausedDays === 1 ? 'día' : 'días'} en pausa (no cuentan)` : ''
  const titulo = `Inicio: ${formatDateLong(p.start_date!)} · ${dias}${pausa}`
  // Detenido: la antigüedad se congela y muestra cuánto duró activo.
  if (p.status === 'on_hold') {
    return (
      <span className="proj-age" title={titulo}>
        <b className="proj-age-month">{a.month} {a.month === 1 ? 'mes' : 'meses'}</b>
        <span className="proj-age-days">detenido</span>
      </span>
    )
  }
  return (
    <span className="proj-age" title={titulo}>
      <b className="proj-age-month">Mes {a.month}</b>
      <span className="proj-age-days">{dias}</span>
    </span>
  )
}

function StarBtn({ p }: { p: ProjectOverview }) {
  return (
    <form action={async (fd) => { toastIfFailed(await toggleFavorite(fd)) }}>
      <input type="hidden" name="project_id" value={p.id} />
      <input type="hidden" name="favorite" value={String(p.favorite)} />
      <button type="submit" className="proj-star" title={p.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}>
        <Star on={p.favorite} />
      </button>
    </form>
  )
}

function Menu({ p, ctx }: { p: ProjectOverview; ctx: RowCtx }) {
  const open = abierto(ctx, 'menu', p.id)
  return (
    <div className="dropdown">
      <button
        type="button"
        className="proj-more"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { ctx.setConfirmDelete(null); ctx.toggleOpen('menu', p.id) }}
        title="Acciones"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>
      {open && (
        <div className="dropdown-menu" style={{ right: 0, left: 'auto' }}>
          <button
            type="button"
            className="dropdown-item"
            onClick={() => { ctx.closeAll(); if (ctx.isAdmin) ctx.onEdit(p); else toastNoPermission() }}
          >
            Editar
          </button>
          {ctx.confirmDelete === p.id ? (
            <div className="proj-confirm">
              <p className="proj-confirm-text">
                Se elimina el proyecto <b>{p.name}</b> y todas sus tareas. No se puede deshacer.
              </p>
              <div className="proj-confirm-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => ctx.setConfirmDelete(null)}>
                  Cancelar
                </button>
                <form
                  action={async (fd) => {
                    toastIfFailed(await deleteProject(fd))
                    ctx.setConfirmDelete(null)
                    ctx.closeAll()
                  }}
                >
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitBtn className="btn btn-sm btn-danger">Eliminar</SubmitBtn>
                </form>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="dropdown-item"
              style={{ color: 'var(--urgent-fg)' }}
              onClick={() => (ctx.isAdmin ? ctx.setConfirmDelete(p.id) : toastNoPermission())}
            >
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ p, ctx }: { p: ProjectOverview; ctx: RowCtx }) {
  return (
    <div className="projtable-row">
      <StarBtn p={p} />
      <span className="projtable-cell"><UrlCell p={p} ctx={ctx} /></span>
      <Link href={`/projects/${p.id}`} className="projtable-name">
        <span className="name">{p.name}</span>
      </Link>
      <span className="projtable-cell"><BillingCell p={p} /></span>
      <span
        className="projtable-cell projtable-fee"
        title={p.fee != null ? `${money(p.fee, p.currency)} ${p.type === 'web' ? 'total' : '/ mes'}` : undefined}
      >
        {p.fee != null ? (
          <>
            {moneyCompact(p.fee, p.currency)}
            <span className="projtable-fee-unit">{p.type === 'web' ? 'total' : '/mes'}</span>
          </>
        ) : (
          <span className="projtable-muted">—</span>
        )}
      </span>
      <span className="projtable-cell"><AgeCell p={p} ctx={ctx} /></span>
      <span className="projtable-cell projtable-center"><ManagerCell p={p} ctx={ctx} /></span>
      <span className="projtable-cell"><TypeBadge p={p} /></span>
      <span className="projtable-cell"><StatusPill p={p} ctx={ctx} /></span>
      <span className="projtable-cell">
        {p.overdue > 0 ? <RiskHint p={p} /> : <span className="projtable-muted">—</span>}
      </span>
      <span className="projtable-cell proj-active">{activeAgo(p.last_activity, ctx.now)}</span>
      <Menu p={p} ctx={ctx} />
    </div>
  )
}

export default function ProjectsView({
  projects,
  clients = [],
  templates = [],
  members = [],
  isAdmin = false,
  initialClient = '',
}: {
  projects: ProjectOverview[]
  clients?: { id: string; name: string }[]
  templates?: { id: string; name: string; type: string }[]
  members?: Member[]
  isAdmin?: boolean
  /** Cliente preseleccionado cuando se llega desde su ficha (?client=…). */
  initialClient?: string
}) {
  const [createType, setCreateType] = useState('seo')
  const tplFor = (type: string) => templates.filter((t) => t.type === type || t.type === 'general')
  const [createOpen, setCreateOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [createName, setCreateName] = useState('')
  const [createClient, setCreateClient] = useState('')
  const isLastStep = step === CREATE_STEPS.length - 1
  // Validación a mano: los campos de los pasos ocultos no se pueden enfocar, y
  // un `required` sobre uno de ellos hace que el navegador aborte el envío sin
  // mostrar nada. Por eso el paso 1 se valida acá y no con atributos del HTML.
  const faltaEnPaso1 = !createName.trim() ? 'nombre' : !createClient ? 'cliente' : null
  const canAdvance = step !== 0 || faltaEnPaso1 === null
  // El aviso no aparece hasta que alguien intenta avanzar: recibir a la persona
  // con un "falta el nombre" en un formulario recién abierto es ruido.
  const [intentoAvanzar, setIntentoAvanzar] = useState(false)
  const closeCreate = () => {
    setCreateOpen(false)
    setStep(0)
    setCreateName('')
    setCreateClient('')
    setCreateType('seo')
    setIntentoAvanzar(false)
  }
  const goNext = () => {
    if (!canAdvance) { setIntentoAvanzar(true); return }
    if (!isLastStep) setStep((s) => s + 1)
  }
  const [editing, setEditing] = useState<ProjectOverview | null>(null)

  /**
   * Un solo desplegable abierto a la vez, identificado por "tipo:id". Antes
   * eran tres estados independientes: se podían dejar dos menús abiertos y
   * ninguno se cerraba al hacer clic fuera.
   */
  const [open, setOpen] = useState<string | null>(null)
  const toggleOpen = useCallback(
    (kind: string, id: string) => setOpen((prev) => (prev === `${kind}:${id}` ? null : `${kind}:${id}`)),
    [],
  )
  const closeAll = useCallback(() => setOpen(null), [])

  useEffect(() => {
    if (open === null) return
    const onDown = (e: MouseEvent) => {
      // Un clic dentro del propio desplegable no lo cierra; el resto sí.
      if (!(e.target as HTMLElement)?.closest?.('.dropdown')) closeAll()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, closeAll])

  // Confirmación de borrado en el propio menú (antes era un confirm() nativo,
  // que bloquea el hilo y se ve distinto en cada navegador).
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [groupBy, setGroupBy] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(!!initialClient)

  /**
   * Reloj para "Activo hace…". Arranca en null a propósito: durante el render
   * del servidor no hay reloj del navegador, así que se muestra la fecha
   * (idéntica en ambos lados) y el texto se vuelve relativo al montar. Así no
   * hay desajuste de hidratación, y de paso se refresca solo cada minuto.
   *
   * El primer valor se pone en un timeout y no en el cuerpo del efecto para no
   * encadenar un render sincrónico justo después de montar.
   */
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const primero = window.setTimeout(() => setNow(Date.now()), 0)
    const cada = window.setInterval(() => setNow(Date.now()), 60000)
    return () => {
      window.clearTimeout(primero)
      window.clearInterval(cada)
    }
  }, [])

  // El botón "Iniciar un nuevo proyecto" vive en el header y abre este modal por evento
  useEffect(() => {
    const abrir = () => {
      if (!isAdmin) return toastNoPermission()
      setStep(0)
      setCreateName('')
      setCreateClient('')
      setIntentoAvanzar(false)
      setCreateOpen(true)
    }
    window.addEventListener(OPEN_NEW_PROJECT, abrir)
    return () => window.removeEventListener(OPEN_NEW_PROJECT, abrir)
  }, [isAdmin])

  // Filtros por columna (estilo data table), aplicados en cliente
  const [fName, setFName] = useState('')
  const [fClient, setFClient] = useState(initialClient)
  const [fManager, setFManager] = useState('')
  const [fType, setFType] = useState('')
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set())
  const [fOverdue, setFOverdue] = useState('')
  // Solo para admin: es el único que recibe el dato de pagos.
  const [fPagos, setFPagos] = useState('')

  const toggleStatus = (key: string) =>
    setStatusSel((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const anyFilter = !!(fName.trim() || fClient || fManager || fType || statusSel.size > 0 || fOverdue || fPagos)
  const clearFilters = () => {
    setFName(''); setFClient(''); setFManager(''); setFType(''); setStatusSel(new Set()); setFOverdue(''); setFPagos('')
  }

  /**
   * Base de los contadores: todos los filtros MENOS el de estado, para que las
   * píldoras sigan diciendo cuántos hay de cada estado mientras una está
   * activa. La lista que se pinta es esto más el filtro de estado: derivarla
   * evita mantener dos veces las mismas condiciones.
   */
  const baseForCounts = useMemo(() => {
    const q = fName.trim().toLowerCase()
    return projects.filter((p) => {
      // El buscador mira nombre, cliente y encargado: las tres columnas están a
      // la vista, y escribir "Vitaliah" sin encontrar nada desconcierta.
      if (q) {
        const heno = `${p.name} ${p.client ?? ''} ${p.manager ?? ''}`.toLowerCase()
        if (!heno.includes(q)) return false
      }
      if (fClient) {
        if (fClient === '__none__' ? p.client_id != null : p.client_id !== fClient) return false
      }
      if (fManager) {
        if (fManager === '__none__' ? p.manager_id != null : p.manager_id !== fManager) return false
      }
      if (fType && p.type !== fType) return false
      if (fOverdue === 'with' && !(p.overdue > 0)) return false
      if (fOverdue === 'without' && p.overdue > 0) return false
      if (fPagos) {
        const atrasado = (p.pay_overdue?.count ?? 0) > 0
        // "Sin atraso" = proyectos que cobran (SEO con inicio) y no deben nada;
        // un Web sin cuotas vencidas o un SEO sin fecha no está "al día", no aplica.
        const cobra = p.type === 'seo' && !!p.start_date
        if (fPagos === 'late' ? !atrasado : atrasado || !cobra) return false
      }
      return true
    })
  }, [projects, fName, fClient, fManager, fType, fOverdue, fPagos])

  const statusCount = (key: string) =>
    key === '' ? baseForCounts.length : baseForCounts.filter((p) => p.status === key).length

  const filtered = useMemo(() => {
    const porEstado =
      statusSel.size === 0 ? baseForCounts : baseForCounts.filter((p) => statusSel.has(p.status))
    return [...porEstado].sort(porNombre)
  }, [baseForCounts, statusSel])

  const { sentinelRef, stuckClass } = useStickyHead()

  // Agrupa por encargado (respetando el orden vigente dentro de cada grupo)
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; avatar: string | null; items: ProjectOverview[] }>()
    for (const p of filtered) {
      const key = p.manager_id ?? '__none__'
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: p.manager_id ? p.manager ?? 'Encargado' : 'Sin encargado',
          avatar: p.manager_avatar,
          items: [],
        })
      }
      map.get(key)!.items.push(p)
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === '__none__') return 1
      if (b.key === '__none__') return -1
      return a.name.localeCompare(b.name, 'es')
    })
  }, [filtered])

  const ctx: RowCtx = {
    now,
    isAdmin,
    members,
    open,
    toggleOpen,
    closeAll,
    onEdit: setEditing,
    confirmDelete,
    setConfirmDelete,
  }

  return (
    <div>
      {projects.length === 0 ? (
        <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
          <p className="card-title mb-1">Aún no tienes proyectos</p>
          <p className="card-desc">Crea tu primer proyecto para empezar a organizar el trabajo.</p>
        </div>
      ) : (
        <>
          {/* Barra de filtros: buscador + búsqueda avanzada + píldoras de estado */}
          <div className="projfilters">
            <div className="projfilter-search">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="Buscar por proyecto, cliente o encargado…"
                aria-label="Buscar proyectos"
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              className={`proj-advanced-toggle ${advancedOpen || fClient || fManager || fType || fOverdue || fPagos ? 'on' : ''}`}
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((o) => !o)}
            >
              Búsqueda avanzada
            </button>

            <div className="proj-pills">
              <button
                type="button"
                className={`proj-pill proj-pill-all ${statusSel.size === 0 ? 'on' : ''}`}
                onClick={() => setStatusSel(new Set())}
                aria-pressed={statusSel.size === 0}
                title="Ver todos los estados"
              >
                Todos <span className="proj-pill-count">{statusCount('')}</span>
              </button>
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`proj-pill ${s.cls} ${statusSel.has(s.key) ? 'on' : ''}`}
                  onClick={() => toggleStatus(s.key)}
                  aria-pressed={statusSel.has(s.key)}
                >
                  {s.label} <span className="proj-pill-count">{statusCount(s.key)}</span>
                </button>
              ))}
              <button
                type="button"
                className={`proj-groupbtn ${groupBy ? 'on' : ''}`}
                onClick={() => setGroupBy((v) => !v)}
                aria-pressed={groupBy}
                title="Agrupar proyectos por encargado"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                </svg>
                {groupBy ? 'Sin agrupar' : 'Agrupar por encargado'}
              </button>
            </div>
          </div>

          {/* Filtros avanzados */}
          {advancedOpen && (
            <div className="projfilters proj-advanced">
              <select className="projfilter-sel" value={fClient} onChange={(e) => setFClient(e.target.value)} aria-label="Filtrar por cliente">
                <option value="">Cliente: todos</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__none__">Sin cliente</option>
              </select>
              <select className="projfilter-sel" value={fManager} onChange={(e) => setFManager(e.target.value)} aria-label="Filtrar por encargado">
                <option value="">Encargado: todos</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
                <option value="__none__">Sin encargado</option>
              </select>
              <select className="projfilter-sel" value={fType} onChange={(e) => setFType(e.target.value)} aria-label="Filtrar por tipo">
                <option value="">Tipo: todos</option>
                {PROJECT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <select className="projfilter-sel" value={fOverdue} onChange={(e) => setFOverdue(e.target.value)} aria-label="Filtrar por tareas vencidas">
                <option value="">Vencidas: todas</option>
                <option value="with">Con vencidas</option>
                <option value="without">Sin vencidas</option>
              </select>
              {isAdmin && (
                <select className="projfilter-sel" value={fPagos} onChange={(e) => setFPagos(e.target.value)} aria-label="Filtrar por pagos">
                  <option value="">Pagos: todos</option>
                  <option value="late">Con atraso</option>
                  <option value="ok">Sin atraso</option>
                </select>
              )}
              {anyFilter && (
                <button
                  type="button"
                  className="projfilter-clear"
                  onClick={clearFilters}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  Limpiar
                </button>
              )}
              <span className="projfilter-count">{filtered.length} de {projects.length}</span>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="card text-center" style={{ padding: 'var(--space-8)' }}>
              <p className="card-title mb-1">Sin resultados</p>
              <p className="card-desc">Ningún proyecto coincide con los filtros. <button type="button" className="linklike" onClick={clearFilters}>Limpiar filtros</button></p>
            </div>
          ) : (
            <div className={`projtable ${stuckClass}`}>
              <div ref={sentinelRef} className="sticky-sentinel" aria-hidden="true" />
              <div className="projtable-head">
                <span />
                <span />
                <span>Nombre</span>
                <span>Próximo cobro</span>
                <span>Fee</span>
                <span>Antigüedad</span>
                <span className="projtable-center">Encargado</span>
                <span>Tipo</span>
                <span>Estado</span>
                <span>Vencidas</span>
                <span>Actividad</span>
                <span />
              </div>

              {groupBy
                ? groups.map((g) => (
                    <Fragment key={g.key}>
                      <div className="projgroup">
                        {g.key !== '__none__' && <Avatar name={g.name} url={g.avatar} size={22} />}
                        <span className="projgroup-title">Encargado: {g.name}</span>
                        <span className="projgroup-count">{g.items.length}</span>
                      </div>
                      {g.items.map((p) => <Row key={p.id} p={p} ctx={ctx} />)}
                    </Fragment>
                  ))
                : filtered.map((p) => <Row key={p.id} p={p} ctx={ctx} />)}
            </div>
          )}
        </>
      )}

      {/* Modal crear: asistente en 3 pasos.
          Todos los campos siguen montados (solo se ocultan con [hidden]) para que
          el FormData del submit final llegue completo. Ninguno lleva `required`:
          un campo obligatorio dentro de un panel oculto no se puede enfocar y el
          navegador aborta el envío sin mostrar el aviso. */}
      {createOpen && (
        <div className="modal-overlay" onClick={closeCreate}>
          <div className="modal wizard" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <aside className="wizard-aside">
              <div className="wizard-glow" />
              <div className="wizard-aside-inner">
                <span className="wizard-kicker">Nuevo proyecto</span>
                <h2 className="wizard-headline">{CREATE_STEPS[step].title}</h2>
                <p className="wizard-desc">{CREATE_STEPS[step].desc}</p>
                <ol className="wizard-steps">
                  {CREATE_STEPS.map((s, i) => (
                    <li key={s.key} className={`wizard-step${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}>
                      <span className="wizard-step-dot">
                        {i < step ? (
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </span>
                      {s.label}
                    </li>
                  ))}
                </ol>
              </div>
            </aside>

            <form
              className="wizard-form"
              action={async (fd) => {
                const res = await createProject(fd)
                if (!toastIfFailed(res)) closeCreate()
              }}
              onKeyDown={(e) => {
                // Enter en un campo de texto avanza de paso en vez de enviar el
                // formulario a medias. Solo en INPUT: sobre un botón ("Atrás",
                // "Cancelar") Enter tiene que hacer lo que dice el botón.
                if (e.key === 'Enter' && !isLastStep && (e.target as HTMLElement).tagName === 'INPUT') {
                  e.preventDefault()
                  goNext()
                }
              }}
            >
              <div className="wizard-body">
                {/* Paso 1 · Lo esencial */}
                <div className="wizard-panel" hidden={step !== 0}>
                  <div className="wizard-field">
                    <label className="k" htmlFor="wz-name">Nombre del proyecto</label>
                    <input
                      id="wz-name"
                      name="name"
                      className="field"
                      placeholder="Ej: Vitaliah · SEO"
                      autoComplete="off"
                      autoFocus
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                    />
                  </div>
                  <div className="wizard-grid">
                    <div className="wizard-field">
                      <label className="k" htmlFor="wz-client">Cliente</label>
                      {/* Obligatorio: projects.client_id es NOT NULL. Sin
                          cliente no hay portal, ni facturación agrupada, ni
                          datos de Search Console. Se valida acá, no con
                          `required`, por lo del panel oculto. */}
                      <select
                        id="wz-client"
                        name="client_id"
                        className="field"
                        value={createClient}
                        onChange={(e) => setCreateClient(e.target.value)}
                      >
                        <option value="" disabled>Elige un cliente…</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="wizard-field">
                      <label className="k" htmlFor="wz-manager">Encargado</label>
                      <select id="wz-manager" name="manager_id" className="field" defaultValue="">
                        <option value="">Sin encargado</option>
                        {members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="wizard-field">
                    <label className="k" htmlFor="wz-type">Tipo de proyecto</label>
                    <select id="wz-type" name="type" className="field" value={createType} onChange={(e) => setCreateType(e.target.value)}>
                      {PROJECT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                  {intentoAvanzar && faltaEnPaso1 && (
                    <p className="wizard-help" role="alert">
                      {faltaEnPaso1 === 'nombre'
                        ? 'Ponle un nombre al proyecto para continuar.'
                        : 'Elige el cliente para continuar.'}
                    </p>
                  )}
                </div>

                {/* Paso 2 · Términos */}
                <div className="wizard-panel" hidden={step !== 1}>
                  <div className="wizard-grid">
                    <div className="wizard-field">
                      <label className="k" htmlFor="wz-start">Fecha de inicio</label>
                      <input id="wz-start" type="date" name="start_date" className="field" defaultValue="" />
                    </div>
                    <div className="wizard-field">
                      <label className="k" htmlFor="wz-currency">Moneda</label>
                      <select id="wz-currency" name="currency" className="field" defaultValue="COP">
                        <option value="COP">COP</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                  </div>
                  <div className="wizard-field">
                    <label className="k" htmlFor="wz-fee">Fee {createType === 'web' ? '(total del proyecto)' : '(mensual)'}</label>
                    <input id="wz-fee" type="number" name="fee" className="field" placeholder="0" min="0" step="any" />
                    <p className="wizard-help">
                      {createType === 'web'
                        ? 'Se dividirá en cuotas desde la sección de Pagos.'
                        : 'Se cobra por mes anticipado en el aniversario de la fecha de inicio.'}
                    </p>
                  </div>
                  <div className="wizard-field">
                    <label className="k" htmlFor="wz-url">URL del proyecto</label>
                    <input id="wz-url" name="url" className="field" placeholder="https://…" autoComplete="off" />
                  </div>
                </div>

                {/* Paso 3 · Puesta en marcha */}
                <div className="wizard-panel" hidden={step !== 2}>
                  <div className="wizard-grid">
                    <div className="wizard-field">
                      <label className="k" htmlFor="wz-tpl">Plantilla (opcional)</label>
                      <select id="wz-tpl" name="template_id" className="field" defaultValue="" key={createType}>
                        <option value="">Sin plantilla</option>
                        {tplFor(createType).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="wizard-field">
                      <label className="k" htmlFor="wz-status">Estado inicial</label>
                      <select id="wz-status" name="status" className="field" defaultValue="upcoming">
                        {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="wizard-field">
                    <label className="k" htmlFor="wz-desc">Descripción (opcional)</label>
                    <textarea id="wz-desc" name="description" className="field" placeholder="Contexto, alcance, acuerdos…" rows={4} />
                  </div>
                </div>
              </div>

              <div className="wizard-footer">
                <span className="wizard-progress">Paso {step + 1} de {CREATE_STEPS.length}</span>
                <div className="wizard-actions">
                  {step === 0 ? (
                    <button type="button" className="btn btn-outline" onClick={closeCreate}>Cancelar</button>
                  ) : (
                    <button type="button" className="btn btn-outline" onClick={() => setStep((s) => s - 1)}>Atrás</button>
                  )}
                  {isLastStep ? (
                    <SubmitBtn className="btn btn-primary">Crear proyecto</SubmitBtn>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={goNext}>
                      Siguiente
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal editar (compartido con la vista del proyecto) */}
      {editing && (
        <ProjectEditModal
          project={editing}
          clients={clients}
          members={members}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
