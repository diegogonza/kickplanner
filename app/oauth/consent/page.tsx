import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSessionProfile } from "@/app/lib/session";
import { aprobarAcceso, rechazarAcceso } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Pantalla de consentimiento OAuth.
 *
 * Supabase Auth manda acá al miembro cuando un cliente (Claude) pide acceso,
 * con ?authorization_id=... Si no hay sesión, el proxy lo lleva al login y lo
 * devuelve a esta misma URL. Si ya había aprobado antes a ese cliente, Supabase
 * responde directamente con la URL de vuelta y no se muestra nada.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
  const { authorization_id: id, error: errorParam } = await searchParams;

  if (!id) {
    return <Aviso titulo="Falta la solicitud" texto="Este enlace no trae una solicitud de acceso válida. Volvé a conectar desde Claude." />;
  }

  const { user } = await getSessionProfile();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);

  if (error || !data) {
    return (
      <Aviso
        titulo="La solicitud ya no es válida"
        texto="Puede que haya vencido o que ya se haya usado. Volvé a Claude y empezá la conexión de nuevo."
      />
    );
  }

  // Ya había consentido antes a este cliente: de vuelta sin preguntar.
  if ("redirect_url" in data) redirect(data.redirect_url);

  const nombre = data.client.name || "Una aplicación";
  const inicial = nombre.trim().charAt(0).toUpperCase() || "?";

  return (
    <main style={estilos.stage}>
      <div style={estilos.card}>
        <div style={estilos.logos} aria-hidden="true">
          <span style={estilos.chip}>{inicial}</span>
          <span style={estilos.flecha}>⟷</span>
          <span style={{ ...estilos.chip, background: "var(--brand-600, #1f6f4a)", color: "#fff" }}>K</span>
        </div>

        <h1 style={estilos.titulo}>
          {nombre} quiere acceder a tu cuenta de KickPlanner
        </h1>
        <p style={estilos.cuenta}>
          Vas a autorizar como <strong>{data.user.email}</strong>
        </p>

        {errorParam && (
          <p role="alert" style={estilos.error}>
            No se pudo registrar tu decisión. Probá de nuevo.
          </p>
        )}

        <div style={estilos.bloque}>
          <p style={estilos.subtitulo}>Si aceptás, podrá:</p>
          <ul style={estilos.lista}>
            <li>Ver los proyectos, tareas, clientes y personas que vos ves.</li>
            <li>Crear y editar tareas, comentar y actualizar el estado de los proyectos a tu nombre.</li>
          </ul>
          <p style={estilos.nota}>
            Nunca verá más de lo que vos podés ver: se aplican tus mismos permisos. Podés quitarle el
            acceso cuando quieras desde Ajustes.
          </p>
        </div>

        <div style={estilos.acciones}>
          <form action={rechazarAcceso}>
            <input type="hidden" name="authorization_id" value={data.authorization_id} />
            <button type="submit" className="btn btn-ghost">Cancelar</button>
          </form>
          <form action={aprobarAcceso}>
            <input type="hidden" name="authorization_id" value={data.authorization_id} />
            <button type="submit" className="btn btn-primary">Autorizar</button>
          </form>
        </div>

        <p style={estilos.pie}>Te va a devolver a {hostDe(data.redirect_uri)}</p>
      </div>
    </main>
  );
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main style={estilos.stage}>
      <div style={estilos.card}>
        <h1 style={estilos.titulo}>{titulo}</h1>
        <p style={estilos.nota}>{texto}</p>
      </div>
    </main>
  );
}

const estilos = {
  stage: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "24px 16px",
    background: "var(--bg, #f6f7f6)",
  },
  card: {
    width: "100%",
    maxWidth: 460,
    background: "var(--panel, #fff)",
    border: "1px solid var(--border, #e3e6e4)",
    borderRadius: "var(--r-lg, 14px)",
    padding: "32px 28px 24px",
    boxShadow: "0 10px 30px rgba(0,0,0,.06)",
  },
  logos: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 20 },
  chip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    fontWeight: 700,
    fontSize: 18,
    background: "var(--brand-50, #eaf5ef)",
    color: "var(--text, #111)",
  },
  flecha: { color: "var(--text-3, #888)", fontSize: 18 },
  titulo: { fontSize: 19, lineHeight: 1.3, margin: "0 0 6px", textAlign: "center" as const },
  cuenta: { margin: "0 0 20px", fontSize: 13.5, color: "var(--text-2, #555)", textAlign: "center" as const },
  error: {
    margin: "0 0 16px",
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 13,
    background: "var(--danger-bg, #fdecec)",
    color: "var(--danger-fg, #a11)",
  },
  bloque: {
    border: "1px solid var(--border, #e3e6e4)",
    borderRadius: "var(--r-md, 10px)",
    padding: "14px 16px",
    marginBottom: 20,
  },
  subtitulo: { margin: "0 0 8px", fontSize: 13.5, fontWeight: 600 },
  lista: { margin: "0 0 10px", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55 },
  nota: { margin: 0, fontSize: 12.5, color: "var(--text-3, #777)", lineHeight: 1.5 },
  acciones: { display: "flex", justifyContent: "flex-end", gap: 8 },
  pie: { margin: "16px 0 0", fontSize: 12, color: "var(--text-3, #888)", textAlign: "center" as const },
};
