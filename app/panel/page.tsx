import { redirect } from 'next/navigation'

// El panel pasó a ser la portada del espacio de trabajo. Esta ruta se deja
// redirigiendo para no romper enlaces guardados ni el historial del navegador.
// /panel/tareas sigue funcionando: es una ruta hija independiente.
export default function PanelPage() {
  redirect('/')
}
