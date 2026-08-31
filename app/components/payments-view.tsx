'use client'

import { useState } from 'react'
import { money } from '@/app/projects/statuses'
import {
  markPaymentPaid,
  markPaymentPending,
  updatePayment,
  addInstallment,
  deletePayment,
  changeFee,
} from '@/app/pagos/actions'

type Client = { project_id: string; name: string; type: string; currency: string; start_date: string | null; fee: number }
type Payment = { id: string; project_id: string; seq: number; period: string | null; amount: number; currency: string; status: string; paid_on: string | null; kind: string; note: string | null }
type FeeChange = { project_id: string; old_amount: number | null; new_amount: number; currency: string; effective_date: string; created_at: string }

function fmt(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}
function iso(dt: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}
function addMonths(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number)
  return iso(new Date(y, m - 1 + n, d))
}
function addDays(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number)
  return iso(new Date(y, m - 1, d + n))
}

export default function PaymentsView({
  clients,
  payments,
  feeHistory = [],
  today,
}: {
  clients: Client[]
  payments: Payment[]
  feeHistory?: FeeChange[]
  today: string
}) {
  const historyByProject = new Map<string, FeeChange[]>()
  for (const h of feeHistory) {
    const arr = historyByProject.get(h.project_id) ?? []
    arr.push(h)
    historyByProject.set(h.project_id, arr)
  }
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [modelFilter, setModelFilter] = useState<'all' | 'seo' | 'web'>('all')
  const toggle = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const byProject = new Map<string, Payment[]>()
  for (const p of payments) {
    const arr = byProject.get(p.project_id) ?? []
    arr.push(p)
    byProject.set(p.project_id, arr)
  }

  // Filtro por modelo (SEO / Web)
  const visClients = clients.filter((c) => modelFilter === 'all' || c.type === modelFilter)
  const visIds = new Set(visClients.map((c) => c.project_id))
  const visPayments = payments.filter((p) => visIds.has(p.project_id))

  // Totales por moneda (según el filtro)
  const currencies = Array.from(new Set(visClients.map((c) => c.currency)))
  const monthPrefix = today.slice(0, 7)
  const totals = currencies.map((cur) => {
    const cl = visClients.filter((c) => c.currency === cur)
    const pay = visPayments.filter((p) => p.currency === cur)
    const mrr = cl.filter((c) => c.type === 'seo' && c.start_date).reduce((s, c) => s + Number(c.fee), 0)
    const pending = pay.filter((p) => p.status !== 'paid').reduce((s, p) => s + Number(p.amount), 0)
    const overdue = pay.filter((p) => p.status !== 'paid' && p.period && p.period < today).reduce((s, p) => s + Number(p.amount), 0)
    const collected = pay.filter((p) => p.status === 'paid' && (p.paid_on ?? '').slice(0, 7) === monthPrefix).reduce((s, p) => s + Number(p.amount), 0)
    return { cur, mrr, pending, overdue, collected }
  })

  const counts = {
    all: clients.length,
    seo: clients.filter((c) => c.type === 'seo').length,
    web: clients.filter((c) => c.type === 'web').length,
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Filtro por modelo */}
      <div className="pay-filter">
        {(['all', 'seo', 'web'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`pay-filter-btn ${modelFilter === k ? 'on' : ''}`}
            onClick={() => setModelFilter(k)}
          >
            {k === 'all' ? 'Todos' : k === 'seo' ? 'SEO (recurrente)' : 'Web (pago único)'}
            <span className="pay-filter-count">{counts[k]}</span>
          </button>
        ))}
      </div>

      {totals.map((t) => (
        <div key={t.cur}>
          {currencies.length > 1 && <div className="pay-cur-label">{t.cur}</div>}
          <div className="kpi-grid">
            <div className="kpi"><div className="kpi-num">{money(t.mrr, t.cur)}</div><div className="kpi-label">MRR (SEO activo)</div></div>
            <div className="kpi"><div className="kpi-num" style={{ color: 'var(--mod-fg)' }}>{money(t.pending, t.cur)}</div><div className="kpi-label">Pendiente por cobrar</div></div>
            <div className="kpi"><div className="kpi-num" style={{ color: 'var(--urgent-fg)' }}>{money(t.overdue, t.cur)}</div><div className="kpi-label">Vencido</div></div>
            <div className="kpi"><div className="kpi-num" style={{ color: 'var(--low-fg)' }}>{money(t.collected, t.cur)}</div><div className="kpi-label">Cobrado este mes</div></div>
          </div>
        </div>
      ))}

      <div className="projtable">
        <div className="projtable-head paytable-row">
          <span>Cliente</span>
          <span>Modelo</span>
          <span>Fee / Total</span>
          <span>Estado</span>
          <span>Próx. venc.</span>
          <span>Pagado</span>
          <span>Pendiente</span>
          <span />
        </div>

        {visClients.map((c) => {
          const cy = (byProject.get(c.project_id) ?? []).slice().sort((a, b) => a.seq - b.seq)
          const isWeb = c.type === 'web'
          const pending = cy.filter((p) => p.status !== 'paid')
          const overdue = pending.filter((p) => p.period && p.period < today)
          const paidCount = cy.filter((p) => p.status === 'paid').length
          const pendingAmount = pending.reduce((s, p) => s + Number(p.amount), 0)
          const noStart = !isWeb && !c.start_date
          const instSum = cy.reduce((s, p) => s + Number(p.amount), 0)
          const feeMismatch = isWeb && cy.length > 0 && Math.round(instSum) !== Math.round(c.fee)

          // Estado y próximo vencimiento según modelo
          let estado: React.ReactNode
          let nextDue: string | null = null
          if (isWeb) {
            estado = cy.length ? (
              <b>
                {`${paidCount}/${cy.length} cuotas`}
                {feeMismatch && <span className="pay-warn-dot" title="Las cuotas no cuadran con el total">⚠</span>}
              </b>
            ) : (
              <span className="projtable-muted">Sin plan</span>
            )
            nextDue = pending.map((p) => p.period).filter(Boolean).sort()[0] ?? null
          } else if (noStart) {
            estado = <span className="projtable-muted">Sin fecha de inicio</span>
          } else {
            estado = <b>Mes {cy.length ? cy[cy.length - 1].seq : 0}</b>
            if (c.start_date) {
              const [y, m, d] = c.start_date.split('-').map(Number)
              const nd = new Date(y, m - 1 + cy.length, d)
              const pad = (n: number) => String(n).padStart(2, '0')
              nextDue = `${nd.getFullYear()}-${pad(nd.getMonth() + 1)}-${pad(nd.getDate())}`
            }
          }

          const isOpen = open.has(c.project_id)
          return (
            <div key={c.project_id}>
              <div className="projtable-row paytable-row">
                <span className="projtable-cell"><b>{c.name}</b></span>
                <span className="projtable-cell">
                  <span className={`pay-model ${isWeb ? 'web' : 'seo'}`}>{isWeb ? 'Pago único' : 'Recurrente'}</span>
                </span>
                <span className="projtable-cell projtable-muted">{money(c.fee, c.currency)}</span>
                <span className="projtable-cell">{estado}</span>
                <span className="projtable-cell projtable-muted">{nextDue ? fmt(nextDue) : '—'}</span>
                <span className="projtable-cell projtable-muted">{cy.length ? `${paidCount}/${cy.length}` : '—'}</span>
                <span className="projtable-cell">
                  {pendingAmount > 0 ? (
                    <span style={{ color: overdue.length > 0 ? 'var(--urgent-fg)' : 'var(--mod-fg)', fontWeight: 600 }}>{money(pendingAmount, c.currency)}</span>
                  ) : cy.length ? (
                    <span style={{ color: 'var(--low-fg)', fontWeight: 600 }}>Pagado</span>
                  ) : (
                    <span className="projtable-muted">—</span>
                  )}
                </span>
                <span className="projtable-cell">
                  {cy.length > 0 && (
                    <button type="button" className="btn btn-outline pay-expand" onClick={() => toggle(c.project_id)}>
                      {isOpen ? 'Ocultar' : isWeb ? 'Ver cuotas' : 'Ver ciclos'}
                    </button>
                  )}
                </span>
              </div>

              {isOpen && (
                <div className="pay-cycles">
                  {/* Cambiar fee + historial */}
                  <div className="pay-feebox">
                    <form action={changeFee} className="pay-fee-form">
                      <span className="pay-fee-label">Cambiar fee:</span>
                      <input name="project_id" type="hidden" value={c.project_id} />
                      <input name="amount" type="number" defaultValue={c.fee} className="field pay-inst-amt" />
                      <label className="pay-fee-eff">
                        vigente desde
                        <input name="effective" type="date" defaultValue={nextDue ?? today} className="field pay-inst-date" />
                      </label>
                      <button type="submit" className="pay-action-pay">Aplicar</button>
                    </form>
                    {(historyByProject.get(c.project_id) ?? []).length > 0 && (
                      <div className="pay-fee-history">
                        {(historyByProject.get(c.project_id) ?? []).map((h, i) => (
                          <div key={i} className="pay-fee-hrow">
                            {h.old_amount != null ? money(Number(h.old_amount), h.currency) : '—'} → <b>{money(Number(h.new_amount), h.currency)}</b>
                            <span className="projtable-muted"> · vigente {fmt(h.effective_date)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {feeMismatch && (
                    <div className="pay-warn">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <path d="M12 9v4M12 17h.01" />
                      </svg>
                      Las cuotas suman {money(instSum, c.currency)} pero el total del proyecto es {money(c.fee, c.currency)}. Ajustá las cuotas para que cuadren.
                    </div>
                  )}

                  {cy.map((p) => {
                    const isOverdue = p.status !== 'paid' && p.period && p.period < today
                    const badge = p.status === 'paid' ? 'paid' : isOverdue ? 'overdue' : 'pending'
                    const badgeText = p.status === 'paid' ? `Pagado${p.paid_on ? ' · ' + fmt(p.paid_on) : ''}` : isOverdue ? 'Vencido' : 'Pendiente'
                    if (!isWeb) {
                      const next = p.period ? addMonths(p.period, 1) : null
                      const endIncl = next ? addDays(next, -1) : null
                      const isCurrent = !!p.period && !!next && p.period <= today && today < next
                      return (
                        <div key={p.id} className={`pay-cycle ${isCurrent ? 'current' : ''}`}>
                          <span className="pay-cycle-seq">
                            Mes {p.seq}
                            {isCurrent && <span className="pay-tag-actual">Actual</span>}
                          </span>
                          <span className="pay-cycle-due">
                            {p.period ? `${fmt(p.period)} – ${endIncl ? fmt(endIncl) : ''}` : ''}
                          </span>
                          <span className="pay-cycle-amt">{money(Number(p.amount), p.currency)}</span>
                          <span className={`pay-badge ${badge}`}>{badgeText}</span>
                          {p.status === 'paid' ? (
                            <form action={markPaymentPending}><input type="hidden" name="id" value={p.id} /><button type="submit" className="pay-action-undo">Deshacer</button></form>
                          ) : (
                            <form action={markPaymentPaid}><input type="hidden" name="id" value={p.id} /><button type="submit" className="pay-action-pay">Marcar pagado</button></form>
                          )}
                        </div>
                      )
                    }
                    // Cuota Web: editable
                    return (
                      <div key={p.id} className="pay-inst">
                        <form action={updatePayment} className="pay-inst-edit">
                          <input type="hidden" name="id" value={p.id} />
                          <input name="note" defaultValue={p.note ?? ''} className="field pay-inst-note" placeholder="Etiqueta" />
                          <input name="amount" type="number" defaultValue={Number(p.amount)} className="field pay-inst-amt" />
                          <input name="period" type="date" defaultValue={p.period ?? ''} className="field pay-inst-date" />
                          <button type="submit" className="pay-action-undo">Guardar</button>
                        </form>
                        <span className={`pay-badge ${badge}`}>{badgeText}</span>
                        {p.status === 'paid' ? (
                          <form action={markPaymentPending}><input type="hidden" name="id" value={p.id} /><button type="submit" className="pay-action-undo">Deshacer</button></form>
                        ) : (
                          <form action={markPaymentPaid}><input type="hidden" name="id" value={p.id} /><button type="submit" className="pay-action-pay">Marcar pagado</button></form>
                        )}
                        <form action={deletePayment} onSubmit={(e) => { if (!confirm('¿Eliminar esta cuota?')) e.preventDefault() }}>
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="pay-inst-del" title="Eliminar cuota">✕</button>
                        </form>
                      </div>
                    )
                  })}

                  {isWeb && (
                    <form action={addInstallment} className="pay-inst-add">
                      <input type="hidden" name="project_id" value={c.project_id} />
                      <input type="hidden" name="currency" value={c.currency} />
                      <input name="note" className="field pay-inst-note" placeholder="Nueva cuota (etiqueta)" />
                      <input name="amount" type="number" className="field pay-inst-amt" placeholder="Monto" />
                      <input name="period" type="date" className="field pay-inst-date" />
                      <button type="submit" className="pay-action-pay">Agregar cuota</button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
