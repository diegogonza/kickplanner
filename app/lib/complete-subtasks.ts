'use client'

import { createElement } from 'react'
import { createClient } from '@/utils/supabase/client'
import { confirmDialog } from '@/app/components/confirm-dialog'
import { confirmBeforeSubmit } from '@/app/lib/confirm-submit'

/**
 * Antes de marcar una tarea como finalizada: si tiene subtareas sin finalizar
 * (a cualquier profundidad), avisa que también se van a completar y pide
 * confirmación. Devuelve `true` si se puede seguir.
 *
 * `knownOpen`: si la vista ya sabe cuántas subtareas abiertas hay (o que no
 * tiene ninguna), se evita la consulta a la base.
 */
export async function confirmCompleteSubtasks(taskId: string, knownOpen?: number): Promise<boolean> {
  let open = knownOpen
  if (open === undefined) {
    const { data, error } = await createClient().rpc('task_open_descendants', { p_task_id: taskId })
    // Si no se pudo contar, se pregunta igual: mejor un aviso de más que
    // completar subtareas sin que la persona lo sepa.
    open = error ? -1 : Number(data ?? 0)
  }
  if (open === 0) return true
  const cuantas = open > 0 ? `${open} ${open === 1 ? 'subtarea' : 'subtareas'} sin finalizar` : 'subtareas sin finalizar'
  return confirmDialog({
    title: open === 1 ? '¿Completar también la subtarea?' : '¿Completar también las subtareas?',
    body: createElement(
      'p',
      { style: { margin: 0 } },
      'Esta tarea tiene ',
      createElement('b', null, cuantas),
      '. Si la marcás como finalizada, también se van a marcar como completadas.'
    ),
    confirmLabel: 'Sí, completar todo',
    cancelLabel: 'Cancelar',
    tone: 'check',
  })
}

/**
 * Para los checks que son <form action={toggleComplete}>: pregunta solo cuando
 * la tarea se va a completar. Reabrir una tarea (done → todo) no pregunta.
 *
 * Uso: <form action={toggleComplete} onSubmit={guardComplete(task.id, conteoConocido)}>
 */
export function guardComplete(taskId: string, knownOpen?: number) {
  return confirmBeforeSubmit(
    () => confirmCompleteSubtasks(taskId, knownOpen),
    (form) => new FormData(form).get('status') !== 'done' && knownOpen !== 0
  )
}
