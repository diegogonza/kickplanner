'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const full_name = ((formData.get('full_name') as string) ?? '').trim() || null
  const job_title = ((formData.get('job_title') as string) ?? '').trim() || null
  const department = ((formData.get('department') as string) ?? '').trim() || null

  await supabase.from('profiles').upsert({
    id: user.id,
    full_name,
    job_title,
    department,
    updated_at: new Date().toISOString(),
  })

  revalidatePath('/ajustes')
  revalidatePath('/', 'layout')
}

export async function uploadAvatar(formData: FormData) {
  const file = formData.get('avatar') as File | null
  if (!file || file.size === 0) return
  if (file.size > 5 * 1024 * 1024) return // máx. 5 MB

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const path = `${user.id}/avatar-${Date.now()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType: file.type || 'image/png', upsert: true })
  if (error) {
    console.error('uploadAvatar:', error.message)
    return
  }

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
  await supabase.from('profiles').upsert({
    id: user.id,
    avatar_url: pub.publicUrl,
    updated_at: new Date().toISOString(),
  })

  revalidatePath('/ajustes')
  revalidatePath('/', 'layout')
}

export async function removeAvatar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('profiles').upsert({
    id: user.id,
    avatar_url: null,
    updated_at: new Date().toISOString(),
  })

  revalidatePath('/ajustes')
  revalidatePath('/', 'layout')
}
