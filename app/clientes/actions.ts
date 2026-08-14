'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

function clean(v: FormDataEntryValue | null): string | null {
  const s = ((v as string) ?? '').trim()
  return s || null
}

export async function createCliente(formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  if (!name) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('clients').insert({
    owner_id: user.id,
    name,
    nap_name: clean(formData.get('nap_name')),
    address: clean(formData.get('address')),
    phone: clean(formData.get('phone')),
    website: clean(formData.get('website')),
  })
  revalidatePath('/clientes')
}

export async function updateCliente(formData: FormData) {
  const id = formData.get('id') as string
  const name = (formData.get('name') as string)?.trim()
  if (!id || !name) return

  const supabase = await createClient()
  await supabase
    .from('clients')
    .update({
      name,
      address: clean(formData.get('address')),
      phone: clean(formData.get('phone')),
      website: clean(formData.get('website')),
    })
    .eq('id', id)

  revalidatePath('/clientes')
  revalidatePath('/')
}

export async function deleteCliente(formData: FormData) {
  const id = formData.get('id') as string
  if (!id) return

  const supabase = await createClient()
  // Los proyectos enlazados quedan con client_id = null (on delete set null)
  await supabase.from('clients').delete().eq('id', id)

  revalidatePath('/clientes')
  revalidatePath('/')
}
