import { redirect } from 'next/navigation'

// El panel ahora es una vista de Proyectos (/projects?view=panel). Esta ruta se
// deja redirigiendo para no romper enlaces guardados ni el historial.
// /panel/tareas sigue funcionando: es una ruta hija independiente.
export default function PanelPage() {
  redirect('/projects?view=panel')
}
