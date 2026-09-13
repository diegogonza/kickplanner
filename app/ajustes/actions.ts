'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

// Límite del avatar. NO se exporta: en un archivo 'use server' solo pueden
// exportarse funciones async, así que la UI repite el número en su copy.
const AVATAR_MAX_MB = 5
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

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
  // Antes cada uno de estos casos hacía `return` en silencio: la página se
  // recargaba igual y parecía que la foto se había subido. Ahora cada salida
  // deja una marca en la URL que /ajustes convierte en mensaje.
  if (!file || file.size === 0) redirect('/ajustes?foto=vacio')
  if (file.size > AVATAR_MAX_MB * 1024 * 1024) redirect('/ajustes?foto=grande')
  if (file.type && !AVATAR_TYPES.includes(file.type)) redirect('/ajustes?foto=tipo')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const path = `${user.id}/avatar-${Date.now()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType: file.type || 'image/png', upsert: true })
  if (error) {
    console.error('uploadAvatar:', error.message)
    redirect('/ajustes?foto=error')
  }

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
  const { error: profErr } = await supabase.from('profiles').upsert({
    id: user.id,
    avatar_url: pub.publicUrl,
    updated_at: new Date().toISOString(),
  })
  if (profErr) {
    console.error('uploadAvatar/profile:', profErr.message)
    redirect('/ajustes?foto=error')
  }

  revalidatePath('/ajustes')
  revalidatePath('/', 'layout')
  redirect('/ajustes?foto=ok')
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
