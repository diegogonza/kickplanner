import Image from 'next/image'
import { cookies } from 'next/headers'
import { entrarAlPortal, entrarComoEquipo, salirDelPortal } from '../actions'
import Activities from '../activities'
import SeoCard from '../seo-card'
import HitosCard from '@/app/components/hitos-card'
import { calcularHitos } from '@/app/lib/hitos'
import {
  PORTAL_COOKIE,
  esSesionDeEquipo,
  mesLargo,
  portalMe,
  portalProject,
  portalProjects,
  portalSeo,
  puedeVerComoEquipo,
  type PortalDetail,
} from '../data'

export const dynamic = 'force-dynamic'

/* El archivo mide 2560 × 274. Se declaran esas medidas para que Next reserve
   el espacio correcto y la barra no salte al cargar; el tamaño real lo fija el
   CSS con `height` y `width: auto`. */
const LOGO = { src: '/kickranking-blanco-verde.png', ancho: 2560, alto: 274 }

function Marca() {
  return (
    <span className="pt-brand">
      <Image src={LOGO.src} alt="KickRanking" width={LOGO.ancho} height={LOGO.alto} priority />
    </span>
  )
}

/* ---------- Puerta de contraseña ---------- */
function Puerta({
  slug,
  error,
  equipo,
}: {
  slug: string
  error: boolean
  /** La persona logueada es del equipo y tiene acceso a este cliente. */
  equipo: boolean
}) {
  return (
    <div className="pt-gate">
      <div className="pt-gate-in">
        {/* El logo va FUERA de la tarjeta, sobre el fondo oscuro. La palabra
            "RANKING" es blanca: encima de la tarjeta blanca desaparecía media
            marca. */}
        <Image
          className="pt-gate-logo"
          src={LOGO.src} alt="KickRanking"
          width={LOGO.ancho} height={LOGO.alto} priority
        />
        <div className="pt-gate-box">
        <h1>Acceso a tu portal</h1>
        <p className="lead">
          Ingresá la contraseña que te compartió el equipo de KickRanking para ver el
          avance de tu proyecto.
        </p>
        <form action={entrarAlPortal}>
          <input type="hidden" name="slug" value={slug} />
          <label htmlFor="pt-pass">Contraseña</label>
          <input
            id="pt-pass" className="pt-input" name="password" type="password"
            autoComplete="current-password" placeholder="••••••••••" required autoFocus
          />
          {error && (
            <p className="pt-err">
              La contraseña no coincide. Revisá que sea la última que te enviamos:
              después de dos intentos fallidos el acceso queda bloqueado 40 minutos
              por seguridad. Si seguís sin poder entrar, escribinos y lo desbloqueamos.
            </p>
          )}
          <button className="pt-submit" type="submit">Entrar</button>
        </form>

        {/* Atajo para KickRanking: quien ya está logueado en la app no
            necesita la contraseña del cliente. La autorización la hace
            Postgres con auth.uid(), no este botón. */}
        {equipo && (
          <form action={entrarComoEquipo} className="pt-equipo">
            <input type="hidden" name="slug" value={slug} />
            <button type="submit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              </svg>
              Entrar como equipo de KickRanking
            </button>
            <span>Sin contraseña. Vas a ver exactamente lo que ve el cliente.</span>
          </form>
        )}
        <p className="foot">
          Este portal es de solo lectura: podés consultar el avance y abrir los
          entregables, pero nada se modifica desde acá.
        </p>
        </div>
      </div>
    </div>
  )
}

