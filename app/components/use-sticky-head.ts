'use client'

import { useEffect, useState } from 'react'

/**
 * Detecta si el encabezado de una tabla ya quedó fijado arriba, para darle más
 * aire y una sombra en ese estado (CSS no tiene un pseudo-selector ":stuck").
 *
 * Uso:
 *   const { sentinelRef, stuckClass } = useStickyHead()
 *   <div className={`mitabla ${stuckClass}`}>
 *     <div ref={sentinelRef} className="sticky-sentinel" aria-hidden="true" />
 *     <div className="mitabla-head">…</div>
 *
 * El centinela de 1px va justo encima del encabezado: sale del contenedor de
 * scroll exactamente cuando el encabezado empieza a estar fijo.
 *
 * Dos condiciones importantes:
 *
 * 1. El contenedor de scroll no debe tener padding vertical propio: `position:
 *    sticky` se ancla al content box y las filas se verían pasar por esa franja.
 *    Para eso está la clase `.viewscroll` en globals.css.
 *
 * 2. El centinela NO puede vivir dentro de un componente declarado en el cuerpo
 *    de otro componente (`const Head = () => …`). Ese tipo se recrea en cada
 *    render, React remonta el subárbol, el ref se dispara con null y luego con
 *    el nodo, y eso vuelve a renderizar: bucle infinito. Ponelo suelto en el
 *    contenedor de la tabla.
 */
export function useStickyHead() {
  // Callback ref (en estado) para que el efecto también corra cuando la tabla
  // se monta después, por ejemplo al limpiar un filtro sin resultados.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    if (!sentinel) return

    let scroller: HTMLElement | null = sentinel.parentElement
    while (scroller) {
      const oy = getComputedStyle(scroller).overflowY
      if (oy === 'auto' || oy === 'scroll') break
      scroller = scroller.parentElement
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        // Solo cuenta como "pegado" si el centinela quedó por ENCIMA del
        // scroller. Si la tabla todavía está más abajo del área visible
        // tampoco intersecta, pero el encabezado no está fijo.
        const rootTop = entry.rootBounds?.top ?? 0
        setStuck(!entry.isIntersecting && entry.boundingClientRect.top <= rootTop)
      },
      { root: scroller, threshold: 1 },
    )
    io.observe(sentinel)
    return () => io.disconnect()
  }, [sentinel])

  return { sentinelRef: setSentinel, stuck, stuckClass: stuck ? 'is-stuck' : '' }
}
