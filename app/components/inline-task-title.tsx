'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

// Título de la tarea editable con autoguardado (sin botón / formulario)
export default function InlineTaskTitle({ taskId, initial }: { taskId: string; initial: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [val, setVal] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(initial)

  const save = async (v: string) => {
    const t = v.trim()
    if (!t || t === lastSaved.current) return
    lastSaved.current = t
    await supabase.from('tasks').update({ title: t }).eq('id', taskId)
    router.refresh()
  }

  const onChange = (v: string) => {
    setVal(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(v), 600)
  }

  return (
    <input
      className="panel-title-input"
      value={val}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        if (timer.current) clearTimeout(timer.current)
        save(e.target.value)
      }}
      placeholder="Título de la tarea"
      aria-label="Título de la tarea"
    />
  )
}
