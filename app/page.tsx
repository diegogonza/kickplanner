import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { signout } from './login/actions'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">Bienvenido</h1>
      <p className="text-gray-600">Sesion iniciada como: {user.email}</p>
      <form action={signout}>
        <button className="rounded bg-gray-800 px-4 py-2 text-white hover:bg-gray-900">
          Cerrar sesion
        </button>
      </form>
    </main>
  )
}
