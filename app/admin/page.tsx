import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getSessionProfile } from '@/app/lib/session'
import Sidebar from '@/app/components/sidebar'
import AdminRoles, { type AdminMember } from '@/app/components/admin-roles'
import AdminTabs from '@/app/components/admin-tabs'

// Administración del espacio de trabajo (solo admin): roles por miembro.
// La otra pestaña del área es /plantillas.
export default async function AdminPage() {
  const { user, isAdmin } = await getSessionProfile()
  if (!user) redirect('/login')
  if (!isAdmin) redirect('/')

  const supabase = await createClient()
  const [membersRes, profilesRes] = await Promise.all([
    supabase.rpc('workspace_members'),
    supabase.from('profiles').select('id, role, job_title'),
  ])
  if (membersRes.error) console.error('admin workspace_members:', membersRes.error.message)
  if (profilesRes.error) console.error('admin profiles:', profilesRes.error.message)

  const perfiles = new Map(
    ((profilesRes.data ?? []) as { id: string; role: string; job_title: string | null }[]).map((p) => [p.id, p])
  )
  const members: AdminMember[] = (
    (membersRes.data ?? []) as { user_id: string; email: string; full_name: string | null; avatar_url: string | null }[]
  )
    // Solo cuentas con perfil del equipo.
    .filter((m) => perfiles.has(m.user_id))
    .map((m) => {
      const p = perfiles.get(m.user_id)!
      return {
        id: m.user_id,
        email: m.email,
        full_name: m.full_name,
        avatar_url: m.avatar_url,
        job_title: p.job_title,
        role: p.role === 'admin' ? 'admin' : 'member',
      }
    })
  const admins = members.filter((m) => m.role === 'admin').length

  return (
    <div className="flex h-full">
      <Sidebar active="admin" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">Organización</div>
            <h1 className="page-title">Espacio de trabajo</h1>
          </div>
        </header>
        <AdminTabs active="roles" />

        <div className="viewscroll flex-1 overflow-y-auto px-6">
          <div className="adm-wrap">
            <section aria-labelledby="adm-roles-title">
              <div className="adm-section-head">
                <h2 className="adm-section-title" id="adm-roles-title">Miembros y roles</h2>
                <p className="adm-section-desc">
                  {members.length} miembros · {admins} {admins === 1 ? 'administrador' : 'administradores'}.
                  Los administradores ven Pagos, Semana del equipo y esta página, y pueden gestionar cualquier proyecto.
                </p>
              </div>
              <AdminRoles members={members} currentUserId={user.id} />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
