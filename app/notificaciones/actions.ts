'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

// Marca la notificación como leída y abre la tarea
export async function openNotification(formData: FormData) {
  const id = formData.get('id') as string
  const taskId = formData.get('task_id') as string
  const projectId = formData.get('project_id') as string

  const supabase = await createClient()
  if (id) await supabase.from('notifications').update({ read: true }).eq('id', id)

  if (projectId && taskId) redirect(`/projects/${projectId}?task=${taskId}`)
  redirect('/notificaciones')
}

export async function markAllRead() {
  const supabase = await createClient()
  await supabase.from('notifications').update({ read: true }).eq('read', false)
  revalidatePath('/notificaciones')
  revalidatePath('/', 'layout')
}
