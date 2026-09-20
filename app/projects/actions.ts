'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { isAdmin, OK, DENIED, failed, type ActionResult } from '@/app/lib/permissions'

// ---------- PROYECTOS ----------

const PROJECT_STATUS = ['upcoming', 'on_track', 'at_risk', 'on_hold'] as const
const PROJECT_TYPE = ['seo', 'web'] as const

/**
 * URL del proyecto: vacía, o http(s). Se usa como href en la lista de
 * proyectos, así que un "javascript:…" se ejecutaría al hacer clic.
 * Sin esquema ("stevia.com.co") se asume https.
 */
function parseUrl(raw: string): { ok: true; value: string | null } | { ok: false } {
  const v = raw.trim()
  if (!v) return { ok: true, value: null }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false }
    return { ok: true, value: u.toString() }
  } catch {
    return { ok: false }
  }
}

/** Fee: vacío, o número >= 0. Un valor inválido NO se convierte en null. */
function parseFee(raw: string): { ok: true; value: number | null } | { ok: false } {
  const v = raw.trim()
  if (!v) return { ok: true, value: null }
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return { ok: false }
  return { ok: true, value: n }
}

const BAD_URL = failed('La URL del proyecto debe empezar con http:// o https://.')
const BAD_FEE = failed('El fee debe ser un número igual o mayor a 0.')

export async function createProject(formData: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return DENIED
  const name = (formData.get('name') as string)?.trim()
  if (!name) return failed('El proyecto necesita un nombre.')

  const clientId = (formData.get('client_id') as string) || null
  const description = ((formData.get('description') as string) ?? '').trim() || null
  const raw = (formData.get('status') as string) ?? 'upcoming'
  const status = PROJECT_STATUS.includes(raw as never) ? raw : 'upcoming'
  const typeRaw = (formData.get('type') as string) ?? 'seo'
  const type = PROJECT_TYPE.includes(typeRaw as never) ? typeRaw : 'seo'
  const managerId = (formData.get('manager_id') as string) || null
  const startDate = (formData.get('start_date') as string) || null
  const currency = (formData.get('currency') as string) || 'COP'
  const feeP = parseFee((formData.get('fee') as string) ?? '')
  if (!feeP.ok) return BAD_FEE
  const urlP = parseUrl((formData.get('url') as string) ?? '')
  if (!urlP.ok) return BAD_URL
  const fee = feeP.value
  const url = urlP.value

  // Todo proyecto necesita cliente (projects.client_id es NOT NULL). Se corta
  // acá para dar un mensaje, en vez de dejar que reviente la base.
  if (!clientId) {
    console.error('createProject: sin cliente asignado')
    return failed('Elige un cliente para el proyecto.')
  }

  const supabase = await createClient()
  const { data: newId, error } = await supabase.rpc('create_project', {
    p_name: name,
    p_client_id: clientId,
  })
  if (error || !newId) {
    console.error('createProject:', error?.message)
    return failed()
  }
  // El proyecto ya existe. Si un paso posterior falla no se deshace (eso
  // borraría lo que sí se guardó): se completa lo posible y se avisa qué quedó
  // pendiente, para terminarlo desde "Editar ajustes" o "Plantillas".
  const pendientes: string[] = []

  const { error: updErr } = await supabase
    .from('projects')
    .update({ description, type, manager_id: managerId, start_date: startDate, fee, currency, url })
    .eq('id', newId)
  if (updErr) {
    console.error('createProject/update:', updErr.message)
    pendientes.push('los datos del proyecto (tipo, fee, fechas, URL)')
  }

  // Fija el estado inicial y lo registra en el historial (sin nota)
  const { error: stErr } = await supabase.rpc('set_project_status', {
    p_project_id: newId,
    p_status: status,
    p_note: null,
  })
  if (stErr) {
    console.error('createProject/status:', stErr.message)
    pendientes.push('el estado inicial')
  }

  // Aplica una plantilla si se eligió al crear
  const templateId = (formData.get('template_id') as string) || null
  if (templateId) {
    const { error: tplErr } = await supabase.rpc('apply_template', { p_template_id: templateId, p_project_id: newId })
    if (tplErr) {
      console.error('createProject/template:', tplErr.message)
      pendientes.push('la plantilla')
    }
  }

  revalidatePath('/') // el panel vive en la raíz
  revalidatePath('/projects')
  if (pendientes.length) {
    return failed(`El proyecto se creó, pero no se pudo guardar ${pendientes.join(', ')}. Complétalo desde el menú del proyecto.`)
  }
  return OK
}

