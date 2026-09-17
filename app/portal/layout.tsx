import type { Metadata } from 'next'
import { Caveat } from 'next/font/google'
import './portal.css'

/**
 * Tipografía manuscrita para la cita de Hellix y la nota al margen.
 *
 * Va por next/font, igual que la fuente de la app: se descarga en el BUILD y
 * se sirve desde el propio dominio. No hay pedido a Google en tiempo de
 * ejecución, que en el portal importa el doble — es una página que ve gente
 * de afuera y no tiene por qué avisarle a un tercero que la abrió.
 */
const manuscrita = Caveat({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-mano',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Portal de cliente · KickPlanner',
  description: 'Seguimiento del avance de tu proyecto',
  // El portal no debe aparecer en buscadores ni filtrar la URL al salir hacia
  // los entregables de Drive.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className={`pt-root ${manuscrita.variable}`}>{children}</div>
}
