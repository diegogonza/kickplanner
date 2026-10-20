'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })
  const next = destinoSeguro(formData.get('next'))
  if (error) {
    const params = new URLSearchParams({ error: error.message })
    if (next) params.set('next', next)
    redirect('/login?' + params.toString())
  }
  revalidatePath('/', 'layout')
  redirect(next ?? '/')
}

// Solo rutas internas: "/algo" sí; "//dominio" o "https://..." no, para que el
// parámetro next no sirva como redirección abierta hacia otro sitio.
function destinoSeguro(valor: FormDataEntryValue | null): string | null {
  if (typeof valor !== 'string') return null
  if (!valor.startsWith('/') || valor.startsWith('//') || valor.startsWith('/\\')) return null
  return valor
}

export async function signout() {
  const supabase = await createClient()
  // 'local' cierra solo esta sesión del navegador: el acceso que se le dio a
  // Claude por OAuth (y otras sesiones abiertas) sigue vivo.
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}
