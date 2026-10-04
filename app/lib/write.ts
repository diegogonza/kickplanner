/**
 * Escrituras a Supabase que SÍ fallan cuando no se guardó nada.
 *
 * supabase-js no lanza: devuelve `{ error }`. Y peor: un UPDATE o DELETE que la
 * RLS bloquea no devuelve error, devuelve CERO filas. Por eso toda escritura del
 * modal pide `.select('id')` y pasa por `must()`, que convierte ambos casos en
 * una excepción que la cola de guardado sabe atrapar.
 */
export class WriteError extends Error {}

type Res<T> = { data: T; error: { message: string } | null }

export async function must<T>(q: PromiseLike<Res<T>>): Promise<T> {
  const { data, error } = await q
  if (error) throw new WriteError(error.message)
  if (Array.isArray(data) && data.length === 0) throw new WriteError('La base no aceptó el cambio')
  return data
}

/** Opciones de cada trabajo de la cola de guardado del modal. */
export type JobOpts = {
  /** Qué se intentó guardar, para el aviso: "la prioridad", "la subtarea"… */
  what: string
  /** Se ejecuta si falla: devuelve la pantalla al último valor guardado. */
  undo?: () => void
  /** Texto final del aviso; por defecto "Se revirtió el cambio." si hay undo. */
  hint?: string
}

export type Enqueue = (run: () => Promise<unknown>, opts: JobOpts) => void
/** Registra una función que guarda lo que está esperando en un debounce. */
export type RegisterFlush = (fn: () => void) => () => void
