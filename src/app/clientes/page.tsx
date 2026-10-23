
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import CreditosDisponibles from "@/components/CreditosDisponibles";

type Cliente = {
  uid: string;
  email: string;
  activo: boolean;
  plan: string;
  vencimiento: string;
};

type FiltroEstado = "todos" | "activos" | "inactivos";
type OrdenVencimiento = "proximo" | "lejano";

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState("1 mes");
  const [guardando, setGuardando] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [filtroPlan, setFiltroPlan] = useState("todos");
  const [ordenVencimiento, setOrdenVencimiento] =
    useState<OrdenVencimiento>("proximo");

  const cargarClientes = useCallback(async (idToken: string) => {
    setCargando(true);

    try {
      const respuesta = await fetch("/api/admin?accion=clientes", {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.error || "No se pudieron cargar los clientes."
        );
      }

      setClientes(datos.clientes || []);
      setMensaje("");
    } catch (error) {
      setMensaje(
        error instanceof Error ? error.message : "Error al cargar clientes."
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const cancelar = onAuthStateChanged(auth, async (usuario) => {
      if (!usuario) {
        window.location.replace("/login");
        return;
      }

      try {
        const idToken = await usuario.getIdToken();
        setToken(idToken);
        await cargarClientes(idToken);
      } catch {
        setMensaje("No se pudo verificar la sesión.");
        setCargando(false);
      }
    });

    return () => cancelar();
  }, [cargarClientes]);

  const clientesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    const resultado = clientes.filter((cliente) => {
      const coincideBusqueda =
        !texto ||
        (cliente.email || "").toLowerCase().includes(texto) ||
        cliente.uid.toLowerCase().includes(texto);

      const coincideEstado =
        filtroEstado === "todos" ||
        (filtroEstado === "activos" && cliente.activo) ||
        (filtroEstado === "inactivos" && !cliente.activo);

      const coincidePlan =
        filtroPlan === "todos" || cliente.plan === filtroPlan;

      return coincideBusqueda && coincideEstado && coincidePlan;
    });

    return resultado.sort((a, b) => {
      const fechaA = a.vencimiento || "";
      const fechaB = b.vencimiento || "";

      if (!fechaA && !fechaB) return 0;
      if (!fechaA) return 1;
      if (!fechaB) return -1;

      return ordenVencimiento === "proximo"
        ? fechaA.localeCompare(fechaB)
        : fechaB.localeCompare(fechaA);
    });
  }, [clientes, busqueda, filtroEstado, filtroPlan, ordenVencimiento]);

  async function crearCliente(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardando(true);
    setMensaje("");

    try {
      const respuesta = await fetch("/api/admin", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, plan }),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos.error || "No se pudo crear el cliente.");
      }

      setMensaje("Cliente creado correctamente.");
      setEmail("");
      setPassword("");
      setPlan("1 mes");

      await cargarClientes(token);
    } catch (error) {
      setMensaje(
        error instanceof Error ? error.message : "Ocurrió un error."
      );
    } finally {
      setGuardando(false);
    }
  }

  async function actualizarCliente(
    cliente: Cliente,
    cambios: Partial<Pick<Cliente, "activo">>
  ) {
    setMensaje("");

    try {
      const respuesta = await fetch("/api/admin", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uid: cliente.uid, ...cambios }),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos.error || "No se pudo actualizar el cliente.");
      }

      await cargarClientes(token);
      setMensaje("Cliente actualizado correctamente.");
    } catch (error) {
      setMensaje(
        error instanceof Error ? error.message : "Error al actualizar."
      );
    }
  }

  async function eliminarCliente(cliente: Cliente) {
    if (
      !window.confirm(
        `¿Eliminar permanentemente la cuenta ${
          cliente.email || cliente.uid
        }? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setMensaje("");

    try {
      const respuesta = await fetch("/api/admin", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uid: cliente.uid }),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos.error || "No se pudo eliminar el cliente.");
      }

      setMensaje("Cliente eliminado.");
      await cargarClientes(token);
    } catch (error) {
      setMensaje(
        error instanceof Error ? error.message : "Error al eliminar."
      );
    }
  }

  function mostrarFecha(fecha: string) {
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return "Sin fecha registrada";
    }

    const [anio, mes, dia] = fecha.split("-");
    return `${dia}/${mes}/${anio}`;
  }

  function limpiarFiltros() {
    setBusqueda("");
    setFiltroEstado("todos");
    setFiltroPlan("todos");
    setOrdenVencimiento("proximo");
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white sm:p-10">
      <div className="mx-auto max-w-6xl">
        <CreditosDisponibles />
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Clientes</h1>
            <p className="mt-2 text-slate-400">
              Creá y administrá las cuentas de TV DIGITAL.
            </p>
          </div>

          <button
            onClick={() => (window.location.href = "/dashboard")}
            className="rounded-lg bg-slate-800 px-4 py-2 hover:bg-slate-700"
          >
            Volver al panel
          </button>
        </div>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-5 text-xl font-semibold">Crear cliente</h2>

          <form onSubmit={crearCliente} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm">
                Correo electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3"
                placeholder="cliente@ejemplo.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm">
                Contraseña inicial
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm">Plan</label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3"
              >
                <option value="1 mes">1 mes</option>
                <option value="2 meses">2 meses</option>
                <option value="3 meses">3 meses</option>
              </select>
              <p className="mt-2 text-sm text-slate-400">
                La fecha de vencimiento se calculará automáticamente según
                el plan seleccionado.
              </p>
            </div>

            <button
              type="submit"
              disabled={guardando || !token}
              className="rounded-lg bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50 sm:col-span-2"
            >
              {guardando ? "Creando..." : "Crear cliente"}
            </button>
          </form>
        </section>

        {mensaje && (
          <p
            role="status"
            className="mb-6 rounded-lg bg-slate-900 p-4 text-sm"
          >
            {mensaje}
          </p>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-6">
            <div>
              <h2 className="text-xl font-semibold">Clientes registrados</h2>
              <p className="mt-1 text-sm text-slate-400">
                Mostrando {clientesFiltrados.length} de {clientes.length} clientes
              </p>
            </div>

            <button
              onClick={() => cargarClientes(token)}
              disabled={!token || cargando}
              className="rounded-lg bg-slate-800 px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
            >
              Actualizar lista
            </button>
          </div>

          <div className="grid gap-4 border-b border-slate-800 p-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="mb-2 block text-sm text-slate-300">
                Buscar cliente
              </label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Correo electrónico o UID"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Estado
              </label>
              <select
                value={filtroEstado}
                onChange={(e) =>
                  setFiltroEstado(e.target.value as FiltroEstado)
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3"
              >
                <option value="todos">Todos los estados</option>
                <option value="activos">Activos</option>
                <option value="inactivos">Inactivos</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Plan contratado
              </label>
              <select
                value={filtroPlan}
                onChange={(e) => setFiltroPlan(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3"
              >
                <option value="todos">Todos los planes</option>
                <option value="1 mes">1 mes</option>
                <option value="2 meses">2 meses</option>
                <option value="3 meses">3 meses</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Ordenar vencimiento
              </label>
              <select
                value={ordenVencimiento}
                onChange={(e) =>
                  setOrdenVencimiento(e.target.value as OrdenVencimiento)
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3"
              >
                <option value="proximo">Más próximos primero</option>
                <option value="lejano">Más lejanos primero</option>
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <button
                type="button"
                onClick={limpiarFiltros}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          {cargando ? (
            <p className="p-6 text-slate-400">Cargando clientes...</p>
          ) : clientesFiltrados.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-300">
                {clientes.length === 0
                  ? "No se encontraron clientes en la base de datos."
                  : "Ningún cliente coincide con los filtros seleccionados."}
              </p>

              {clientes.length > 0 && (
                <button
                  onClick={limpiarFiltros}
                  className="mt-4 rounded-lg bg-slate-800 px-4 py-2 hover:bg-slate-700"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="p-4">Correo / UID</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4">Plan</th>
                    <th className="p-4">Vencimiento</th>
                    <th className="p-4">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.map((cliente) => (
                    <tr
                      key={cliente.uid}
                      className="border-t border-slate-800"
                    >
                      <td className="p-4">
                        <div>
                          {cliente.email || "Sin correo en la base de datos"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {cliente.uid}
                        </div>
                      </td>

                      <td className="p-4">
                        <button
                          onClick={() =>
                            actualizarCliente(cliente, {
                              activo: !cliente.activo,
                            })
                          }
                          className={`rounded-full px-3 py-1 ${
                            cliente.activo
                              ? "bg-green-900 text-green-300"
                              : "bg-red-900 text-red-300"
                          }`}
                        >
                          {cliente.activo ? "Activo" : "Inactivo"}
                        </button>
                      </td>

                      <td className="p-4">
                        <span className="inline-block rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300">
                          {cliente.plan || "Sin plan"}
                        </span>
                      </td>

                      <td className="p-4">
                        <span
                          className="inline-block min-w-28 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300"
                          aria-label={`Vencimiento: ${mostrarFecha(
                            cliente.vencimiento
                          )}`}
                        >
                          {mostrarFecha(cliente.vencimiento)}
                        </span>
                      </td>

                      <td className="p-4">
                        <button
                          onClick={() => eliminarCliente(cliente)}
                          className="rounded-lg bg-red-900 px-3 py-2 text-red-200 hover:bg-red-800"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
