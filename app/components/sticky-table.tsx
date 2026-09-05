'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useStickyHead } from './use-sticky-head'

/**
 * Contenedor de tabla con encabezado fijo. Inserta el centinela y aplica
 * `.is-stuck` cuando el encabezado queda pegado arriba.
 *
 * Útil sobre todo desde componentes de servidor, que no pueden usar el hook.
 * El encabezado (.lt-head / .projtable-head) debe ser hijo directo.
 */
export default function StickyTable({
  className = '',
  style,
  children,
}: {
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const { sentinelRef, stuckClass } = useStickyHead()
  return (
    <div className={`${className} ${stuckClass}`} style={style}>
      <div ref={sentinelRef} className="sticky-sentinel" aria-hidden="true" />
      {children}
    </div>
  )
}
