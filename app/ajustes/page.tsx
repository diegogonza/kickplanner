import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import Avatar from '@/app/components/avatar'
import { updateProfile, uploadAvatar, removeAvatar } from './actions'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, job_title, department, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  const email = user.email ?? ''

  return (
    <div className="flex h-full">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">Ajustes</h1>
          </div>
        </header>

        <div className="viewscroll flex-1 overflow-y-auto px-6">
          <div className="w-full">
            <div className="section-label" style={{ marginTop: 0 }}>Perfil</div>

            {/* Foto */}
            <div className="card mb-4" style={{ padding: 'var(--space-5)' }}>
              <div className="flex items-center gap-4">
                <Avatar name={profile?.full_name} email={email} url={profile?.avatar_url} size={72} />
                <div className="flex flex-col gap-2">
                  <form action={uploadAvatar} className="flex items-center gap-2">
                    <input
                      type="file"
                      name="avatar"
                      accept="image/png, image/jpeg, image/webp"
                      className="field"
                      style={{ padding: 6, fontSize: 13 }}
                    />
                    <button type="submit" className="btn btn-primary">Subir foto</button>
                  </form>
                  <div className="flex items-center gap-3">
                    {profile?.avatar_url && (
                      <form action={removeAvatar}>
                        <button type="submit" className="btn-link" style={{ background: 'transparent', border: 0, color: 'var(--urgent-fg)', cursor: 'pointer', fontSize: 13, padding: 0 }}>
                          Eliminar foto
                        </button>
                      </form>
                    )}
                    <span className="card-desc">JPG, PNG o WebP · hasta 5 MB.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Datos básicos */}
            <form action={updateProfile} className="card" style={{ padding: 'var(--space-5)' }}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="k">Nombre completo</span>
                  <input name="full_name" className="field" defaultValue={profile?.full_name ?? ''} placeholder="Tu nombre completo" autoComplete="off" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="k">Nombre del puesto</span>
                  <input name="job_title" className="field" defaultValue={profile?.job_title ?? ''} placeholder="p. ej. Director SEO" autoComplete="off" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="k">Departamento o equipo</span>
                  <input name="department" className="field" defaultValue={profile?.department ?? ''} placeholder="p. ej. Marketing" autoComplete="off" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="k">Email</span>
                  <input className="field" value={email} disabled style={{ background: 'var(--panel)', color: 'var(--text-3)' }} />
                </label>
              </div>
              <div className="mt-5 flex justify-end">
                <button type="submit" className="btn btn-primary">Guardar cambios</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
