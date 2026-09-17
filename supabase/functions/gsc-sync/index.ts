// gsc-sync — trae datos de Google Search Console y los guarda en Postgres.
//
// Dos modos:
//   incremental (diario) — mes en curso + mes anterior, y la foto de posiciones
//                          de los últimos 28 días.
//   backfill (una vez)   — los 16 meses que GSC conserva, para que la línea de
//                          tendencia no nazca con dos puntos.
//
// Principio: si una propiedad falla, las demás siguen. El error queda en
// gsc_properties.last_error y el portal muestra el último dato bueno.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Fila = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

// ---------- Postgres por PostgREST ----------
/**
 * Una función de Postgres que devuelve `void` responde 204 SIN CUERPO.
 * Hacerle .json() revienta con "Unexpected end of JSON input" — y revienta
 * DESPUÉS de que la escritura ya se hizo. Es el peor error posible: los datos
 * quedan guardados y la pantalla muestra rojo, así que uno vuelve a apretar
 * el botón buscando arreglar algo que ya estaba bien. Por eso se lee como
 * texto y solo se parsea si hay algo que parsear.
 */
function parsear<T>(texto: string): T {
  if (!texto.trim()) return undefined as T;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return undefined as T;
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(args),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${fn}: HTTP ${r.status} ${texto.slice(0, 200)}`);
  return parsear<T>(texto);
}

async function tabla<T>(path: string): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${texto.slice(0, 200)}`);
  return parsear<T>(texto);
}

