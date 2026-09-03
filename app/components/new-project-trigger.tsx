'use client'

// Botón del header que abre el modal de "Crear proyecto" de ProjectsView (vía evento)
export default function NewProjectTrigger() {
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => window.dispatchEvent(new Event('open-new-project'))}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      Iniciar un nuevo proyecto
    </button>
  )
}
