'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

type Person = { user_id: string; full_name: string | null; email: string }
type Proj = { id: string; name: string }

export default function AdvancedSearch() {
  const sp = useSearchParams()
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<Proj[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [due, setDue] = useState<string>(() => sp.get('due') ?? 'any')

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    supabase.rpc('projects_overview').then(({ data }) => {
      setProjects(((data ?? []) as Proj[]).map((p) => ({ id: p.id, name: p.name })))
    })
    supabase.rpc('my_collaborators').then(({ data }) => setPeople((data ?? []) as Person[]))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const cur = (k: string, d = '') => sp.get(k) ?? d

  return (
    <>
      <button type="button" className="app-filter-btn" onClick={() => setOpen(true)} title="Filtros avanzados" aria-label="Filtros avanzados">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h2>Búsqueda avanzada</h2>
            <p className="modal-sub">Filtrá las tareas por proyecto, estado, responsable y fecha.</p>

            <form action="/buscar">
              <div className="filter-grid">
                <label className="k">Contiene las palabras</label>
                <input name="q" className="field" defaultValue={cur('q')} placeholder="Palabras clave" autoComplete="off" autoFocus />

                <label className="k">Tipo</label>
                <select name="type" className="field" defaultValue={cur('type', 'all')}>
                  <option value="all">Tareas y subtareas</option>
                  <option value="top">Solo tareas</option>
                </select>

                <label className="k">Ubicado</label>
                <select name="project" className="field" defaultValue={cur('project')}>
                  <option value="">En cualquier lugar</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                <label className="k">Estado</label>
                <select name="status" className="field" defaultValue={cur('status', 'all')}>
                  <option value="all">Todo</option>
                  <option value="open">Sin completar</option>
                  <option value="todo">Pendiente</option>
                  <option value="doing">En curso</option>
                  <option value="done">Completada</option>
                </select>

                <label className="k">Asignada a</label>
                <select name="assignee" className="field" defaultValue={cur('assignee')}>
                  <option value="">Cualquiera</option>
                  <option value="me">A mí</option>
                  {people.map((p) => (
                    <option key={p.user_id} value={p.user_id}>{p.full_name?.trim() || p.email}</option>
                  ))}
                </select>

                <label className="k">Fecha de entrega</label>
                <select name="due" className="field" value={due} onChange={(e) => setDue(e.target.value)}>
                  <option value="any">Cualquiera</option>
                  <option value="overdue">Vencidas</option>
                  <option value="today">Hoy</option>
                  <option value="week">Esta semana</option>
                  <option value="range">Rango</option>
                  <option value="none">Sin fecha</option>
                </select>

                {due === 'range' && (
                  <>
                    <label className="k">Desde</label>
                    <input type="date" name="from" className="field" defaultValue={cur('from')} />
                    <label className="k">Hasta</label>
                    <input type="date" name="to" className="field" defaultValue={cur('to')} />
                  </>
                )}
              </div>

              <div className="modal-actions">
                <a href="/buscar" className="btn btn-outline">Restablecer los filtros</a>
                <button type="submit" className="btn btn-primary">Buscar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
