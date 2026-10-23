
import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type EstadoHLS = "operativo" | "inestable" | "caido";

export interface ResultadoHLS {
  estado: EstadoHLS;
  mensaje: string;
  codigoHttp: number | null;
  duracionMs: number;
  verificadoEn: number;
}

const TIMEOUT_MS = 8000;
const MAX_PLAYLIST_BYTES = 512 * 1024;

function esIpPrivada(ip: string): boolean {
  const version = isIP(ip);

  if (version === 4) {
    const octetos = ip.split(".").map(Number);
    const [a, b] = octetos;

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }

  if (version === 6) {
    const normalizada = ip.toLowerCase();

    return (
      normalizada === "::" ||
      normalizada === "::1" ||
      normalizada.startsWith("fc") ||
      normalizada.startsWith("fd") ||
      /^fe[89ab]/.test(normalizada) ||
      normalizada.startsWith("::ffff:")
    );
  }

  return true;
}

async function validarUrl(valor: string): Promise<URL> {
  let url: URL;

  try {
    url = new URL(valor);
  } catch {
    throw new Error("La URL no es válida.");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname ||
    url.port && url.port !== "443"
  ) {
    throw new Error("Solo se admiten URL HTTPS públicas sin credenciales.");
  }

  const host = url.hostname.toLowerCase();

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".test")
  ) {
    throw new Error("El dominio no está permitido.");
  }

  if (isIP(host)) {
    if (esIpPrivada(host)) {
      throw new Error("No se permiten direcciones IP privadas.");
    }
  } else {
    let direcciones;

    try {
      direcciones = await lookup(host, { all: true, verbatim: true });
    } catch {
      throw new Error("No se pudo resolver el dominio.");
    }

    if (
      direcciones.length === 0 ||
      direcciones.some((direccion) => esIpPrivada(direccion.address))
    ) {
      throw new Error("El dominio resuelve a una dirección no permitida.");
    }
  }

  return url;
}

async function obtener(
  valor: string,
  maxBytes: number
): Promise<{ respuesta: Response; texto: string }> {
  const url = await validarUrl(valor);
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controlador.signal,
      cache: "no-store",
      headers: {
        Accept: "*/*",
        "User-Agent": "TV-DIGITAL-HLS-Monitor/1.0",
      },
    });

    if (respuesta.status >= 300 && respuesta.status < 400) {
      await respuesta.body?.cancel();
      throw new Error("El enlace redirige a otra URL; no se siguen redirecciones.");
    }

    if (!respuesta.ok) {
      await respuesta.body?.cancel();
      throw new Error(`El servidor respondió HTTP ${respuesta.status}.`);
    }

    const lector = respuesta.body?.getReader();

    if (!lector) {
      throw new Error("La respuesta no contiene datos.");
    }

    const partes: Uint8Array[] = [];
    let total = 0;

    try {
      while (true) {
        const { done, value } = await lector.read();

        if (done) break;

        total += value.byteLength;

        if (total > maxBytes) {
          await lector.cancel();
          throw new Error("La respuesta supera el tamaño permitido.");
        }

        partes.push(value);
      }
    } finally {
      lector.releaseLock();
    }

    const combinado = new Uint8Array(total);
    let posicion = 0;

    for (const parte of partes) {
      combinado.set(parte, posicion);
      posicion += parte.byteLength;
    }

    return {
      respuesta,
      texto: new TextDecoder().decode(combinado),
    };
  } finally {
    clearTimeout(temporizador);
  }
}

export async function comprobarHLS(url: string): Promise<ResultadoHLS> {
  const inicio = Date.now();
  const verificadoEn = Date.now();

  try {
    const { respuesta, texto } = await obtener(url, MAX_PLAYLIST_BYTES);

    if (!texto.trimStart().startsWith("#EXTM3U")) {
      throw new Error("La respuesta no contiene una lista HLS válida.");
    }

    const lineas = texto
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter(Boolean);

    const esMaestra = lineas.some((linea) =>
      linea.startsWith("#EXT-X-STREAM-INF:")
    );

    const esMedia = lineas.some((linea) =>
      linea.startsWith("#EXTINF:")
    );

    if (!esMaestra && !esMedia) {
      throw new Error("La lista no contiene segmentos ni variantes HLS.");
    }

    let segmento: string | undefined;

    if (esMedia) {
      segmento = lineas.find((linea) => !linea.startsWith("#"));
    } else {
      const indice = lineas.findIndex((linea) =>
        linea.startsWith("#EXT-X-STREAM-INF:")
      );

      segmento = lineas
        .slice(indice + 1)
        .find((linea) => !linea.startsWith("#"));
    }

    if (!segmento) {
      throw new Error("No se encontró un segmento o una variante de video.");
    }

    const urlSegmento = new URL(segmento, url).toString();
    const urlValidada = await validarUrl(urlSegmento);

    if (urlValidada.pathname.toLowerCase().endsWith(".m3u8")) {
      const variante = await comprobarHLSInterno(urlSegmento);

      if (!variante) {
        throw new Error("La variante HLS no respondió correctamente.");
      }
    } else {
      const segmentoRespuesta = await obtener(urlSegmento, 64 * 1024);

      if (segmentoRespuesta.texto.length === 0) {
        throw new Error("El segmento está vacío.");
      }
    }

    return {
      estado: "operativo",
      mensaje: "Lista HLS y recurso de video accesibles.",
      codigoHttp: respuesta.status,
      duracionMs: Date.now() - inicio,
      verificadoEn,
    };
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error desconocido.";

    return {
      estado: "caido",
      mensaje: mensaje.slice(0, 250),
      codigoHttp: null,
      duracionMs: Date.now() - inicio,
      verificadoEn,
    };
  }
}

async function comprobarHLSInterno(url: string): Promise<boolean> {
  try {
    const { texto } = await obtener(url, MAX_PLAYLIST_BYTES);

    return (
      texto.trimStart().startsWith("#EXTM3U") &&
      texto.split(/\r?\n/).some((linea) => linea.trim().startsWith("#EXTINF:"))
    );
  } catch {
    return false;
  }
}
