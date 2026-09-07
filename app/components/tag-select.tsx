'use client'

import { useRef, useState } from 'react'
import type { Tag } from '@/app/projects/statuses'
import Popover from '@/app/components/popover'

/**
 * Selector de etiqueta ÚNICA: una tarea tiene una etiqueta o ninguna.
 * Elegir otra reemplaza la anterior; no se acumulan.
 * Es presentacional: el modal se encarga de persistir y de crear la etiqueta.
 */
export default function TagSelect({
  current,
  allTags,
  onPick,
  onCreate,
}: {
  current: Tag | null
  allTags: Tag[]
  onPick: (tag: Tag | null) => void
  onCreate: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)

  const query = q.trim().toLowerCase()
  const filtered = allTags.filter((t) => t.name.toLowerCase().includes(query))
  const exactExists = allTags.some((t) => t.name.toLowerCase() === query)

  const close = () => {
    setOpen(false)
    setQ('')
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
        {current ? (
          <span className="tag-pill is-plain" style={{ background: `${current.color}1A`, color: current.color }}>
            {current.name}
          </span>
        ) : (
          <span className="text-[13px]" style={{ color: 'var(--text-3)' }}>Sin etiqueta</span>
        )}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <Popover open={open} onClose={close} anchor={btnRef} minWidth={240} maxHeight={280}>
        <input
          className="pop-search"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const name = q.trim()
            if (!name) return
            const hit = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase())
            if (hit) onPick(hit)
            else onCreate(name)
            close()
          }}
          placeholder="Buscar o crear etiqueta…"
          aria-label="Buscar o crear etiqueta"
        />

        {filtered.map((t) => (
          <button
            key={t.id}
            type="button"
            className="dropdown-item"
            aria-current={t.id === current?.id}
            onClick={() => {
              onPick(t)
              close()
            }}
          >
            <span className="tag-pill is-plain" style={{ background: `${t.color}1A`, color: t.color }}>
              {t.name}
            </span>
          </button>
        ))}

        {query && !exactExists && (
          <button
            type="button"
            className="dropdown-item"
            onClick={() => {
              onCreate(q.trim())
              close()
            }}
          >
            Crear “{q.trim()}”
          </button>
        )}

        {filtered.length === 0 && !query && (
          <div className="dropdown-item" style={{ cursor: 'default' }}>No hay etiquetas todavía</div>
        )}

        {current && (
          <button
            type="button"
            className="dropdown-item"
            style={{ color: 'var(--text-3)' }}
            onClick={() => {
              onPick(null)
              close()
            }}
          >
            Quitar etiqueta
          </button>
        )}
      </Popover>
    </>
  )
}
