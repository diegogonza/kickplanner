'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { deleteField, removeProjectFromPortfolio } from '@/app/portfolios/actions'

type Row = {
  project_id: string
  name: string
  owner_email: string
  done_count: number
  total_count: number
}
type Field = { id: string; name: string; type: 'text' | 'number' | 'money' }

export default function PortfolioTable({
  portfolioId,
  rows,
  fields,
  values,
}: {
  portfolioId: string
  rows: Row[]
  fields: Field[]
  values: Record<string, string>
}) {
  const supabase = createClient()
  const router = useRouter()
  const [vals, setVals] = useState<Record<string, string>>(values)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const key = (fieldId: string, projectId: string) => `${fieldId}:${projectId}`

  const save = async (fieldId: string, projectId: string, value: string) => {
    await supabase
      .from('project_field_values')
      .upsert(
        { field_id: fieldId, project_id: projectId, value: value.trim() || null },
        { onConflict: 'field_id,project_id' }
      )
  }

  const onCell = (fieldId: string, projectId: string, value: string) => {
    const k = key(fieldId, projectId)
    setVals((v) => ({ ...v, [k]: value }))
    if (timers.current[k]) clearTimeout(timers.current[k])
    timers.current[k] = setTimeout(() => save(fieldId, projectId, value), 600)
  }

  return (
    <div className="ptable-wrap">
      <table className="ptable">
        <thead>
          <tr>
            <th className="idx">#</th>
            <th>Nombre</th>
            <th>Progreso</th>
            <th>Encargado</th>
            {fields.map((f) => (
              <th key={f.id}>
                <span className="th-field">
                  {f.name}
                  <form action={deleteField}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="portfolio_id" value={portfolioId} />
                    <button type="submit" className="th-del" title="Eliminar campo">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </form>
                </span>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const pct = r.total_count > 0 ? Math.round((r.done_count / r.total_count) * 100) : 0
            return (
              <tr key={r.project_id}>
                <td className="idx">{i + 1}</td>
                <td>
                  <Link href={`/projects/${r.project_id}`} className="pname">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-[8px]"
                      style={{ background: 'var(--brand-50)', color: 'var(--brand-600)' }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </span>
                    {r.name}
                  </Link>
                </td>
                <td>
                  <span className="pbar-track">
                    <span className="pbar-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="ml-2 text-[12px]" style={{ color: 'var(--text-3)' }}>{pct}%</span>
                </td>
                <td>
                  <span className="flex items-center gap-2">
                    <span className="avatar" style={{ width: 24, height: 24, fontSize: 11 }}>
                      {r.owner_email[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span className="text-[12.5px]">{r.owner_email}</span>
                  </span>
                </td>
                {fields.map((f) => (
                  <td key={f.id}>
                    <input
                      className="cell-input"
                      type={f.type === 'text' ? 'text' : 'number'}
                      inputMode={f.type === 'text' ? undefined : 'decimal'}
                      placeholder={f.type === 'money' ? '$0' : '—'}
                      value={vals[key(f.id, r.project_id)] ?? ''}
                      onChange={(e) => onCell(f.id, r.project_id, e.target.value)}
                      onBlur={(e) => save(f.id, r.project_id, e.target.value)}
                    />
                  </td>
                ))}
                <td>
                  <form action={removeProjectFromPortfolio}>
                    <input type="hidden" name="portfolio_id" value={portfolioId} />
                    <input type="hidden" name="project_id" value={r.project_id} />
                    <button type="submit" className="btn-ghost" title="Quitar del portfolio">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </form>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
