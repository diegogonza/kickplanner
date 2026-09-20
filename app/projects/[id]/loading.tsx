/**
 * Esqueleto de la vista de proyecto. Se muestra al instante al entrar a un
 * proyecto desde otra pantalla, mientras el servidor arma la página.
 *
 * Es estático a propósito (sin sesión ni consultas): si esperara datos,
 * dejaría de ser instantáneo. Por eso el sidebar es solo su fondo.
 */
export default function Loading() {
  return (
    <div className="flex h-full" aria-busy="true" aria-label="Cargando proyecto">
      <aside className="sidebar" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: "none" }}>
          <div className="flex flex-col gap-3">
            <span className="sk sk-dark" style={{ width: 220, height: 12 }} />
            <span className="sk sk-dark" style={{ width: 280, height: 24 }} />
          </div>
        </header>
        <div className="tabs">
          {[78, 58, 72, 92, 82].map((w, i) => (
            <span key={i} className="tab">
              <span className="sk sk-dark" style={{ width: w, height: 14 }} />
            </span>
          ))}
        </div>
        <div className="viewscroll flex-1 overflow-hidden px-6">
          <div className="sk-rows">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="sk-row">
                <span className="sk" style={{ width: 16, height: 16, borderRadius: 999 }} />
                <span className="sk" style={{ width: `${38 + ((i * 17) % 30)}%`, height: 12 }} />
                <span className="sk" style={{ width: 70, height: 12, marginLeft: "auto" }} />
                <span className="sk" style={{ width: 24, height: 24, borderRadius: 999 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
