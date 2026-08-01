'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

// Descripción con autoguardado: guarda al dejar de escribir (debounce) y al salir del campo.
export default function DescriptionInput({
  taskId,
  initial,
}: {
  taskId: string
  initial: string | null
}) {
  const supabase = createClient()
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(initial ?? '')

  const save = async (value: string) => {
    if (value === lastSaved.current) return
    setState('saving')
    await supabase
      .from('tasks')
      .update({ description: value.trim() || null })
      .eq('id', taskId)
    lastSaved.current = value
    setState('saved')
  }

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(value), 700)
  }

  return (
    <div>
      <textarea
        className="desc-area"
        placeholder="¿De qué se trata esta tarea?"
        defaultValue={initial ?? ''}
        onChange={onChange}
        onBlur={(e) => save(e.target.value)}
      />
      <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
        {state === 'saving' ? 'Guardando…' : state === 'saved' ? 'Guardado ✓' : ''}
      </div>
    </div>
  )
}