// ---------- Fechas (UTC, que es como razona GSC) ----------
const iso = (d: Date) => d.toISOString().slice(0, 10);
const primerDia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const ultimoDia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
function sumarMeses(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

// ---------- Errores de Google ----------
//
// Google devuelve 403 para cosas muy distintas, con arreglos muy distintos:
// la API apagada en el proyecto de Cloud, la cuenta sin permiso sobre el sitio,
// o la cuota agotada. Mapear todo a "sin permiso" manda a buscar el problema al
// lugar equivocado — que es exactamente lo que pasó la primera vez. El motivo
// real viene en el cuerpo de la respuesta; hay que leerlo.

/** Marca los errores donde ayuda mostrar qué propiedades ve la cuenta. */
class ErrorDeSitio extends Error {
  listar = true;
}

function motivoDeGoogle(texto: string): { reason: string; message: string } {
  try {
    const j = JSON.parse(texto);
    const e = j?.error ?? {};
    return {
      reason: String(e.errors?.[0]?.reason ?? e.status ?? ""),
      message: String(e.message ?? ""),
    };
  } catch {
    return { reason: "", message: texto.slice(0, 200) };
  }
}

function traducirError(status: number, texto: string, siteUrl: string): Error {
  const { reason, message } = motivoDeGoogle(texto);

  // La API no está habilitada en el proyecto de Google Cloud. No tiene NADA que
  // ver con los permisos sobre el sitio, y se arregla en otra pantalla.
  if (
    reason === "accessNotConfigured" ||
    reason === "SERVICE_DISABLED" ||
    /has not been used in project|is disabled/i.test(message)
  ) {
    return new Error(
      "La API de Search Console no está habilitada en el proyecto de Google Cloud. " +
        "Entrá a console.cloud.google.com → APIs y servicios → Biblioteca, buscá " +
        '"Google Search Console API", habilitala, esperá un minuto y volvé a sincronizar.',
    );
  }

  if (reason === "insufficientPermissions" || reason === "forbidden" || status === 403) {
    return new ErrorDeSitio(
      `La cuenta de Google conectada no tiene permiso sobre ${siteUrl} en Search Console.` +
        (message ? ` Google dice: "${message}".` : ""),
    );
  }

  if (status === 404) {
    return new ErrorDeSitio(
      `La propiedad ${siteUrl} no existe con ese nombre exacto en Search Console.`,
    );
  }

  if (status === 429 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
    return new Error("Google cortó por cuota. Volvé a intentar en unos minutos.");
  }

  if (status === 401) {
    return new Error("La conexión con Google expiró. Reconectala desde Ajustes.");
  }

  return new Error(
    `Search Console respondió HTTP ${status}${reason ? ` (${reason})` : ""}` +
      (message ? `: ${message.slice(0, 200)}` : ""),
  );
}

// ---------- Google ----------
async function accessToken(cred: {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cred.client_id,
      client_secret: cred.client_secret,
      refresh_token: cred.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const j = parsear<{ access_token?: string; error?: string; error_description?: string }>(
    await r.text(),
  ) ?? {};
  if (!r.ok || !j.access_token) {
    const d = j.error_description ?? j.error ?? `HTTP ${r.status}`;
    // invalid_grant = revocado o vencido: hay que reconectar desde Ajustes.
    throw new Error(
      String(d).includes("invalid_grant")
        ? "La conexión con Google fue revocada o expiró. Reconectala desde Ajustes."
        : `Google: ${d}`,
    );
  }
  return j.access_token;
}

/**
 * Propiedades que ve la cuenta conectada.
 *
 * Existe para que un error de propiedad no sea un callejón sin salida: en vez
 * de "no tenés permiso", el mensaje puede decir qué propiedades SÍ ve y con
 * qué nombre exacto están escritas. La mitad de estos errores son una `s` de
 * más en https o una propiedad de prefijo escrita como si fuera de dominio.
 */
type Sitio = { siteUrl: string; permissionLevel: string };

async function sitiosDeLaCuenta(token: string): Promise<Sitio[]> {
  const r = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const t = await r.text();
  if (!r.ok) throw traducirError(r.status, t, "(lista de propiedades)");
  const j = parsear<{ siteEntry?: Sitio[] }>(t) ?? {};
  return (j.siteEntry ?? []).sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
}

/** Versión en prosa, para pegar al final de un mensaje de error. */
async function listarSitios(token: string): Promise<string> {
  try {
    const sitios = await sitiosDeLaCuenta(token);
    if (sitios.length === 0) {
      return " La cuenta conectada no tiene ninguna propiedad en Search Console.";
    }
    const lista = sitios.map((s) => `${s.siteUrl} (${s.permissionLevel})`).join(", ");
    return ` La cuenta conectada ve estas propiedades: ${lista}.`;
  } catch (e) {
    return e instanceof Error ? ` ${e.message}` : "";
  }
}

async function consultar(
  token: string,
  siteUrl: string,
  body: Record<string, unknown>,
): Promise<Fila[]> {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw traducirError(r.status, t, siteUrl);
  const j = parsear<{ rows?: Fila[] }>(t) ?? {};
  return j.rows ?? [];
}

/** Totales de un período, sin dimensiones. */
async function totales(token: string, site: string, desde: string, hasta: string) {
  const filas = await consultar(token, site, {
    startDate: desde,
    endDate: hasta,
    dimensions: [],
    type: "web",
  });
  const f = filas[0];
  return {
    clicks: Math.round(f?.clicks ?? 0),
    impressions: Math.round(f?.impressions ?? 0),
    position: f?.position != null ? Number(f.position.toFixed(2)) : null,
  };
}

/** Palabras clave de un período, paginando. */
async function palabras(token: string, site: string, desde: string, hasta: string, tope = 5000) {
  const filas: Fila[] = [];
  let startRow = 0;
  const paso = 1000;
  while (filas.length < tope) {
    const lote = await consultar(token, site, {
      startDate: desde,
      endDate: hasta,
      dimensions: ["query"],
      type: "web",
      rowLimit: paso,
      startRow,
    });
    filas.push(...lote);
    if (lote.length < paso) break;
    startRow += paso;
  }
  return filas;
}

/** Conteo acumulativo por rango: top 3 incluye top 1, top 10 incluye top 3. */
function rangos(filas: Fila[]) {
  const p = filas.map((f) => f.position ?? 999);
  const hasta = (n: number) => p.filter((x) => x <= n).length;
  return {
    kw_total: p.length,
    kw_top1: hasta(1.5), // GSC promedia: 1.4 sigue siendo "primero" en la práctica
    kw_top3: hasta(3),
    kw_top5: hasta(5),
    kw_top10: hasta(10),
    kw_top20: hasta(20),
    kw_top50: hasta(50),
  };
}

// ---------- Una propiedad ----------
async function sincronizar(
  token: string,
  prop: { project_id: string; site_url: string; backfilled_at: string | null },
  modo: "incremental" | "backfill",
) {
  const hoy = new Date();
  const ayer = new Date(hoy.getTime() - 86400000);
  const site = prop.site_url;

  // --- FLUJO ---
  // Incremental: mes en curso + anterior. GSC completa datos hasta ~2 semanas
  // después, así que traer solo el actual dejaría el anterior incompleto.
  // Backfill: los 16 meses que GSC conserva.
  const meses: { month: string; clicks: number; impressions: number; position: number | null; partial: boolean }[] = [];
  const cuantos = modo === "backfill" ? 16 : 2;

  for (let i = cuantos - 1; i >= 0; i--) {
    const ref = sumarMeses(primerDia(hoy), -i);
    const desde = iso(ref);
    const finMes = ultimoDia(ref);
    const enCurso = finMes > ayer;
    const hasta = enCurso ? iso(ayer) : iso(finMes);
    if (hasta < desde) continue; // mes que todavía no empezó

    const t = await totales(token, site, desde, hasta);
    meses.push({ month: desde, ...t, partial: enCurso });
  }

  // --- ESTADO --- ventana móvil de 28 días terminando ayer.
  // La posición es una foto del momento: promediarla sobre un mes entero
  // subestima toda palabra que mejoró dentro del mes.
  const desde28 = iso(new Date(ayer.getTime() - 27 * 86400000));
  const filas28 = await palabras(token, site, desde28, iso(ayer));
  const rankings = { as_of: iso(ayer), window_days: 28, ...rangos(filas28) };

  // --- DETALLE --- top 1.000 del último mes completo, para el reporte mensual.
  const mesCompleto = sumarMeses(primerDia(hoy), -1);
  const detalleFilas = await palabras(
    token,
    site,
    iso(mesCompleto),
    iso(ultimoDia(mesCompleto)),
    1000,
  );
  const keywords = {
    month: iso(mesCompleto),
    rows: detalleFilas
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 1000)
      .map((f) => ({
        query: f.keys?.[0] ?? "",
        clicks: Math.round(f.clicks),
        impressions: Math.round(f.impressions),
        position: Number((f.position ?? 0).toFixed(2)),
      }))
      .filter((r) => r.query !== ""),
  };

  await rpc("gsc_guardar_sync", {
    p_project_id: prop.project_id,
    p_monthly: meses,
    p_rankings: rankings,
    p_keywords: keywords,
    p_error: null,
  });

  if (modo === "backfill") {
    await fetch(`${SUPABASE_URL}/rest/v1/gsc_properties?project_id=eq.${prop.project_id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ backfilled_at: new Date().toISOString() }),
    });
  }

  return { project_id: prop.project_id, site_url: site, meses: meses.length, palabras: rankings.kw_total };
}

// ---------- Entrada ----------
Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  try {
    let modo: "incremental" | "backfill" = "incremental";
    let soloProyecto: string | null = null;
    let diagnostico = false;
    try {
      const b = await req.json();
      if (b?.mode === "backfill") modo = "backfill";
      if (b?.mode === "diagnostico") diagnostico = true;
      if (typeof b?.project_id === "string") soloProyecto = b.project_id;
    } catch {
      // Sin cuerpo: incremental de todo. Es como lo llama el cron.
    }

    const cred = await rpc<{
      client_id: string | null;
      client_secret: string | null;
      refresh_token: string | null;
    }>("google_oauth_credenciales");

    if (!cred?.refresh_token || !cred.client_id || !cred.client_secret) {
      return json(
        { ok: false, error: "No hay una cuenta de Google conectada. Conectala desde Ajustes." },
        409,
      );
    }

    // Un solo access token para todas las propiedades.
    const token = await accessToken(cred as { client_id: string; client_secret: string; refresh_token: string });

    // Modo diagnóstico: no toca ningún dato, solo dice qué ve la cuenta.
    if (diagnostico) {
      try {
        return json({ ok: true, modo: "diagnostico", propiedades: await sitiosDeLaCuenta(token) });
      } catch (e) {
        return json(
          { ok: false, error: e instanceof Error ? e.message : "No se pudo leer la lista." },
          502,
        );
      }
    }

    const filtro = soloProyecto ? `&project_id=eq.${soloProyecto}` : "";
    const props = await tabla<
      { project_id: string; site_url: string; backfilled_at: string | null }[]
    >(`gsc_properties?select=project_id,site_url,backfilled_at${filtro}`);

    if (!props || props.length === 0) {
      return json({ ok: true, mensaje: "No hay propiedades vinculadas.", resultados: [] });
    }

    const resultados: unknown[] = [];
    const errores: unknown[] = [];
    // La lista de propiedades se pide UNA vez como mucho, no por cada fallo.
    let listaSitios: string | null = null;

    for (const p of props) {
      // Una propiedad sin backfill lo hace ahora, aunque el cron pida incremental.
      const suModo = p.backfilled_at ? modo : "backfill";
      try {
        resultados.push(await sincronizar(token, p, suModo));
      } catch (e) {
        let msg = e instanceof Error ? e.message : "Error desconocido";
        if (e instanceof ErrorDeSitio) {
          if (listaSitios === null) listaSitios = await listarSitios(token);
          msg += listaSitios;
        }
        errores.push({ project_id: p.project_id, site_url: p.site_url, error: msg });
        // Se anota y se sigue: el fallo de una no frena a las otras.
        try {
          await rpc("gsc_guardar_sync", {
            p_project_id: p.project_id,
            p_monthly: null,
            p_rankings: null,
            p_keywords: null,
            p_error: msg,
          });
        } catch { /* si ni eso se puede escribir, ya se reporta en la respuesta */ }
      }
    }

    return json({ ok: errores.length === 0, modo, resultados, errores });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return json({ ok: false, error: msg }, 500);
  }
});
