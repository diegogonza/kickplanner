import {
  HITOS,
  TOTAL_NIVELES,
  formatoClics,
  mesCorto,
  nombreHito,
  type EstadoHitos,
} from '@/app/lib/hitos'

/** 2500 → "2,5K", 1000000 → "1M": etiqueta corta para la escalera. */
function corto(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`
  if (n >= 1_000) return `${String(n / 1_000).replace('.', ',')}K`
  return String(n)
}

/**
 * Tarjeta de hitos de clics orgánicos. Componente de presentación puro (sin
 * hooks): se usa en el Resumen del proyecto y en el portal del cliente.
 * `variant` solo cambia la caja exterior para que encaje en cada lugar.
 */
export default function HitosCard({
  hitos,
  variant = 'app',
}: {
  hitos: EstadoHitos
  variant?: 'app' | 'portal'
}) {
  const ultimo = hitos.logrados[hitos.logrados.length - 1] ?? null
  const caja = variant === 'portal' ? 'pt-card pt-seo hito-card' : 'card hito-card'

  return (
    <section className={caja} aria-labelledby="hito-titulo">
      <header className="hito-head">
        <span className="hito-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
            <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
          </svg>
        </span>
        <div className="hito-titulos">
          <h2 id="hito-titulo">Hitos de clics orgánicos</h2>
          <p>Se logran cuando un mes completo alcanza la cifra en Google.</p>
        </div>
        <span className="hito-nivel">
          Nivel <b>{hitos.nivel}</b> de {TOTAL_NIVELES}
        </span>
      </header>

      {!hitos.conDatos ? (
        <p className="hito-vacio">Todavía no hay un mes completo de datos de Search Console.</p>
      ) : (
        <>
          <div className="hito-resumen">
            <div className="hito-bloque">
              <span className="hito-et">Último hito</span>
              <b className="hito-valor">{ultimo ? nombreHito(ultimo.meta) : 'Aún sin hitos'}</b>
              {ultimo && <span className="hito-sub">Logrado en {mesCorto(ultimo.mes)}</span>}
            </div>

            <div className="hito-bloque hito-meta">
              {hitos.meta ? (
                <>
                  <span className="hito-et">Próxima meta</span>
                  <b className="hito-valor">{formatoClics(hitos.meta)} clics en un mes</b>
                  <div
                    className="hito-barra"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(hitos.progreso * 100)}
                    aria-label="Avance del último mes hacia la próxima meta"
                  >
                    <span style={{ width: `${Math.max(2, hitos.progreso * 100)}%` }} />
                  </div>
                  {hitos.ultimoMes && (
                    <span className="hito-sub">
                      {mesCorto(hitos.ultimoMes.mes)}: <b>{formatoClics(hitos.ultimoMes.clics)}</b> clics
                      {hitos.faltan ? ` · faltan ${formatoClics(hitos.faltan)}` : ' · ¡meta alcanzada!'}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="hito-et">Próxima meta</span>
                  <b className="hito-valor">¡Todos los hitos logrados!</b>
                </>
              )}
            </div>
          </div>

          <ol className="hito-escalera" aria-label="Escalera de hitos">
            {HITOS.map((meta, i) => {
              const nivel = i + 1
              const logrado = hitos.logrados.find((l) => l.nivel === nivel)
              const esMeta = nivel === hitos.nivel + 1
              const estado = logrado ? 'is-done' : esMeta ? 'is-next' : ''
              const titulo = logrado
                ? `Nivel ${nivel}: ${nombreHito(meta)} · logrado en ${mesCorto(logrado.mes)}`
                : `Nivel ${nivel}: ${nombreHito(meta)}${esMeta ? ' · próxima meta' : ''}`
              return (
                <li key={meta} className={`hito-paso ${estado}`} title={titulo}>
                  <span className="hito-paso-n">{corto(meta)}</span>
                  <span className="sr-only">{titulo}</span>
                </li>
              )
            })}
          </ol>

          {hitos.mejorMes && (
            <p className="hito-pie">
              Mejor mes: <b>{formatoClics(hitos.mejorMes.clics)}</b> clics ({mesCorto(hitos.mejorMes.mes)})
            </p>
          )}
        </>
      )}
    </section>
  )
}
