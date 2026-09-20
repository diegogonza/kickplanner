import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSessionProfile } from "@/app/lib/session";
import Sidebar from "@/app/components/sidebar";
import Overview from "@/app/components/views/overview";
import ListView from "@/app/components/views/list-view";
import BoardView from "@/app/components/views/board-view";
import TagsView from "@/app/components/views/tags-view";
import CalendarView from "@/app/components/views/calendar-view";
import TaskDetail from "@/app/components/task-detail";
import ShareButton from "@/app/components/share-button";
import NewTaskButton from "@/app/components/new-task-button";
import ProjectStatus, {
  type StatusUpdate,
} from "@/app/components/project-status";
import ProjectMenu from "@/app/components/project-menu";
import TabLink from "@/app/components/tab-link";
import {
  projectTypeOf,
  type Task,
  type Tag,
  type Member,
} from "@/app/projects/statuses";

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "lista", label: "Lista" },
  { key: "tablero", label: "Tablero" },
  { key: "calendario", label: "Calendario" },
  { key: "etiquetas", label: "Etiquetas" },
];

// Íconos de línea de las pestañas (mismo trazo que el resto de la app)
const TAB_ICONS: Record<string, React.ReactNode> = {
  resumen: (
    <>
      <path d="M3 21h18" />
      <rect x="5" y="11" width="3" height="7" rx="0.5" />
      <rect x="10.5" y="5" width="3" height="13" rx="0.5" />
      <rect x="16" y="8" width="3" height="10" rx="0.5" />
    </>
  ),
  lista: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="2.6" />
    </>
  ),
  tablero: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </>
  ),
  calendario: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  etiquetas: (
    <>
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z" />
      <path d="M7.5 7.5h.01" strokeWidth="2.6" />
    </>
  ),
};