/* ---------- Página ---------- */
export default async function PortalCliente({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ e?: string; p?: string }>
}) {
  const { slug } = await params
  const { e, p } = await searchParams

  const token = (await cookies()).get(PORTAL_COOKIE)?.value
  const me = token ? await portalMe(token) : null
  if (!token || !me || me.slug !== slug) {
    // Antes de pedir contraseña: ¿es alguien del equipo con acceso a este
    // cliente? Si sí, la puerta le ofrece entrar de un clic.
    const equipo = await puedeVerComoEquipo(slug)
    return <Puerta slug={slug} error={e === '1'} equipo={equipo} />
  }

  const vistaEquipo = await esSesionDeEquipo(token)

  const proyectos = await portalProjects(token)
  const inicial = me.client_name.trim().charAt(0).toUpperCase()

  const Barra = (
    <>
      {/* Si mira el equipo, hay que decirlo. Nadie debería confundir la vista
          del cliente con una pantalla interna y sacar conclusiones de lo que
          ve —o de lo que NO ve— sin saber desde dónde está mirando. */}
      {vistaEquipo && (
        <div className="pt-equipo-bar">
          <span>
            Vista de equipo: estás viendo exactamente lo que ve el cliente.
          </span>
          <a href="/portales">Volver a KickPlanner</a>
        </div>
      )}
    <header className="pt-top">
      <div className="pt-top-in">
        <Marca />
        <div className="pt-who">
          <span className="pt-ava">{inicial}</span>
          <span className="pt-who-nm">{me.client_name}</span>
          <form action={salirDelPortal}>
            <input type="hidden" name="slug" value={slug} />
            <button className="pt-out" type="submit">Salir</button>
          </form>
        </div>
      </div>
    </header>
    </>
  )

  if (proyectos.length === 0) {
    return (
      <>
        {Barra}
        <div className="pt-wrap">
          <div className="pt-card">
            <div className="pt-empty">
              <b>Tu portal todavía se está preparando</b>
              <span>
                El equipo está dejando listo el seguimiento de tu proyecto. En cuanto
                haya avances para mostrar, los vas a ver acá.
              </span>
            </div>
          </div>
        </div>
      </>
    )
  }

  const elegido = proyectos.find((x) => x.id === p) ?? proyectos[0]
  const det: PortalDetail | null = await portalProject(token, elegido.id)
  // La sesión es válida y el proyecto salió de SU propia lista: si el detalle
  // no llega, es un fallo puntual de lectura, no un problema de acceso.
  // Mandarlo a la puerta de contraseña sería pedirle la clave a alguien que ya
  // está adentro, y encima sin decirle por qué.
  if (!det) {
    return (
      <>
        {Barra}
        <div className="pt-wrap">
          <div className="pt-card">
            <div className="pt-empty">
              <b>No pudimos cargar este proyecto</b>
              <span>
                Fue un problema nuestro, no tuyo. Volvé a cargar la página en un
                momento; si sigue igual, avisanos y lo revisamos.
              </span>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Solo los proyectos de SEO muestran datos de búsqueda. Si algo falla,
  // portalSeo devuelve null y la tarjeta simplemente no aparece.
  const seo =
    det.project.type === 'seo' ? await portalSeo(token, elegido.id) : null

  const R = 34
  const C = 2 * Math.PI * R

  return (
    <>
      {Barra}

      <div className="pt-wrap">
        {/* Banda de bienvenida */}
        <section className="pt-hero">
          {/* Ondas de fondo. Decorativas: aria-hidden y sin texto adentro. */}
          <svg className="pt-hero-olas" viewBox="0 0 1200 220" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 154 C 190 96 320 190 520 150 C 720 110 880 176 1200 120 L1200 220 L0 220 Z" fill="var(--brand-100)" opacity=".55" />
            <path d="M0 186 C 230 132 400 214 640 172 C 880 130 1010 196 1200 160 L1200 220 L0 220 Z" fill="var(--brand-200)" opacity=".45" />
            <path d="M700 0 C 860 44 980 8 1200 40 L1200 0 Z" fill="var(--brand-100)" opacity=".5" />
          </svg>

          <div className="pt-hero-in">
            <span className="pt-hero-eyebrow">Tu proyecto en buenas manos</span>
            <h1>
              Bienvenido, {me.client_name}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
              </svg>
            </h1>
            <p>
              Acá podés revisar el avance de tu proyecto, los resultados en Google y
              las actividades que estamos trabajando para hacer crecer tu marca.
            </p>
            <span className="pt-hero-chip">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" />
              </svg>
              Disciplina hoy. Más visibilidad mañana.
            </span>
          </div>

          <figure className="pt-hero-cita">
            <blockquote>
              Estoy acá para mantenerte al tanto de todo el progreso.
            </blockquote>
            <figcaption>
              — Hellix
              {/* La flecha apunta a la ilustración, que va justo al lado. */}
              <svg viewBox="0 0 60 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M56 4 C 44 6 26 12 14 26" />
                <path d="M9 20 L12 28 L21 27" />
              </svg>
            </figcaption>
          </figure>

          <div className="pt-hero-mascota">
            {/* Decorativa: el alt vacío evita que un lector de pantalla lea
                "Hellix" como si fuera información del proyecto. */}
            <Image
              src="/Hellix/hellix-coffe.webp"
              alt=""
              width={766}
              height={908}
              priority
            />
          </div>
        </section>

        {proyectos.length > 1 && (
          <nav className="pt-projs" aria-label="Tus proyectos">
            {proyectos.map((pr) => (
              <a
                key={pr.id}
                href={`/portal/${slug}?p=${pr.id}`}
                className={`pt-proj ${pr.id === elegido.id ? 'on' : ''}`}
              >
                {pr.name}
                <span className="pt-n">{pr.pct}%</span>
              </a>
            ))}
          </nav>
        )}

        {/* Resumen */}
        <section className="pt-kpis">
          <div className="pt-kpi pt-kpi-main">
            <svg viewBox="0 0 84 84" width="78" height="78" role="img"
                 aria-label={`Avance del proyecto: ${det.pct} por ciento`}>
              <circle cx="42" cy="42" r={R} fill="none" stroke="var(--brand-100)" strokeWidth="11" />
              <circle
                cx="42" cy="42" r={R} fill="none" stroke="var(--brand-600)" strokeWidth="11"
                strokeLinecap="round" transform="rotate(-90 42 42)"
                strokeDasharray={`${(C * det.pct) / 100} ${C}`}
              />
              <text x="42" y="42" textAnchor="middle" dominantBaseline="central"
                    fontSize="19" fontWeight="800" fill="var(--text)"
                    fontFamily="var(--font-sans)">{det.pct}%</text>
            </svg>
            <div>
              <h2>Avance general</h2>
              <p>
                {det.project.start_date
                  ? `En marcha desde ${mesLargo(det.project.start_date)}`
                  : det.project.name}
              </p>
            </div>
          </div>

          <div className="pt-kpi">
            <span className="pt-ic total">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11H3v10h6z" /><path d="M15 3H9v18h6z" /><path d="M21 8h-6v13h6z" />
              </svg>
            </span>
            <div><b>{det.total}</b><span>Actividades totales</span></div>
          </div>

          <div className="pt-kpi">
            <span className="pt-ic run">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 4 14 8-14 8z" />
              </svg>
            </span>
            <div><b>{det.running}</b><span>En curso</span></div>
          </div>

          <div className="pt-kpi">
            <span className="pt-ic done">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <div><b>{det.done}</b><span>Completadas</span></div>
          </div>
        </section>

        <SeoCard datos={seo} projectId={elegido.id} />

        {/* Hitos de clics orgánicos: misma regla que en la app (mes completo). */}
        {seo?.estado === 'ok' && seo.serie && seo.serie.length > 0 && (
          <HitosCard variant="portal" hitos={calcularHitos(seo.serie)} />
        )}

        <Activities tasks={det.tasks} />

        <p className="pt-foot">
          {det.project.name} · Portal de seguimiento de KickRanking
        </p>
      </div>
    </>
  )
}
