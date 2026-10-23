'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/app/components/avatar'
import ClientLogo from '@/app/components/client-logo'
import Popover from '@/app/components/popover'
import PortfolioMenu from '@/app/components/portfolio-menu'
import AddProjectToPortfolio from '@/app/components/add-project-to-portfolio'
import { confirmDialog } from '@/app/components/confirm-dialog'
import { toastIfFailed, toastNoPermission } from '@/app/components/toast'
import { createClient } from '@/utils/supabase/client'
import { removeFromPortfolio, deleteField } from '@/app/portfolios/actions'
import { setProjectManager, setProjectStatus } from '@/app/projects/actions'
import { PROJECT_STATUSES, projectStatusOf, money, moneyCompact } from '@/app/projects/statuses'
import type { PortfolioCover } from '@/app/portfolios/covers'
import type { DetailField, DetailMember, DetailRow } from '@/app/portfolios/detail-types'

type Filter = 'all' | 'late' | 'pay' | 'seo' | 'web'
type GroupBy = 'type' | 'status' | 'manager' | 'none'

const ICON = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Suma por moneda: { COP: 18300000, USD: 1300 } → "$18.3M + US$1,300" */
function sumByCurrency(rows: DetailRow[]): string | null {
  const tot: Record<string, number> = {}
  for (const r of rows) if (r.fee != null) tot[r.currency] = (tot[r.currency] ?? 0) + Number(r.fee)
  const parts = Object.entries(tot)
    .sort(([a], [b]) => (a === 'COP' ? -1 : b === 'COP' ? 1 : a.localeCompare(b)))
    .map(([cur, n]) => moneyCompact(n, cur))
  return parts.length ? parts.join(' + ') : null
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? 60 / (values.length - 1) : 0
  const pts = values.map((v, i) => `${(2 + i * step).toFixed(1)},${(18 - (v / max) * 16).toFixed(1)}`).join(' ')
  return (
    <svg className="pd-spark" width="64" height="20" viewBox="0 0 64 20" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function CobroCell({ r }: { r: DetailRow }) {
  const c = r.cobro
  const fee =
    r.fee != null ? (
      <span className="pd-fee" title={`${money(Number(r.fee), r.currency)} ${r.type === 'web' ? 'total' : '/ mes'}`}>
        {moneyCompact(Number(r.fee), r.currency)}
        <span className="pd-fee-unit">{r.type === 'web' ? 'total' : '/mes'}</span>
      </span>
    ) : (
      <span className="pd-muted">—</span>
    )
  let pill: React.ReactNode = null
  if (c?.kind === 'late') {
    pill = (
      <Link href="/pagos" className="pd-pill is-bad" title={`Debe ${money(c.amount, r.currency)} · ver en Pagos`}>
        {c.count} {c.count === 1 ? 'vencido' : 'vencidos'}
      </Link>
    )
  }
  return (
    <span className="pd-inline">
      {fee}
      {pill}
    </span>
  )
}

function FieldCell({ fieldId, projectId, type, initial }: { fieldId: string; projectId: string; type: DetailField['type']; initial: string }) {
  const [val, setVal] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const save = async (value: string) => {
    const { error } = await createClient()
      .from('project_field_values')
      .upsert({ field_id: fieldId, project_id: projectId, value: value.trim() || null }, { onConflict: 'field_id,project_id' })
    if (error) toastIfFailed({ ok: false, message: 'No se pudo guardar el campo.' })
  }
  return (
    <input
      className="cell-input pd-field-input"
      type={type === 'text' ? 'text' : 'number'}
      inputMode={type === 'text' ? undefined : 'decimal'}
      placeholder={type === 'money' ? '$0' : '—'}
      value={val}
      onChange={(e) => {
        const v = e.target.value
        setVal(v)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => save(v), 600)
      }}
      onBlur={(e) => {
        if (timer.current) clearTimeout(timer.current)
        save(e.target.value)
      }}
    />
  )
}

function RowMenu({
  r,
  portfolioId,
  canManage,
  isAdmin,
  members,
}: {
  r: DetailRow
  portfolioId: string
  canManage: boolean
  isAdmin: boolean
  members: DetailMember[]
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'status' | 'manager'>('main')
  const [pending, startTransition] = useTransition()
  const btnRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()

  const close = () => {
    setOpen(false)
    setView('main')
  }

  const run = (fn: () => Promise<unknown>) => {
    close()
    startTransition(async () => {
      const res = await fn()
      if (!toastIfFailed(res)) router.refresh()
    })
  }

  const changeStatus = (status: string) => {
    if (status === r.status) return close()
    const fd = new FormData()
    fd.set('id', r.id)
    fd.set('status', status)
    run(() => setProjectStatus(fd))
  }

  const changeManager = (managerId: string | null) => {
    if (managerId === r.managerId) return close()
    const fd = new FormData()
    fd.set('id', r.id)
    fd.set('manager_id', managerId ?? '')
    run(() => setProjectManager(fd))
  }

  const remove = async () => {
    close()
    if (!canManage) return toastNoPermission()
    const ok = await confirmDialog({
      title: `¿Quitar "${r.name}" del portafolio?`,
      body: 'El proyecto no se borra: sigue en Proyectos con todas sus tareas.',
      confirmLabel: 'Quitar del portafolio',
      tone: 'alert',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await removeFromPortfolio(portfolioId, r.id)
      if (!toastIfFailed(res)) router.refresh()
    })
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="pd-rowmenu"
        aria-label={`Acciones de ${r.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>

      <Popover open={open} onClose={close} anchor={btnRef} align="right" minWidth={230} maxHeight={340}>
        {view === 'main' && (
          <>
            <Link href={`/projects/${r.id}`} className="dropdown-item proj-menu-item" onClick={close}>
              <svg {...ICON}>
                <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </svg>
              <span>Abrir proyecto</span>
            </Link>
            <button
              type="button"
              className="dropdown-item proj-menu-item"
              onClick={() => (isAdmin ? setView('manager') : (close(), toastNoPermission()))}
            >
              <svg {...ICON}>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21v-1a6 6 0 0 1 12 0v1" />
              </svg>
              <span>Cambiar encargado</span>
              <svg {...ICON} className="pd-chev" width={13} height={13}>
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
            <button type="button" className="dropdown-item proj-menu-item" onClick={() => setView('status')}>
              <svg {...ICON}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span>Cambiar estado</span>
              <svg {...ICON} className="pd-chev" width={13} height={13}>
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
            {isAdmin && (
              <Link href="/pagos" className="dropdown-item proj-menu-item" onClick={close}>
                <svg {...ICON}>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 10h18" />
                </svg>
                <span>Ver pagos</span>
              </Link>
            )}
            <div className="ctxmenu-sep" />
            <button type="button" className="dropdown-item proj-menu-item danger" onClick={remove}>
              <svg {...ICON}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              <span>Quitar del portafolio</span>
            </button>
          </>
        )}

        {view === 'status' && (
          <>
            <button type="button" className="dropdown-item proj-menu-item pd-back" onClick={() => setView('main')}>
              <svg {...ICON} width={13} height={13}>
                <path d="m15 6-6 6 6 6" />
              </svg>
              <span>Estado del proyecto</span>
            </button>
            {PROJECT_STATUSES.map((s) => (
              <button key={s.key} type="button" className="dropdown-item proj-menu-item" onClick={() => changeStatus(s.key)}>
                <span className="pd-dot" style={{ background: s.color }} aria-hidden="true" />
                <span>{s.label}</span>
                {s.key === r.status && <span className="pd-check" aria-label="actual">✓</span>}
              </button>
            ))}
          </>
        )}

        {view === 'manager' && (
          <>
            <button type="button" className="dropdown-item proj-menu-item pd-back" onClick={() => setView('main')}>
              <svg {...ICON} width={13} height={13}>
                <path d="m15 6-6 6 6 6" />
              </svg>
              <span>Encargado</span>
            </button>
            {members.map((m) => (
              <button key={m.user_id} type="button" className="dropdown-item proj-menu-item" onClick={() => changeManager(m.user_id)}>
                <Avatar name={m.full_name} email={m.email} url={m.avatar_url} size={20} />
                <span>{m.full_name || m.email}</span>
                {m.user_id === r.managerId && <span className="pd-check" aria-label="actual">✓</span>}
              </button>
            ))}
            <div className="ctxmenu-sep" />
            <button type="button" className="dropdown-item proj-menu-item" onClick={() => changeManager(null)}>
              <span className="pd-av-empty" aria-hidden="true" />
              <span>Sin encargado</span>
            </button>
          </>
        )}
      </Popover>
    </>
  )
}

export default function PortfolioDetail({
  portfolio,
  canManage,
  isAdmin,
  rows,
  available,
  members,
  fields,
  values,
  gscMonth,
}: {
  portfolio: { id: string; name: string; description: string | null; cover: PortfolioCover }
  canManage: boolean
  isAdmin: boolean
  rows: DetailRow[]
  available: { id: string; name: string }[]
  members: DetailMember[]
  fields: DetailField[]
  values: Record<string, string>
  gscMonth: string | null
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('type')

  const counts = useMemo(
    () => ({
      all: rows.length,
      late: rows.filter((r) => r.late > 0).length,
      pay: rows.filter((r) => r.cobro?.kind === 'late').length,
      seo: rows.filter((r) => r.type === 'seo').length,
      web: rows.filter((r) => r.type === 'web').length,
    }),
    [rows]
  )

  const kpis = useMemo(() => {
    const activos = rows.filter((r) => r.status === 'on_track' || r.status === 'at_risk').length
    const abiertas = rows.reduce((n, r) => n + r.open, 0)
    const vencidas = rows.reduce((n, r) => n + r.late, 0)
    const retainers = isAdmin ? sumByCurrency(rows.filter((r) => r.type === 'seo' && r.status !== 'on_hold')) : null
    return { activos, abiertas, vencidas, retainers }
  }, [rows, isAdmin])

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows
      .filter((r) => {
        if (filter === 'late' && r.late === 0) return false
        if (filter === 'pay' && r.cobro?.kind !== 'late') return false
        if (filter === 'seo' && r.type !== 'seo') return false
        if (filter === 'web' && r.type !== 'web') return false
        if (term && !`${r.name} ${r.client ?? ''} ${r.manager ?? ''}`.toLowerCase().includes(term)) return false
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [rows, filter, q])

  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: null as React.ReactNode, rows: visible, total: null as string | null }]
    const map = new Map<string, { key: string; label: React.ReactNode; order: number; rows: DetailRow[] }>()
    for (const r of visible) {
      let key: string, label: React.ReactNode, order: number
      if (groupBy === 'type') {
        key = r.type
        label = <span className={`ptype ${r.type === 'seo' ? 'pt-seo' : 'pt-web'}`}>{r.type.toUpperCase()}</span>
        order = r.type === 'seo' ? 0 : 1
      } else if (groupBy === 'status') {
        const s = projectStatusOf(r.status)
        key = s.key
        label = <span className={`pstatus ${s.cls}`}>{s.label}</span>
        order = PROJECT_STATUSES.findIndex((x) => x.key === s.key)
      } else {
        key = r.managerId ?? '__none__'
        label = r.managerId ? (
          <span className="pd-inline">
            <Avatar name={r.manager} url={r.managerAvatar} size={20} />
            {r.manager}
          </span>
        ) : (
          'Sin encargado'
        )
        order = r.managerId ? 0 : 1
      }
      if (!map.has(key)) map.set(key, { key, label, order, rows: [] })
      map.get(key)!.rows.push(r)
    }
    return Array.from(map.values())
      .sort((a, b) => a.order - b.order || String(a.key).localeCompare(String(b.key)))
      .map((g) => {
        let total: string | null = null
        if (isAdmin && groupBy === 'type') {
          const s = sumByCurrency(g.key === 'seo' ? g.rows.filter((r) => r.status !== 'on_hold') : g.rows)
          total = s ? (g.key === 'seo' ? `Retainers ${s} / mes` : `Proyectos ${s}`) : null
        }
        return { ...g, total }
      })
  }, [visible, groupBy, isAdmin])

  // Columnas: fijas + (cobro si admin) + campos personalizados + acciones
  const cols = [
    'minmax(220px, 2.2fr)',
    '118px',
    '92px',
    '128px',
    '200px',
    ...(isAdmin ? ['170px'] : []),
    '104px',
    ...fields.map(() => '130px'),
    '40px',
  ].join(' ')

  const chip = (key: Filter, label: string, dot?: string) => (
    <button
      key={key}
      type="button"
      className={`pd-chip ${filter === key ? 'is-on' : ''}`}
      aria-pressed={filter === key}
      onClick={() => setFilter(key)}
    >
      {dot && <span className="pd-dot" style={{ background: dot }} aria-hidden="true" />}
      {label} <b>{counts[key]}</b>
    </button>
  )

  return (
    <>
      <header className="topbar">
        <div className="pd-head">
          <span className={`pd-cover pf-cover--${portfolio.cover}`} aria-hidden="true" />
          <div>
            <div className="breadcrumb">
              <Link href="/portfolios" style={{ color: 'inherit' }}>
                Portafolios
              </Link>{' '}
              / <b>{portfolio.name}</b>
            </div>
            <h1 className="page-title">
              {portfolio.name}
              <span className="count-badge">
                {rows.length} {rows.length === 1 ? 'proyecto' : 'proyectos'}
              </span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AddProjectToPortfolio portfolioId={portfolio.id} available={available} />
          <PortfolioMenu
            placement="header"
            canManage={canManage}
            portfolio={{ ...portfolio, projectCount: rows.length }}
          />
        </div>
      </header>

      <div className="viewscroll flex-1 overflow-y-auto px-6">
        {rows.length === 0 ? (
          <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
            <p className="card-title mb-1">Este portafolio está vacío</p>
            <p className="card-desc">Agrega proyectos con el botón de arriba.</p>
          </div>
        ) : (
          <div className="pd-wrap">
            <section className="pf-summary" aria-label="Resumen del portafolio">
              <div className="pf-kpi">
                <b>{kpis.activos}</b>
                <span>activos</span>
              </div>
              <div className="pf-kpi">
                <b>{kpis.abiertas}</b>
                <span>tareas abiertas</span>
              </div>
              <div className="pf-kpi">
                <b className={kpis.vencidas > 0 ? 'is-late' : ''}>{kpis.vencidas}</b>
                <span>vencidas</span>
              </div>
              {isAdmin && (
                <div className="pf-kpi">
                  <b className={counts.pay > 0 ? 'is-late' : ''}>{counts.pay}</b>
                  <span>con cobro vencido</span>
                </div>
              )}
              {kpis.retainers && (
                <div className="pf-kpi">
                  <b>{kpis.retainers}</b>
                  <span>retainers SEO / mes</span>
                  <span className="pf-kpi-badge">Solo admins</span>
                </div>
              )}
            </section>

            <div className="pd-toolbar">
              <div className="pd-chips" role="group" aria-label="Filtros">
                {chip('all', 'Todos')}
                {counts.late > 0 && chip('late', 'Con vencidas', 'var(--urgent-text)')}
                {isAdmin && counts.pay > 0 && chip('pay', 'Cobro vencido', 'var(--mod-fg)')}
                {counts.seo > 0 && counts.web > 0 && chip('seo', 'SEO')}
                {counts.seo > 0 && counts.web > 0 && chip('web', 'WEB')}
              </div>
              <div className="pd-tools">
                <label className="pd-search">
                  <svg {...ICON} width={14} height={14} aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    type="search"
                    placeholder="Buscar proyecto"
                    aria-label="Buscar proyecto, cliente o encargado"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </label>
                <label className="pd-group">
                  <span>Agrupar</span>
                  <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Agrupar por">
                    <option value="type">Tipo</option>
                    <option value="status">Estado</option>
                    <option value="manager">Encargado</option>
                    <option value="none">Sin agrupar</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="pd-table-box">
              <div className="pd-table" role="table" aria-label={`Proyectos de ${portfolio.name}`} style={{ ['--pd-cols' as string]: cols }}>
                <div className="pd-row pd-thead" role="row">
                  <span role="columnheader" className="pd-first">Proyecto</span>
                  <span role="columnheader">Estado</span>
                  <span role="columnheader" className="pd-center">Encargado</span>
                  <span role="columnheader" className="pd-center">Tareas vencidas</span>
                  <span role="columnheader" title="Último mes completo frente al anterior">
                    Clics orgánicos{gscMonth ? ` · ${gscMonth}` : ''}
                  </span>
                  {isAdmin && <span role="columnheader">Fee · cobro</span>}
                  <span role="columnheader">Actividad</span>
                  {fields.map((f) => (
                    <span role="columnheader" key={f.id} className="pd-th-field">
                      {f.name}
                      {canManage && (
                        <form action={deleteField}>
                          <input type="hidden" name="id" value={f.id} />
                          <input type="hidden" name="portfolio_id" value={portfolio.id} />
                          <button type="submit" className="th-del" aria-label={`Eliminar el campo ${f.name}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="11" height="11" aria-hidden="true">
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </form>
                      )}
                    </span>
                  ))}
                  <span role="columnheader" aria-label="Acciones" />
                </div>

                {visible.length === 0 && (
                  <div className="pd-empty" role="row">
                    <span role="cell">Ningún proyecto coincide con el filtro.</span>
                  </div>
                )}

                {groups.map((g) => (
                  <div role="rowgroup" key={g.key}>
                    {g.label && (
                      <div className="pd-grp" role="row">
                        <span role="cell" className="pd-grp-cell">
                          <span className="pd-inline pd-grp-name">
                            {g.label}
                            <span className="pd-muted">
                              {g.rows.length} {g.rows.length === 1 ? 'proyecto' : 'proyectos'}
                            </span>
                          </span>
                          {g.total && <span className="pd-muted">{g.total}</span>}
                        </span>
                      </div>
                    )}
                    {g.rows.map((r) => {
                      const st = projectStatusOf(r.status)
                      return (
                        <div className="pd-row pd-tr" role="row" key={r.id}>
                          <div role="cell" className="pd-first">
                            <span className="pd-inline pd-proj">
                              <ClientLogo name={r.client ?? r.name} url={r.url} index={0} />
                              <span className="pd-proj-text">
                                <Link href={`/projects/${r.id}`} className="pd-name">
                                  {r.name}
                                </Link>
                                {r.client && r.client !== r.name && <span className="pd-client">{r.client}</span>}
                              </span>
                            </span>
                          </div>
                          <div role="cell">
                            <span className={`pstatus ${st.cls}`}>{st.label}</span>
                          </div>
                          <div role="cell" className="pd-center">
                            {/* Solo la burbuja: el nombre va en el tooltip y en el lector de pantalla */}
                            {r.managerId ? (
                              <span className="pd-inline" role="img" aria-label={`Encargado: ${r.manager ?? 'sin nombre'}`}>
                                <Avatar name={r.manager} url={r.managerAvatar} size={24} title={r.manager ?? undefined} />
                              </span>
                            ) : (
                              <span className="pd-av-empty" role="img" aria-label="Sin encargado" title="Sin encargado" />
                            )}
                          </div>
                          <div role="cell" className="pd-center">
                            {r.late > 0 ? (
                              <span className="pd-pill is-bad pd-late" aria-label={`${r.late} ${r.late === 1 ? 'tarea vencida' : 'tareas vencidas'}`}>
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                                  <path d="M12 9v4M12 17h.01" />
                                </svg>
                                {r.late}
                              </span>
                            ) : (
                              <span className="pd-muted" aria-label="Sin tareas vencidas">—</span>
                            )}
                          </div>
                          <div role="cell">
                            {r.type === 'web' ? (
                              <span className="pd-muted">—</span>
                            ) : r.gsc ? (
                              <span className="pd-inline">
                                <Spark values={r.gsc.spark} />
                                <span className="pd-strong pd-num">{r.gsc.clicks.toLocaleString('es-CO')}</span>
                                {r.gsc.isNew ? (
                                  <span className="pd-pill is-ok">Nuevo</span>
                                ) : r.gsc.deltaPct != null ? (
                                  <span
                                    className={`pd-pill ${r.gsc.deltaPct >= 3 ? 'is-ok' : r.gsc.deltaPct <= -10 ? 'is-bad' : 'is-muted'}`}
                                  >
                                    {r.gsc.deltaPct > 0 ? '+' : r.gsc.deltaPct < 0 ? '−' : ''}
                                    {Math.abs(r.gsc.deltaPct)} %
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <Link href={`/projects/${r.id}/seo`} className="pd-link-muted">
                                Conectar Search Console
                              </Link>
                            )}
                          </div>
                          {isAdmin && (
                            <div role="cell">
                              <CobroCell r={r} />
                            </div>
                          )}
                          <div role="cell" className={r.activity === 'Sin actividad' ? 'pd-muted' : ''}>
                            {r.activity}
                          </div>
                          {fields.map((f) => (
                            <div role="cell" key={f.id}>
                              <FieldCell fieldId={f.id} projectId={r.id} type={f.type} initial={values[`${f.id}:${r.id}`] ?? ''} />
                            </div>
                          ))}
                          <div role="cell" className="pd-actions">
                            <RowMenu r={r} portfolioId={portfolio.id} canManage={canManage} isAdmin={isAdmin} members={members} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
