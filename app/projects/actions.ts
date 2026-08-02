'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

// ---------- PROYECTOS ----------

export async function createProject(formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  if (!name) return

  const supabase = await createClient()
  const { data: newId, error } = await supabase.rpc('create_project', {
    p_name: name,
  })
  if (error) {
    console.error('createProject:', error.message)
    return
  }

  revalidatePath('/')
  redirect(`/projects/${newId}`)
}

// ---------- TAREAS ----------

const VALID_STATUS = ['todo', 'doing', 'done'] as const
const VALID_PRIORITY = ['media', 'alta', 'urgente'] as const

// Crea una tarea o subtarea (si viene parent_id)
export async function createTask(formData: FormData) {
  const title = (formData.get('title') as string)?.trim()
  const projectId = formData.get('project_id') as string
  const parentId = (formData.get('parent_id') as string) || null
  const statusRaw = (formData.get('status') as string) ?? 'todo'
  const status = VALID_STATUS.includes(statusRaw as never) ? statusRaw : 'todo'
  if (!title || !projectId) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase.from('tasks').insert({
    title,
    project_id: projectId,
    parent_id: parentId,
    status,
    created_by: user?.id,
  })

  revalidatePath(`/projects/${projectId}`)
}

// Crea una tarea y le asigna una etiqueta (usado en la vista Etiquetas)
export async function createTaskWithTag(formData: FormData) {
  const title = (formData.get('title') as string)?.trim()
  const projectId = formData.get('project_id') as string
  const tagId = formData.get('tag_id') as string
  if (!title || !projectId || !tagId) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: task } = await supabase
    .from('tasks')
    .insert({ title, project_id: projectId, status: 'todo', created_by: user?.id })
    .select('id')
    .single()

  if (task) {
    await supabase
      .from('task_tags')
      .upsert(
        { task_id: task.id, tag_id: tagId },
        { onConflict: 'task_id,tag_id', ignoreDuplicates: true }
      )
  }

  revalidatePath(`/projects/${projectId}`)
}

export async function updateTaskStatus(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string
  const statusRaw = formData.get('status') as string
  if (!VALID_STATUS.includes(statusRaw as never)) return

  const supabase = await createClient()
  await supabase.from('tasks').update({ status: statusRaw }).eq('id', id)
  revalidatePath(`/projects/${projectId}`)
}

export async function toggleComplete(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string
  const current = formData.get('status') as string
  const next = current === 'done' ? 'todo' : 'done'

  const supabase = await createClient()
  await supabase.from('tasks').update({ status: next }).eq('id', id)
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteTask(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string

  const supabase = await createClient()
  await supabase.from('tasks').delete().eq('id', id)
  revalidatePath(`/projects/${projectId}`)
}

// ---------- DETALLE DE TAREA ----------

export async function setPriority(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string
  const raw = formData.get('priority') as string
  const priority = VALID_PRIORITY.includes(raw as never) ? raw : null

  const supabase = await createClient()
  await supabase.from('tasks').update({ priority }).eq('id', id)
  revalidatePath(`/projects/${projectId}`)
}

export async function updateDescription(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string
  const description = ((formData.get('description') as string) ?? '').trim() || null

  const supabase = await createClient()
  await supabase.from('tasks').update({ description }).eq('id', id)
  revalidatePath(`/projects/${projectId}`)
}

export async function updateDueDate(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string
  const dueDate = (formData.get('due_date') as string) || null

  const supabase = await createClient()
  await supabase.from('tasks').update({ due_date: dueDate }).eq('id', id)
  revalidatePath(`/projects/${projectId}`)
}

// ---------- ETIQUETAS (globales, se crean solas) ----------

export async function addTag(formData: FormData) {
  const taskId = formData.get('task_id') as string
  const projectId = formData.get('project_id') as string
  const name = (formData.get('name') as string)?.trim()
  if (!name) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Buscar la etiqueta (sin distinguir mayus/minus); si no existe, crearla
  let { data: tag } = await supabase
    .from('tags')
    .select('id')
    .ilike('name', name)
    .maybeSingle()

  if (!tag) {
    const { data: created } = await supabase
      .from('tags')
      .insert({ name, created_by: user?.id })
      .select('id')
      .single()
    tag = created
  }

  if (tag) {
    // upsert con ignore: si ya estaba asignada, no falla ni duplica
    await supabase
      .from('task_tags')
      .upsert(
        { task_id: taskId, tag_id: tag.id },
        { onConflict: 'task_id,tag_id', ignoreDuplicates: true }
      )
  }

  revalidatePath(`/projects/${projectId}`)
}

// ---------- RESPONSABLE ----------

export async function setAssignee(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string
  const assignee = (formData.get('assignee_id') as string) || null

  const supabase = await createClient()
  await supabase.from('tasks').update({ assignee_id: assignee }).eq('id', id)
  revalidatePath(`/projects/${projectId}`)
}

// ---------- COMENTARIOS ----------

export async function addComment(formData: FormData) {
  const taskId = formData.get('task_id') as string
  const projectId = formData.get('project_id') as string
  const body = (formData.get('body') as string)?.trim()
  if (!taskId || !body) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('comments').insert({ task_id: taskId, author_id: user.id, body })
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteComment(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string

  const supabase = await createClient()
  await supabase.from('comments').delete().eq('id', id)
  revalidatePath(`/projects/${projectId}`)
}

export async function removeTag(formData: FormData) {
  const taskId = formData.get('task_id') as string
  const tagId = formData.get('tag_id') as string
  const projectId = formData.get('project_id') as string

  const supabase = await createClient()
  await supabase
    .from('task_tags')
    .delete()
    .eq('task_id', taskId)
    .eq('tag_id', tagId)

  revalidatePath(`/projects/${projectId}`)
}
