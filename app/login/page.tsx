import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="lg-stage">
      <style>{`
        .lg-stage {
          --lg-green: #07DA5D;
          --lg-green-hi: #35F07F;
          --lg-green-lo: #05B84D;
          --lg-green-deep: #04963E;
          --lg-panel: #FFFFFF;
          --lg-stage-bg: #050C09;   /* negro carbón verdoso */
          --lg-field: #FFFFFF;
          --lg-line: #CBD5D8;
          --lg-line-strong: #94A6AD;
          --lg-ink: #0B1B21;
          --lg-muted: #6B7B82;

          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 100dvh;
          padding: 32px 20px;
          background: var(--lg-stage-bg);
          overflow: hidden;
        }
        .lg-stage,
        .lg-stage *,
        .lg-stage *::before,
        .lg-stage *::after { box-sizing: border-box; }

        /* halo verde detrás de la tarjeta */
        .lg-stage::before {
          content: "";
          position: absolute;
          inset: -20%;
          background:
            radial-gradient(38% 44% at 28% 42%, rgba(7, 218, 93, 0.22), transparent 70%),
            radial-gradient(40% 40% at 78% 78%, rgba(7, 218, 93, 0.10), transparent 72%);
          pointer-events: none;
        }

        .lg-card {
          position: relative;
          display: grid;
          grid-template-columns: 1.05fr 1fr;
          width: 100%;
          max-width: 1040px;
          min-height: 620px;
          background: var(--lg-panel);
          border-radius: 28px;
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.06),
            0 40px 90px -30px rgba(0, 0, 0, 0.85),
            0 0 120px -40px rgba(7, 218, 93, 0.35);
        }

        /* ---- panel izquierdo: imagen ---- */
        .lg-art {
          position: relative;
          background-color: #061109;
          background-image: url("/hell-basement-bg.webp");
          background-size: cover;
          background-position: center;
          clip-path: polygon(0 0, 100% 0, calc(100% - 90px) 100%, 0 100%);
        }
        .lg-art::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(3, 12, 7, 0.35) 0%, rgba(3, 12, 7, 0) 35%, rgba(3, 12, 7, 0.55) 100%),
            linear-gradient(90deg, rgba(3, 12, 7, 0.25) 0%, rgba(3, 12, 7, 0) 45%);
        }
        .lg-art-caption {
          position: absolute;
          left: 34px;
          bottom: 30px;
          z-index: 1;
          max-width: 60%;
        }
        .lg-art-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--lg-green-hi);
          text-shadow: 0 1px 12px rgba(0, 0, 0, 0.9);
        }
        .lg-art-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: var(--lg-green-hi);
          box-shadow: 0 0 10px 2px rgba(53, 240, 127, 0.8);
        }

        /* ---- panel derecho: formulario ---- */
        .lg-form-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 56px 56px 48px;
        }
        .lg-form {
          position: relative;
          display: flex;
          flex-direction: column;
          width: 100%;
          max-width: 360px;
        }
        .lg-logo {
          width: 340px;
          max-width: 100%;
          height: auto;
          margin-bottom: 10px;
          display: block;
        }

        .lg-error {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 16px;
          padding: 10px 12px;
          border: 1px solid #FBD5D5;
          border-radius: 12px;
          background: #FEF2F2;
          font-size: 13px;
          line-height: 1.4;
          color: #B42318;
        }

        .lg-field { position: relative; margin-bottom: 14px; }
        .lg-input {
          width: 100%;
          height: 54px;
          padding: 0 48px 0 18px;
          border: 1px solid var(--lg-line);
          border-radius: 14px;
          background: var(--lg-field);
          font-family: inherit;
          font-size: 15px;
          color: var(--lg-ink);
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
        }
        .lg-input::placeholder { color: var(--lg-muted); }
        .lg-input:hover { border-color: var(--lg-line-strong); }
        .lg-input:focus {
          border-color: var(--lg-green);
          box-shadow: 0 0 0 4px rgba(7, 218, 93, 0.16);
        }
        /* el autocompletado de Chrome pinta el campo de amarillo/azul: se anula */
        .lg-input:-webkit-autofill,
        .lg-input:-webkit-autofill:hover,
        .lg-input:-webkit-autofill:focus {
          -webkit-text-fill-color: var(--lg-ink);
          -webkit-box-shadow: 0 0 0 1000px var(--lg-field) inset;
          caret-color: var(--lg-ink);
        }
        .lg-icon {
          position: absolute;
          top: 50%;
          right: 16px;
          transform: translateY(-50%);
          color: var(--lg-muted);
          pointer-events: none;
        }
        .lg-input:focus + .lg-icon { color: var(--lg-green-lo); }

        .lg-btn {
          height: 54px;
          margin-top: 2px;
          border: 0;
          border-radius: 12px;
          background: var(--lg-green-lo) !important;
          color: #ffffff !important;
          font-family: inherit;
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.01em;
          cursor: pointer;
          transition: background-color 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
        }
        .lg-btn:hover {
          background: var(--lg-green-deep) !important;
          box-shadow: 0 8px 20px -10px rgba(4, 150, 62, 0.75);
        }
        .lg-btn:active {
          background: var(--lg-green-deep) !important;
          transform: translateY(1px);
          box-shadow: none;
        }
        .lg-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 4px rgba(7, 218, 93, 0.28);
        }

        .lg-foot {
          margin-top: 24px;
          font-size: 12px;
          line-height: 1.5;
          text-align: center;
          color: var(--lg-muted);
        }

        /* ---- responsive ---- */
        @media (max-width: 880px) {
          .lg-card {
            grid-template-columns: 1fr;
            min-height: 0;
            max-width: 460px;
          }
          .lg-art {
            height: 190px;
            clip-path: polygon(0 0, 100% 0, 100% calc(100% - 34px), 0 100%);
          }
          .lg-art-caption { left: 24px; bottom: 46px; max-width: 78%; }
          .lg-form-wrap { padding: 34px 26px 32px; }
          .lg-logo { width: 210px; margin-bottom: 26px; }
        }
      `}</style>

      <div className="lg-card">
        <div className="lg-art" aria-hidden="true">
          <div className="lg-art-caption">
            <span className="lg-art-kicker">
              <span className="lg-art-dot" />
              KickRanking
            </span>
          </div>
        </div>

        <div className="lg-form-wrap">
          <form className="lg-form">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="lg-logo"
              src="/kickplanner-logo-degrade.png"
              alt="KickPlanner"
              width={800}
              height={154}
            />

            {error && (
              <p className="lg-error" role="alert">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ flexShrink: 0, marginTop: 1 }}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M12 7.5v5.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="16.5" r="1.2" fill="currentColor" />
                </svg>
                {error}
              </p>
            )}

            <div className="lg-field">
              <input
                name="email"
                type="email"
                autoComplete="email"
                aria-label="Correo electrónico"
                placeholder="Correo"
                required
                className="lg-input"
              />
              <svg
                className="lg-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="5.5"
                  width="18"
                  height="13"
                  rx="2.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="m4 8 7.13 4.9a1.5 1.5 0 0 0 1.74 0L20 8"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div className="lg-field">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                aria-label="Contraseña"
                placeholder="Contraseña"
                required
                className="lg-input"
              />
              <svg
                className="lg-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="4.5"
                  y="10.5"
                  width="15"
                  height="9.5"
                  rx="2.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="M8 10.5V8a4 4 0 1 1 8 0v2.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="15.2" r="1.3" fill="currentColor" />
              </svg>
            </div>

            <button formAction={login} className="lg-btn">
              Ingresar
            </button>

            <p className="lg-foot">
              Acceso restringido al equipo. Contactá al administrador si
              necesitás una cuenta.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
