/**
 * Eventos de window que usan dos componentes de cliente para hablarse sin
 * envolver nada en un provider. Viven acá para que renombrar uno no deje al
 * otro escuchando en silencio un evento que ya nadie dispara.
 */

/** Lo dispara el botón del header de Proyectos; lo escucha ProjectsView. */
export const OPEN_NEW_PROJECT = 'kp-open-new-project'
