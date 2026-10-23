
"use client";

import { useState } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  async function iniciarSesion(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    setMensaje("");
    setCargando(true);

    try {
      const resultado = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const token = await resultado.user.getIdToken(true);

      const respuesta = await fetch(
        "/api/admin?accion=clientes",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      if (!respuesta.ok) {
        const detalle = await respuesta.text();
        console.error(
          "Error verificando el acceso:",
          respuesta.status,
          detalle
        );

        await signOut(auth);

        if (respuesta.status === 403) {
          setMensaje(
            "La cuenta no tiene permisos para ingresar o está desactivada."
          );
        } else {
          setMensaje(
            "No se pudo verificar el acceso. Revisá la API e intentá nuevamente."
          );
        }

        return;
      }

      router.replace("/dashboard");
    } catch (error) {
      console.error(
        "Error de autenticación o verificación:",
        error
      );

      await signOut(auth).catch(() => {});

      setMensaje(
        "No se pudo iniciar sesión. Verificá el correo, la contraseña y los permisos de la cuenta."
      );
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
        <h1 className="mb-2 text-center text-3xl font-bold">
          TV DIGITAL
        </h1>

        <p className="mb-8 text-center text-slate-400">
          Panel de administración y revendedores
        </p>

        <form onSubmit={iniciarSesion} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm"
            >
              Correo electrónico
            </label>

            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 outline-none focus:border-blue-500"
              placeholder="Ingresá tu correo"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm"
            >
              Contraseña
            </label>

            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 outline-none focus:border-blue-500"
              placeholder="Ingresá tu contraseña"
            />
          </div>

          {mensaje && (
            <p role="alert" className="text-sm text-red-400">
              {mensaje}
            </p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
          >
            {cargando ? "Verificando acceso..." : "INGRESAR"}
          </button>
        </form>
      </section>
    </main>
  );
}
