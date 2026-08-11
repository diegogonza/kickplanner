'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import AdvancedSearch from './advanced-search'

export default function GlobalSearch() {
  const pathname = usePathname()
  const sp = useSearchParams()

  // No mostrar la barra en el login
  if (pathname === '/login') return null

  const q = pathname === '/buscar' ? sp.get('q') ?? '' : ''

  return (
    <div className="app-topbar">
      <Link href="/" className="app-brand" aria-label="KickPlanner - inicio">
        <img src="/kickplanner.png" alt="KickPlanner" />
      </Link>

      <div className="app-search-wrap">
        <form action="/buscar" className="app-search" role="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            key={pathname + q}
            name="q"
            defaultValue={q}
            placeholder="Buscar tareas…"
            autoComplete="off"
            aria-label="Buscar tareas"
          />
        </form>
        <AdvancedSearch />
      </div>

      <div className="app-topbar-spacer" aria-hidden />
    </div>
  )
}
