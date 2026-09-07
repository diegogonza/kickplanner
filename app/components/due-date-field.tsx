'use client'

import { useRef, useState } from 'react'
import { formatDueShort, todayISO } from '@/app/projects/statuses'
import Popover from '@/app/components/popover'

const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const shift = (days: number) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return iso(d)
}
// Próximo lunes (si hoy es lunes, el de la semana que viene)
const nextMonday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return iso(d)
}

/**
 * Fecha de entrega del modal: un disparador sin caja que muestra la fecha en
 * castellano ("8 sep", "Hoy", "Mañana") y abre un desplegable con atajos.
 * Reemplaza al input nativo, que mostraba 09/08/2026 —formato ambiguo— y
 * dejaba el ícono del calendario despegado del número.
 */
export default function DueDateField({
  value,
  onChange,
  done,
}: {
  value: string | null
  onChange: (value: string | null) => void
  done: boolean
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const info = value ? formatDueShort(value) : null
  const overdue = !!info && info.overdue && !done

  const pick = (next: string | null) => {
    setOpen(false)
    onChange(next)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="dropdown-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {info ? (
          <span className={`text-[13px] ${overdue ? 'due-late' : ''}`} style={{ color: overdue ? undefined : 'var(--text)' }}>
            {info.label}
            {overdue && ' · Vencida'}
          </span>
        ) : (
          <span className="text-[13px]" style={{ color: 'var(--text-3)' }}>Sin fecha</span>
        )}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchor={btnRef} minWidth={218} maxHeight={300}>
        <button type="button" className="dropdown-item" onClick={() => pick(todayISO())}>Hoy</button>
        <button type="button" className="dropdown-item" onClick={() => pick(shift(1))}>Mañana</button>
        <button type="button" className="dropdown-item" onClick={() => pick(nextMonday())}>Próximo lunes</button>

        <div className="pop-sep" />

        <input
          type="date"
          className="pop-date"
          value={value ?? ''}
          aria-label="Elegir una fecha"
          onChange={(e) => pick(e.target.value || null)}
        />

        {value && (
          <button type="button" className="dropdown-item" style={{ color: 'var(--text-3)' }} onClick={() => pick(null)}>
            Quitar fecha
          </button>
        )}
      </Popover>
    </>
  )
}
