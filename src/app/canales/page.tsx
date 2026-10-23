
"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

type Estado = "operativo" | "inestable" | "caido" | "pendiente";

type Canal = {
  id: string;
  nombre: string;
  categoria: string;
  url: string;
  estado: Estado;
  mensaje?: string;
  codigoHttp?: number | null;
  duracionMs?: number;
  verificadoEn?: number | null;
  creadoEn: number;
  actualizadoEn: number;
};

const estadoTexto: Record<Estado, string> = {
  operativo: "Operativo",
  inestable: "Inestable",
  caido: "Caído",
  pendiente: "Pendiente",
};

function fechaTexto(valor?: number | null) {
  if (!valor) return "Nunca";
  return new Date(valor).toLocaleString("es-AR");
}

export default function CanalesPage() {
  const router = useRouter();
  const [canales, setCanales] = useState<Canal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [url, setUrl] = useState("");

  const cargarCanales = useCallback(async () => {
    const usuario = auth.currentUser;
    if (!usuario) return;

    const token = await usuario.getIdToken();
    const respuesta = await fetch("/api/canales", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(datos.error || "No se pudieron cargar los canales.");
    }

    setCanales(datos.canales ?? []);
  }, []);

  useEffect(() => {
    const cancelar = onAuthStateChanged(auth, async (usuario) => {
      if (!usuario) {
        router.replace("/login");
        return;
      }

      try {
        const resultado = await usuario.getIdTokenResult(true);

        if (resultado.claims.role !== "admin") {
          router.replace("/");
          return;
        }

        await cargarCanales();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar los canales.");
      } finally {
        setCargando(false);
      }
    });

    return () => cancelar();
  }, [router, cargarCanales]);

  function limpiarFormulario() {
    setEditando(null);
    setNombre("");
    setCategoria("");
    setUrl("");
  }

  async function guardarCanal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    setMensaje("");

    try {
      const usuario = auth.currentUser;
      if (!usuario) throw new Error("La sesión expiró. Volvé a ingresar.");

      const token = await usuario.getIdToken();
      const respuesta = await fetch("/api/canales", {
        method: editando ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          editando
            ? { id: editando, nombre, categoria, url }
            : { nombre, categoria, url }
        ),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos.error || "No se pudo guardar el canal.");
      }

      await cargarCanales();
      setMensaje(editando ? "Canal actualizado." : "Canal agregado.");
      limpiarFormulario();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error.");
    } finally {
      setGuardando(false);
    }
  }

  function iniciarEdicion(canal: Canal) {
    setEditando(canal.id);
    setNombre(canal.nombre);
    setCategoria(canal.categoria);
    setUrl(canal.url);
    setError("");
    setMensaje("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function eliminarCanal(canal: Canal) {
    if (!window.confirm(`¿Eliminar el canal "${canal.nombre}"?`)) return;

    setError("");
    setMensaje("");

    try {
      const usuario = auth.currentUser;
      if (!usuario) throw new Error("La sesión expiró.");

      const token = await usuario.getIdToken();
      const respuesta = await fetch("/api/canales", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: canal.id }),
      });

      const datos = await respuesta.json();
      if (!respuesta.ok) {
        throw new Error(datos.error || "No se pudo eliminar el canal.");
      }

      await cargarCanales();
      setMensaje("Canal eliminado.");
      if (editando === canal.id) limpiarFormulario();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error.");
    }
  }

  const filtrados = canales.filter((canal) =>
    `${canal.nombre} ${canal.categoria}`
      .toLowerCase()
      .includes(busqueda.toLowerCase())
  );

  if (cargando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Cargando canales...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <button
          onClick={() => router.push("/")}
          className="mb-6 text-sm text-blue-400 hover:text-blue-300"
        >
          ← Volver al panel
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Administrar canales</h1>
          <p className="mt-2 text-slate-400">
            Gestioná enlaces y consultá el último estado registrado.
          </p>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-red-800 bg-red-950 p-3 text-red-200">
            {error}
          </p>
        )}

        {mensaje && (
          <p className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950 p-3 text-emerald-200">
            {mensaje}
          </p>
        )}

        <form
          onSubmit={guardarCanal}
          className="mb-8 grid gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:grid-cols-2"
        >
          <h2 className="text-xl font-semibold sm:col-span-2">
            {editando ? "Editar canal" : "Agregar canal"}
          </h2>

          <label className="text-sm text-slate-300">
            Nombre
            <input
              required
              maxLength={100}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
              placeholder="Ej. Canal de prueba"
            />
          </label>

          <label className="text-sm text-slate-300">
            Categoría
            <input
              required
              maxLength={80}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
              placeholder="Ej. Deportes"
            />
          </label>

          <label className="text-sm text-slate-300 sm:col-span-2">
            URL HTTPS de la lista HLS (.m3u8)
            <input
              required
              type="url"
              maxLength={2048}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
              placeholder="https://servidor.example/lista.m3u8"
            />
          </label>

          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button
              disabled={guardando}
              className="rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
            >
              {guardando ? "Comprobando y guardando..." : editando ? "Guardar cambios" : "Comprobar y agregar"}
            </button>

            {editando && (
              <button
                type="button"
                onClick={limpiarFormulario}
                className="rounded-lg bg-slate-700 px-5 py-3 hover:bg-slate-600"
              >
                Cancelar edición
              </button>
            )}

            <button
              type="button"
              onClick={async () => {
                setError("");
                setMensaje("");
                setCargando(true);
                try {
                  await cargarCanales();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Error al actualizar.");
                } finally {
                  setCargando(false);
                }
              }}
              className="rounded-lg border border-slate-700 px-5 py-3 hover:bg-slate-800"
            >
              Actualizar lista
            </button>
          </div>
        </form>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">
            Canales registrados ({canales.length})
          </h2>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o categoría..."
            className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-white sm:w-80"
          />
        </div>

        <div className="grid gap-4">
          {filtrados.map((canal) => (
            <article
              key={canal.id}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold">{canal.nombre}</h3>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      canal.estado === "operativo"
                        ? "bg-emerald-950 text-emerald-300"
                        : canal.estado === "inestable"
                        ? "bg-amber-950 text-amber-300"
                        : canal.estado === "caido"
                        ? "bg-red-950 text-red-300"
                        : "bg-slate-800 text-slate-300"
                    }`}>
                      {estadoTexto[canal.estado] ?? "Pendiente"}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-slate-400">{canal.categoria}</p>
                  <p className="mt-3 break-all text-sm text-slate-300">{canal.url}</p>
                  <p className="mt-3 text-sm text-slate-400">
                    Última comprobación: {fechaTexto(canal.verificadoEn)}
                    {canal.duracionMs !== undefined && ` · ${canal.duracionMs} ms`}
                    {canal.codigoHttp != null && ` · HTTP ${canal.codigoHttp}`}
                  </p>
                  {canal.mensaje && (
                    <p className="mt-2 text-sm text-slate-400">{canal.mensaje}</p>
                  )}
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => iniciarEdicion(canal)}
                    className="rounded-lg bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => eliminarCanal(canal)}
                    className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-300 hover:bg-red-950"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </article>
          ))}

          {filtrados.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
              {canales.length === 0
                ? "Todavía no hay canales registrados."
                : "No se encontraron canales con esa búsqueda."}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
