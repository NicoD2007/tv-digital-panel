
"use client";

import { useEffect, useState } from "react";
import CreditosDisponibles from "@/components/CreditosDisponibles";
import {
  onAuthStateChanged,
  signOut,
  getIdTokenResult,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

type Rol = "admin" | "revendedor";

export default function DashboardPage() {
  const router = useRouter();

  const [verificando, setVerificando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Rol | null>(null);

  useEffect(() => {
    const cancelar = onAuthStateChanged(auth, async (usuario) => {
      if (!usuario) {
        router.replace("/login");
        return;
      }

      try {
        // Obtener el rol asignado desde Firebase Authentication.
        const resultadoToken = await getIdTokenResult(usuario, true);
        const rolToken = resultadoToken.claims.role;

        if (rolToken !== "admin" && rolToken !== "revendedor") {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        // Validar también el acceso desde el servidor.
        const token = await usuario.getIdToken();

        const respuesta = await fetch("/api/admin?accion=clientes", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!respuesta.ok) {
          await signOut(auth);
          router.replace("/login");
          return;
        }

        setRol(rolToken);
        setNombre(usuario.email || (rolToken === "admin" ? "Administrador" : "Revendedor"));
        setVerificando(false);
      } catch (error) {
        console.error("Error verificando el acceso:", error);
        await signOut(auth);
        router.replace("/login");
      }
    });

    return () => cancelar();
  }, [router]);

  async function cerrarSesion() {
    await signOut(auth);
    router.replace("/login");
  }

  if (verificando || !rol) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Verificando acceso...
      </main>
    );
  }

  const secciones = [
    {
      titulo: "Clientes",
      descripcion:
        rol === "admin"
          ? "Administrar todas las cuentas de clientes."
          : "Registrar y administrar tus propios clientes.",
      icono: "👥",
      ruta: "/clientes",
      visible: true,
    },
    {
      titulo: "Planes y vencimientos",
      descripcion:
        rol === "admin"
          ? "Controlar los planes y vencimientos de todos los clientes."
          : "Consultar y renovar los planes de tus clientes.",
      icono: "📅",
      ruta: "/planes",
      visible: true,
    },
    {
      titulo: "Revendedores",
      descripcion: "Crear, activar y administrar revendedores.",
      icono: "🤝",
      ruta: "/revendedores",
      visible: rol === "admin",
    },
    {
  titulo: "Canales",
  descripcion: "Administrar canales y enlaces.",
  icono: "📺",
  ruta: "/canales",
  visible: rol === "admin",
},
    {
      titulo: "Estadísticas",
      descripcion: "Consultar el estado general del servicio.",
      icono: "📊",
      ruta: null,
      visible: rol === "admin",
    },
  ].filter((seccion) => seccion.visible);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="flex flex-col gap-4 border-b border-slate-800 bg-slate-900 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">TV DIGITAL</h1>
          <p className="text-sm text-slate-400">
            {rol === "admin" ? "Panel de administración" : "Panel de revendedor"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-sm text-slate-300">{nombre}</p>
            <p className="text-xs text-slate-500">
              {rol === "admin" ? "Administrador" : "Revendedor"}
            </p>
          </div>

          <button
            onClick={cerrarSesion}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl p-6 sm:p-8">
        <CreditosDisponibles />
        <div className="mb-8">
          <h2 className="text-3xl font-bold">
            {rol === "admin" ? "Panel principal" : "Mi panel"}
          </h2>
          <p className="mt-2 text-slate-400">
            {rol === "admin"
              ? "Administrá tu servicio TV DIGITAL desde acá."
              : "Gestioná tus clientes y sus vencimientos desde acá."}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {secciones.map((seccion) => (
            <article
              key={seccion.titulo}
              onClick={() => {
                if (seccion.ruta) {
                  router.push(seccion.ruta);
                }
              }}
              className={`rounded-2xl border border-slate-800 bg-slate-900 p-6 transition ${
                seccion.ruta
                  ? "cursor-pointer hover:border-blue-500 hover:bg-slate-800"
                  : "opacity-75"
              }`}
            >
              <div className="mb-4 text-3xl">{seccion.icono}</div>

              <h3 className="text-lg font-semibold">{seccion.titulo}</h3>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                {seccion.descripcion}
              </p>

              <p className="mt-5 text-xs font-semibold">
                {seccion.ruta ? (
                  <span className="text-blue-400">Acceder →</span>
                ) : (
                  <span className="text-slate-500">
                    Próximamente disponible
                  </span>
                )}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
