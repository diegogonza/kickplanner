'use client'

import { usePathname } from 'next/navigation'

/**
 * El layout raíz monta el buscador global en TODAS las rutas. El portal de
 * clientes no debe mostrar nada de la app interna, así que este envoltorio lo
 * apaga bajo /portal. Todo lo demás queda igual que antes.
 */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname?.startsWith('/portal')) return null
  return <>{children}</>
}
