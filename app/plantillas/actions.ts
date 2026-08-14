'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

const TEMPLATE_TYPE = ['seo', 'web', 'general'] as const
const VALID_PRIORITY = ['media', 'alta', 'urgente'] as const

// ---------- PLANTILLAS ----------

export async function createTemplate(formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  if (!name) return
  const typeRaw = (formData.get('type') as string) ?? 'general'
  const type = TEMPLATE_TYPE.includes(typeRaw as never) ? typeRaw : 'general'
  const description = ((formData.get('description') as string) ?? '').trim() || null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('templates').insert({ owner_id: user.id, name, type, description })
  revalidatePath('/plantillas')
}

export async function updateTemplate(formData: FormData) {
  const id = formData.get('id') as string
  const name = (formData.get('name') as string)?.trim()
  if (!id || !name) return
  const typeRaw = (formData.get('type') as string) ?? 'general'
  const type = TEMPLATE_TYPE.includes(typeRaw as never) ? typeRaw : 'general'
  const description = ((formData.get('description') as string) ?? '').trim() || null

  const supabase = await createClient()
  await supabase.from('templates').update({ name, type, description }).eq('id', id)
  revalidatePath('/plantillas')
  revalidatePath(`/plantillas/${id}`)
}

export async function deleteTemplate(formData: FormData) {
  const id = formData.get('id') as string
  if (!id) return
  const supabase = await createClient()
  await supabase.from('templates').delete().eq('id', id)
  revalidatePath('/plantillas')
}

// ---------- TAREAS DE LA PLANTILLA ----------

export async function addTemplateTask(formData: FormData) {
  const templateId = formData.get('template_id') as string
  const parentId = (formData.get('parent_id') as string) || null
  const title = (formData.get('title') as string)?.trim()
  if (!templateId || !title) return

  const supabase = await createClient()
  const { data: last } = await supabase
    .from('template_tasks')
    .select('position')
    .eq('template_id', templateId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = (last?.position ?? 0) + 10

  await supabase.from('template_tasks').insert({
    template_id: templateId,
    parent_id: parentId,
    title,
    position,
  })
  revalidatePath(`/plantillas/${templateId}`)
}

export async function updateTemplateTask(formData: FormData) {
  const id = formData.get('id') as string
  const templateId = formData.get('template_id') as string
  if (!id) return

  const patch: Record<string, unknown> = {}
  if (formData.has('title')) {
    const title = (formData.get('title') as string)?.trim()
    if (!title) return
    patch.title = title
  }
  if (formData.has('priority')) {
    const raw = formData.get('priority') as string
    patch.priority = VALID_PRIORITY.includes(raw as never) ? raw : null
  }
  if (formData.has('due_offset_days')) {
    const raw = ((formData.get('due_offset_days') as string) ?? '').trim()
    const n = raw === '' ? null : Number(raw)
    patch.due_offset_days = n === null || Number.isNaN(n) ? null : Math.trunc(n)
  }
  if (formData.has('assignee_id')) {
    patch.assignee_id = (formData.get('assignee_id') as string) || null
  }
  if (formData.has('description')) {
    patch.description = ((formData.get('description') as string) ?? '').trim() || null
  }
  if (formData.has('drive_url')) {
    const raw = ((formData.get('drive_url') as string) ?? '').trim()
    let value: string | null = null
    if (raw) {
      try {
        const u = new URL(raw)
        if (u.protocol === 'http:' || u.protocol === 'https:') value = raw
      } catch {
        value = null
      }
    }
    patch.drive_url = value
  }

  if (Object.keys(patch).length === 0) return
  const supabase = await createClient()
  await supabase.from('template_tasks').update(patch).eq('id', id)
  if (templateId) revalidatePath(`/plantillas/${templateId}`)
}

export async function deleteTemplateTask(formData: FormData) {
  const id = formData.get('id') as string
  const templateId = formData.get('template_id') as string
  if (!id) return
  const supabase = await createClient()
  await supabase.from('template_tasks').delete().eq('id', id)
  if (templateId) revalidatePath(`/plantillas/${templateId}`)
}

export async function addTemplateTaskTag(formData: FormData) {
  const taskId = formData.get('template_task_id') as string
  const templateId = formData.get('template_id') as string
  const tagId = (formData.get('tag_id') as string) || null
  if (!taskId || !tagId) return

  const supabase = await createClient()
  await supabase
    .from('template_task_tags')
    .upsert({ template_task_id: taskId, tag_id: tagId }, { onConflict: 'template_task_id,tag_id', ignoreDuplicates: true })
  if (templateId) revalidatePath(`/plantillas/${templateId}`)
}

export async function removeTemplateTaskTag(formData: FormData) {
  const taskId = formData.get('template_task_id') as string
  const tagId = formData.get('tag_id') as string
  const templateId = formData.get('template_id') as string
  if (!taskId || !tagId) return
  const supabase = await createClient()
  await supabase.from('template_task_tags').delete().eq('template_task_id', taskId).eq('tag_id', tagId)
  if (templateId) revalidatePath(`/plantillas/${templateId}`)
}

// ---------- APLICAR ----------

export async function applyTemplate(formData: FormData) {
  const templateId = formData.get('template_id') as string
  const projectId = formData.get('project_id') as string
  const start = ((formData.get('start_date') as string) ?? '').trim() || null
  if (!templateId || !projectId) return

  const supabase = await createClient()
  await supabase.rpc('apply_template', {
    p_template_id: templateId,
    p_project_id: projectId,
    ...(start ? { p_start: start } : {}),
  })
  revalidatePath(`/projects/${projectId}`)
}
