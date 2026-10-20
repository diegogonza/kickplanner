import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import { getMcpSession } from '@/utils/supabase/mcp'

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const TZ = 'America/Bogota'

function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

function ok(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  }
}

function fail(mensaje: string) {
  return {
    content: [{ type: 'text' as const, text: `Error: ${mensaje}` }],
    isError: true,
  }
}

/** Envuelve el handler para que cualquier excepcion vuelva como error MCP legible. */
function guard<T>(fn: (args: T) => Promise<ReturnType<typeof ok>>) {
  return async (args: T) => {
    try {
      return await fn(args)
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e))
    }
  }
}

type TaskRow = {
  id: string
  title: string
  status: string
  priority: string | null
  due_date: string | null
  project_id: string
  project_name: string
  assignee_id: string | null
  assignee_name: string | null
  assignee_email: string | null
}

function compactarTarea(t: TaskRow) {
  return {
    id: t.id,
    titulo: t.title,
    estado: t.status,
    prioridad: t.priority,
    vence: t.due_date,
    proyecto: t.project_name,
    proyecto_id: t.project_id,
    responsable: t.assignee_name ?? t.assignee_email ?? null,
    responsable_id: t.assignee_id,
  }
}

const ESTADOS_TAREA = ['todo', 'doing', 'done'] as const
const PRIORIDADES = ['urgente', 'alta', 'media', 'baja'] as const
const ESTADOS_PROYECTO = ['on_track', 'at_risk', 'on_hold', 'upcoming'] as const

/* ------------------------------------------------------------------ */
/* Registro de herramientas                                            */
/* ------------------------------------------------------------------ */

