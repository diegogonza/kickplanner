'use client'

import { useState } from 'react'
import Link from 'next/link'

export type HomeProject = { id: string; name: string; type: string; color_hue: number | null }

function hashHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % 360
}

// Ícono por tipo de proyecto: SEO (lupa con barras) y WEB (navegador)
function ProjectIcon({ type }: { type: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {type === 'web' ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18" />
          <circle cx="6.5" cy="6.5" r=".6" fill="currentColor" />
        </>
      ) : (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m20 20-4.5-4.5" />
          <path d="M8 12.5v-2M10.5 12.5V8.5M13 12.5v-3" />
        </>
      )}
    </svg>
  )
}

const VISIBLE = 6

/** Módulo "Proyectos" de la portada: solo los proyectos donde el usuario es responsable. */
export default function HomeMyProjects({ projects }: { projects: HomeProject[] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? projects : projects.slice(0, VISIBLE)

  return (
    <section className="card hm-card" aria-labelledby="hm-projects-title">
      <header className="hm-head">
        <h2 className="hm-title" id="hm-projects-title">Proyectos</h2>
        <Link href="/projects" className="hm-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Buscar proyectos
        </Link>
      </header>

      <div className="hm-body">
        {projects.length === 0 ? (
          <p className="hm-empty">No eres responsable de ningún proyecto.</p>
        ) : (
          <ul className="hm-projects">
            {shown.map((p) => {
              const hue = p.color_hue ?? hashHue(p.id)
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="hm-project">
                    <span className="hm-project-icon" style={{ background: `hsl(${hue} 70% 72%)`, color: `hsl(${hue} 45% 14%)` }}>
                      <ProjectIcon type={p.type} />
                    </span>
                    <span className="hm-project-name">{p.name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {projects.length > VISIBLE && (
        <button type="button" className="hm-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Mostrar menos' : 'Mostrar más'}
        </button>
      )}
    </section>
  )
}
