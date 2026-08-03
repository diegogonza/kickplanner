import Link from 'next/link'
import { signout } from '@/app/login/actions'

export default function Sidebar({
  email,
  active = 'projects',
}: {
  email: string
  active?: 'projects' | 'portfolios' | 'teams' | 'mis-tareas'
}) {
  const initial = email?.[0]?.toUpperCase() ?? '?'

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </span>
        Asana Clone
      </div>

      <div className="nav-label">Espacio de trabajo</div>
      <nav className="flex flex-col gap-1">
        <Link className={`nav-item ${active === 'mis-tareas' ? 'active' : ''}`} href="/mis-tareas">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          Mis tareas
        </Link>
        <Link className={`nav-item ${active === 'projects' ? 'active' : ''}`} href="/">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Proyectos
        </Link>
        <Link className={`nav-item ${active === 'portfolios' ? 'active' : ''}`} href="/portfolios">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          Portfolios
        </Link>
        <Link className={`nav-item ${active === 'teams' ? 'active' : ''}`} href="/teams">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Equipos
        </Link>
      </nav>

      <div className="mt-auto flex items-center gap-3 border-t pt-4" style={{ borderColor: 'var(--nav-border)' }}>
        <span className="avatar">{initial}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--nav-text)' }}>
            {email}
          </div>
        </div>
        <form action={signout}>
          <button className="btn-ghost" title="Cerrar sesión" type="submit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </form>
      </div>
    </aside>
  )
}
