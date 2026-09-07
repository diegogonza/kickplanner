'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

/**
 * Descripción con autoguardado. Sin caja: crece con el contenido y solo se
 * resalta al pasar el cursor o al enfocarla, igual que el resto del modal.
 */
export default function DescriptionInput({
  taskId,
  initial,
  onSaved,
}: {
  taskId: string
  initial: string | null
  onSaved?: (value: string | null) => void
}) {
  const supabase = createClient()
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const ref = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fade = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(initial ?? '')

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    if (ref.current) grow(ref.current)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (fade.current) clearTimeout(fade.current)
    }
  }, [])

  const save = async (value: string) => {
    if (value === lastSaved.current) return
    setState('saving')
    const next = value.trim() || null
    await supabase.from('tasks').update({ description: next }).eq('id', taskId)
    lastSaved.current = value
    setState('saved')
    onSaved?.(next)
    if (fade.current) clearTimeout(fade.current)
    fade.current = setTimeout(() => setState('idle'), 2000)
  }

  return (
    <div className="desc-wrap">
      <textarea
        ref={ref}
        rows={1}
        className="desc-area"
        placeholder="¿De qué se trata esta tarea?"
        defaultValue={initial ?? ''}
        onChange={(e) => {
          grow(e.currentTarget)
          const value = e.target.value
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => save(value), 700)
        }}
        onBlur={(e) => {
          if (timer.current) clearTimeout(timer.current)
          save(e.target.value)
        }}
      />
      <span className={`save-hint ${state === 'idle' ? '' : 'on'}`} aria-live="polite">
        {state === 'saving' ? 'Guardando…' : state === 'saved' ? 'Guardado ✓' : ''}
      </span>
    </div>
  )
}
