import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import Overview from '@/app/components/views/overview'
import ListView from '@/app/components/views/list-view'
import BoardView from '@/app/components/views/board-view'
import TagsView from '@/app/components/views/tags-view'
import TaskPanel from '@/app/components/task-panel'
import TaskDetail from '@/app/components/task-detail'
import ShareButton from '@/app/components/share-button'
import NewTaskButton from '@/app/components/new-task-button'
import type { Task, Tag, Member } from '@/app/projects/statuses'

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'lista', label: 'Lista' },
  { key: 'tablero', label: 'Tablero' },
  { key: 'etiquetas', label: 'Etiquetas' },
]

const TASK_COLS =
  'id, title, status, priority, due_date, parent_id, description, assignee_id, created_at'

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string; task?: string }>
}) {
  const { id } = await params
  const { view, task: taskParam } = await searchParams
  const active = TABS.some((t) => t.key === view) ? view! : 'lista'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, owner_id')
    .eq('id', id)
    .single()
  if (!project) redirect('/')

  const isOwner = project.owner_id === user.id

  // Solo tareas de nivel superior (las subtareas viven en el panel)
  const { data: tasks } = await supabase
    .from('tasks')
    .select(TASK_COLS)
    .eq('project_id', id)
    .is('parent_id', null)
    .order('created_at', { ascending: true })

  const list = (tasks ?? []) as Task[]
  const closeHref = `/projects/${id}?view=${active}`

  // Subtareas del proyecto: conteo (tablero) + agrupadas por padre (expandir en la lista)
  const { data: subRows } = await supabase
    .from('tasks')
    .select(TASK_COLS)
    .eq('project_id', id)
    .not('parent_id', 'is', null)
    .order('created_at', { ascending: true })
  const childrenByParent: Record<string, Task[]> = {}
  const subtaskCounts: Record<string, number> = {}
  for (const r of (subRows ?? []) as Task[]) {
    const p = r.parent_id
    if (!p) continue
    ;(childrenByParent[p] ??= []).push(r)
    subtaskCounts[p] = (subtaskCounts[p] ?? 0) + 1
  }

  // Miembros del proyecto (para responsable y avatares)
  const { data: membersData } = await supabase.rpc('project_members_list', {
    p_project_id: id,
  })
  const members = (membersData ?? []) as Member[]
  const memberMap: Record<string, string> = {}
  for (const m of members) memberMap[m.user_id] = m.email

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
    <div className="flex h-screen">
      <Sidebar email={user.email ?? ''} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">
              <Link href="/" style={{ color: 'var(--text-3)' }}>
                Proyectos
              </Link>{' '}
              / <b>{project.name}</b>
            </div>
            <h1 className="page-title">{project.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <NewTaskButton projectId={project.id} />
            <ShareButton projectId={project.id} isOwner={isOwner} currentUserId={user.id} />
          </div>
        </header>

        <div className="tabs">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/projects/${id}?view=${tab.key}`}
              className={`tab ${active === tab.key ? 'active' : ''}`}
            >
              {tab.label}
            </Link>
          ))}
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
            />
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
            />
          )}
        </div>
      </div>

      {panelTask && (
        <TaskPanel closeHref={closeHref}>
          <TaskDetail
            task={panelTask}
            subtasks={subtasks}
            tags={panelTags}
            allTags={allTags}
            ancestors={ancestors}
            members={members}
            comments={comments}
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
