
"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function Home() {
  const [creditos, setCreditos] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargarCreditos = useCallback(async () => {
    setCargando(true);
    setError("");

    try {
      const usuario = auth.currentUser;

      if (!usuario) {
        setError("Iniciá sesión para consultar tus créditos.");
        return;
      }

      const token = await usuario.getIdToken();

      const respuesta = await fetch("/api/admin?accion=creditos", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(datos.error || "No se pudieron cargar los créditos.");
      }

      if (datos.administrador) {
        setCreditos(null);
        return;
      }

      if (
        typeof datos.creditos !== "number" ||
        !Number.isSafeInteger(datos.creditos) ||
        datos.creditos < 0
      ) {
        throw new Error("El saldo recibido no es válido.");
      }

      setCreditos(datos.creditos);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Ocurrió un error al consultar los créditos."
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const cancelar = onAuthStateChanged(auth, (usuario) => {
      if (usuario) {
        void cargarCreditos();
      } else {
        setCreditos(null);
        setCargando(false);
        setError("Iniciá sesión para consultar tus créditos.");
      }
    });

    return () => cancelar();
  }, [cargarCreditos]);

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-12 text-white">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-400">
            TV DIGITAL
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Panel del revendedor
          </h1>
          <p className="mt-2 text-zinc-400">
            Consultá tu saldo de créditos disponibles.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-400">
                Mis créditos disponibles
              </p>

              {cargando ? (
                <p className="mt-3 text-lg text-zinc-300">
                  Cargando saldo...
                </p>
              ) : error ? (
                <p role="alert" className="mt-3 text-sm text-red-400">
                  {error}
                </p>
              ) : creditos === null ? (
                <p className="mt-3 text-sm text-zinc-300">
                  El saldo de créditos es para cuentas revendedoras.
                </p>
              ) : (
                <>
                  <p className="mt-3 text-5xl font-bold tracking-tight text-white">
                    {creditos}
                  </p>
                  <p className="mt-2 text-sm text-zinc-400">
                    {creditos === 1 ? "crédito disponible" : "créditos disponibles"}
                  </p>
                </>
              )}
            </div>

            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-2xl text-blue-400">
              $
            </div>
          </div>

          <div className="my-6 border-t border-zinc-800" />

          <div>
            <h2 className="font-semibold">¿Cómo funcionan?</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Cada crédito equivale a un mes de servicio. Una cuenta nueva
              o una renovación consume los créditos correspondientes al plan
              seleccionado.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-zinc-300">
              <li>1 mes: 1 crédito</li>
              <li>2 meses: 2 créditos</li>
              <li>3 meses: 3 créditos</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => void cargarCreditos()}
            disabled={cargando}
            className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cargando ? "Consultando..." : "Actualizar saldo"}
          </button>
        </section>
      </div>
    </main>
  );
}
