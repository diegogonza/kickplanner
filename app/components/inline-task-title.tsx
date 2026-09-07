'use client'

import { useEffect, useRef } from 'react'

/**
 * Título de la tarea editable. Es un textarea de una línea que crece solo, así
 * un título largo se ve entero en vez de recortarse (sobre todo en móvil).
 * El estado y el guardado con debounce viven en el modal.
 */
export default function InlineTaskTitle({
  value,
  onChange,
  id,
}: {
  value: string
  onChange: (value: string) => void
  id?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      id={id}
      ref={ref}
      rows={1}
      className="panel-title-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // Enter confirma: el título es de una sola línea
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      placeholder="Título de la tarea"
      aria-label="Título de la tarea"
    />
  )
}
