import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import PlantillasView, { type TemplateOverview } from '@/app/components/plantillas-view'

export default async function PlantillasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase.rpc('templates_overview')
  const templates = (data ?? []) as TemplateOverview[]

  return (
    <div className="flex h-full">
      <Sidebar active="plantillas" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">
              Plantillas
              <span className="count-badge">{templates.length}</span>
            </h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="w-full">
            <PlantillasView templates={templates} />
          </div>
        </div>
      </div>
    </div>
  )
}
