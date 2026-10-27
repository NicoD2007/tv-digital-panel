
"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import CreditosDisponibles from "@/components/CreditosDisponibles";

type Cliente = {
  uid: string;
  email: string;
  activo: boolean;
  plan: string;
  vencimiento: string;
  // Instante exacto de vencimiento (ms) y marca de prueba gratuita.
  vencimientoMs?: number | null;
  esPrueba?: boolean;
};

const MS_POR_DIA = 86400000;

function mostrarHora(ms: number) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

type Filtro = "todos" | "vigentes" | "proximos" | "vencidos";

function fechaLocal() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return partes;
}

function diasHasta(fecha: string) {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const vencimiento = Date.UTC(anio, mes - 1, dia);
  const [hoyAnio, hoyMes, hoyDia] = fechaLocal().split("-").map(Number);
  const hoy = Date.UTC(hoyAnio, hoyMes - 1, hoyDia);
  return Math.round((vencimiento - hoy) / 86400000);
}

function mostrarFecha(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return "Sin fecha";
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

export default function PlanesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [renovandoUid, setRenovandoUid] = useState("");

  async function cargarClientes(token: string) {
    const respuesta = await fetch("/api/admin?accion=clientes", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(datos.error || "No se pudieron cargar los clientes");
    }

    setClientes(datos.clientes || []);
  }

  useEffect(() => {
    const cancelar = onAuthStateChanged(auth, async (usuario) => {
      if (!usuario) {
        window.location.replace("/login");
        return;
      }

      try {
        setCargando(true);
        const token = await usuario.getIdToken();
        await cargarClientes(token);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar");
      } finally {
        setCargando(false);
      }
    });

    return () => cancelar();
  }, []);

  const clasificados = useMemo(() => {
    return clientes.map((cliente) => {
      const dias = /^\d{4}-\d{2}-\d{2}$/.test(cliente.vencimiento || "")
        ? diasHasta(cliente.vencimiento)
        : null;

      let estado: "vigente" | "proximo" | "vencido" | "sin-fecha";

      if (typeof cliente.vencimientoMs === "number") {
        // Misma regla que la app y las reglas de Firebase: el instante exacto.
        const restante = cliente.vencimientoMs - Date.now();

        if (restante <= 0) estado = "vencido";
        else if (restante <= 7 * MS_POR_DIA) estado = "proximo";
        else estado = "vigente";
      } else if (dias === null) estado = "sin-fecha";
      else if (dias < 0) estado = "vencido";
      else if (dias <= 7) estado = "proximo";
      else estado = "vigente";

      return { ...cliente, dias, estado };
    });
  }, [clientes]);

  const filtrados = clasificados.filter((cliente) => {
    const coincideFiltro =
      filtro === "todos" ||
      (filtro === "vigentes" && cliente.estado === "vigente") ||
      (filtro === "proximos" && cliente.estado === "proximo") ||
      (filtro === "vencidos" && cliente.estado === "vencido");

    const coincideBusqueda = cliente.email
      .toLowerCase()
      .includes(busqueda.toLowerCase().trim());

    return coincideFiltro && coincideBusqueda;
  });

  async function renovar(cliente: Cliente, plan: "1 mes" | "2 meses" | "3 meses") {
    const duracion = plan === "1 mes" ? 1 : plan === "2 meses" ? 2 : 3;

    if (
      !window.confirm(
        `¿Renovar a ${cliente.email} por ${duracion} ${
          duracion === 1 ? "mes" : "meses"
        }? La fecha de vencimiento se actualizará automáticamente.${
          cliente.esPrueba
            ? " Esto convierte la prueba gratuita en una suscripción."
            : ""
        }`
      )
    ) {
      return;
    }

    try {
      setRenovandoUid(cliente.uid);
      setError("");
      setMensaje("");

      const usuario = auth.currentUser;
      if (!usuario) throw new Error("Tu sesión expiró. Volvé a ingresar.");

      const token = await usuario.getIdToken();

      const respuesta = await fetch("/api/admin?accion=renovar", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid: cliente.uid,
          plan,
        }),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos.error || "No se pudo renovar el cliente.");
      }

      await cargarClientes(token);
      setMensaje(
        `Renovación guardada para ${cliente.email}. Nuevo vencimiento: ${mostrarFecha(
          datos.vencimiento
        )}.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al renovar.");
    } finally {
      setRenovandoUid("");
    }
  }

  if (cargando) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        Cargando vencimientos...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-8">
      <div className="mx-auto max-w-6xl">
        <CreditosDisponibles />
        <a href="/dashboard" className="text-sm text-cyan-400 hover:underline">
          ← Volver al panel
        </a>

        <h1 className="mt-4 text-3xl font-bold">Planes y vencimientos</h1>
        <p className="mt-2 text-slate-400">
          Los clientes próximos a vencer son aquellos a los que les quedan
          siete días o menos, sin contar los ya vencidos.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-950 p-3 text-red-300">
            {error}
          </p>
        )}

        {mensaje && (
          <p role="status" className="mt-4 rounded-lg bg-green-950 p-3 text-green-300">
            {mensaje}
          </p>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { nombre: "Todos", valor: clasificados.length, filtro: "todos" },
            {
              nombre: "Vigentes",
              valor: clasificados.filter((c) => c.estado === "vigente").length,
              filtro: "vigentes",
            },
            {
              nombre: "Próximos a vencer",
              valor: clasificados.filter((c) => c.estado === "proximo").length,
              filtro: "proximos",
            },
            {
              nombre: "Vencidos",
              valor: clasificados.filter((c) => c.estado === "vencido").length,
              filtro: "vencidos",
            },
          ].map((tarjeta) => (
            <button
              key={tarjeta.filtro}
              onClick={() => setFiltro(tarjeta.filtro as Filtro)}
              className={`rounded-xl border p-5 text-left transition hover:border-cyan-500 ${
                filtro === tarjeta.filtro
                  ? "border-cyan-500 bg-slate-800"
                  : "border-slate-700 bg-slate-900"
              }`}
            >
              <p className="text-sm text-slate-400">{tarjeta.nombre}</p>
              <p className="mt-2 text-3xl font-bold">{tarjeta.valor}</p>
            </button>
          ))}
        </section>

        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por correo..."
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
            />

            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as Filtro)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            >
              <option value="todos">Todos los clientes</option>
              <option value="vigentes">Vigentes</option>
              <option value="proximos">Próximos a vencer</option>
              <option value="vencidos">Vencidos</option>
            </select>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-slate-400">
                <tr className="border-b border-slate-700">
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Vencimiento</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Renovar</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((cliente) => {
                  const vencido = cliente.estado === "vencido";
                  const proximo = cliente.estado === "proximo";
                  const guardando = renovandoUid === cliente.uid;

                  return (
                    <tr key={cliente.uid} className="border-b border-slate-800">
                      <td className="p-3">{cliente.email || "Sin correo"}</td>
                      <td className="p-3">{cliente.plan || "Sin plan"}</td>
                      <td className="p-3">
                        {mostrarFecha(cliente.vencimiento)}
                        {cliente.esPrueba &&
                        typeof cliente.vencimientoMs === "number" ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Prueba gratuita · vence {mostrarHora(cliente.vencimientoMs)}
                          </p>
                        ) : cliente.dias !== null && cliente.dias > 0 ? (
                          <p className="mt-1 text-xs text-slate-400">
                            {cliente.dias} día(s) restantes
                          </p>
                        ) : cliente.estado === "proximo" &&
                          cliente.dias === 0 ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Vence hoy
                          </p>
                        ) : null}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block rounded-full px-3 py-1 text-xs ${
                            vencido
                              ? "bg-red-950 text-red-300"
                              : proximo
                                ? "bg-amber-950 text-amber-300"
                                : cliente.estado === "sin-fecha"
                                  ? "bg-slate-800 text-slate-300"
                                  : cliente.activo
                                    ? "bg-green-950 text-green-300"
                                    : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {vencido
                            ? "Vencido"
                            : cliente.esPrueba
                              ? "Prueba activa"
                              : proximo
                              ? "Próximo a vencer"
                              : cliente.estado === "sin-fecha"
                                ? "Sin fecha"
                                : cliente.activo
                                  ? "Vigente"
                                  : "Inactivo"}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {(["1 mes", "2 meses", "3 meses"] as const).map((plan) => (
                            <button
                              key={plan}
                              disabled={Boolean(renovandoUid)}
                              onClick={() => renovar(cliente, plan)}
                              className="rounded-lg bg-cyan-700 px-3 py-2 font-medium hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {guardando ? "Guardando..." : `Renovar ${plan}`}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      No hay clientes para este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
