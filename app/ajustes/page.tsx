import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSessionProfile } from "@/app/lib/session";
import Sidebar from "@/app/components/sidebar";
import Avatar from "@/app/components/avatar";
import { updateProfile, uploadAvatar, removeAvatar } from "./actions";

/** Consejo contextual: cambia según lo que le falte al perfil. */
function tipFor(p: {
  full_name?: string | null;
  job_title?: string | null;
  department?: string | null;
  avatar_url?: string | null;
}) {
  if (!p.avatar_url)
    return "Una foto de perfil hace que tu equipo te reconozca de un vistazo en tareas y comentarios.";
  if (!p.full_name?.trim())
    return "Poné tu nombre completo: es lo que ve el equipo cuando te asignan una tarea o te mencionan.";
  if (!p.job_title?.trim())
    return "Un puesto claro ayuda a saber a quién acudir cuando algo se traba.";
  if (!p.department?.trim())
    return "Indicá tu equipo o departamento para que las menciones lleguen a la persona correcta.";
  return "Tu perfil está completo. Mantenelo al día cuando cambies de rol o de equipo.";
}

/** Resultado de la subida de foto. La acción redirige con ?foto=<clave>. */
const FOTO_MSG: Record<string, { tone: "ok" | "error"; text: string }> = {
  ok: { tone: "ok", text: "Foto de perfil actualizada." },
  vacio: { tone: "error", text: "No elegiste ningún archivo." },
  grande: {
    tone: "error",
    text: "La imagen supera los 5 MB. Probá con una más liviana.",
  },
  tipo: { tone: "error", text: "Formato no admitido. Usá JPG, PNG o WebP." },
  error: {
    tone: "error",
    text: "No pudimos subir la foto. Intentá de nuevo en un momento.",
  },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ foto?: string }>;
}) {
  const { foto } = await searchParams;
  const aviso = foto ? FOTO_MSG[foto] : undefined;

  // Cacheado por request: lo comparte con el sidebar.
  const { user } = await getSessionProfile();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, job_title, department, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const email = user.email ?? "";
  const firstName =
    profile?.full_name?.trim().split(/\s+/)[0] ||
    email.split("@")[0] ||
    "equipo";

  return (
    <div className="flex h-full">
      <Sidebar active="ajustes" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">Ajustes</h1>
          </div>
        </header>

        <div className="viewscroll flex-1 overflow-y-auto px-6">
          <div className="st-grid">
            {/* ---------- Formulario ---------- */}
            <div className="st-card">
              <div className="st-head">
                <h2 className="st-title">Información de perfil</h2>
                <p className="st-desc">
                  Actualizá tus datos personales. Esta información es visible
                  para tu equipo.
                </p>
              </div>

              {aviso && (
                <p className={`st-alert st-alert-${aviso.tone}`} role="status">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {aviso.tone === "ok" ? (
                      <path d="m5 12.5 4.2 4.2L19 7" />
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7.5v5.5" />
                        <path d="M12 16.4h.01" />
                      </>
                    )}
                  </svg>
                  {aviso.text}
                  <Link
                    href="/ajustes"
                    className="st-alert-close"
                    aria-label="Cerrar aviso"
                  >
                    ✕
                  </Link>
                </p>
              )}

              {/* Foto: form propio, la sube al elegir y confirmar */}
              <div className="st-photo">
                <span className="st-avatar-ring">
                  <Avatar
                    name={profile?.full_name}
                    email={email}
                    url={profile?.avatar_url}
                    size={92}
                  />
                </span>

                <div className="st-photo-body">
                  <p className="st-photo-title">Foto de perfil</p>
                  <p className="st-photo-desc">
                    Una buena foto ayuda a que tu equipo te reconozca
                    fácilmente.
                  </p>

                  <form action={uploadAvatar} className="st-file">
                    <input
                      type="file"
                      name="avatar"
                      accept="image/png, image/jpeg, image/webp"
                      aria-label="Elegir foto de perfil"
                    />
                    <button type="submit" className="btn btn-primary">
                      Subir
                    </button>
                  </form>

                  <div className="st-photo-meta">
                    <span>JPG, PNG o WebP · hasta 5 MB.</span>
                    {profile?.avatar_url && (
                      <form action={removeAvatar}>
                        <button type="submit" className="st-remove">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                          </svg>
                          Eliminar foto
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>

              <div className="st-sep" />

              {/* Datos básicos */}
              <form action={updateProfile}>
                <div className="st-fields">
                  <label className="st-field">
                    <span className="st-label">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
                      </svg>
                      Nombre completo
                    </span>
                    <input
                      name="full_name"
                      className="field"
                      defaultValue={profile?.full_name ?? ""}
                      placeholder="Tu nombre completo"
                      autoComplete="off"
                    />
                  </label>

                  <label className="st-field">
                    <span className="st-label">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="7" width="18" height="13" rx="2" />
                        <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                      </svg>
                      Nombre del puesto
                    </span>
                    <input
                      name="job_title"
                      className="field"
                      defaultValue={profile?.job_title ?? ""}
                      placeholder="p. ej. Director SEO"
                      autoComplete="off"
                    />
                  </label>

                  <label className="st-field">
                    <span className="st-label">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9.5" cy="7" r="3.5" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      </svg>
                      Departamento o equipo
                    </span>
                    <input
                      name="department"
                      className="field"
                      defaultValue={profile?.department ?? ""}
                      placeholder="p. ej. Marketing"
                      autoComplete="off"
                    />
                  </label>

                  <div className="st-field">
                    <span className="st-label">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="m4 7 7.4 5.2a1 1 0 0 0 1.2 0L20 7" />
                      </svg>
                      Email
                    </span>
                    <input
                      className="field"
                      value={email}
                      disabled
                      aria-label="Email"
                    />
                    <p className="st-hint">El email no se puede modificar.</p>
                  </div>
                </div>

                <div className="st-actions">
                  <button type="submit" className="btn btn-primary">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <path d="M17 21v-8H7v8M7 3v5h8" />
                    </svg>
                    Guardar cambios
                  </button>
                </div>
              </form>
            </div>

            {/* ---------- Hellix ---------- */}
            <aside className="st-card st-aside">
              <p className="st-hello">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2.5 13.7 8l5.5 1.7-5.5 1.7L12 17l-1.7-5.6L4.8 9.7 10.3 8 12 2.5Z" />
                  <path
                    d="M19 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"
                    opacity=".55"
                  />
                </svg>
                ¡Hola, {firstName}!
              </p>
              <p className="st-msg">
                Pequeños ajustes, grandes resultados. Mantené tu perfil
                actualizado y tu equipo siempre te encontrará.
              </p>

              <div className="st-hellix">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/Hellix/hellix-coffe.webp"
                  alt=""
                  aria-hidden="true"
                  width={766}
                  height={908}
                  decoding="async"
                />
                <span className="st-note" aria-hidden="true">Planifica hoy, logra mañana ♥</span>
              </div>

              <div className="st-tip">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 18h6M10 22h4" />
                  <path d="M12 2a6 6 0 0 0-3.5 10.9c.5.4.8.9.9 1.5l.1.6h5l.1-.6c.1-.6.4-1.1.9-1.5A6 6 0 0 0 12 2Z" />
                </svg>
                <div>
                  <p className="st-tip-title">Consejo de Hellix</p>
                  <p className="st-tip-text">{tipFor(profile ?? {})}</p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
