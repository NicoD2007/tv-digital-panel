/**
 * Lógica de fechas y vencimientos de las cuentas.
 *
 * No depende de Firebase ni de Next.js, de modo que se puede probar de forma
 * aislada (ver scripts/pruebas-vencimientos.test.mjs).
 *
 * REGLA DE VENCIMIENTO (única para el panel, la app y las reglas de Firebase)
 * ---------------------------------------------------------------------------
 * - `vencimiento` (texto "AAAA-MM-DD"): ES EL ÚLTIMO DÍA con acceso, hasta las
 *   23:59:59.999 hora de Argentina. Equivale al instante exclusivo
 *   00:00 (Argentina) del día siguiente. Es lo que la app ya aplicaba antes.
 * - `vencimientoMs` (número, ms desde 1970 UTC): instante EXCLUSIVO exacto a
 *   partir del cual no hay acceso. Cuando existe, manda sobre `vencimiento`.
 *   Lo usan las reglas de Realtime Database (`now`) porque las reglas no
 *   pueden interpretar un texto "AAAA-MM-DD".
 *
 * Argentina usa UTC-3 todo el año (sin horario de verano desde 2009), por eso
 * el desfase es fijo y no depende de la zona horaria del servidor.
 */

export const PLAN_PRUEBA = "Prueba 2 horas";
export const DURACION_PRUEBA_MS = 2 * 60 * 60 * 1000;

/**
 * Créditos que consume una prueba gratuita cuando la crea un revendedor.
 * 0 = no consume créditos. Cambiar este valor es la única modificación
 * necesaria si se decide cobrar las pruebas.
 */
export const CREDITOS_PRUEBA = 0;

const MS_POR_HORA = 60 * 60 * 1000;
const DESFASE_ARGENTINA_MS = 3 * MS_POR_HORA;

export function esFechaValida(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;

  const [anio, mes, dia] = fecha.split("-").map(Number);
  const fechaUTC = new Date(Date.UTC(anio, mes - 1, dia));

  return (
    fechaUTC.getUTCFullYear() === anio &&
    fechaUTC.getUTCMonth() === mes - 1 &&
    fechaUTC.getUTCDate() === dia
  );
}

export function obtenerFechaArgentina(ahora: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

export function sumarMesesAFecha(fechaBase: string, meses: number): string {
  if (!esFechaValida(fechaBase) || !Number.isInteger(meses) || meses < 1) {
    throw new Error("Fecha o cantidad de meses no válida");
  }

  const [anio, mes, dia] = fechaBase.split("-").map(Number);
  const destino = new Date(Date.UTC(anio, mes - 1 + meses, 1));

  const ultimoDia = new Date(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)
  ).getUTCDate();

  destino.setUTCDate(Math.min(dia, ultimoDia));

  return [
    destino.getUTCFullYear(),
    String(destino.getUTCMonth() + 1).padStart(2, "0"),
    String(destino.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Instante (ms UTC) en que termina el día `fecha` en Argentina:
 * las 00:00 del día siguiente. Hay acceso mientras `ahora < instante`.
 */
export function finDeDiaArgentinaMs(fecha: string): number {
  if (!esFechaValida(fecha)) throw new Error("Fecha no válida");

  const [anio, mes, dia] = fecha.split("-").map(Number);

  return Date.UTC(anio, mes - 1, dia + 1) + DESFASE_ARGENTINA_MS;
}

/** Fecha "AAAA-MM-DD" que corresponde en Argentina al instante `ms`. */
export function fechaArgentinaDeMs(ms: number): string {
  return new Date(ms - DESFASE_ARGENTINA_MS).toISOString().slice(0, 10);
}

type DatosVencimiento = {
  vencimiento?: unknown;
  vencimientoMs?: unknown;
};

/**
 * Instante exclusivo de vencimiento de una cuenta, o null si no hay un dato
 * utilizable. Usa `vencimientoMs` si existe; si no (cuentas anteriores a esta
 * mejora), lo deduce de `vencimiento` sin modificar nada en la base.
 */
export function leerVencimientoMs(datos: DatosVencimiento): number | null {
  const ms = datos.vencimientoMs;

  if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) return ms;

  const fecha = datos.vencimiento;

  if (typeof fecha === "string" && esFechaValida(fecha)) {
    return finDeDiaArgentinaMs(fecha);
  }

  return null;
}

/** Una cuenta sin fecha utilizable no se considera vencida (como antes). */
export function estaVencido(datos: DatosVencimiento, ahoraMs: number) {
  const vence = leerVencimientoMs(datos);

  return vence !== null && vence <= ahoraMs;
}

/** Campos de vencimiento de una prueba gratuita creada en `ahoraMs`. */
export function datosPruebaGratuita(ahoraMs: number) {
  const vencimientoMs = ahoraMs + DURACION_PRUEBA_MS;

  return {
    plan: PLAN_PRUEBA,
    esPrueba: true as const,
    creadoEn: new Date(ahoraMs).toISOString(),
    vencimientoMs,
    // Solo informativo y para compatibilidad con versiones anteriores de la
    // app y del panel, que leen este campo.
    vencimiento: fechaArgentinaDeMs(vencimientoMs),
  };
}
