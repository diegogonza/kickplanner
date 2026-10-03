/**
 * Esqueleto de la lista de proyectos. Mismo criterio que el de
 * /projects/[id]: estático, sin sesión ni consultas, para que aparezca al
 * instante mientras el servidor resuelve las cuatro consultas de la página.
 *
 * No intenta calcar la rejilla de 12 columnas de `.projtable`: es una fila de
 * bloques (`.sk-row`, el mismo esqueleto que usa el resto de la app) con el
 * alto y el ritmo aproximados. Sirve para que la pantalla no quede en blanco,
 * no para que el salto al contenido real sea imperceptible.
 */
export default function Loading() {
  return (
    <div className="flex h-full" aria-busy="true" aria-label="Cargando proyectos">
      <aside className="sidebar" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div className="flex flex-col gap-3">
            <span className="sk sk-dark" style={{ width: 160, height: 12 }} />
            <span className="sk sk-dark" style={{ width: 200, height: 24 }} />
          </div>
        </header>
        <div className="viewscroll flex-1 overflow-hidden px-6">
          <div className="sk-rows" style={{ paddingTop: 16 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="sk-row">
                <span className="sk" style={{ width: 18, height: 18, borderRadius: 999 }} />
                <span className="sk" style={{ width: `${30 + ((i * 13) % 26)}%`, height: 12 }} />
                <span className="sk" style={{ width: 90, height: 12 }} />
                <span className="sk" style={{ width: 60, height: 12, marginLeft: 'auto' }} />
                <span className="sk" style={{ width: 26, height: 26, borderRadius: 999 }} />
                <span className="sk" style={{ width: 84, height: 20, borderRadius: 999 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
