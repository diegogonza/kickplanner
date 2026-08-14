'use client'

import { useState } from 'react'
import { setProjectStatus } from '@/app/projects/actions'
import { PROJECT_STATUSES, projectStatusOf, displayName } from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'

export type StatusUpdate = {
  id: string
  status: string
  note: string | null
  created_at: string
  author_id: string | null
  author_name: string | null
  author_email: string | null
  author_avatar: string | null
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

export default function ProjectStatus({
  projectId,
  status,
  overdue,
  history,
}: {
  projectId: string
  status: string
  overdue: number
  history: StatusUpdate[]
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(status)
  const [note, setNote] = useState('')
  const current = projectStatusOf(status)
  const latest = history[0]

  return (
    <div className="pstatus-wrap">
      <button
        type="button"
        className={`pstatus pstatus-lg ${current.cls}`}
        onClick={() => {
          setSelected(status)
          setNote('')
          setOpen((o) => !o)
        }}
        title="Actualizar estado del proyecto"
      >
        <span className="pstatus-dot" style={{ background: current.color }} />
        {current.label}
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {overdue > 0 && !open && (
        <span className="risk-hint" title="Tareas vencidas en este proyecto">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          {overdue} {overdue === 1 ? 'tarea vencida' : 'tareas vencidas'}
        </span>
      )}

      {open && (
        <>
          <div className="pstatus-backdrop" onClick={() => setOpen(false)} />
          <div className="pstatus-pop" role="dialog" aria-label="Actualizar estado">
            <div className="pstatus-pop-title">Actualizar estado</div>

            <div className="pstatus-options">
              {PROJECT_STATUSES.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`pstatus-opt ${selected === opt.key ? 'sel' : ''}`}
                  onClick={() => setSelected(opt.key)}
                >
                  <span className="pstatus-dot" style={{ background: opt.color }} />
                  {opt.label}
                </button>
              ))}
            </div>

            <form
              action={setProjectStatus}
              onSubmit={() => setOpen(false)}
            >
              <input type="hidden" name="id" value={projectId} />
              <input type="hidden" name="status" value={selected} />
              <textarea
                name="note"
                className="field"
                rows={3}
                placeholder="Añade una nota de actualización (opcional)…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ resize: 'vertical', marginTop: 8 }}
              />
              <div className="pstatus-pop-actions">
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Publicar actualización</button>
              </div>
            </form>

            {history.length > 0 && (
              <div className="pstatus-history">
                <div className="pstatus-history-label">Historial</div>
                {history.map((h) => {
                  const st = projectStatusOf(h.status)
                  return (
                    <div key={h.id} className="pstatus-hrow">
                      <span className="pstatus-dot" style={{ background: st.color, marginTop: 5 }} />
                      <div className="pstatus-hbody">
                        <div className="pstatus-hhead">
                          <span className={`pstatus ${st.cls}`}>{st.label}</span>
                          <span className="pstatus-htime">{timeAgo(h.created_at)}</span>
                        </div>
                        {h.note && <div className="pstatus-hnote">{h.note}</div>}
                        {(h.author_name || h.author_email) && (
                          <div className="pstatus-hauthor">
                            <Avatar name={h.author_name} email={h.author_email ?? ''} url={h.author_avatar} size={16} />
                            {displayName({ full_name: h.author_name, email: h.author_email ?? '' })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {latest?.note && !open && <span className="pstatus-latest" title={latest.note}>“{latest.note}”</span>}
    </div>
  )
}
