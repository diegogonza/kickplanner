'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { isAdmin, OK, DENIED, failed, type ActionResult } from '@/app/lib/permissions'

// Asignar un proyecto a un equipo. Cambia projects.team_id, así que es de
// administradores (RLS "admin edita proyectos", migración 012_roles).
export async function assignProjectToTeam(formData: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return DENIED
  const teamId = formData.get('team_id') as string
  const projectId = formData.get('project_id') as string
  if (!teamId || !projectId) return failed()

  const supabase = await createClient()
  const { error, count } = await supabase
    .from('projects')
    .update({ team_id: teamId }, { count: 'exact' })
    .eq('id', projectId)
  if (error) return failed()
  if (!count) return DENIED
  revalidatePath(`/teams/${teamId}`)
  return OK
}

// Quitar un proyecto de su equipo
export async function removeProjectFromTeam(formData: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return DENIED
  const teamId = formData.get('team_id') as string
  const projectId = formData.get('project_id') as string
  if (!teamId || !projectId) return failed()

  const supabase = await createClient()
  const { error, count } = await supabase
    .from('projects')
    .update({ team_id: null }, { count: 'exact' })
    .eq('id', projectId)
  if (error) return failed()
  if (!count) return DENIED
  revalidatePath(`/teams/${teamId}`)
  return OK
}
