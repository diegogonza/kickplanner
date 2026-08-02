'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

// Asignar un proyecto (que el usuario posee) a un equipo
export async function assignProjectToTeam(formData: FormData) {
  const teamId = formData.get('team_id') as string
  const projectId = formData.get('project_id') as string
  if (!teamId || !projectId) return

  const supabase = await createClient()
  await supabase.from('projects').update({ team_id: teamId }).eq('id', projectId)
  revalidatePath(`/teams/${teamId}`)
}

// Quitar un proyecto de su equipo
export async function removeProjectFromTeam(formData: FormData) {
  const teamId = formData.get('team_id') as string
  const projectId = formData.get('project_id') as string

  const supabase = await createClient()
  await supabase.from('projects').update({ team_id: null }).eq('id', projectId)
  revalidatePath(`/teams/${teamId}`)
}
