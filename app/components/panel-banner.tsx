import Link from "next/link";
import { getSessionProfile } from "@/app/lib/session";

/** Dato real del día para la columna derecha del banner (reemplaza la lista fija). */
export type BannerStat = {
  value: number;
  label: string;
  href?: string;
  /** "alert": se pinta en rojo cuando value > 0 (atrasadas, en riesgo). */
  tone?: "alert";
};

/** Primer nombre a partir del perfil; si no hay, la parte anterior al @ del correo. */
export function firstName(fullName: string | null, email: string): string {
  const fromProfile = fullName?.trim().split(/\s+/)[0];
  if (fromProfile) return fromProfile;
  const local = (email.split("@")[0] || "")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(" ")[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "equipo";
}

const DEFAULT_ITEMS = [
  "Menos reuniones",
  "Más foco",
  "Entregas a tiempo",
  "Clientes felices",
];

export default async function PanelBanner({
  name,
  title = "Que tengas una semana",
  highlight = "imparable",
  quote = "“La disciplina de hoy construye los resultados de mañana.”",
  items = DEFAULT_ITEMS,
  stats,
}: {
  /** Si no se pasa, se resuelve del perfil de la sesión. */
  name?: string;
  title?: string;
  /** Palabra final del titular, en verde. */
  highlight?: string;
  quote?: string;
  items?: string[];
  /** Si se pasa, la columna derecha muestra este resumen en vez de `items`. */
  stats?: BannerStat[];
}) {
  let resolved = name;
  if (!resolved) {
    // Cacheado por request: no repite el getUser ni la consulta del sidebar.
    const { user, fullName } = await getSessionProfile();
    resolved = firstName(fullName, user?.email ?? "");
  }

  return (
    <section className="pbanner" aria-labelledby="pbanner-title">
      <div className="pbanner-inner">
        <div className="pbanner-text">
          <p className="pbanner-hello">¡Hola {resolved}!</p>
          <h2 className="pbanner-title" id="pbanner-title">
            {title} <span>{highlight}</span>
          </h2>
          <span className="pbanner-rule" aria-hidden="true" />
          <p className="pbanner-quote">{quote}</p>
        </div>

        <div className="pbanner-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Hellix/hellix-books.webp"
            alt=""
            aria-hidden="true"
            width={800}
            height={1000}
            decoding="async"
          />
        </div>

        {stats ? (
          <div className="pbanner-list">
            <h3 className="pbanner-list-title" id="pbanner-resumen">Resumen</h3>
            <ul className="pbanner-stats" aria-labelledby="pbanner-resumen">
            {stats.map((st) => {
              const alert = st.tone === "alert" && st.value > 0;
              const body = (
                <>
                  <span className={`pbanner-num${alert ? " is-alert" : ""}`}>{st.value}</span>
                  {st.label}
                </>
              );
              return (
                <li className="pbanner-item" key={st.label}>
                  {st.href ? (
                    <Link href={st.href} className="pbanner-stat-link">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
            </ul>
          </div>
        ) : (
          <ul className="pbanner-list">
            {items.map((it, i) => (
              <li className="pbanner-item" key={`${i}-${it}`}>
                <span className="pbanner-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="m5 12.5 4.2 4.2L19 7"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                {it}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
