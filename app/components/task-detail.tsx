'use client'

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import {
  displayName,
  STATUSES,
  PRIORITIES,
  type Status,
  type Priority,
  type Task,
  type Tag,
  type Member,
} from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'
import { deleteComment } from '@/app/projects/actions'
import TaskPanel from '@/app/components/task-panel'
import { toast } from '@/app/components/toast'
import StatusSelect from '@/app/components/status-select'
import TaskActionsMenu from '@/app/components/task-actions-menu'
import PrioritySelect from '@/app/components/priority-select'
import DueDateField from '@/app/components/due-date-field'
import TagSelect from '@/app/components/tag-select'
import DescriptionInput from '@/app/components/description-input'
import AssigneeSelect from '@/app/components/assignee-select'
import DriveField from '@/app/components/drive-field'
import InlineTaskTitle from '@/app/components/inline-task-title'
import SubtaskList from '@/app/components/subtask-list'
import CommentEditor from '@/app/components/comment-editor'
import CommentBody from '@/app/components/comment-body'
import { must, type JobOpts } from '@/app/lib/write'
import { confirmCompleteSubtasks } from '@/app/lib/complete-subtasks'

type Ancestor = { id: string; title: string }
type Mention = { id: string; name: string | null; email: string; avatar: string | null }
type Comment = {
  id: string
  body: string
  author_email: string
  author_id: string
  author_name: string | null
  author_avatar: string | null
  created_at: string
  edited_at: string | null
  mentions: Mention[]
}

type Activity = {
  id: string
  actor_id: string
  actor_name: string | null
  actor_avatar: string | null
  actor_email: string | null
  type: string
  meta: { to?: string | null } | null
  created_at: string
}

// Campos que el modal edita con estado local (optimista)
type Editable = Pick<Task, 'title' | 'status' | 'priority' | 'due_date' | 'assignee_id' | 'description' | 'drive_url'>

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'hace un momento'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es')
}

