'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { generarToken, sesionParaConexion } from '@/utils/supabase/mcp'

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

/* ------------------------- Conexion con Claude (MCP) ------------------------- */

export type EstadoConexionMcp = { token?: string; error?: string }

export async function conectarClaude(
  _previo: EstadoConexionMcp,
  formData: FormData
): Promise<EstadoConexionMcp> {
  if (!process.env.MCP_ENCRYPTION_KEY) {
    return { error: 'Falta configurar MCP_ENCRYPTION_KEY en el servidor.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { error: 'Tu sesion no es valida. Vuelve a iniciar sesion.' }

  const nombre = ((formData.get('name') as string) ?? '').trim() || 'Claude'
  const password = (formData.get('password') as string) ?? ''
  if (!password) return { error: 'Escribe tu contrasena para confirmar.' }

  let refreshCifrado: string
  try {
    refreshCifrado = await sesionParaConexion(user.email, password)
  } catch (e) {
    const detalle = e instanceof Error ? e.message : ''
    // Solo el fallo de credenciales se muestra como tal; un problema de red o de
    // configuracion no debe disfrazarse de contrasena incorrecta.
    return /credential|password|invalid/i.test(detalle)
      ? { error: 'Contrasena incorrecta.' }
      : { error: `No se pudo crear la conexion: ${detalle || 'error desconocido'}` }
  }

  const { token, hash, prefijo } = generarToken()
  const { error } = await supabase.rpc('mcp_create_connection', {
    p_name: nombre,
    p_token_hash: hash,
    p_token_prefix: prefijo,
    p_refresh_token_enc: refreshCifrado,
  })
  if (error) return { error: error.message }

  revalidatePath('/ajustes')
  return { token }
}

export async function desconectarClaude(formData: FormData) {
  const id = (formData.get('id') as string) ?? ''
  if (!id) return

  const supabase = await createClient()
  await supabase.rpc('mcp_revoke_connection', { p_id: id })
  revalidatePath('/ajustes')
}
