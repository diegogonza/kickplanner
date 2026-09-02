import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import Overview from '@/app/components/views/overview'
import ListView from '@/app/components/views/list-view'
import BoardView from '@/app/components/views/board-view'
import TagsView from '@/app/components/views/tags-view'
import CalendarView from '@/app/components/views/calendar-view'
import TaskPanel from '@/app/components/task-panel'
import TaskDetail from '@/app/components/task-detail'
import ShareButton from '@/app/components/share-button'
import NewTaskButton from '@/app/components/new-task-button'
import ProjectStatus, { type StatusUpdate } from '@/app/components/project-status'
import ApplyTemplateButton from '@/app/components/apply-template-button'
import { projectTypeOf, type Task, type Tag, type Member } from '@/app/projects/statuses'

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'lista', label: 'Lista' },
  { key: 'tablero', label: 'Tablero' },
  { key: 'calendario', label: 'Calendario' },
  { key: 'etiquetas', label: 'Etiquetas' },
]

const TASK_COLS =
  'id, title, status, priority, due_date, parent_id, description, assignee_id, drive_url, created_at, position'

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string; task?: string; hide?: string; overdue?: string }>
}) {
  const { id } = await params
  const { view, task: taskParam, hide, overdue: overdueParam } = await searchParams
  const active = TABS.some((t) => t.key === view) ? view! : 'lista'
  const hideDone = hide === 'done'
  const overdueOnly = overdueParam === '1'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, owner_id, status, type, client_id')
    .eq('id', id)
    .single()
  if (!project) redirect('/')

  const ptype = projectTypeOf(project.type)

  let clientName: string | null = null
  if (project.client_id) {
    const { data: cli } = await supabase.from('clients').select('name').eq('id', project.client_id).maybeSingle()
    clientName = cli?.name ?? null
  }

  const { data: tplData } = await supabase.rpc('templates_overview')
  const templates = (tplData ?? []) as { id: string; name: string; type: string; num_tasks: number }[]

  const isOwner = project.owner_id === user.id

  // Estado del proyecto: historial + conteo de vencidas (para la sugerencia "En riesgo")
  const { data: statusHistory } = await supabase.rpc('project_status_history', { p_project_id: id })
  const history = (statusHistory ?? []) as StatusUpdate[]
  const todayStr = new Date().toISOString().slice(0, 10)
  const { count: overdueCount } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', id)
    .lt('due_date', todayStr)
    .neq('status', 'done')
  const overdue = overdueCount ?? 0

  // Solo tareas de nivel superior (las subtareas viven en el panel)
  const { data: tasks } = await supabase
    .from('tasks')
    .select(TASK_COLS)
    .eq('project_id', id)
    .is('parent_id', null)
    .order('created_at', { ascending: true })

  const allTop = (tasks ?? []) as Task[]
  const list = hideDone ? allTop.filter((t) => t.status !== 'done') : allTop
  const closeHref = `/projects/${id}?view=${active}${hideDone ? '&hide=done' : ''}`

  // Filtro "vencidas": todas las tareas del proyecto (incl. subtareas) vencidas y sin completar
  let overdueTasks: Task[] = []
  if (overdueOnly) {
    const { data: od } = await supabase
      .from('tasks')
      .select(TASK_COLS)
      .eq('project_id', id)
      .lt('due_date', todayStr)
      .neq('status', 'done')
      .order('due_date', { ascending: true })
    overdueTasks = (od ?? []) as Task[]
  }

  // Subtareas del proyecto: conteo (tablero) + agrupadas por padre (expandir en la lista)
  const { data: subRows } = await supabase
    .from('tasks')
    .select(TASK_COLS)
    .eq('project_id', id)
    .not('parent_id', 'is', null)
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  const childrenByParent: Record<string, Task[]> = {}
  const subtaskCounts: Record<string, number> = {}
  for (const r of (subRows ?? []) as Task[]) {
    const p = r.parent_id
    if (!p) continue
    if (hideDone && r.status === 'done') continue
    ;(childrenByParent[p] ??= []).push(r)
    subtaskCounts[p] = (subtaskCounts[p] ?? 0) + 1
  }

  // Miembros del proyecto (para responsable y avatares)
  const { data: membersData } = await supabase.rpc('project_members_list', {
    p_project_id: id,
  })
  const members = (membersData ?? []) as Member[]
  const memberMap: Record<string, Member> = {}
  for (const m of members) memberMap[m.user_id] = m

  // Vista Etiquetas: agrupar tareas por etiqueta
  const taskTags: Record<string, Tag[]> = {}
  let usedTags: Tag[] = []
  if (active === 'etiquetas' && list.length > 0) {
    const { data: tt } = await supabase
      .from('task_tags')
      .select('task_id, tags(id, name, color)')
      .in(
        'task_id',
        list.map((t) => t.id)
      )
    const seen = new Map<string, Tag>()
    for (const row of tt ?? []) {
      const tag = (row as { tags: unknown }).tags as Tag
      if (!tag) continue
      ;(taskTags[(row as { task_id: string }).task_id] ??= []).push(tag)
      if (!seen.has(tag.id)) seen.set(tag.id, tag)
    }
    usedTags = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  // Vista Calendario: todas las tareas con fecha de entrega (incluye subtareas)
  let calTasks: Task[] = []
  if (active === 'calendario') {
    const { data: ct } = await supabase
      .from('tasks')
      .select(TASK_COLS)
      .eq('project_id', id)
      .not('due_date', 'is', null)
    const ctAll = (ct ?? []) as Task[]
    calTasks = hideDone ? ctAll.filter((t) => t.status !== 'done') : ctAll
  }

  // Datos del panel de detalle (si hay ?task=)
  let panelTask: Task | null = null
  let subtasks: Task[] = []
  let panelTags: Tag[] = []
  let allTags: Tag[] = []
  let ancestors: { id: string; title: string }[] = []
  let comments: {
    id: string
    body: string
    author_email: string
    author_id: string
    author_name: string | null
    author_avatar: string | null
    created_at: string
    mentions: { id: string; name: string | null; email: string; avatar: string | null }[]
  }[] = []
  let activity: {
    id: string
    actor_id: string
    actor_name: string | null
    actor_avatar: string | null
    actor_email: string | null
    type: string
    meta: { to?: string | null } | null
    created_at: string
  }[] = []
  if (taskParam) {
    const { data: t } = await supabase
      .from('tasks')
      .select(TASK_COLS)
      .eq('id', taskParam)
      .eq('project_id', id)
      .maybeSingle()
    if (t) {
      panelTask = t as Task

      const { data: subs } = await supabase
        .from('tasks')
        .select(TASK_COLS)
        .eq('parent_id', t.id)
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      subtasks = (subs ?? []) as Task[]

      const { data: tagRows } = await supabase
        .from('task_tags')
        .select('tags(id, name, color)')
        .eq('task_id', t.id)
      panelTags = ((tagRows ?? []).map((r) => r.tags).filter(Boolean) as unknown) as Tag[]

      const { data: commentsData } = await supabase.rpc('task_comments', {
        p_task_id: t.id,
      })
      comments = (commentsData ?? []) as typeof comments

      const { data: activityData } = await supabase.rpc('task_activity_feed', {
        p_task_id: t.id,
      })
      activity = (activityData ?? []) as typeof activity

      const { data: at } = await supabase
        .from('tags')
        .select('id, name, color')
        .order('name', { ascending: true })
      allTags = (at ?? []) as Tag[]

      // Cadena de ancestros (para el breadcrumb de subtareas)
      let pid = panelTask.parent_id
      let guard = 0
      while (pid && guard < 10) {
        const { data: anc } = await supabase
          .from('tasks')
          .select('id, title, parent_id')
          .eq('id', pid)
          .maybeSingle()
        if (!anc) break
        ancestors.unshift({ id: anc.id, title: anc.title })
        pid = anc.parent_id as string | null
        guard++
      }
    }
  }

  return (
    <div className="flex h-full">
      <Sidebar email={user.email ?? ''} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">
              <Link href="/" style={{ color: 'var(--text-3)' }}>
                Proyectos
              </Link>{' '}
              /{' '}
              {clientName && (
                <>
                  <Link href={`/?client=${project.client_id}`} style={{ color: 'var(--text-3)' }}>
                    {clientName}
                  </Link>{' '}
                  /{' '}
                </>
              )}
              <b>{project.name}</b>
            </div>
            <div className="flex items-center gap-3 proj-headline">
              <h1 className="page-title" style={{ margin: 0 }}>{project.name}</h1>
              <span className={`ptype ${ptype.cls}`} title={`Proyecto ${ptype.label}`}>{ptype.label}</span>
              <ProjectStatus projectId={project.id} status={project.status} overdue={overdue} history={history} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a className="btn btn-outline" href={`/api/export/tasks?project=${project.id}`} title="Exportar a Excel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Exportar
            </a>
            <ApplyTemplateButton projectId={project.id} projectType={project.type} templates={templates} />
            <NewTaskButton projectId={project.id} />
            <ShareButton projectId={project.id} isOwner={isOwner} currentUserId={user.id} />
          </div>
        </header>

        <div className="tabs">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/projects/${id}?view=${tab.key}${hideDone ? '&hide=done' : ''}`}
              className={`tab ${active === tab.key ? 'active' : ''}`}
            >
              {tab.label}
            </Link>
          ))}
          <Link
            href={`/projects/${id}?view=${active}${hideDone ? '' : '&hide=done'}${taskParam ? `&task=${taskParam}` : ''}`}
            className={`hide-done ${hideDone ? 'on' : ''}`}
            title={hideDone ? 'Mostrar tareas completadas' : 'Ocultar tareas completadas'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
              {hideDone ? (
                <>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <path d="M1 1l22 22" />
                </>
              ) : (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
            {hideDone ? 'Mostrar completadas' : 'Ocultar completadas'}
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {active === 'resumen' && <Overview tasks={list} />}
          {active === 'lista' && (
            <ListView
              projectId={project.id}
              view={active}
              tasks={list}
              memberMap={memberMap}
              members={members}
              subtaskCounts={subtaskCounts}
              childrenByParent={childrenByParent}
              hideDone={hideDone}
              overdueOnly={overdueOnly}
              overdueTasks={overdueTasks}
              clearOverdueHref={`/projects/${project.id}?view=lista`}
            />
          )}
          {active === 'tablero' && (
            <BoardView
              projectId={project.id}
              view={active}
              userId={user.id}
              tasks={list}
              subtaskCounts={subtaskCounts}
              memberMap={memberMap}
              hideDone={hideDone}
            />
          )}
          {active === 'calendario' && (
            <CalendarView projectId={project.id} view={active} tasks={calTasks} memberMap={memberMap} hideDone={hideDone} />
          )}
          {active === 'etiquetas' && (
            <TagsView
              projectId={project.id}
              view={active}
              tasks={list}
              taskTags={taskTags}
              usedTags={usedTags}
              memberMap={memberMap}
              subtaskCounts={subtaskCounts}
              hideDone={hideDone}
            />
          )}
        </div>
      </div>

      {panelTask && (
        <TaskPanel closeHref={closeHref}>
          <TaskDetail
            key={panelTask.id}
            task={panelTask}
            subtasks={subtasks}
            tags={panelTags}
            allTags={allTags}
            ancestors={ancestors}
            members={members}
            comments={comments}
            activity={activity}
            currentUserId={user.id}
            projectId={project.id}
            projectName={project.name}
            view={active}
            closeHref={closeHref}
          />
        </TaskPanel>
      )}
    </div>
  )
}
