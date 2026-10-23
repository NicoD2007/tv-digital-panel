
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { comprobarHLS } from "@/lib/hls-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONCURRENCIA = 5;
const MAX_CANALES_POR_EJECUCION = 100;

export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const autorizacion = request.headers.get("authorization");

  if (!secreto || autorizacion !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const snapshot = await adminDb.ref("canales").get();
  const entradas = Object.entries(snapshot.val() ?? {}).slice(
    0,
    MAX_CANALES_POR_EJECUCION
  );

  let siguiente = 0;
  let comprobados = 0;
  let errores = 0;

  async function trabajador() {
    while (true) {
      const indice = siguiente++;

      if (indice >= entradas.length) return;

      const [id, valor] = entradas[indice];
      const canal = valor as {
        nombre: string;
        url: string;
        estado?: string;
      };

      try {
        const resultado = await comprobarHLS(canal.url);
        const referencia = adminDb.ref(`canales/${id}`);
        const actual = await referencia.get();

        // No sobrescribir si el canal fue eliminado durante la prueba.
        if (!actual.exists()) continue;

        const estadoAnterior = canal.estado ?? "pendiente";

        await referencia.update({
          estado: resultado.estado,
          mensaje: resultado.mensaje,
          codigoHttp: resultado.codigoHttp,
          duracionMs: resultado.duracionMs,
          verificadoEn: resultado.verificadoEn,
          actualizadoEn: Date.now(),
        });

        if (estadoAnterior !== resultado.estado) {
          const incidente = adminDb.ref(`incidentes/${id}`).push();

          await incidente.set({
            canalId: id,
            nombre: canal.nombre,
            estadoAnterior,
            estadoNuevo: resultado.estado,
            mensaje: resultado.mensaje,
            fecha: resultado.verificadoEn,
          });
        }

        comprobados++;
      } catch {
        errores++;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(CONCURRENCIA, entradas.length) },
      () => trabajador()
    )
  );

  return NextResponse.json({
    ok: true,
    total: entradas.length,
    comprobados,
    errores,
    fecha: Date.now(),
  });
}