export async function updateProject(formData: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return DENIED
  const id = formData.get('id') as string
  const name = (formData.get('name') as string)?.trim()
  if (!id || !name) return failed('El proyecto necesita un nombre.')

  // Solo se actualizan los campos que el formulario MANDÓ. Antes, un campo
  // ausente (p. ej. el selector de encargado sin opciones porque falló la
  // carga del equipo) se guardaba como null y borraba el dato existente.
  const has = (k: string) => formData.has(k)
  const str = (k: string) => ((formData.get(k) as string) ?? '').trim()
  const patch: Record<string, unknown> = { name }
  if (has('description')) patch.description = str('description') || null
  if (has('manager_id')) patch.manager_id = str('manager_id') || null
  if (has('start_date')) patch.start_date = str('start_date') || null
  if (has('fee')) {
    const f = parseFee(str('fee'))
    if (!f.ok) return BAD_FEE
    patch.fee = f.value
  }
  if (has('currency')) patch.currency = str('currency') || 'COP'
  if (has('url')) {
    const u = parseUrl(str('url'))
    if (!u.ok) return BAD_URL
    patch.url = u.value
  }
  // Dejar un proyecto sin cliente no es un estado válido: vacío = no tocar.
  if (str('client_id')) patch.client_id = str('client_id')
  const typeRaw = str('type')
  if (PROJECT_TYPE.includes(typeRaw as never)) patch.type = typeRaw
  const raw = str('status')
  const status = PROJECT_STATUS.includes(raw as never) ? raw : null

  const supabase = await createClient()
  const { error, count } = await supabase.from('projects').update(patch, { count: 'exact' }).eq('id', id)
  if (error) {
    console.error('updateProject:', error.message)
    return failed()
  }
  // Con RLS, un UPDATE sobre un proyecto que no puedes ver no da error: toca
  // 0 filas. Sin esto se respondía "guardado" sin haber guardado nada.
  if (!count) return DENIED
  // Si cambió el estado desde el modal de edición, se registra en el historial
  if (status) {
    const { error: stErr } = await supabase.rpc('set_project_status', { p_project_id: id, p_status: status, p_note: null })
    if (stErr) {
      console.error('updateProject/status:', stErr.message)
      revalidatePath(`/projects/${id}`)
      return failed('Se guardaron los cambios, pero no se pudo actualizar el estado.')
    }
  }
  revalidatePath('/') // el panel vive en la raíz
  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  return OK
}

// Edición en línea de la URL del proyecto (desde la tabla de Proyectos)
export async function setProjectUrl(formData: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return DENIED
  const id = formData.get('id') as string
  if (!id) return failed()
  const u = parseUrl((formData.get('url') as string) ?? '')
  if (!u.ok) return BAD_URL
  const url = u.value

  const supabase = await createClient()
  const { error, count } = await supabase.from('projects').update({ url }, { count: 'exact' }).eq('id', id)
  if (error) return failed()
  if (!count) return DENIED
  revalidatePath('/')
  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  return OK
}

// Cambio rápido de encargado desde la lista de proyectos
export async function setProjectManager(formData: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return DENIED
  const id = formData.get('id') as string
  if (!id) return failed()
  const managerId = (formData.get('manager_id') as string) || null

  const supabase = await createClient()
  const { error, count } = await supabase.from('projects').update({ manager_id: managerId }, { count: 'exact' }).eq('id', id)
  if (error) return failed()
  if (!count) return DENIED
  revalidatePath('/') // el panel vive en la raíz
  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  return OK
}

export async function setProjectStatus(formData: FormData) {
  const id = formData.get('id') as string
  const raw = formData.get('status') as string
  const note = ((formData.get('note') as string) ?? '').trim() || null
  if (!id || !PROJECT_STATUS.includes(raw as never)) return

  const supabase = await createClient()
  await supabase.rpc('set_project_status', { p_project_id: id, p_status: raw, p_note: note })
  revalidatePath('/') // el panel vive en la raíz
  revalidatePath('/projects')
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
  revalidatePath('/projects')
}

export async function deleteProject(formData: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return DENIED
  const id = formData.get('id') as string
  if (!id) return failed()
  const supabase = await createClient()
  // count: con RLS un DELETE bloqueado no da error, devuelve 0 filas.
  const { error, count } = await supabase.from('projects').delete({ count: 'exact' }).eq('id', id)
  if (error || !count) {
    if (error) console.error('deleteProject:', error.message)
    return error ? failed() : DENIED
  }
  revalidatePath('/')
  revalidatePath('/projects')
  return OK
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
  revalidatePath('/equipo')
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
  const { error } = await supabase.rpc('set_task_assignee', { p_task_id: id, p_assignee: assignee })
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/equipo')
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
  const { error } = await supabase.rpc('post_comment', {
    p_task_id: taskId,
    p_body: body,
    p_mentions: mentions,
  })
  // Se propaga: el compositor devuelve el texto y avisa en vez de dar por
  // guardado un comentario que nunca llegó.
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteComment(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string

  const supabase = await createClient()
  // .select() confirma qué se borró: con RLS, borrar un comentario ajeno no da
  // error, simplemente afecta 0 filas. Sin esta comprobación el cliente lo
  // ocultaba como si hubiera funcionado y reaparecía al refrescar.
  const { data, error } = await supabase.from('comments').delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('No se pudo eliminar el comentario')
  revalidatePath(`/projects/${projectId}`)
}

// Edita un comentario propio. El RPC valida la autoría, re-sincroniza las
// menciones (agrega las nuevas, quita las que ya no están) y notifica solo a
// quien no estaba mencionado antes.
export async function editComment(formData: FormData) {
  const id = formData.get('id') as string
  const projectId = formData.get('project_id') as string
  const body = (formData.get('body') as string)?.trim()
  if (!id || !body) return

  const mentions = ((formData.get('mentions') as string) ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

  const supabase = await createClient()
  const { error } = await supabase.rpc('edit_comment', {
    p_comment_id: id,
    p_body: body,
    p_mentions: mentions,
  })
  if (error) throw new Error(error.message)

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
