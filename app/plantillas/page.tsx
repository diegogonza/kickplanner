import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import AdminTabs from '@/app/components/admin-tabs'
import { getSessionProfile } from '@/app/lib/session'
import PlantillasView, { type TemplateOverview } from '@/app/components/plantillas-view'

// Plantillas vive dentro de Administración: solo admin. Los miembros siguen
// pudiendo APLICAR plantillas a un proyecto (apply-template-modal).
export default async function PlantillasPage() {
  const { user, isAdmin } = await getSessionProfile()
  if (!user) redirect('/login')
  if (!isAdmin) redirect('/')
  const supabase = await createClient()

  const { data } = await supabase.rpc('templates_overview')
  const templates = (data ?? []) as TemplateOverview[]

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
        <AdminTabs active="plantillas" />

        <div className="viewscroll flex-1 overflow-y-auto px-6">
          <div className="w-full">
            <PlantillasView templates={templates} />
          </div>
        </div>
      </div>
    </div>
  )
}