// Clave de día local (no UTC): un comentario de las 21:00 en Medellín no debe
// caer en el día siguiente.
function diaClave(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function etiquetaDia(iso: string): string {
  const hoy = new Date()
  const ayer = new Date()
  ayer.setDate(ayer.getDate() - 1)
  const k = diaClave(iso)
  if (k === diaClave(hoy.toISOString())) return 'Hoy'
  if (k === diaClave(ayer.toISOString())) return 'Ayer'
  const d = new Date(iso)
  const mismoAno = d.getFullYear() === hoy.getFullYear()
  return d.toLocaleDateString('es', {
    day: 'numeric',
    month: 'long',
    ...(mismoAno ? {} : { year: 'numeric' }),
  })
}

export default function TaskDetail({
  task,
  subtasks,
  childCounts,
  tags,
  allTags,
  ancestors,
  members,
  comments,
  activity,
  currentUserId,
  projectId,
  projectName,
  closeHref,
}: {
  task: Task
  subtasks: Task[]
  childCounts: Record<string, number>
  tags: Tag[]
  allTags: Tag[]
  ancestors: Ancestor[]
  members: Member[]
  comments: Comment[]
  activity: Activity[]
  currentUserId: string
  projectId: string
  projectName: string
  closeHref: string
}) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const titleId = useId()

  // ---- Estado local optimista -------------------------------------------
  // El modal no revalida la página entera en cada campo: aplica el cambio al
  // instante, escribe en Supabase y refresca una sola vez, al cerrar.
  //
  // Todo lo que se deriva de los props del servidor vive en un solo objeto y se
  // reajusta DURANTE el render (no en un efecto): así no hay renders en cascada.
  const tagSig = tags.map((x) => x.id).join(',')

  const [sync, setSync] = useState<{
    srcTask: Task
    ov: Partial<Editable>
    srcAct: Activity[]
    local: Activity[]
    srcCom: Comment[]
    pend: Comment[]
    ocul: string[]
    tagSig: string
    tag: Tag | null
  }>(() => ({
    srcTask: task,
    ov: {},
    srcAct: activity,
    local: [],
    srcCom: comments,
    pend: [],
    ocul: [],
    tagSig,
    tag: tags[0] ?? null,
  }))

  if (
    sync.srcTask !== task ||
    sync.srcAct !== activity ||
    sync.srcCom !== comments ||
    sync.tagSig !== tagSig
  ) {
    setSync((prev) => {
      const next = { ...prev }
      if (prev.srcTask !== task) {
        next.srcTask = task
        // Cuando el servidor alcanza lo que ya teníamos local, el override se cae solo
        const kept: Partial<Editable> = {}
        for (const k of Object.keys(prev.ov) as (keyof Editable)[]) {
          if (task[k] !== prev.ov[k]) (kept as Record<string, unknown>)[k] = prev.ov[k]
        }
        next.ov = kept
      }
      // La actividad del servidor ya incluye lo que habíamos mostrado optimista
      if (prev.srcAct !== activity) {
        next.srcAct = activity
        next.local = []
      }
      // Ídem con los comentarios: al llegar los del servidor, se sueltan los pendientes
      if (prev.srcCom !== comments) {
        next.srcCom = comments
        next.pend = []
        next.ocul = []
      }
      if (prev.tagSig !== tagSig) {
        next.tagSig = tagSig
        next.tag = tags[0] ?? null
      }
      return next
    })
  }

  const t: Task = { ...task, ...sync.ov }
  const tag = sync.tag
  const localActs = sync.local
  const pendientes = sync.pend
  const ocultos = sync.ocul

  const dirty = useRef(false)
  const hasDraft = useRef(false)

  // Las escrituras se encolan: se serializan entre sí y, al cerrar, el refresh
  // espera a que terminen (así la lista de atrás nunca queda con el valor viejo).
  //
  // Cada trabajo atrapa su propio error: uno que falla no corta la cadena, se
  // avisa con un toast y, si trae `undo`, la pantalla vuelve al último valor
  // que la base confirmó.
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const enqueue = useCallback((run: () => Promise<unknown>, opts: JobOpts) => {
    dirty.current = true
    chain.current = chain.current.then(async () => {
      try {
        await run()
      } catch {
        opts.undo?.()
        const tail = opts.hint ?? (opts.undo ? 'Se revirtió el cambio.' : '')
        toast(`No se pudo guardar ${opts.what}. ${tail}`.trim(), 'error')
      }
    })
  }, [])

  // Lo que espera en un debounce (títulos de subtareas, descripción) se
  // registra acá para guardarse ANTES de cerrar o de navegar a otra tarea.
  const flushers = useRef(new Set<() => void>())
  const registerFlush = useCallback((fn: () => void) => {
    flushers.current.add(fn)
    return () => {
      flushers.current.delete(fn)
    }
  }, [])

  const patch = useCallback((p: Partial<Editable>) => {
    dirty.current = true
    setSync((s) => ({ ...s, ov: { ...s.ov, ...p } }))
  }, [])

  // ---- Actividad optimista ----------------------------------------------
  const me = members.find((m) => m.user_id === currentUserId)

  const pushAct = useCallback(
    (type: string, to: string | null): string => {
      const id = `local-${type}-${Date.now()}`
      setSync((s) => ({
        ...s,
        local: [
          ...s.local,
          {
            id,
            actor_id: currentUserId,
            actor_name: me?.full_name ?? null,
            actor_avatar: me?.avatar_url ?? null,
            actor_email: me?.email ?? null,
            type,
            meta: { to },
            created_at: new Date().toISOString(),
          },
        ],
      }))
      return id
    },
    [currentUserId, me]
  )

  // ---- Subtareas: progreso ----------------------------------------------
  const [subStats, setSubStats] = useState({ done: 0, total: subtasks.length })
  const onSubStats = useCallback((done: number, total: number) => {
    setSubStats((prev) => (prev.done === done && prev.total === total ? prev : { done, total }))
  }, [])
  // ---- Escrituras --------------------------------------------------------
  // Último valor CONFIRMADO por la base. Si una escritura falla, el campo vuelve
  // a esto, pero solo si todavía muestra el valor que falló (si el usuario ya
  // lo cambió otra vez, no se le pisa).
  const confirmed = useRef<Partial<Editable>>({
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    assignee_id: task.assignee_id,
    drive_url: task.drive_url,
  })

  const setField = <K extends 'status' | 'priority' | 'due_date' | 'assignee_id' | 'drive_url'>(
    key: K,
    value: Editable[K],
    what: string,
    write: () => Promise<unknown>,
    act?: string,
    alsoUndo?: () => void
  ) => {
    patch({ [key]: value } as Partial<Editable>)
    const actId = act ? pushAct(act, (value as string | null) ?? null) : null
    enqueue(
      async () => {
        await write()
        confirmed.current[key] = value
      },
      {
        what,
        undo: () => {
          setSync((s) => ({
            ...s,
            ov: s.ov[key] === value ? { ...s.ov, [key]: confirmed.current[key] } : s.ov,
            local: actId ? s.local.filter((a) => a.id !== actId) : s.local,
          }))
          alsoUndo?.()
        },
      }
    )
  }

  // La actividad la registra también la base por trigger (migración 017): si
  // ya está aplicada, este insert se descarta como duplicado. Si falla, no
  // importa: el cambio en sí ya se guardó.
  const logAct = (type: string, to: string | null) =>
    supabase.from('task_activity').insert({ task_id: task.id, type, meta: { to } })

  // Subtareas marcadas como hechas en bloque al completar la tarea: la lista
  // lo aplica al instante y lo deshace si la base rechaza el cambio.
  const [allDone, setAllDone] = useState({ seq: 0, on: false })

  const setStatus = async (status: Status) => {
    if (status === t.status) return
    if (status === 'done') {
      // Aviso si quedan subtareas sin finalizar (se cuentan las de la lista,
      // que ya incluye lo optimista). Cancelar no cambia nada.
      const abiertas = subStats.total - subStats.done
      // Si alguna subtarea tiene subtareas propias, el conteo local no alcanza
      // (también se completan las de más abajo): se cuenta en la base.
      const hayNietas = subtasks.some((s) => (childCounts[s.id] ?? 0) > 0)
      const conocidas = hayNietas ? undefined : abiertas
      if ((hayNietas || abiertas > 0) && !(await confirmCompleteSubtasks(task.id, conocidas))) return
      if (abiertas > 0) setAllDone((a) => ({ seq: a.seq + 1, on: true }))
      // Completa la tarea y todas sus subtareas abiertas, a cualquier
      // profundidad, en una sola operación (registra la actividad de cada una)
      setField(
        'status',
        status,
        'el estado',
        () => must(supabase.rpc('complete_task_tree', { p_task_id: task.id })),
        'status',
        abiertas > 0 ? () => setAllDone((a) => ({ seq: a.seq + 1, on: false })) : undefined
      )
      return
    }
    setField('status', status, 'el estado', async () => {
      await must(supabase.from('tasks').update({ status }).eq('id', task.id).select('id'))
      await logAct('status', status)
    }, 'status')
  }

  const setPrio = (priority: Priority | null) =>
    setField('priority', priority, 'la prioridad', async () => {
      await must(supabase.from('tasks').update({ priority }).eq('id', task.id).select('id'))
      await logAct('priority', priority)
    }, 'priority')

  const setDue = (due_date: string | null) =>
    setField('due_date', due_date, 'la fecha de entrega', async () => {
      await must(supabase.from('tasks').update({ due_date }).eq('id', task.id).select('id'))
      await logAct('due', due_date)
    }, 'due')

  // El RPC ya registra la actividad y la notificación de asignación
  const setWho = (assignee_id: string | null) =>
    setField('assignee_id', assignee_id, 'el responsable', () =>
      must(supabase.rpc('set_task_assignee', { p_task_id: task.id, p_assignee: assignee_id })),
      'assignee'
    )

  const setDrive = (drive_url: string | null) =>
    setField('drive_url', drive_url, 'el archivo de Drive', () =>
      must(supabase.from('tasks').update({ drive_url }).eq('id', task.id).select('id'))
    )

  // Título: se ve al instante, se guarda al dejar de escribir
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTitle = useRef<string | null>(null)
  // Se compara contra lo último que guardamos, no contra el prop del servidor:
  // como no refrescamos en cada tecla, el prop queda viejo y volver al título
  // original no llegaría a guardarse.
  const lastTitle = useRef(task.title)

  const saveTitle = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      pendingTitle.current = null
      if (!trimmed || trimmed === lastTitle.current) return
      const prev = lastTitle.current
      lastTitle.current = trimmed
      enqueue(
        async () => {
          await must(supabase.from('tasks').update({ title: trimmed }).eq('id', task.id).select('id'))
        },
        {
          what: 'el título',
          hint: 'Tu texto sigue en el campo.',
          // Se olvida que "ya estaba guardado", así la próxima edición reintenta
          undo: () => {
            if (lastTitle.current === trimmed) lastTitle.current = prev
          },
        }
      )
    },
    [enqueue, supabase, task.id]
  )

  const onTitle = (value: string) => {
    patch({ title: value })
    pendingTitle.current = value
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => saveTitle(value), 600)
  }

  // Un título vacío no se guarda: al salir del campo vuelve el último guardado
  const onTitleBlur = () => {
    if (t.title.trim()) return
    if (titleTimer.current) clearTimeout(titleTimer.current)
    pendingTitle.current = null
    patch({ title: lastTitle.current })
  }

  // Guarda YA todo lo que espera en un debounce (título y lo registrado)
  const flushAll = useCallback(() => {
    if (titleTimer.current) clearTimeout(titleTimer.current)
    if (pendingTitle.current !== null) saveTitle(pendingTitle.current)
    for (const f of flushers.current) f()
  }, [saveTitle])

  // Al desmontar, no se pierde lo que quedó en el debounce
  useEffect(() => {
    return () => {
      if (titleTimer.current) clearTimeout(titleTimer.current)
      if (pendingTitle.current !== null) saveTitle(pendingTitle.current)
    }
  }, [saveTitle])

  // ---- Cierre ------------------------------------------------------------
  const [closing, setClosing] = useState(false)
  // Un solo cierre a la vez: Escape o un segundo clic mientras dice
  // "Guardando…" no deben iniciar otra navegación ni otro temporizador.
  const closingRef = useRef(false)
  // Salir del modal: cerrarlo o ir a otra tarea (subtarea, ancestro, proyecto).
  // Un solo camino para los dos, así abrir una subtarea tiene las mismas
  // garantías que cerrar: lo pendiente se guarda y la navegación lo espera.
  const leave = useCallback(
    (href: string, draftMsg: string) => {
      if (closingRef.current) return
      if (hasDraft.current && !window.confirm(draftMsg)) return
      // Lo que todavía está en un debounce (título, descripción, títulos de
      // subtareas) se guarda YA, para que entre en la cadena y la navegación lo
      // espere (antes se perdía o llegaba después y la lista mostraba lo viejo).
      flushAll()
      // Una sola navegación. El push ya trae la página fresca del servidor, así
      // que no hace falta un refresh() aparte (antes eran dos renders completos).
      // Si hubo cambios, se espera a que terminen de guardarse para que esa única
      // respuesta ya los incluya.
      closingRef.current = true
      if (!dirty.current) return void router.push(href)
      // Con conexión lenta esto puede tardar: se avisa en vez de parecer ignorado.
      // Y si Supabase no responde, a los 8 s se sale igual: los guardados
      // siguen en curso en segundo plano y la página se pone al día al terminar.
      setClosing(true)
      let done = false
      const go = () => {
        if (done) return
        done = true
        router.push(href)
      }
      const timer = window.setTimeout(() => {
        toast('Algunos cambios aún se están guardando. Aparecerán en unos segundos.')
        go()
        const refresh = () => router.refresh()
        chain.current.then(refresh, refresh)
      }, 8000)
      const finish = () => {
        window.clearTimeout(timer)
        go()
      }
      chain.current.then(finish, finish)
    },
    [router, flushAll]
  )

  const requestClose = useCallback(
    () => leave(closeHref, 'Tenés un comentario sin enviar. ¿Cerrar de todos modos?'),
    [leave, closeHref]
  )
  const navigateTo = useCallback(
    (href: string) => leave(href, 'Tenés un comentario sin enviar. ¿Salir de todos modos?'),
    [leave]
  )
  const onNavClick = (e: React.MouseEvent, href: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigateTo(href)
  }

  const onDraftChange = useCallback((v: boolean) => {
    hasDraft.current = v
  }, [])

  // El comentario aparece al enviarlo, sin esperar el round-trip del servidor.
  // El id lo pone el editor para poder retirarlo si la escritura falla.
  const onSendComment = useCallback(
    (tempId: string, body: string, mentions: string[]) => {
      dirty.current = true
      const menciones = mentions
        .map((uid) => members.find((m) => m.user_id === uid))
        .filter((m): m is Member => Boolean(m))
        .map((m) => ({ id: m.user_id, name: m.full_name, email: m.email, avatar: m.avatar_url }))
      setSync((s) => ({
        ...s,
        pend: [
          ...s.pend,
          {
            id: tempId,
            body,
            author_email: me?.email ?? '',
            author_id: currentUserId,
            author_name: me?.full_name ?? null,
            author_avatar: me?.avatar_url ?? null,
            created_at: new Date().toISOString(),
            edited_at: null,
            mentions: menciones,
          },
        ],
      }))
    },
    [currentUserId, me, members]
  )

  // Si el servidor rechazó el comentario, se retira el optimista (el editor ya
  // devolvió el texto al compositor, así que no se pierde nada).
  const onSendCommentFailed = useCallback((tempId: string) => {
    setSync((s) => ({ ...s, pend: s.pend.filter((c) => c.id !== tempId) }))
  }, [])

  // Borrado con confirmación, ocultado optimista y vuelta atrás si falla.
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null)
  const borrarComentario = useCallback(
    async (id: string) => {
      if (!window.confirm('¿Eliminar este comentario?')) return
      setErrorBorrar(null)
      dirty.current = true
      setSync((s) => ({ ...s, ocul: [...s.ocul, id] }))
      const fd = new FormData()
      fd.set('id', id)
      fd.set('project_id', projectId)
      try {
        await deleteComment(fd)
      } catch {
        setSync((s) => ({ ...s, ocul: s.ocul.filter((x) => x !== id) }))
        setErrorBorrar('No se pudo eliminar el comentario. Probá de nuevo.')
      }
    },
    [projectId]
  )

  // Al eliminar una subtarea se vuelve a su tarea padre, no al proyecto.
  // push trae la página fresca: un refresh() previo solo duplicaba el render.
  const parentId = task.parent_id
  const afterDestructive = useCallback(() => {
    router.push(parentId ? `${closeHref}&task=${parentId}` : closeHref)
  }, [closeHref, parentId, router])

  const afterDuplicate = useCallback(() => {
    router.refresh()
  }, [router])

  // ---- Etiqueta única ----------------------------------------------------
  // Una tarea tiene una etiqueta o ninguna: elegir otra reemplaza la anterior.
  const pickTag = (next: Tag | null) => {
    setSync((s) => ({ ...s, tag: next }))
    dirty.current = true
    const prev = tag
    enqueue(
      async () => {
        // Borrar puede afectar 0 filas si no tenía etiqueta: acá solo vale el error
        const del = await supabase.from('task_tags').delete().eq('task_id', task.id)
        if (del.error) throw del.error
        if (next) await must(supabase.from('task_tags').insert({ task_id: task.id, tag_id: next.id }).select('task_id'))
      },
      {
        what: 'la etiqueta',
        undo: () => setSync((s) => (s.tag?.id === next?.id ? { ...s, tag: prev } : s)),
      }
    )
  }

  // Reutiliza la etiqueta si ya existe con ese nombre (sin distinguir mayúsculas)
  const createTag = async (name: string) => {
    const clean = name.trim()
    if (!clean) return
    const hit = await supabase.from('tags').select('id, name, color').ilike('name', clean).maybeSingle()
    let found = hit.data as Tag | null
    if (!found) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const created = await supabase
        .from('tags')
        .insert({ name: clean, created_by: user?.id })
        .select('id, name, color')
        .single()
      found = created.data as Tag | null
    }
    if (found) pickTag(found)
  }

  const pct = subStats.total > 0 ? Math.round((subStats.done / subStats.total) * 100) : 0

  // ---- Feed --------------------------------------------------------------
  const [onlyComments, setOnlyComments] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)

  // La conversación se lee de arriba hacia abajo y lo último es lo que importa:
  // al abrir se salta al final. Después solo se sigue el hilo si el usuario ya
  // estaba abajo — si subió a leer algo viejo, no se le mueve el scroll.
  const feedRef = useRef<HTMLDivElement>(null)
  const abajo = useRef(true)
  useEffect(() => {
    const el = feedRef.current
    if (!el) return
    const onScroll = () => {
      abajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.scrollTop = el.scrollHeight
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const done = t.status === 'done'
  // Conserva la vista y el filtro (hide=done) de la página de atrás
  const hrefFor = useCallback((id: string) => `${closeHref}&task=${id}`, [closeHref])

  const actText = (a: Activity): string => {
    const to = a.meta?.to ?? null
    switch (a.type) {
      case 'created':
        return 'creó la tarea'
      case 'status': {
        if (to === 'done') return 'marcó como completada'
        const s = STATUSES.find((x) => x.key === to)
        return s ? `movió a ${s.label}` : 'actualizó el estado'
      }
      case 'priority': {
        const p = PRIORITIES.find((x) => x.key === to)
        return p ? `cambió la prioridad a ${p.label}` : 'quitó la prioridad'
      }
      case 'due':
        return to ? `cambió la fecha de entrega a ${fmtDate(to)}` : 'quitó la fecha de entrega'
      case 'assignee': {
        if (!to) return 'quitó el responsable'
        const m = members.find((x) => x.user_id === to)
        return `asignó a ${m ? displayName(m) : 'alguien'}`
      }
      default:
        return 'actualizó la tarea'
    }
  }

  type FeedItem =
    | { kind: 'comment'; at: string; c: Comment }
    | { kind: 'activity'; at: string; a: Activity }

  const feed: FeedItem[] = [
    ...[...comments, ...pendientes]
      .filter((c) => !ocultos.includes(c.id))
      .map((c) => ({ kind: 'comment' as const, at: c.created_at, c })),
    ...(onlyComments
      ? []
      : [...activity, ...localActs]
          .filter((a) => a.type !== 'comment')
          .map((a) => ({ kind: 'activity' as const, at: a.created_at, a }))),
  ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime())

  // Lo que realmente se ve: incluye el comentario optimista y excluye el que se
  // está borrando, así el contador del filtro nunca contradice al feed.
  const comentariosVisibles = feed.filter((i) => i.kind === 'comment').length
  const feedLen = feed.length
  useEffect(() => {
    const el = feedRef.current
    if (!el || !abajo.current) return
    el.scrollTop = el.scrollHeight
  }, [feedLen])

  return (
    <TaskPanel labelledBy={titleId} onClose={requestClose}>
      {/* ---------- Encabezado ---------- */}
      <div className="tm-head">
        <div className="tm-head-l">
          <button
            type="button"
            className={`btn ${done ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setStatus(done ? 'todo' : 'done')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {done ? 'Completada' : 'Marcar como finalizada'}
          </button>
          {t.parent_id && <span className="tm-badge">Subtarea</span>}
        </div>

        <div className="tm-head-r">
          <TaskActionsMenu
            taskId={task.id}
            title={t.title}
            projectId={projectId}
            onDeleted={afterDestructive}
            onDuplicated={afterDuplicate}
          />
          {closing && <span className="tm-saving" role="status">Guardando…</span>}
          <button type="button" className="btn-ghost" title="Cerrar (Esc)" onClick={requestClose} disabled={closing}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ---------- Dos columnas: detalle | actividad ---------- */}
      <div className="tm-grid">
        <div className="tm-main">
          <nav className="breadcrumb tm-crumb">
            <Link href={closeHref} onClick={(e) => onNavClick(e, closeHref)}>{projectName}</Link>
            {ancestors.map((a) => (
              <span key={a.id} className="tm-crumb-i">
                <span className="tm-crumb-sep">/</span>
                <Link href={hrefFor(a.id)} onClick={(e) => onNavClick(e, hrefFor(a.id))}>{a.title}</Link>
              </span>
            ))}
          </nav>

          <InlineTaskTitle id={titleId} value={t.title} onChange={onTitle} onBlur={onTitleBlur} />

          {/* Metadatos sin cajas: rótulo gris + valor como chip.
              El valor se resalta al pasar el cursor para indicar que es editable. */}
          <div className="tm-meta">
            <div className="tm-field">
              <span className="tm-f-k">Estado</span>
              <span className="tm-f-v">
                <StatusSelect current={t.status} onChange={setStatus} />
              </span>
            </div>

            <div className="tm-field">
              <span className="tm-f-k">Responsable</span>
              <span className="tm-f-v">
                <AssigneeSelect
                  taskId={task.id}
                  projectId={projectId}
                  current={t.assignee_id}
                  members={members}
                  onChange={setWho}
                />
              </span>
            </div>

            <div className="tm-field">
              <span className="tm-f-k">Prioridad</span>
              <span className="tm-f-v">
                <PrioritySelect taskId={task.id} projectId={projectId} current={t.priority} onChange={setPrio} />
              </span>
            </div>

            <div className="tm-field">
              <span className="tm-f-k">Entrega</span>
              <span className="tm-f-v">
                <DueDateField value={t.due_date} onChange={setDue} done={done} />
              </span>
            </div>

            <div className="tm-field">
              <span className="tm-f-k">Etiqueta</span>
              <span className="tm-f-v">
                <TagSelect current={tag} allTags={allTags} onPick={pickTag} onCreate={createTag} />
              </span>
            </div>

          </div>

          <div className="section-label">Descripción</div>
          <DescriptionInput
            taskId={task.id}
            initial={task.description}
            onSaved={(v) => patch({ description: v })}
            enqueue={enqueue}
            registerFlush={registerFlush}
          />

          <div className="section-label">Archivo de Drive</div>
          <DriveField value={t.drive_url} onSave={setDrive} />

          <div className="tm-subs-head">
            <span className="section-label" style={{ margin: 0 }}>Subtareas</span>
            {subStats.total > 0 && (
              <>
                <span className="tm-prog" role="progressbar" aria-label="Progreso de subtareas" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="tm-prog-n">
                  {subStats.done}/{subStats.total}
                </span>
              </>
            )}
          </div>
          <SubtaskList
            parentId={task.id}
            projectId={projectId}
            subtasks={subtasks}
            members={members}
            childCounts={childCounts}
            hrefFor={hrefFor}
            onOpen={navigateTo}
            onStats={onSubStats}
            enqueue={enqueue}
            registerFlush={registerFlush}
            allDone={allDone}
          />
        </div>

        {/* ---------- Columna de actividad ---------- */}
        <aside className="tm-side">
          <div className="tm-side-head">
            <span className="comments-title">Actividad</span>
            <div className="tm-filter" role="tablist" aria-label="Filtrar actividad">
              <button
                type="button"
                role="tab"
                aria-selected={!onlyComments}
                className={`tm-filter-b ${onlyComments ? '' : 'on'}`}
                onClick={() => setOnlyComments(false)}
              >
                Todo
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={onlyComments}
                className={`tm-filter-b ${onlyComments ? 'on' : ''}`}
                onClick={() => setOnlyComments(true)}
              >
                Comentarios{comentariosVisibles > 0 ? ` ${comentariosVisibles}` : ''}
              </button>
            </div>
          </div>

          <div className="tm-side-feed" ref={feedRef}>
            {feed.length > 0 && (
              <div className="act-feed">
                {feed.map((item, idx) => {
                  const dia = diaClave(item.at)
                  const nuevoDia = idx === 0 || diaClave(feed[idx - 1].at) !== dia
                  const sep = nuevoDia ? (
                    <div key={`d-${dia}`} className="act-dia">
                      <span>{etiquetaDia(item.at)}</span>
                    </div>
                  ) : null

                  if (item.kind === 'activity') {
                    const a = item.a
                    const own = a.actor_id === currentUserId
                    const who = own ? 'Vos' : displayName({ full_name: a.actor_name, email: a.actor_email ?? '' })
                    return (
                      <Fragment key={`a-${a.id}`}>
                      {sep}
                      <div className="act-line">
                        <Avatar name={a.actor_name} email={a.actor_email ?? ''} url={a.actor_avatar} size={22} />
                        <span className="act-line-text">
                          <b>{who}</b> {actText(a)}
                        </span>
                        <span className="act-line-time">{timeAgo(a.created_at)}</span>
                      </div>
                      </Fragment>
                    )
                  }
                  const c = item.c
                  const own = c.author_id === currentUserId
                  const pendiente = c.id.startsWith('pend-')
                  return (
                    <Fragment key={`c-${c.id}`}>
                    {sep}
                    <div className={`act ${own ? 'own' : ''} ${pendiente ? 'is-pendiente' : ''}`}>
                      <Avatar name={c.author_name} email={c.author_email} url={c.author_avatar} size={34} />
                      <div className="act-card">
                        <div className="act-top">
                          <span className="act-author">
                            {own ? 'Vos' : displayName({ full_name: c.author_name, email: c.author_email })}
                          </span>
                          <span className="act-time">
                            {timeAgo(c.created_at)}
                            {c.edited_at && ' · editado'}
                          </span>
                          {own && !pendiente && editando !== c.id && (
                            <div className="act-acciones">
                              <button
                                type="button"
                                className="btn-ghost"
                                title="Editar comentario"
                                onClick={() => setEditando(c.id)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="btn-ghost"
                                title="Eliminar comentario"
                                onClick={() => borrarComentario(c.id)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                        {editando === c.id ? (
                          <CommentEditor
                            taskId={task.id}
                            projectId={projectId}
                            members={members}
                            variante="edicion"
                            commentId={c.id}
                            initialHtml={c.body}
                            onDone={() => setEditando(null)}
                          />
                        ) : (
                          <p className="act-body">
                            <CommentBody body={c.body} mentions={c.mentions} members={members} />
                          </p>
                        )}
                      </div>
                    </div>
                    </Fragment>
                  )
                })}
              </div>
            )}

            {errorBorrar && (
              <p className="side-error" role="alert">
                {errorBorrar}
              </p>
            )}

            {/* Mensaje centrado en el espacio libre: llena el vacío sin mover
                el compositor ni comprimir la columna. */}
            {comentariosVisibles === 0 && (
              <div className="side-vacio">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p>Sin comentarios todavía</p>
                <span>Escribí abajo para dejar el primero, o mencioná a alguien con @</span>
              </div>
            )}
          </div>

          <div className="tm-side-foot">
            <CommentEditor
              taskId={task.id}
              projectId={projectId}
              members={members}
              onDraftChange={onDraftChange}
              onSend={onSendComment}
              onSendFailed={onSendCommentFailed}
            />
          </div>
        </aside>
      </div>
    </TaskPanel>
  )
}
