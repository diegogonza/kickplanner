'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

// Completar / reabrir una tarea desde la vista "Mis tareas"
export async function toggleCompleteMine(formData: FormData) {
  const id = formData.get('id') as string
  const current = formData.get('status') as string
  if (!id) return

  const next = current === 'done' ? 'todo' : 'done'

  const supabase = await createClient()
  await supabase.from('tasks').update({ status: next }).eq('id', id)

  revalidatePath('/mis-tareas')
}
