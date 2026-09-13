import { getSessionProfile } from "@/app/lib/session";

/** Primer nombre a partir del perfil; si no hay, la parte anterior al @ del correo. */
function firstName(fullName: string | null, email: string): string {
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
}: {
  /** Si no se pasa, se resuelve del perfil de la sesión. */
  name?: string;
  title?: string;
  /** Palabra final del titular, en verde. */
  highlight?: string;
  quote?: string;
  items?: string[];
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
      </div>
    </section>
  );
}