export function registrarHerramientas(server: McpServer) {
  /* ---------------------------- Proyectos --------------------------- */

  server.registerTool(
    'listar_proyectos',
    {
      title: 'Listar proyectos',
      description:
        'Lista los proyectos del workspace con su cliente, estado, tipo (seo/web), responsable, numero de tareas y cuantas estan vencidas. Usala primero cuando necesites el id de un proyecto.',
      inputSchema: z.object({
        q: z.string().optional().describe('Filtra por nombre de proyecto o de cliente'),
        estado: z.enum([...ESTADOS_PROYECTO, 'todos']).default('todos'),
        tipo: z.enum(['seo', 'web', 'todos']).default('todos'),
        solo_con_vencidas: z.boolean().default(false).describe('Solo proyectos con tareas vencidas'),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(async ({ q, estado, tipo, solo_con_vencidas }) => {
      const { db } = await getMcpSession()
      const { data, error } = await db.rpc('projects_overview')
      if (error) throw new Error(error.message)

      const texto = (q ?? '').trim().toLowerCase()
      const filas = (data ?? [])
        .filter((p: Record<string, unknown>) => {
          const nombre = String(p.name ?? '').toLowerCase()
          const cliente = String(p.client ?? '').toLowerCase()
          if (texto && !nombre.includes(texto) && !cliente.includes(texto)) return false
          if (estado !== 'todos' && p.status !== estado) return false
          if (tipo !== 'todos' && p.type !== tipo) return false
          if (solo_con_vencidas && Number(p.overdue ?? 0) === 0) return false
          return true
        })
        .map((p: Record<string, unknown>) => ({
          id: p.id,
          nombre: p.name,
          cliente: p.client,
          estado: p.status,
          nota_estado: p.status_note,
          tipo: p.type,
          responsable: p.manager,
          tareas: p.num_tasks,
          vencidas: p.overdue,
          ultima_actividad: p.last_activity,
          url: p.url,
        }))

      return ok({ total: filas.length, proyectos: filas })
    })
  )

  server.registerTool(
    'actualizar_estado_proyecto',
    {
      title: 'Actualizar estado de proyecto',
      description:
        'Publica una actualizacion de estado del proyecto (on_track, at_risk, on_hold, upcoming) con una nota opcional. Queda registrada en el historial de estados.',
      inputSchema: z.object({
        proyecto_id: z.string().uuid(),
        estado: z.enum(ESTADOS_PROYECTO),
        nota: z.string().max(2000).optional(),
      }),
    },
    guard(async ({ proyecto_id, estado, nota }) => {
      const { db } = await getMcpSession()
      const { error } = await db.rpc('set_project_status', {
        p_project_id: proyecto_id,
        p_status: estado,
        p_note: nota ?? null,
      })
      if (error) throw new Error(error.message)
      return ok(`Estado del proyecto actualizado a "${estado}".`)
    })
  )

  server.registerTool(
    'historial_estados_proyecto',
    {
      title: 'Historial de estados de un proyecto',
      description: 'Ultimas actualizaciones de estado publicadas en un proyecto, de la mas reciente a la mas antigua.',
      inputSchema: z.object({
        proyecto_id: z.string().uuid(),
        limite: z.number().int().min(1).max(50).default(10),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(async ({ proyecto_id, limite }) => {
      const { db } = await getMcpSession()
      const { data, error } = await db
        .from('project_status_updates')
        .select('status, note, created_at')
        .eq('project_id', proyecto_id)
        .order('created_at', { ascending: false })
        .limit(limite)
      if (error) throw new Error(error.message)
      return ok(data ?? [])
    })
  )

  /* ------------------------------ Tareas ---------------------------- */

  server.registerTool(
    'buscar_tareas',
    {
      title: 'Buscar tareas',
      description:
        'Busca tareas en los proyectos accesibles, con filtros por texto, proyecto, estado, responsable y vencimiento. Devuelve como maximo 200 resultados.',
      inputSchema: z.object({
        q: z.string().optional().describe('Texto contenido en el titulo'),
        proyecto_id: z.string().uuid().optional(),
        estado: z.enum([...ESTADOS_TAREA, 'open', 'all']).default('open').describe('"open" = todo lo que no esta done'),
        responsable_id: z.string().uuid().optional(),
        mias: z.boolean().default(false).describe('Solo tareas asignadas a la cuenta del MCP'),
        vencimiento: z.enum(['any', 'overdue', 'today', 'week', 'none', 'range']).default('any'),
        desde: z.string().optional().describe('YYYY-MM-DD, solo con vencimiento="range"'),
        hasta: z.string().optional().describe('YYYY-MM-DD, solo con vencimiento="range"'),
        incluir_subtareas: z.boolean().default(true),
        limite: z.number().int().min(1).max(200).default(50),
      }),
      annotations: { readOnlyHint: true },
    },
    guard(async ({ q, proyecto_id, estado, responsable_id, mias, vencimiento, desde, hasta, incluir_subtareas, limite }) => {
      const { db } = await getMcpSession()
      const { data, error } = await db.rpc('search_tasks_adv', {
        p_q: q ?? '',
        p_status: estado,
        p_assignee: responsable_id ?? null,
        p_assignee_me: mias,
        p_project: proyecto_id ?? null,
        p_due: vencimiento,
        p_include_subtasks: incluir_subtareas,
        p_from: desde ?? null,
        p_to: hasta ?? null,
      })
      if (error) throw new Error(error.message)
      const filas = (data ?? []) as TaskRow[]
      return ok({
        total: filas.length,
        mostradas: Math.min(filas.length, limite),
        tareas: filas.slice(0, limite).map(compactarTarea),
      })
    })
  )

  server.registerTool(
    'mis_tareas',
    {
      title: 'Mis tareas',
      description:
        'Tareas abiertas asignadas a la cuenta del MCP, agrupadas en vencidas, hoy, esta semana, mas adelante y sin fecha.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    guard(async () => {
      const { db } = await getMcpSession()
      const { data, error } = await db.rpc('search_tasks_adv', {
        p_q: '',
        p_status: 'open',
        p_assignee: null,
        p_assignee_me: true,
        p_project: null,
        p_due: 'any',
        p_include_subtasks: true,
        p_from: null,
        p_to: null,
      })
      if (error) throw new Error(error.message)

      const dia = hoy()
      const enUnaSemana = new Date(`${dia}T00:00:00Z`)
      enUnaSemana.setUTCDate(enUnaSemana.getUTCDate() + 7)
      const limiteSemana = enUnaSemana.toISOString().slice(0, 10)

      const grupos: Record<string, ReturnType<typeof compactarTarea>[]> = {
        vencidas: [],
        hoy: [],
        esta_semana: [],
        mas_adelante: [],
        sin_fecha: [],
      }
      for (const t of (data ?? []) as TaskRow[]) {
        const c = compactarTarea(t)
        if (!t.due_date) grupos.sin_fecha.push(c)
        else if (t.due_date < dia) grupos.vencidas.push(c)
        else if (t.due_date === dia) grupos.hoy.push(c)
        else if (t.due_date < limiteSemana) grupos.esta_semana.push(c)
        else grupos.mas_adelante.push(c)
      }
      return ok({ fecha: dia, ...grupos })
    })
  )

  server.registerTool(
    'detalle_tarea',
    {
      title: 'Detalle de una tarea',
      description:
        'Devuelve una tarea completa: descripcion, responsable, subtareas, comentarios e historial de actividad.',
      inputSchema: z.object({ tarea_id: z.string().uuid() }),
      annotations: { readOnlyHint: true },
    },
    guard(async ({ tarea_id }) => {
      const { db } = await getMcpSession()
      const { data: tarea, error } = await db
        .from('tasks')
        .select('id, title, description, status, priority, due_date, drive_url, project_id, parent_id, assignee_id, created_at')
        .eq('id', tarea_id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!tarea) return fail('No existe esa tarea o no es accesible con esta cuenta.')

      const [proyecto, subtareas, comentarios, actividad, perfiles] = await Promise.all([
        db.from('projects').select('name').eq('id', tarea.project_id).maybeSingle(),
        db.from('tasks').select('id, title, status, due_date, assignee_id').eq('parent_id', tarea_id).order('position'),
        db.from('comments').select('id, body, created_at, author_id').eq('task_id', tarea_id).order('created_at'),
        db.rpc('task_activity_feed', { p_task_id: tarea_id }),
        db.from('profiles').select('id, full_name'),
      ])

      const nombres = new Map<string, string>()
      for (const p of (perfiles.data ?? []) as { id: string; full_name: string | null }[]) {
        if (p.full_name) nombres.set(p.id, p.full_name)
      }

      return ok({
        id: tarea.id,
        titulo: tarea.title,
        descripcion: tarea.description,
        estado: tarea.status,
        prioridad: tarea.priority,
        vence: tarea.due_date,
        drive_url: tarea.drive_url,
        proyecto: proyecto.data?.name ?? null,
        proyecto_id: tarea.project_id,
        tarea_padre_id: tarea.parent_id,
        responsable: tarea.assignee_id ? nombres.get(tarea.assignee_id) ?? tarea.assignee_id : null,
        responsable_id: tarea.assignee_id,
        creada: tarea.created_at,
        subtareas: (subtareas.data ?? []).map((s: Record<string, unknown>) => ({
          id: s.id,
          titulo: s.title,
          estado: s.status,
          vence: s.due_date,
          responsable: s.assignee_id ? nombres.get(String(s.assignee_id)) ?? s.assignee_id : null,
        })),
        comentarios: (comentarios.data ?? []).map((c: Record<string, unknown>) => ({
          autor: nombres.get(String(c.author_id)) ?? c.author_id,
          fecha: c.created_at,
          texto: c.body,
        })),
        actividad: (actividad.data ?? []).map((a: Record<string, unknown>) => ({
          tipo: a.type,
          actor: a.actor_name ?? a.actor_email,
          fecha: a.created_at,
          detalle: a.meta,
        })),
      })
    })
  )

  server.registerTool(
    'crear_tarea',
    {
      title: 'Crear tarea',
      description:
        'Crea una tarea en un proyecto. Si se pasa tarea_padre_id, se crea como subtarea. Devuelve el id de la tarea creada.',
      inputSchema: z.object({
        proyecto_id: z.string().uuid(),
        titulo: z.string().min(1).max(300),
        descripcion: z.string().max(5000).optional(),
        fecha_limite: z.string().optional().describe('YYYY-MM-DD'),
        prioridad: z.enum(PRIORIDADES).optional(),
        responsable_id: z.string().uuid().optional(),
        tarea_padre_id: z.string().uuid().optional(),
      }),
    },
    guard(async ({ proyecto_id, titulo, descripcion, fecha_limite, prioridad, responsable_id, tarea_padre_id }) => {
      const { db, userId } = await getMcpSession()

      let consulta = db.from('tasks').select('position').eq('project_id', proyecto_id)
      consulta = tarea_padre_id ? consulta.eq('parent_id', tarea_padre_id) : consulta.is('parent_id', null)
      const { data: ultima } = await consulta
        .order('position', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()

      const { data: creada, error } = await db
        .from('tasks')
        .insert({
          project_id: proyecto_id,
          title: titulo,
          description: descripcion ?? null,
          due_date: fecha_limite ?? null,
          priority: prioridad ?? null,
          parent_id: tarea_padre_id ?? null,
          status: 'todo',
          position: (ultima?.position ?? 0) + 1,
          created_by: userId,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)

      await db.from('task_activity').insert({ task_id: creada.id, type: 'created', meta: {} })
      if (responsable_id) {
        await db.rpc('set_task_assignee', { p_task_id: creada.id, p_assignee: responsable_id })
      }

      return ok({ id: creada.id, mensaje: `Tarea "${titulo}" creada.` })
    })
  )

  server.registerTool(
    'actualizar_tarea',
    {
      title: 'Actualizar tarea',
      description:
        'Cambia campos de una tarea existente. Solo se modifican los campos enviados; pasar null en fecha_limite, prioridad o responsable_id los deja vacios.',
      inputSchema: z.object({
        tarea_id: z.string().uuid(),
        titulo: z.string().min(1).max(300).optional(),
        descripcion: z.string().max(5000).nullable().optional(),
        estado: z.enum(ESTADOS_TAREA).optional(),
        prioridad: z.enum(PRIORIDADES).nullable().optional(),
        fecha_limite: z.string().nullable().optional().describe('YYYY-MM-DD o null'),
        responsable_id: z.string().uuid().nullable().optional(),
        drive_url: z.string().url().nullable().optional(),
      }),
    },
    guard(async ({ tarea_id, titulo, descripcion, estado, prioridad, fecha_limite, responsable_id, drive_url }) => {
      const { db } = await getMcpSession()

      const cambios: Record<string, unknown> = {}
      if (titulo !== undefined) cambios.title = titulo
      if (descripcion !== undefined) cambios.description = descripcion
      if (estado !== undefined) cambios.status = estado
      if (prioridad !== undefined) cambios.priority = prioridad
      if (fecha_limite !== undefined) cambios.due_date = fecha_limite
      if (drive_url !== undefined) cambios.drive_url = drive_url

      if (Object.keys(cambios).length > 0) {
        // RLS filtra en silencio: sin .select() un update sobre una tarea ajena
        // devolveria 0 filas sin error y estariamos mintiendo al decir "actualizada".
        const { data: afectadas, error } = await db.from('tasks').update(cambios).eq('id', tarea_id).select('id')
        if (error) throw new Error(error.message)
        if (!afectadas || afectadas.length === 0) {
          return fail('No existe esa tarea o no tienes acceso a su proyecto.')
        }

        const actividad: { task_id: string; type: string; meta: Record<string, unknown> }[] = []
        if (estado !== undefined) actividad.push({ task_id: tarea_id, type: 'status', meta: { to: estado } })
        if (prioridad !== undefined) actividad.push({ task_id: tarea_id, type: 'priority', meta: { to: prioridad } })
        if (fecha_limite !== undefined) actividad.push({ task_id: tarea_id, type: 'due', meta: { to: fecha_limite } })
        if (actividad.length > 0) await db.from('task_activity').insert(actividad)
      }

      if (responsable_id !== undefined) {
        const { error } = await db.rpc('set_task_assignee', { p_task_id: tarea_id, p_assignee: responsable_id })
        if (error) throw new Error(error.message)
      }

      return ok('Tarea actualizada.')
    })
  )

  server.registerTool(
    'completar_tarea',
    {
      title: 'Completar o reabrir tarea',
      description: 'Marca una tarea como completada (done) o la reabre (todo).',
      inputSchema: z.object({
        tarea_id: z.string().uuid(),
        reabrir: z.boolean().default(false).describe('true devuelve la tarea a pendiente'),
      }),
    },
    guard(async ({ tarea_id, reabrir }) => {
      const { db } = await getMcpSession()
      const estado = reabrir ? 'todo' : 'done'
      const { data: afectadas, error } = await db
        .from('tasks')
        .update({ status: estado })
        .eq('id', tarea_id)
        .select('id')
      if (error) throw new Error(error.message)
      if (!afectadas || afectadas.length === 0) {
        return fail('No existe esa tarea o no tienes acceso a su proyecto.')
      }
      await db.from('task_activity').insert({ task_id: tarea_id, type: 'status', meta: { to: estado } })
      return ok(reabrir ? 'Tarea reabierta.' : 'Tarea completada.')
    })
  )

  server.registerTool(
    'comentar_tarea',
    {
      title: 'Comentar una tarea',
      description:
        'Publica un comentario en una tarea. Si se pasan menciones (ids de usuario), esas personas reciben notificacion.',
      inputSchema: z.object({
        tarea_id: z.string().uuid(),
        texto: z.string().min(1).max(5000),
        menciones: z.array(z.string().uuid()).default([]),
      }),
    },
    guard(async ({ tarea_id, texto, menciones }) => {
      const { db } = await getMcpSession()
      const { data, error } = await db.rpc('post_comment', {
        p_task_id: tarea_id,
        p_body: texto,
        p_mentions: menciones,
      })
      if (error) throw new Error(error.message)
      return ok({ comentario_id: data, mensaje: 'Comentario publicado.' })
    })
  )

  /* --------------------- Personas, clientes, pagos ------------------ */

  server.registerTool(
    'listar_personas',
    {
      title: 'Listar personas del workspace',
      description:
        'Personas del workspace con su id, nombre y correo. Usala para traducir un nombre a responsable_id antes de asignar una tarea o mencionar a alguien.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    guard(async () => {
      const { db } = await getMcpSession()
      const { data, error } = await db.rpc('workspace_members')
      if (error) throw new Error(error.message)
      return ok(
        (data ?? []).map((p: Record<string, unknown>) => ({
          id: p.user_id,
          nombre: p.full_name,
          email: p.email,
        }))
      )
    })
  )

  server.registerTool(
    'listar_clientes',
    {
      title: 'Listar clientes',
      description: 'Clientes de la agencia con su numero de proyectos SEO y web, telefono y sitio web.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    guard(async () => {
      const { db } = await getMcpSession()
      const { data, error } = await db.rpc('clients_overview')
      if (error) throw new Error(error.message)
      return ok(
        (data ?? []).map((c: Record<string, unknown>) => ({
          id: c.id,
          nombre: c.name,
          proyectos: c.num_projects,
          seo: c.seo_count,
          web: c.web_count,
          telefono: c.phone,
          sitio: c.website,
        }))
      )
    })
  )

  server.registerTool(
    'resumen_pagos',
    {
      title: 'Resumen de pagos de clientes',
      description:
        'Estado de cobros: cuotas recurrentes e installments por proyecto, con montos, moneda, estado (pending/paid) y periodo.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    guard(async () => {
      const { db } = await getMcpSession()
      const { data, error } = await db.rpc('payments_data')
      if (error) throw new Error(error.message)
      return ok(data)
    })
  )

  server.registerTool(
    'panel_agencia',
    {
      title: 'Panel de la agencia',
      description:
        'Resumen ejecutivo del workspace: carga por persona, proyectos en riesgo, tareas vencidas y actividad reciente.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    guard(async () => {
      const { db } = await getMcpSession()
      const { data, error } = await db.rpc('pm_dashboard')
      if (error) throw new Error(error.message)
      return ok(data)
    })
  )
}
