'use client'

import Link, { useLinkStatus } from 'next/link'

/**
 * Pestaña de navegación con aviso de "cargando". Cambiar de pestaña es una
 * navegación al servidor; mientras llega la respuesta, la pestaña pulsada se
 * marca al instante para que el clic no parezca ignorado.
 */
export default function TabLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link href={href} className={`tab ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
      <Pending />
      {children}
    </Link>
  )
}

// useLinkStatus solo funciona en un descendiente del <Link>
function Pending() {
  const { pending } = useLinkStatus()
  return <span className={`tab-pending${pending ? ' is-on' : ''}`} aria-hidden="true" />
}
