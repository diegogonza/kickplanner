import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import SeoPropertyPanel, { type EstadoPropiedad } from '@/app/components/seo-property-panel'

export const dynamic = 'force-dynamic'

export default async function SeoDatosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, type, client_id')
    .eq('id', id)
    .maybeSingle()
  if (!project) redirect('/projects')

  // Todo lo que sigue tolera fallos: la pantalla se dibuja igual.
  let estado: EstadoPropiedad | null = null
  try {
    const { data } = await supabase
      .from('gsc_properties')
      .select('site_url, backfilled_at, last_sync_at, last_error')
      .eq('project_id', id)
      .maybeSingle()
    estado = (data as EstadoPropiedad) ?? null
  } catch {
    estado = null
  }

  let googleConectado = false
  try {
    const { data } = await supabase.rpc('google_oauth_estado')
    googleConectado = ((data ?? {}) as { conectado?: boolean }).conectado === true
  } catch {
    googleConectado = false
  }

  let meses = 0
  try {
    const { count } = await supabase
      .from('gsc_monthly')
      .select('month', { count: 'exact', head: true })
      .eq('project_id', id)
    meses = count ?? 0
  } catch {
    meses = 0
  }

  return (
    <div className="flex h-full">
      <Sidebar active="projects" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">
              <Link href="/projects" style={{ color: 'var(--text-3)' }}>Proyectos</Link> /{' '}
              <Link href={`/projects/${id}`} style={{ color: 'var(--text-3)' }}>{project.name}</Link> /{' '}
              <b>Search Console</b>
            </div>
            <h1 className="page-title" style={{ margin: 0 }}>
              Datos de Search Console
              {meses > 0 && <span className="count-badge">{meses} meses</span>}
            </h1>
          </div>
          <Link className="btn btn-outline" href={`/projects/${id}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Volver al proyecto
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {project.type !== 'seo' ? (
            <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
              <p className="card-title mb-1">Este proyecto no es de SEO</p>
              <p className="card-desc">
                Los datos de Search Console solo se muestran en proyectos de tipo SEO. Los
                proyectos web conservan el porcentaje de avance en el portal.
              </p>
            </div>
          ) : !project.client_id ? (
            <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
              <p className="card-title mb-1">Este proyecto no tiene cliente asignado</p>
              <p className="card-desc">
                El portal se organiza por cliente. Asignale uno desde la vista de Proyectos
                y volvé acá.
              </p>
            </div>
          ) : (
            <SeoPropertyPanel projectId={id} estado={estado} googleConectado={googleConectado} />
          )}
        </div>
      </div>
    </div>
  )
}
