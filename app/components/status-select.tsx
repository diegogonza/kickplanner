'use client'

import { useRef, useState } from 'react'
import { STATUSES, type Status } from '@/app/projects/statuses'
import Popover from '@/app/components/popover'

/**
 * Selector de estado (Por hacer / En curso / Hecho).
 * Antes solo se podía llegar a "En curso" arrastrando en la vista Tablero.
 */
export default function StatusSelect({
  current,
  onChange,
}: {
  current: Status
  onChange: (value: Status) => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const cur = STATUSES.find((s) => s.key === current) ?? STATUSES[0]

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
        <span className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text)' }}>
          <span className="stat-dot" style={{ background: cur.color }} />
          {cur.label}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchor={btnRef} minWidth={190}>
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            className="dropdown-item"
            aria-current={s.key === current}
            onClick={() => {
              setOpen(false)
              if (s.key !== current) onChange(s.key)
            }}
          >
            <span className="flex items-center gap-2">
              <span className="stat-dot" style={{ background: s.color }} />
              {s.label}
            </span>
          </button>
        ))}
      </Popover>
    </>
  )
}
