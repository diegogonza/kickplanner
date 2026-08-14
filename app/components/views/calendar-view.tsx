'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PRIORITIES, STATUSES, displayName, type Task, type Member } from '@/app/projects/statuses'
import { updateDueDate } from '@/app/projects/actions'
import Avatar from '@/app/components/avatar'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function parseDue(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}
function weekStartOf(d: Date): Date {
  const dow = (d.getDay() + 6) % 7
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -dow)
}

type Mode = 'month' | 'week'
type CalTask = Task & { project_id?: string }

export default function CalendarView({
  projectId,
  view,
  tasks,
  memberMap = {},
  hideDone = false,
}: {
  projectId: string
  view: string
  tasks: CalTask[]
  memberMap?: Record<string, Member>
  hideDone?: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [mode, setMode] = useState<Mode>('month')
  const [cursor, setCursor] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  const [drag, setDrag] = useState<{ id: string; pid?: string } | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [hideWeekends, setHideWeekends] = useState(true)

  // Estado optimista: al soltar, la tarea se ve en el nuevo día al instante
  const [optimisticTasks, moveOptimistic] = useOptimistic(
    tasks,
    (state: CalTask[], { id, due }: { id: string; due: string }) =>
      state.map((t) => (t.id === id ? { ...t, due_date: due } : t))
  )

  const hrefFor = (t: CalTask) => `/projects/${t.project_id ?? projectId}?view=${view}${hideDone ? '&hide=done' : ''}&task=${t.id}`

  const byDay = new Map<string, CalTask[]>()
  for (const t of optimisticTasks) {
    if (!t.due_date) continue
    const k = dayKey(parseDue(t.due_date))
    const arr = byDay.get(k)
    if (arr) arr.push(t)
    else byDay.set(k, [t])
  }

  // Celdas según el modo
  const m = cursor.getMonth()
  let cells: Date[]
  if (mode === 'month') {
    const first = new Date(cursor.getFullYear(), m, 1)
    const startDow = (first.getDay() + 6) % 7
    const gridStart = new Date(cursor.getFullYear(), m, 1 - startDow)
    cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  } else {
    const start = weekStartOf(cursor)
    cells = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }

  // Fines de semana: ocultos salvo que tengan tareas (entonces se muestran sombreados)
  const wdOf = (d: Date) => (d.getDay() + 6) % 7
  const weekendHasTasks = (wd: number) =>
    cells.some((c) => wdOf(c) === wd && (byDay.get(dayKey(c))?.length ?? 0) > 0)
  const showSat = !hideWeekends || weekendHasTasks(5)
  const showSun = !hideWeekends || weekendHasTasks(6)
  const activeWd = [0, 1, 2, 3, 4, ...(showSat ? [5] : []), ...(showSun ? [6] : [])]
  const visibleCells = cells.filter((c) => activeWd.includes(wdOf(c)))
  const gridCols = `repeat(${activeWd.length}, 1fr)`

  // Etiqueta del encabezado
  let label: string
  if (mode === 'month') {
    label = cursor.toLocaleDateString('es', { month: 'long', year: 'numeric' })
  } else {
    const s = weekStartOf(cursor)
    const e = addDays(s, 6)
    const sameMonth = s.getMonth() === e.getMonth()
    const fs = s.toLocaleDateString('es', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
    const fe = e.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
    label = `${fs} – ${fe}`
  }

  const chipColor = (t: Task) => {
    const prio = PRIORITIES.find((p) => p.key === t.priority)
    if (prio) return prio.color
    return STATUSES.find((s) => s.key === t.status)?.color ?? 'var(--text-3)'
  }

  const goPrev = () => setCursor(mode === 'month' ? new Date(cursor.getFullYear(), m - 1, 1) : addDays(cursor, -7))
  const goNext = () => setCursor(mode === 'month' ? new Date(cursor.getFullYear(), m + 1, 1) : addDays(cursor, 7))
  const goToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate()))

  const onDrop = (cell: Date) => {
    const dragged = drag
    setOverKey(null)
    setDrag(null)
    if (!dragged) return
    const due = isoDate(cell)
    const current = tasks.find((t) => t.id === dragged.id)
    if (current?.due_date === due) return
    startTransition(async () => {
      moveOptimistic({ id: dragged.id, due })
      const fd = new FormData()
      fd.set('id', dragged.id)
      fd.set('project_id', dragged.pid ?? projectId)
      fd.set('due_date', due)
      await updateDueDate(fd)
    })
  }

  const maxChips = mode === 'week' ? 12 : 3

  return (
    <div className="cal">
      <div className="cal-head">
        <div className="cal-title" style={{ textTransform: mode === 'month' ? 'capitalize' : 'none' }}>{label}</div>
        <div className="cal-nav">
          <div className="cal-modes" role="tablist" aria-label="Modo de vista">
            <button type="button" className={`cal-mode ${mode === 'week' ? 'active' : ''}`} onClick={() => setMode('week')} aria-selected={mode === 'week'}>Semana</button>
            <button type="button" className={`cal-mode ${mode === 'month' ? 'active' : ''}`} onClick={() => setMode('month')} aria-selected={mode === 'month'}>Mes</button>
          </div>
          <button
            type="button"
            className={`btn-outline cal-toggle ${!hideWeekends ? 'active' : ''}`}
            onClick={() => setHideWeekends((h) => !h)}
            title={hideWeekends ? 'Mostrar fines de semana' : 'Ocultar fines de semana'}
            aria-pressed={!hideWeekends}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
              {hideWeekends ? (
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
            Fines de semana
          </button>
          <button type="button" className="btn-outline" onClick={goToday}>Hoy</button>
          <button type="button" className="move-btn" onClick={goPrev} title="Anterior" aria-label="Anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button type="button" className="move-btn" onClick={goNext} title="Siguiente" aria-label="Siguiente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="cal-dow" style={{ gridTemplateColumns: gridCols }}>
        {activeWd.map((wd) => (
          <span key={wd}>{WEEKDAYS[wd]}</span>
        ))}
      </div>

      <div className={`cal-grid ${mode === 'week' ? 'week' : ''}`} style={{ gridTemplateColumns: gridCols }}>
        {visibleCells.map((cell) => {
          const inMonth = mode === 'week' || cell.getMonth() === m
          const isToday = cell.getTime() === today.getTime()
          const isWeekend = wdOf(cell) >= 5
          const key = dayKey(cell)
          const items = byDay.get(key) ?? []
          const shown = items.slice(0, maxChips)
          const extra = items.length - shown.length

          return (
            <div
              key={cell.toISOString()}
              className={`cal-cell ${inMonth ? '' : 'other'} ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''} ${overKey === key ? 'dragover' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                if (overKey !== key) setOverKey(key)
              }}
              onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
              onDrop={() => onDrop(cell)}
            >
              <div className="cal-daynum">{cell.getDate()}</div>
              <div className="cal-chips">
                {shown.map((t) => {
                  const done = t.status === 'done'
                  const member = t.assignee_id ? memberMap[t.assignee_id] : undefined
                  const who = member ? displayName(member) : undefined
                  return (
                    <div
                      key={t.id}
                      className={`cal-chip ${done ? 'done' : ''} ${drag?.id === t.id ? 'dragging' : ''}`}
                      title={who ? `${t.title} · ${who}` : t.title}
                      draggable
                      onDragStart={(e) => {
                        setDrag({ id: t.id, pid: t.project_id })
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', t.id)
                      }}
                      onDragEnd={() => {
                        setDrag(null)
                        setOverKey(null)
                      }}
                      onClick={() => router.push(hrefFor(t))}
                    >
                      {member ? (
                        <Avatar name={member.full_name} email={member.email} url={member.avatar_url} size={16} />
                      ) : (
                        <span className="cal-dotmark" style={{ background: chipColor(t) }} />
                      )}
                      <span className="cal-chip-title">{t.title}</span>
                    </div>
                  )
                })}
                {extra > 0 && <span className="cal-more">+{extra} más</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
