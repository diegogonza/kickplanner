'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { must, type Enqueue, type RegisterFlush } from '@/app/lib/write'

/**
 * Descripción con autoguardado. Sin caja: crece con el contenido y solo se
 * resalta al pasar el cursor o al enfocarla, igual que el resto del modal.
 *
 * El guardado entra en la cola del modal, así el cierre lo espera. Y lo que
 * quedó en el debounce se guarda igual si el modal cierra o navega (antes, un
 * Esc a menos de 700 ms de la última tecla perdía el texto).
 */
export default function DescriptionInput({
  taskId,
  initial,
  onSaved,
  enqueue,
  registerFlush,
}: {
  taskId: string
  initial: string | null
  onSaved?: (value: string | null) => void
  enqueue: Enqueue
  registerFlush: RegisterFlush
}) {
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const ref = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fade = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(initial ?? '')

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const saveRef = useRef<(value: string) => void>(() => {})
  // Se reasigna en un efecto (no durante el render) con las props al día
  useEffect(() => {
    saveRef.current = (value: string) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      if (value === lastSaved.current) return
      const prev = lastSaved.current
      lastSaved.current = value
      setState('saving')
      const next = value.trim() || null
      enqueue(
        async () => {
          await must(supabase.from('tasks').update({ description: next }).eq('id', taskId).select('id'))
          setState('saved')
          onSaved?.(next)
          if (fade.current) clearTimeout(fade.current)
          fade.current = setTimeout(() => setState('idle'), 2000)
        },
        {
          what: 'la descripción',
          hint: 'Tu texto sigue en el campo; volvé a editarlo para reintentar.',
          undo: () => {
            lastSaved.current = prev
            setState('idle')
          },
        }
      )
    }
  })

  // Al cerrar o navegar: si había algo esperando en el debounce, se guarda YA
  useEffect(() => {
    const flush = () => {
      if (timer.current && ref.current) saveRef.current(ref.current.value)
    }
    const off = registerFlush(flush)
    const el = ref.current
    if (el) grow(el)
    return () => {
      off()
      // Desmontaje (p. ej. al abrir una subtarea): mismo rescate
      if (timer.current && el) saveRef.current(el.value)
      if (fade.current) clearTimeout(fade.current)
    }
  }, [registerFlush])

  return (
    <div className="desc-wrap">
      <textarea
        ref={ref}
        rows={1}
        className="desc-area"
        aria-label="Descripción"
        placeholder="¿De qué se trata esta tarea?"
        defaultValue={initial ?? ''}
        onChange={(e) => {
          grow(e.currentTarget)
          const value = e.target.value
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => saveRef.current(value), 700)
        }}
        onBlur={(e) => saveRef.current(e.target.value)}
      />
      <span className={`save-hint ${state === 'idle' ? '' : 'on'}`} aria-live="polite">
        {state === 'saving' ? 'Guardando…' : state === 'saved' ? 'Guardado ✓' : ''}
      </span>
    </div>
  )
}
