'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

// ---------- PROYECTOS ----------

const PROJECT_STATUS = ['upcoming', 'on_track', 'at_risk', 'on_hold'] as const
const PROJECT_TYPE = ['seo', 'web'] as const

export async function createProject(formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  if (!name) return

  const clientId = (formData.get('client_id') as string) || null
  const description = ((formData.get('description') as string) ?? '').trim() || null
  const raw = (formData.get('status') as string) ?? 'upcoming'
  const status = PROJECT_STATUS.includes(raw as never) ? raw : 'upcoming'
  const typeRaw = (formData.get('type') as string) ?? 'seo'
  const type = PROJECT_TYPE.includes(typeRaw as never) ? typeRaw : 'seo'
  const managerId = (formData.get('manager_id') as string) || null
  const startDate = (formData.get('start_date') as string) || null
  const fee = formData.get('fee') ? Number(formData.get('fee')) : null
  const currency = (formData.get('currency') as string) || 'COP'
  const url = ((formData.get('url') as string) ?? '').trim() || null

  const supabase = await createClient()
  const { data: newId, error } = await supabase.rpc('create_project', { p_name: name })
  if (error || !newId) {
    console.error('createProject:', error?.message)
    return
  }
  await supabase.from('projects').update({ client_id: clientId, description, type, manager_id: managerId, start_date: startDate, fee, currency, url }).eq('id', newId)
  // Fija el estado inicial y lo registra en el historial (sin nota)
  await supabase.rpc('set_project_status', {
    p_project_id: newId,
    p_status: status,
    p_note: null,
  })

  // Aplica una plantilla si se eligió al crear
  const templateId = (formData.get('template_id') as string) || null
  if (templateId) {
    await supabase.rpc('apply_template', { p_template_id: templateId, p_project_id: newId })
  }

  revalidatePath('/')
  revalidatePath('/panel')
}

export async function updateProject(formData: FormData) {
  const id = formData.get('id') as string
  const name = (formData.get('name') as string)?.trim()
  if (!id || !name) return
  const clientId = (formData.get('client_id') as string) || null
  const description = ((formData.get('description') as string) ?? '').trim() || null
  const raw = (formData.get('status') as string) ?? ''
  const status = PROJECT_STATUS.includes(raw as never) ? raw : null
  const typeRaw = (formData.get('type') as string) ?? ''
  const type = PROJECT_TYPE.includes(typeRaw as never) ? typeRaw : null
  const managerId = (formData.get('manager_id') as string) || null
  const startDate = (formData.get('start_date') as string) || null
  const fee = formData.get('fee') ? Number(formData.get('fee')) : null
  const currency = (formData.get('currency') as string) || 'COP'
  const url = ((formData.get('url') as string) ?? '').trim() || null

  const supabase = await createClient()
  await supabase
    .from('projects')
    .update({ name, client_id: clientId, description, manager_id: managerId, start_date: startDate, fee, currency, url, ...(type ? { type } : {}) })
    .eq('id', id)
  // Si cambió el estado desde el modal de edición, se registra en el historial
  if (status) {
    await supabase.rpc('set_project_status', { p_project_id: id, p_status: status, p_note: null })
  }
  revalidatePath('/')
  revalidatePath('/panel')
  revalidatePath(`/projects/${id}`)
}

// Edición en línea de la URL del proyecto (desde la tabla de Proyectos)
export async function setProjectUrl(formData: FormData) {
  const id = formData.get('id') as string
  if (!id) return
  const url = ((formData.get('url') as string) ?? '').trim() || null

  const supabase = await createClient()
  await supabase.from('projects').update({ url }).eq('id', id)
  revalidatePath('/')
  revalidatePath(`/projects/${id}`)
}

// Cambio rápido de encargado desde la lista de proyectos
export async function setProjectManager(formData: FormData) {
  const id = formData.get('id') as string
  if (!id) return
  const managerId = (formData.get('manager_id') as string) || null

  const supabase = await createClient()
  await supabase.from('projects').update({ manager_id: managerId }).eq('id', id)
  revalidatePath('/')
  revalidatePath('/panel')
  revalidatePath(`/projects/${id}`)
}

export async function setProjectStatus(formData: FormData) {
  const id = formData.get('id') as string
  const raw = formData.get('status') as string
  const note = ((formData.get('note') as string) ?? '').trim() || null
  if (!id || !PROJECT_STATUS.includes(raw as never)) return

  const supabase = await createClient()
  await supabase.rpc('set_project_status', { p_project_id: id, p_status: raw, p_note: note })
  revalidatePath('/')
  revalidatePath('/panel')
  revalidatePath(`/projects/${id}`)
}

