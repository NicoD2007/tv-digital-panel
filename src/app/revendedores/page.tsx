
"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

type Revendedor = {
  uid: string;
  email: string;
  activo: boolean;
  creditos: number;
};

export default function RevendedoresPage() {
  const router = useRouter();

  const [verificando, setVerificando] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [token, setToken] = useState("");
  const [revendedores, setRevendedores] = useState<Revendedor[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [asignandoUid, setAsignandoUid] = useState("");

  const cargarRevendedores = useCallback(async (idToken: string) => {
    setCargando(true);

    try {
      const respuesta = await fetch("/api/admin?accion=revendedores", {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos.error || "No se pudieron cargar los revendedores.");
      }

      setRevendedores(datos.revendedores || []);
    } catch (error) {
      setMensaje(
        error instanceof Error ? error.message : "Error al cargar revendedores."
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const cancelar = onAuthStateChanged(auth, async (usuario) => {
      if (!usuario) {
        router.replace("/login");
        return;
      }

      try {
        const idToken = await usuario.getIdToken(true);

        const respuesta = await fetch("/api/admin", {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!respuesta.ok) {
          router.replace("/login");
          return;
        }

        setToken(idToken);
        await cargarRevendedores(idToken);
        setVerificando(false);
      } catch (error) {
        console.error("Error verificando el acceso:", error);
        router.replace("/login");
      }
    });

    return () => cancelar();
  }, [router, cargarRevendedores]);

  async function crearRevendedor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardando(true);
    setMensaje("");

    try {
      const respuesta = await fetch("/api/admin?accion=revendedores", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos.error || "No se pudo crear el revendedor.");
      }

      setMensaje("Revendedor creado correctamente. Su saldo inicial es de 0 créditos.");
      setEmail("");
      setPassword("");
      await cargarRevendedores(token);
    } catch (error) {
      setMensaje(
        error instanceof Error ? error.message : "Ocurrió un error."
      );
    } finally {
      setGuardando(false);
    }
  }

  async function asignarCreditos(revendedor: Revendedor) {
    const cantidad = Number(cantidades[revendedor.uid]);

    if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
      setMensaje("Ingresá una cantidad entera de créditos mayor que cero.");
      return;
    }

    if (
      !window.confirm(
        `¿Asignar ${cantidad} créditos a ${revendedor.email}?`
      )
    ) {
      return;
    }

    setAsignandoUid(revendedor.uid);
    setMensaje("");

    try {
      const respuesta = await fetch("/api/admin?accion=creditos", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid: revendedor.uid,
          cantidad,
        }),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos.error || "No se pudieron asignar los créditos.");
      }

      setMensaje(
        `Se asignaron ${cantidad} créditos a ${revendedor.email}. Saldo actual: ${datos.creditos}.`
      );

      setCantidades((actuales) => ({
        ...actuales,
        [revendedor.uid]: "",
      }));

      await cargarRevendedores(token);
    } catch (error) {
      setMensaje(
        error instanceof Error ? error.message : "Ocurrió un error."
      );
    } finally {
      setAsignandoUid("");
    }
  }

  async function cambiarEstado(revendedor: Revendedor) {
    const nuevoEstado = !revendedor.activo;

    if (
      !window.confirm(
        `${nuevoEstado ? "¿Activar" : "¿Desactivar"} la cuenta ${revendedor.email}?`
      )
    ) {
      return;
    }

    setMensaje("");

    try {
      const respuesta = await fetch("/api/admin?accion=revendedores", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid: revendedor.uid,
          activo: nuevoEstado,
        }),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos.error || "No se pudo cambiar el estado.");
      }

      setMensaje("Estado actualizado correctamente.");
      await cargarRevendedores(token);
    } catch (error) {
      setMensaje(
        error instanceof Error ? error.message : "Ocurrió un error."
      );
    }
  }

  if (verificando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Verificando acceso...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white sm:p-10">
      <div className="mx-auto max-w-6xl">
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-8 rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
        >
          ← Volver al panel
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Revendedores</h1>
          <p className="mt-2 text-slate-400">
            Administrá las cuentas y los créditos de TV DIGITAL.
          </p>
        </div>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-5 text-xl font-semibold">Crear revendedor</h2>

          <form onSubmit={crearRevendedor} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm">Correo electrónico</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3"
                placeholder="revendedor@ejemplo.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm">Contraseña inicial</label>
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

            <button
              type="submit"
              disabled={guardando || !token}
              className="rounded-lg bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50 sm:col-span-2"
            >
              {guardando ? "Creando..." : "Crear revendedor"}
            </button>
          </form>
        </section>

        {mensaje && (
          <p role="status" className="mb-6 rounded-lg bg-slate-900 p-4 text-sm">
            {mensaje}
          </p>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-6">
            <h2 className="text-xl font-semibold">Cuentas registradas</h2>
            <button
              onClick={() => cargarRevendedores(token)}
              disabled={!token || cargando}
              className="rounded-lg bg-slate-800 px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
            >
              {cargando ? "Actualizando..." : "Actualizar lista"}
            </button>
          </div>

          {cargando ? (
            <p className="p-6 text-slate-400">Cargando revendedores...</p>
          ) : revendedores.length === 0 ? (
            <p className="p-6 text-slate-400">
              Todavía no hay revendedores registrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="p-4">Correo electrónico</th>
                    <th className="p-4">UID</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4">Créditos</th>
                    <th className="p-4">Asignar créditos</th>
                    <th className="p-4">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {revendedores.map((revendedor) => (
                    <tr key={revendedor.uid} className="border-t border-slate-800">
                      <td className="p-4">{revendedor.email}</td>

                      <td className="p-4 text-xs text-slate-400">
                        {revendedor.uid}
                      </td>

                      <td className="p-4">
                        <span
                          className={
                            revendedor.activo
                              ? "rounded-full bg-green-900 px-3 py-1 text-green-300"
                              : "rounded-full bg-red-900 px-3 py-1 text-red-300"
                          }
                        >
                          {revendedor.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>

                      <td className="p-4">
                        <span className="font-semibold text-blue-300">
                          {revendedor.creditos}
                        </span>
                      </td>

                      <td className="p-4">
                        <form
                          className="flex min-w-[210px] gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void asignarCreditos(revendedor);
                          }}
                        >
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={cantidades[revendedor.uid] ?? ""}
                            onChange={(e) =>
                              setCantidades((actuales) => ({
                                ...actuales,
                                [revendedor.uid]: e.target.value,
                              }))
                            }
                            placeholder="Cantidad"
                            aria-label={`Créditos para ${revendedor.email}`}
                            className="w-28 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
                          />

                          <button
                            type="submit"
                            disabled={asignandoUid === revendedor.uid}
                            className="rounded-lg bg-blue-600 px-3 py-2 hover:bg-blue-500 disabled:opacity-50"
                          >
                            {asignandoUid === revendedor.uid
                              ? "Asignando..."
                              : "Sumar"}
                          </button>
                        </form>
                      </td>

                      <td className="p-4">
                        <button
                          onClick={() => void cambiarEstado(revendedor)}
                          className="rounded-lg bg-slate-800 px-3 py-2 hover:bg-slate-700"
                        >
                          {revendedor.activo ? "Desactivar" : "Activar"}
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
