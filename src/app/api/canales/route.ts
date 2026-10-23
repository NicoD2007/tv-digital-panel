
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { comprobarHLS } from "@/lib/hls-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Canal = {
  id: string;
  nombre: string;
  categoria: string;
  url: string;
  estado: "operativo" | "inestable" | "caido" | "pendiente";
  mensaje?: string;
  codigoHttp?: number | null;
  duracionMs?: number;
  verificadoEn?: number | null;
  creadoEn: number;
  actualizadoEn: number;
};

async function verificarAdmin(request: NextRequest) {
  const autorizacion = request.headers.get("authorization");

  if (!autorizacion?.startsWith("Bearer ")) {
    throw new Error("No autorizado.");
  }

  const token = autorizacion.slice(7);
  const usuario = await adminAuth.verifyIdToken(token, true);

  if (usuario.role !== "admin") {
    throw new Error("Se requiere rol de administrador.");
  }

  return usuario;
}

function errorRespuesta(error: unknown) {
  const mensaje =
    error instanceof Error ? error.message : "Error interno.";

  const estado = mensaje === "No autorizado." ? 401
    : mensaje === "Se requiere rol de administrador." ? 403
    : 400;

  return NextResponse.json({ error: mensaje }, { status: estado });
}

function limpiarTexto(valor: unknown, max: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

export async function GET(request: NextRequest) {
  try {
    await verificarAdmin(request);

    const snapshot = await adminDb.ref("canales").get();
    const datos = snapshot.val() ?? {};

    const canales: Canal[] = Object.entries(datos).map(([id, valor]) => ({
      id,
      ...(valor as Omit<Canal, "id">),
    }));

    canales.sort((a, b) => a.nombre.localeCompare(b.nombre));

    return NextResponse.json({ canales });
  } catch (error) {
    return errorRespuesta(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await verificarAdmin(request);

    const cuerpo = await request.json();
    const nombre = limpiarTexto(cuerpo.nombre, 100);
    const categoria = limpiarTexto(cuerpo.categoria, 80);
    const url = limpiarTexto(cuerpo.url, 2048);

    if (!nombre || !categoria || !url) {
      return NextResponse.json(
        { error: "Nombre, categoría y URL son obligatorios." },
        { status: 400 }
      );
    }

    // Validación de destino también al comprobar la URL.
    const resultado = await comprobarHLS(url);
    const referencia = adminDb.ref("canales").push();
    const ahora = Date.now();

    const canal: Canal = {
      id: referencia.key!,
      nombre,
      categoria,
      url,
      estado: resultado.estado,
      mensaje: resultado.mensaje,
      codigoHttp: resultado.codigoHttp,
      duracionMs: resultado.duracionMs,
      verificadoEn: resultado.verificadoEn,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };

    await referencia.set(canal);

    return NextResponse.json({ canal }, { status: 201 });
  } catch (error) {
    return errorRespuesta(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await verificarAdmin(request);

    const cuerpo = await request.json();
    const id = limpiarTexto(cuerpo.id, 100);

    if (!id || id.includes("/") || id === "." || id === "..") {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const referencia = adminDb.ref(`canales/${id}`);
    const snapshot = await referencia.get();

    if (!snapshot.exists()) {
      return NextResponse.json({ error: "Canal no encontrado." }, { status: 404 });
    }

    const actual = snapshot.val() as Canal;
    const cambios: Partial<Canal> = {};

    if (cuerpo.nombre !== undefined) {
      const nombre = limpiarTexto(cuerpo.nombre, 100);
      if (!nombre) {
        return NextResponse.json({ error: "Nombre inválido." }, { status: 400 });
      }
      cambios.nombre = nombre;
    }

    if (cuerpo.categoria !== undefined) {
      const categoria = limpiarTexto(cuerpo.categoria, 80);
      if (!categoria) {
        return NextResponse.json({ error: "Categoría inválida." }, { status: 400 });
      }
      cambios.categoria = categoria;
    }

    if (cuerpo.url !== undefined) {
      const url = limpiarTexto(cuerpo.url, 2048);
      if (!url) {
        return NextResponse.json({ error: "URL inválida." }, { status: 400 });
      }

      const resultado = await comprobarHLS(url);

      cambios.url = url;
      cambios.estado = resultado.estado;
      cambios.mensaje = resultado.mensaje;
      cambios.codigoHttp = resultado.codigoHttp;
      cambios.duracionMs = resultado.duracionMs;
      cambios.verificadoEn = resultado.verificadoEn;
    }

    cambios.actualizadoEn = Date.now();

    await referencia.update(cambios);

    return NextResponse.json({
      canal: { ...actual, ...cambios, id },
    });
  } catch (error) {
    return errorRespuesta(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await verificarAdmin(request);

    const cuerpo = await request.json();
    const id = limpiarTexto(cuerpo.id, 100);

    if (!id || id.includes("/")) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const referencia = adminDb.ref(`canales/${id}`);
    const snapshot = await referencia.get();

    if (!snapshot.exists()) {
      return NextResponse.json({ error: "Canal no encontrado." }, { status: 404 });
    }

    await referencia.remove();
    await adminDb.ref(`incidentes/${id}`).remove();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorRespuesta(error);
  }
}