export async function toggleFavorite(formData: FormData) {
  const id = formData.get('project_id') as string
  const isFav = (formData.get('favorite') as string) === 'true'
  if (!id) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  if (isFav) {
    await supabase.from('project_favorites').delete().eq('project_id', id).eq('user_id', user.id)
  } else {
    await supabase
      .from('project_favorites')
      .upsert({ project_id: id, user_id: user.id }, { onConflict: 'project_id,user_id', ignoreDuplicates: true })
  }
  revalidatePath('/')
}

export async function deleteProject(formData: FormData) {
  const id = formData.get('id') as string
  if (!id) return
  const supabase = await createClient()
  await supabase.from('projects').delete().eq('id', id)
  revalidatePath('/')
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

  // Posición al final entre sus hermanas (orden estable)
  let posQuery = supabase.from('tasks').select('position').eq('project_id', projectId)
  posQuery = parentId ? posQuery.eq('parent_id', parentId) : posQuery.is('parent_id', null)
  const { data: last } = await posQuery.order('position', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
  const position = (last?.position ?? 0) + 1

  const { data: created } = await supabase
    .from('tasks')
    .insert({
      title,
      project_id: projectId,
      parent_id: parentId,
      status,
      position,
      created_by: user?.id,
    })
    .select('id')
    .single()

  if (created) {
    await supabase.from('task_activity').insert({ task_id: created.id, type: 'created', meta: {} })
  }

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
  await supabase.from('task_activity').insert({ task_id: id, type: 'status', meta: { to: statusRaw } })
  revalidatePath(`/projects/${projectId}`)
}

export async function toggleComplete(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string
  const current = formData.get('status') as string
  const next = current === 'done' ? 'todo' : 'done'

  const supabase = await createClient()
  await supabase.from('tasks').update({ status: next }).eq('id', id)
  await supabase.from('task_activity').insert({ task_id: id, type: 'status', meta: { to: next } })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/mis-tareas')
}

export async function deleteTask(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string

  const supabase = await createClient()
  await supabase.from('tasks').delete().eq('id', id)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/mis-tareas')
}

// Duplica una tarea con sus subtareas y etiquetas. La tarea duplicada queda
// "por hacer"; las subtareas conservan su estado original (como en Asana).
type DupFields = {
  title: string
  description: string | null
  priority: string | null
  due_date: string | null
  assignee_id: string | null
  drive_url: string | null
  status: string
  parent_id: string | null
  project_id: string
}
const DUP_FIELDS = 'title, description, priority, due_date, assignee_id, drive_url, status, parent_id, project_id'

export async function duplicateTask(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = (formData.get('project_id') as string) || ''
  if (!id) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: srcRaw } = await supabase.from('tasks').select(DUP_FIELDS).eq('id', id).single()
  if (!srcRaw) return
  const src = srcRaw as DupFields

  // Posición al final entre sus hermanas
  let posQuery = supabase.from('tasks').select('position').eq('project_id', src.project_id)
  posQuery = src.parent_id ? posQuery.eq('parent_id', src.parent_id) : posQuery.is('parent_id', null)
  const { data: last } = await posQuery.order('position', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
  const rootPos = (last?.position ?? 0) + 1

  // Copia un nivel de hermanas en un solo insert (mapeo estable por position) y
  // luego recurre por sus subtareas. Devuelve el mapa idOriginal -> idNuevo.
  const copyLevel = async (
    sources: (DupFields & { id: string })[],
    newParentId: string | null,
    startPos: number,
    forceTodo: boolean
  ): Promise<Record<string, string>> => {
    const rows = sources.map((s, i) => ({
      title: s.title,
      description: s.description,
      priority: s.priority,
      due_date: s.due_date,
      assignee_id: s.assignee_id,
      drive_url: s.drive_url,
      project_id: s.project_id,
      parent_id: newParentId,
      status: forceTodo ? 'todo' : s.status,
      position: startPos + i,
      created_by: user?.id,
    }))
    const { data: inserted } = await supabase.from('tasks').insert(rows).select('id, position')
    const srcIdToNew: Record<string, string> = {}
    if (!inserted) return srcIdToNew
    const posToNew: Record<number, string> = {}
    for (const r of inserted as { id: string; position: number }[]) posToNew[r.position] = r.id
    sources.forEach((s, i) => {
      srcIdToNew[s.id] = posToNew[startPos + i]
    })

    // Etiquetas de todo el nivel en un solo insert
    const srcIds = sources.map((s) => s.id)
    const { data: tagRows } = await supabase.from('task_tags').select('task_id, tag_id').in('task_id', srcIds)
    if (tagRows && tagRows.length > 0) {
      await supabase.from('task_tags').insert(
        tagRows
          .filter((t) => srcIdToNew[t.task_id])
          .map((t) => ({ task_id: srcIdToNew[t.task_id], tag_id: t.tag_id }))
      )
    }

    // Subtareas de todo el nivel (una consulta), agrupadas por padre original
    const { data: kids } = await supabase
      .from('tasks')
      .select(`id, ${DUP_FIELDS}`)
      .in('parent_id', srcIds)
      .order('position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (kids && kids.length > 0) {
      const byParent = new Map<string, (DupFields & { id: string })[]>()
      for (const k of kids as (DupFields & { id: string })[]) {
        const arr = byParent.get(k.parent_id as string) ?? []
        arr.push(k)
        byParent.set(k.parent_id as string, arr)
      }
      for (const [srcParent, group] of byParent) {
        await copyLevel(group, srcIdToNew[srcParent], 1, false)
      }
    }
    return srcIdToNew
  }

  const rootMap = await copyLevel([{ ...src, id }], src.parent_id, rootPos, true)
  const newId = rootMap[id]
  if (newId) {
    await supabase.from('task_activity').insert({ task_id: newId, type: 'created', meta: {} })
  }

  revalidatePath(`/projects/${projectId || src.project_id}`)
  revalidatePath('/mis-tareas')
}

// ---------- DETALLE DE TAREA ----------

export async function setPriority(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string
  const raw = formData.get('priority') as string
  const priority = VALID_PRIORITY.includes(raw as never) ? raw : null

  const supabase = await createClient()
  await supabase.from('tasks').update({ priority }).eq('id', id)
  await supabase.from('task_activity').insert({ task_id: id, type: 'priority', meta: { to: priority } })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/mis-tareas')
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
  await supabase.from('task_activity').insert({ task_id: id, type: 'due', meta: { to: dueDate } })
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/mis-tareas')
}

// ---------- ARCHIVO DE DRIVE ----------

export async function setDriveUrl(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string
  const raw = ((formData.get('drive_url') as string) ?? '').trim()

  let value: string | null = null
  if (raw) {
    try {
      const host = new URL(raw).hostname.toLowerCase()
      // Solo se aceptan enlaces de Google Drive / Docs
      if (host === 'drive.google.com' || host === 'docs.google.com') value = raw
      else return
    } catch {
      return
    }
  }

  const supabase = await createClient()
  await supabase.from('tasks').update({ drive_url: value }).eq('id', id)
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
  // RPC: actualiza responsable + registra actividad + notifica al asignado
  await supabase.rpc('set_task_assignee', { p_task_id: id, p_assignee: assignee })
  revalidatePath(`/projects/${projectId}`)
}

// ---------- COMENTARIOS ----------

export async function addComment(formData: FormData) {
  const taskId = formData.get('task_id') as string
  const projectId = formData.get('project_id') as string
  const body = (formData.get('body') as string)?.trim()
  if (!taskId || !body) return

  // IDs de usuarios mencionados (separados por coma) que arma el compositor
  const mentions = ((formData.get('mentions') as string) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const supabase = await createClient()
  // RPC: crea comentario + menciones + notificaciones + actividad
  await supabase.rpc('post_comment', { p_task_id: taskId, p_body: body, p_mentions: mentions })
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

// Mueve una tarea entre columnas de la vista Etiquetas: quita la etiqueta de
// origen (si viene de una) y agrega la de destino (si va a una). "__none__"
// representa la columna "Sin etiqueta".
export async function moveTaskTag(formData: FormData) {
  const taskId = formData.get('task_id') as string
  const projectId = formData.get('project_id') as string
  const fromTag = (formData.get('from_tag_id') as string) || ''
  const toTag = (formData.get('to_tag_id') as string) || ''
  if (!taskId || fromTag === toTag) return

  const supabase = await createClient()
  if (fromTag) {
    await supabase.from('task_tags').delete().eq('task_id', taskId).eq('tag_id', fromTag)
  }
  if (toTag) {
    await supabase
      .from('task_tags')
      .upsert({ task_id: taskId, tag_id: toTag }, { onConflict: 'task_id,tag_id', ignoreDuplicates: true })
  }
  revalidatePath(`/projects/${projectId}`)
}
