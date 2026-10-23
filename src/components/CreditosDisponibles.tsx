
"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

type DatosCreditos = {
  administrador: boolean;
  creditos: number | null;
};

export default function CreditosDisponibles() {
  const [datos, setDatos] = useState<DatosCreditos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState("");

  const cargarCreditos = useCallback(async () => {
    const usuario = auth.currentUser;

    if (!usuario) {
      setError("No se encontró una sesión activa.");
      setCargando(false);
      return;
    }

    setActualizando(true);
    setError("");

    try {
      const token = await usuario.getIdToken();

      const respuesta = await fetch("/api/admin?accion=creditos", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const resultado = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          resultado.error || "No se pudieron consultar los créditos."
        );
      }

      setDatos({
        administrador: resultado.administrador === true,
        creditos:
          typeof resultado.creditos === "number"
            ? resultado.creditos
            : null,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudieron consultar los créditos."
      );
    } finally {
      setCargando(false);
      setActualizando(false);
    }
  }, []);

  useEffect(() => {
    const cancelar = onAuthStateChanged(auth, (usuario) => {
      if (!usuario) {
        setDatos(null);
        setCargando(false);
        return;
      }

      void cargarCreditos();
    });

    return () => cancelar();
  }, [cargarCreditos]);

  if (cargando) {
    return (
      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
        Cargando créditos...
      </div>
    );
  }

  if (datos?.administrador) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-900 bg-slate-900 p-4">
        <div>
          <p className="font-semibold text-white">Panel de administrador</p>
          <p className="mt-1 text-sm text-slate-400">
            No consumís créditos al gestionar clientes.
          </p>
        </div>
      </div>
    );
  }

  if (error || datos?.creditos === null || !datos) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-900 bg-slate-900 p-4">
        <p className="text-sm text-red-300">
          {error || "No se pudo obtener el saldo de créditos."}
        </p>

        <button
          type="button"
          onClick={() => void cargarCreditos()}
          disabled={actualizando}
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700 disabled:opacity-50"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <section className="mb-6 rounded-xl border border-cyan-900/70 bg-gradient-to-r from-slate-900 to-slate-900/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-400">
            Créditos disponibles
          </p>

          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-cyan-400">
              {datos.creditos}
            </span>
            <span className="text-sm text-slate-400">
              {datos.creditos === 1 ? "crédito" : "créditos"}
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-400">
            Cada crédito permite gestionar un mes de servicio.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void cargarCreditos()}
          disabled={actualizando}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700 disabled:opacity-50"
        >
          {actualizando ? "Actualizando..." : "Actualizar saldo"}
        </button>
      </div>
    </section>
  );
}