const TASK_COLS =
  "id, title, status, priority, due_date, parent_id, description, assignee_id, drive_url, created_at, position";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    view?: string;
    task?: string;
    hide?: string;
    overdue?: string;
  }>;
}) {
  const { id } = await params;
  const {
    view,
    task: taskParam,
    hide,
    overdue: overdueParam,
  } = await searchParams;
  const active = TABS.some((t) => t.key === view) ? view! : "lista";
  const hideDone = hide === "done";
  const overdueOnly = overdueParam === "1";

  // Sesión cacheada por request: la comparte con el sidebar (un solo chequeo).
  const { user, isAdmin } = await getSessionProfile();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  // ---- Tanda 1: todo lo que solo depende del id del proyecto (y de ?task),
  // en paralelo. Antes eran ~20 consultas en fila: cada una esperaba a la
  // anterior aunque no dependieran entre sí.
  const [
    { data: project },
    { data: statusHistory },
    { count: overdueCount },
    { data: tasks },
    { data: subRows },
    { data: membersData },
    { data: od },
    { data: ct },
    panel,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, owner_id, status, type, client_id, manager_id, start_date, fee, currency, url, description",
      )
      .eq("id", id)
      .single(),
    // Estado del proyecto: historial + conteo de vencidas (sugerencia "En riesgo")
    supabase.rpc("project_status_history", { p_project_id: id }),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id)
      .lt("due_date", todayStr)
      .neq("status", "done"),
    // Solo tareas de nivel superior (las subtareas viven en el panel)
    supabase
      .from("tasks")
      .select(TASK_COLS)
      .eq("project_id", id)
      .is("parent_id", null)
      .order("created_at", { ascending: true }),
    // Subtareas del proyecto: conteo (tablero) + agrupadas por padre (lista)
    supabase
      .from("tasks")
      .select(TASK_COLS)
      .eq("project_id", id)
      .not("parent_id", "is", null)
      .order("position", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    // Miembros del proyecto (responsable y avatares)
    supabase.rpc("project_members_list", { p_project_id: id }),
    // Filtro "vencidas": todas las tareas (incl. subtareas) vencidas y sin completar
    overdueOnly
      ? supabase
          .from("tasks")
          .select(TASK_COLS)
          .eq("project_id", id)
          .lt("due_date", todayStr)
          .neq("status", "done")
          .order("due_date", { ascending: true })
      : Promise.resolve({ data: null }),
    // Vista Calendario: todas las tareas con fecha (incluye subtareas)
    active === "calendario"
      ? supabase
          .from("tasks")
          .select(TASK_COLS)
          .eq("project_id", id)
          .not("due_date", "is", null)
      : Promise.resolve({ data: null }),
    // Panel de detalle (si hay ?task=): todas sus consultas a la vez. Usan el
    // id de la URL directamente; si la tarea no es de este proyecto, abajo se
    // descarta todo (y la RLS ya impide leer lo que no es tuyo).
    taskParam
      ? Promise.all([
          supabase
            .from("tasks")
            .select(TASK_COLS)
            .eq("id", taskParam)
            .eq("project_id", id)
            .maybeSingle(),
          supabase
            .from("tasks")
            .select(TASK_COLS)
            .eq("parent_id", taskParam)
            .order("position", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true }),
          supabase
            .from("task_tags")
            .select("tags(id, name, color)")
            .eq("task_id", taskParam),
          supabase.rpc("task_comments", { p_task_id: taskParam }),
          supabase.rpc("task_activity_feed", { p_task_id: taskParam }),
          supabase
            .from("tags")
            .select("id, name, color")
            .order("name", { ascending: true }),
        ])
      : Promise.resolve(null),
  ]);
  if (!project) redirect("/projects");

  const ptype = projectTypeOf(project.type);
  const history = (statusHistory ?? []) as StatusUpdate[];
  const overdue = overdueCount ?? 0;

  const allTop = (tasks ?? []) as Task[];
  const list = hideDone ? allTop.filter((t) => t.status !== "done") : allTop;
  const closeHref = `/projects/${id}?view=${active}${hideDone ? "&hide=done" : ""}`;
  const overdueTasks = (od ?? []) as Task[];

  const childrenByParent: Record<string, Task[]> = {};
  const subtaskCounts: Record<string, number> = {};
  for (const r of (subRows ?? []) as Task[]) {
    const p = r.parent_id;
    if (!p) continue;
    if (hideDone && r.status === "done") continue;
    (childrenByParent[p] ??= []).push(r);
    subtaskCounts[p] = (subtaskCounts[p] ?? 0) + 1;
  }

  const members = (membersData ?? []) as Member[];
  const memberMap: Record<string, Member> = {};
  for (const m of members) memberMap[m.user_id] = m;

  const ctAll = (ct ?? []) as Task[];
  const calTasks = hideDone ? ctAll.filter((t) => t.status !== "done") : ctAll;

  // Panel de detalle
  let panelTask: Task | null = null;
  let subtasks: Task[] = [];
  let panelTags: Tag[] = [];
  let allTags: Tag[] = [];
  let comments: {
    id: string;
    body: string;
    author_email: string;
    author_id: string;
    author_name: string | null;
    author_avatar: string | null;
    created_at: string;
    edited_at: string | null;
    mentions: {
      id: string;
      name: string | null;
      email: string;
      avatar: string | null;
    }[];
  }[] = [];
  let activity: {
    id: string;
    actor_id: string;
    actor_name: string | null;
    actor_avatar: string | null;
    actor_email: string | null;
    type: string;
    meta: { to?: string | null } | null;
    created_at: string;
  }[] = [];
  if (panel && panel[0].data) {
    const [t, subs, tagRows, commentsRes, activityRes, at] = panel;
    panelTask = t.data as unknown as Task;
    subtasks = (subs.data ?? []) as Task[];
    panelTags = (tagRows.data ?? [])
      .map((r) => r.tags)
      .filter(Boolean) as unknown as Tag[];
    comments = (commentsRes.data ?? []) as typeof comments;
    activity = (activityRes.data ?? []) as typeof activity;
    allTags = (at.data ?? []) as Tag[];
  }

  // ---- Tanda 2: lo que depende de la tanda 1, también en paralelo. Cada
  // bloque devuelve su resultado (nada de mutar variables desde afuera).
  const [clientInfo, tagInfo, ancestors] = await Promise.all([
    // Cliente y enlace al portal: el portal solo si tiene acceso creado y
    // encendido; si no, no hay nada que abrir.
    (async () => {
      if (!project.client_id) return { clientName: null, portalSlug: null };
      const [{ data: cli }, { data: acc }] = await Promise.all([
        supabase
          .from("clients")
          .select("name")
          .eq("id", project.client_id)
          .maybeSingle(),
        supabase
          .from("portal_access")
          .select("slug, enabled")
          .eq("client_id", project.client_id)
          .maybeSingle(),
      ]);
      return {
        clientName: (cli?.name as string | undefined) ?? null,
        portalSlug: acc?.enabled ? (acc.slug as string) : null,
      };
    })(),
    // Vista Etiquetas: agrupar tareas por etiqueta
    (async () => {
      const taskTags: Record<string, Tag[]> = {};
      if (active !== "etiquetas" || list.length === 0)
        return { taskTags, usedTags: [] as Tag[] };
      const { data: tt } = await supabase
        .from("task_tags")
        .select("task_id, tags(id, name, color)")
        .in(
          "task_id",
          list.map((t) => t.id),
        );
      const seen = new Map<string, Tag>();
      for (const row of tt ?? []) {
        const tag = (row as { tags: unknown }).tags as Tag;
        if (!tag) continue;
        (taskTags[(row as { task_id: string }).task_id] ??= []).push(tag);
        if (!seen.has(tag.id)) seen.set(tag.id, tag);
      }
      const usedTags = Array.from(seen.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      return { taskTags, usedTags };
    })(),
    // Cadena de ancestros (breadcrumb de subtareas). Es secuencial por
    // naturaleza, pero solo corre con una subtarea abierta.
    (async () => {
      const chain: { id: string; title: string }[] = [];
      let pid = panelTask?.parent_id ?? null;
      let guard = 0;
      while (pid && guard < 10) {
        const { data: anc } = await supabase
          .from("tasks")
          .select("id, title, parent_id")
          .eq("id", pid)
          .maybeSingle();
        if (!anc) break;
        chain.unshift({ id: anc.id, title: anc.title });
        pid = anc.parent_id as string | null;
        guard++;
      }
      return chain;
    })(),
  ]);
  const { clientName, portalSlug } = clientInfo;
  const { taskTags, usedTags } = tagInfo;

  return (
    <div className="flex h-full">
      <Sidebar email={user.email} active="projects" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: "none" }}>
          <div>
            <nav className="breadcrumb proj-crumbs" aria-label="Ruta">
              <svg
                className="proj-crumbs-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              </svg>
              <Link href="/projects">Proyectos</Link>
              <span className="proj-crumbs-sep" aria-hidden="true">
                /
              </span>
              {clientName && (
                <>
                  <Link href={`/projects?client=${project.client_id}`}>
                    {clientName}
                  </Link>
                  <span className="proj-crumbs-sep" aria-hidden="true">
                    /
                  </span>
                </>
              )}
              <span className="proj-crumbs-current" aria-current="page">
                {project.name}
              </span>
            </nav>
            <div className="flex items-center gap-3 proj-headline">
              <div className="proj-title">
                <h1 className="page-title" style={{ margin: 0 }}>
                  {project.name}
                  <span className="proj-title-type" title={`Proyecto ${ptype.label}`}>
                    | {ptype.label}
                  </span>
                </h1>
                <ProjectMenu
                  project={{
                    id: project.id,
                    name: project.name,
                    type: project.type,
                    status: project.status,
                    client_id: project.client_id,
                    manager_id: project.manager_id,
                    start_date: project.start_date,
                    fee: project.fee,
                    currency: project.currency,
                    url: project.url,
                    description: project.description,
                  }}
                  isAdmin={isAdmin}
                  showSeo={project.type === "seo" && !!project.client_id}
                />
              </div>
              <ProjectStatus
                projectId={project.id}
                status={project.status}
                overdue={overdue}
                history={history}
              />
              {portalSlug && (
                <a
                  href={`/portal/${portalSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="count-badge"
                  style={{
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  title={`Abrir el portal de ${clientName ?? "el cliente"}`}
                >
                  Portal del cliente
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 12, height: 12 }}
                  >
                    <path d="M15 3h6v6" />
                    <path d="M10 14 21 3" />
                    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                  </svg>
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NewTaskButton projectId={project.id} />
            <ShareButton
              projectId={project.id}
              canManage={isAdmin}
              currentUserId={user.id}
            />
          </div>
        </header>

        <div className="tabs">
          {TABS.map((tab) => (
            <TabLink
              key={tab.key}
              href={`/projects/${id}?view=${tab.key}${hideDone ? "&hide=done" : ""}`}
              active={active === tab.key}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {TAB_ICONS[tab.key]}
              </svg>
              {tab.label}
            </TabLink>
          ))}
          <Link
            href={`/projects/${id}?view=${active}${hideDone ? "" : "&hide=done"}${taskParam ? `&task=${taskParam}` : ""}`}
            className={`hide-done ${hideDone ? "on" : ""}`}
            title={
              hideDone ?
                "Mostrar tareas completadas"
              : "Ocultar tareas completadas"
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="15"
              height="15"
            >
              {hideDone ?
                <>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <path d="M1 1l22 22" />
                </>
              : <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              }
            </svg>
            {hideDone ? "Mostrar completadas" : "Ocultar completadas"}
          </Link>
        </div>

        <div className="viewscroll flex-1 overflow-y-auto px-6">
          {active === "resumen" && <Overview tasks={list} />}
          {active === "lista" && (
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
          {active === "tablero" && (
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
          {active === "calendario" && (
            <CalendarView
              projectId={project.id}
              view={active}
              tasks={calTasks}
              memberMap={memberMap}
              hideDone={hideDone}
            />
          )}
          {active === "etiquetas" && (
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
      )}
    </div>
  );
}
