// Tipos compartidos entre componentes de proyecto.

/** Opción de cliente en selectores. */
export type ClientOption = { id: string; name: string }

/** Persona del equipo (RPC workspace_members). */
export type WorkspaceMember = { user_id: string; email: string; full_name: string | null }
