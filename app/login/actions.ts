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
  if (error) redirect('/login?error=' + encodeURIComponent(error.message))
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signout() {
  const supabase = await createClient()
  // 'local' cierra solo esta sesion: las conexiones MCP de /ajustes siguen vivas
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}
