'use client'

import { createElement } from 'react'
import { createClient } from '@/utils/supabase/client'
import { confirmDialog } from '@/app/components/confirm-dialog'
import { confirmBeforeSubmit } from '@/app/lib/confirm-submit'

type DeleteOpts = {
  taskId: string
  /** Título de la tarea, para que se vea QUÉ se va a borrar */
  title?: string
  /** Subtareas (a cualquier profundidad) si la vista ya lo sabe; si no, se cuenta en la base */
  knownSubs?: number
}

/**
 * Confirmación antes de eliminar una tarea. Muestra el nombre y cuántas
 * subtareas se pierden con ella. El foco arranca en "Cancelar": un Enter o un
 * clic de más no borra nada.
 */
export async function confirmDeleteTask({ taskId, title, knownSubs }: DeleteOpts): Promise<boolean> {
  let subs = knownSubs
  if (subs === undefined) {
    const { data, error } = await createClient().rpc('task_descendant_count', { p_task_id: taskId })
    subs = error ? undefined : Number(data ?? 0)
  }
  const nombre = title?.trim() ? createElement('b', null, `"${title.trim()}"`) : 'Esta tarea'
  const conSubs =
    subs === undefined
      ? ' y sus subtareas'
      : subs > 0
        ? ` y sus ${subs} ${subs === 1 ? 'subtarea' : 'subtareas'}`
        : ''
  return confirmDialog({
    tone: 'alert',
    title: '¿Eliminar esta tarea?',
    body: createElement(
      'p',
      { style: { margin: 0 } },
      nombre,
      `${conSubs} se van a eliminar, junto con sus comentarios y su historial. Esta acción no se puede deshacer.`
    ),
    confirmLabel: 'Eliminar tarea',
  })
}

/** Uso: <form action={deleteTask} onSubmit={guardDeleteTask({ taskId, title, knownSubs })}> */
export function guardDeleteTask(opts: DeleteOpts) {
  return confirmBeforeSubmit(() => confirmDeleteTask(opts))
}
