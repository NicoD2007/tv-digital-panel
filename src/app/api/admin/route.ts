
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  CREDITOS_PRUEBA,
  datosPruebaGratuita,
  esFechaValida,
  estaVencido,
  finDeDiaArgentinaMs,
  leerVencimientoMs,
  obtenerFechaArgentina,
  sumarMesesAFecha,
} from "@/lib/vencimientos";

export const runtime = "nodejs";

type UsuarioVerificado = {
  uid: string;
  rol: "admin" | "revendedor";
};

const MESES_POR_PLAN: Record<string, number> = {
  "1 mes": 1,
  "2 meses": 2,
  "3 meses": 3,
};

async function verificarUsuario(
  request: NextRequest
): Promise<UsuarioVerificado> {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("401");
  }

  const token = authorization.slice("Bearer ".length);
  const decoded = await adminAuth.verifyIdToken(token, true);
  const cuenta = await adminAuth.getUser(decoded.uid);

  if (cuenta.disabled) throw new Error("403");

  const rol = cuenta.customClaims?.role;

  if (rol !== "admin" && rol !== "revendedor") {
    throw new Error("403");
  }

  if (rol === "revendedor") {
    const registro = await adminDb
      .ref(`revendedores/${cuenta.uid}`)
      .get();

    if (!registro.exists() || registro.val()?.activo !== true) {
      throw new Error("403");
    }
  }

  return { uid: cuenta.uid, rol };
}

function responderError(error: unknown) {
  if (error instanceof Error && error.message === "401") {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (error instanceof Error && error.message === "403") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  return NextResponse.json(
    { error: "Error interno del servidor" },
    { status: 500 }
  );
}

function esEmailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Las funciones de fecha (esFechaValida, obtenerFechaArgentina, sumarMesesAFecha)
// y la regla de vencimiento viven ahora en src/lib/vencimientos.ts.

function calcularVencimiento(plan: string) {
  const meses = MESES_POR_PLAN[plan];
  if (!meses) throw new Error("Plan no válido");

  return sumarMesesAFecha(obtenerFechaArgentina(), meses);
}

function esPlanValido(plan: string) {
  return Object.prototype.hasOwnProperty.call(MESES_POR_PLAN, plan);
}

/**
 * Reserva créditos mediante una transacción atómica.
 * Los saldos ausentes o inválidos se consideran cero.
 */




async function reservarCreditos(uid: string, cantidad: number) {
  if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
    throw new Error("CANTIDAD_CREDITOS_INVALIDA");
  }

  const referencia = adminDb.ref(`revendedores/${uid}/creditos`);
  const snapshotInicial = await referencia.get();
  const saldoInicial = snapshotInicial.val();

  if (
    typeof saldoInicial !== "number" ||
    !Number.isSafeInteger(saldoInicial) ||
    saldoInicial < 0
  ) {
    throw new Error("SALDO_INVALIDO");
  }

  if (saldoInicial < cantidad) {
    throw new Error("CREDITOS_INSUFICIENTES");
  }

  const resultado = await referencia.transaction((saldoActual) => {
    // Firebase puede iniciar la transacción con null.
    // Usamos el saldo leído previamente solo para ese intento inicial.
    const saldo =
      saldoActual === null || saldoActual === undefined
        ? saldoInicial
        : saldoActual;

    if (
      typeof saldo !== "number" ||
      !Number.isSafeInteger(saldo) ||
      saldo < cantidad
    ) {
      return;
    }

    return saldo - cantidad;
  });

  if (!resultado.committed) {
    const saldoActual = (await referencia.get()).val();

    if (
      typeof saldoActual === "number" &&
      Number.isSafeInteger(saldoActual) &&
      saldoActual >= 0 &&
      saldoActual < cantidad
    ) {
      throw new Error("CREDITOS_INSUFICIENTES");
    }

    throw new Error("ERROR_RESERVANDO_CREDITOS");
  }

  return resultado.snapshot.val() as number;
}


/** Devuelve créditos si una operación posterior falla. */
async function devolverCreditos(uid: string, cantidad: number) {
  const referencia = adminDb.ref(`revendedores/${uid}/creditos`);

  const resultado = await referencia.transaction((saldoActual) => {
    const saldo =
      typeof saldoActual === "number" &&
      Number.isSafeInteger(saldoActual) &&
      saldoActual >= 0
        ? saldoActual
        : 0;

    const nuevoSaldo = saldo + cantidad;

    if (!Number.isSafeInteger(nuevoSaldo)) return;

    return nuevoSaldo;
  });

  if (!resultado.committed) {
    throw new Error("No se pudieron restituir los créditos automáticamente.");
  }
}

function responderErrorCreditos(error: unknown) {
  if (error instanceof Error && error.message === "CREDITOS_INSUFICIENTES") {
    return NextResponse.json(
      { error: "No tenés suficientes créditos para esta operación." },
      { status: 402 }
    );
  }

  return responderError(error);
}

// GET: verificar acceso, listar clientes, revendedores y saldo.
export async function GET(request: NextRequest) {
  try {
    const usuarioActual = await verificarUsuario(request);
    const accion = request.nextUrl.searchParams.get("accion");

    if (accion === "creditos") {
      if (usuarioActual.rol === "admin") {
        return NextResponse.json({
          administrador: true,
          creditos: null,
        });
      }

      const snapshot = await adminDb
        .ref(`revendedores/${usuarioActual.uid}/creditos`)
        .get();

      const saldo = snapshot.val();

      return NextResponse.json({
        administrador: false,
        creditos:
          typeof saldo === "number" &&
          Number.isSafeInteger(saldo) &&
          saldo >= 0
            ? saldo
            : 0,
      });
    }

    if (accion === "revendedores") {
      if (usuarioActual.rol !== "admin") {
        return NextResponse.json(
          { error: "Solo el administrador puede gestionar revendedores." },
          { status: 403 }
        );
      }

      const snapshot = await adminDb.ref("revendedores").get();
      const datos = snapshot.val() || {};

      const revendedores = Object.entries(datos).map(([uid, valor]) => {
        const r = (valor || {}) as Record<string, unknown>;
        const saldo = r.creditos;

        return {
          uid,
          email: typeof r.email === "string" ? r.email : "",
          activo: r.activo === true,
          creditos:
            typeof saldo === "number" &&
            Number.isSafeInteger(saldo) &&
            saldo >= 0
              ? saldo
              : 0,
        };
      });

      return NextResponse.json({ revendedores });
    }

    if (accion !== "clientes") {
      if (usuarioActual.rol !== "admin") {
        return NextResponse.json(
          { error: "No autorizado para acceder al panel de administración." },
          { status: 403 }
        );
      }

      return NextResponse.json({
        autorizado: true,
        mensaje: "Acceso de administrador verificado",
      });
    }

    const referencia = adminDb.ref("usuarios");

    const snapshot =
      usuarioActual.rol === "admin"
        ? await referencia.get()
        : await referencia
            .orderByChild("creadoPor")
            .equalTo(usuarioActual.uid)
            .get();

    const datos = snapshot.val() || {};
    const ahora = Date.now();
    const actualizaciones: Record<string, boolean> = {};

    for (const [uid, valor] of Object.entries(datos)) {
      const cliente = (valor || {}) as Record<string, unknown>;

      // Misma regla que usan la app y las reglas de Firebase (ver
      // src/lib/vencimientos.ts): se compara contra el instante exacto de
      // vencimiento, no solo contra la fecha.
      if (cliente.activo === true && estaVencido(cliente, ahora)) {
        actualizaciones[`${uid}/activo`] = false;
      }
    }

    if (Object.keys(actualizaciones).length > 0) {
      await referencia.update(actualizaciones);
    }

    const clientes = Object.entries(datos)
      .filter(([, valor]) => {
        const cliente = (valor || {}) as Record<string, unknown>;

        return (
          usuarioActual.rol === "admin" ||
          cliente.creadoPor === usuarioActual.uid
        );
      })
      .map(([uid, valor]) => {
        const cliente = (valor || {}) as Record<string, unknown>;
        const vencimiento =
          typeof cliente.vencimiento === "string"
            ? cliente.vencimiento
            : "";

        const vencido = estaVencido(cliente, ahora);

        return {
          uid,
          email: typeof cliente.email === "string" ? cliente.email : "",
          activo: cliente.activo === true && !vencido,
          plan: typeof cliente.plan === "string" ? cliente.plan : "",
          vencimiento,
          // Instante exacto de vencimiento. Para cuentas anteriores se deduce
          // de `vencimiento` (no se escribe nada en la base).
          vencimientoMs: leerVencimientoMs(cliente),
          esPrueba: cliente.esPrueba === true,
        };
      });

    return NextResponse.json({ clientes });
  } catch (error) {
    console.error("Error en GET /api/admin:", error);
    return responderError(error);
  }
}

// POST: crear clientes o revendedores.
export async function POST(request: NextRequest) {
  let uidCreado: string | undefined;
  let tipoCuenta: "cliente" | "revendedor" | undefined;
  let creditosReservados = 0;
  let revendedorQuePago: string | undefined;

  try {
    const usuarioActual = await verificarUsuario(request);
    const cuerpo = await request.json();
    const accion = request.nextUrl.searchParams.get("accion");

    const email =
      typeof cuerpo.email === "string" ? cuerpo.email.trim() : "";
    const password =
      typeof cuerpo.password === "string" ? cuerpo.password : "";

    if (accion === "revendedores") {
      if (usuarioActual.rol !== "admin") {
        return NextResponse.json(
          { error: "Solo el administrador puede crear revendedores." },
          { status: 403 }
        );
      }

      if (!esEmailValido(email) || password.length < 6) {
        return NextResponse.json(
          { error: "Ingresá un correo válido y una contraseña de al menos 6 caracteres." },
          { status: 400 }
        );
      }

      const cuenta = await adminAuth.createUser({
        email,
        password,
        disabled: false,
      });

      uidCreado = cuenta.uid;
      tipoCuenta = "revendedor";

      await adminAuth.setCustomUserClaims(cuenta.uid, {
        role: "revendedor",
      });

      await adminDb.ref(`revendedores/${cuenta.uid}`).set({
        email,
        activo: true,
        creditos: 0,
        creadoEn: new Date().toISOString(),
      });

      return NextResponse.json(
        { mensaje: "Revendedor creado correctamente", uid: cuenta.uid },
        { status: 201 }
      );
    }

    // "normal" (valor por defecto, como hasta ahora) o "prueba".
    const tipo = typeof cuerpo.tipo === "string" ? cuerpo.tipo : "normal";

    if (tipo !== "normal" && tipo !== "prueba") {
      return NextResponse.json(
        { error: "Tipo de cuenta no válido" },
        { status: 400 }
      );
    }

    const esPrueba = tipo === "prueba";
    const plan = typeof cuerpo.plan === "string" ? cuerpo.plan : "";

    if (!esEmailValido(email) || password.length < 6) {
      return NextResponse.json(
        { error: "Ingresá un correo válido y una contraseña de al menos 6 caracteres." },
        { status: 400 }
      );
    }

    if (!esPrueba && !esPlanValido(plan)) {
      return NextResponse.json({ error: "Plan no válido" }, { status: 400 });
    }

    // El vencimiento SIEMPRE se calcula acá, en el servidor. Una prueba dura
    // exactamente 2 horas desde este instante; el cliente no envía ninguna fecha.
    const ahoraMs = Date.now();
    let datosPlan: Record<string, unknown>;
    let creditosNecesarios: number;

    if (esPrueba) {
      datosPlan = datosPruebaGratuita(ahoraMs);
      creditosNecesarios = CREDITOS_PRUEBA;
    } else {
      const vencimientoNormal = calcularVencimiento(plan);

      datosPlan = {
        plan,
        vencimiento: vencimientoNormal,
        vencimientoMs: finDeDiaArgentinaMs(vencimientoNormal),
        creadoEn: new Date(ahoraMs).toISOString(),
      };
      creditosNecesarios = MESES_POR_PLAN[plan];
    }

    // Solo los revendedores consumen créditos al crear clientes.
    if (usuarioActual.rol === "revendedor" && creditosNecesarios > 0) {
      revendedorQuePago = usuarioActual.uid;
      await reservarCreditos(revendedorQuePago, creditosNecesarios);
      creditosReservados = creditosNecesarios;
    }

    const cuenta = await adminAuth.createUser({
      email,
      password,
      disabled: false,
    });

    uidCreado = cuenta.uid;
    tipoCuenta = "cliente";

    await adminDb.ref(`usuarios/${cuenta.uid}`).set({
      email,
      activo: true,
      ...datosPlan,
      creadoPor:
        usuarioActual.rol === "admin" ? "admin" : usuarioActual.uid,
    });

    const saldoRestante =
      revendedorQuePago
        ? (await adminDb
            .ref(`revendedores/${revendedorQuePago}/creditos`)
            .get()).val()
        : null;

    return NextResponse.json(
      {
        mensaje: esPrueba
          ? "Prueba gratuita creada correctamente"
          : "Cliente creado correctamente",
        uid: cuenta.uid,
        vencimiento: datosPlan.vencimiento,
        vencimientoMs: datosPlan.vencimientoMs,
        esPrueba,
        ...(revendedorQuePago ? { creditosRestantes: saldoRestante } : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error) {
  if (error.message === "CREDITOS_INSUFICIENTES") {
    return NextResponse.json(
      { error: "No tenés suficientes créditos para este plan." },
      { status: 402 }
    );
  }

  if (error.message === "ERROR_RESERVANDO_CREDITOS") {
    console.error("No se confirmó la transacción de créditos.");

    return NextResponse.json(
      {
        error:
          "No se pudieron reservar los créditos. Verificá el saldo e intentá nuevamente.",
      },
      { status: 409 }
    );
  }
}
    // Limpiar una cuenta creada parcialmente.
    if (uidCreado && tipoCuenta) {
      const ruta =
        tipoCuenta === "revendedor"
          ? `revendedores/${uidCreado}`
          : `usuarios/${uidCreado}`;

      await adminDb.ref(ruta).remove().catch(() => {});
      await adminAuth.deleteUser(uidCreado).catch(() => {});
    }

    // Si falló la creación del cliente, devolver los créditos reservados.
    if (revendedorQuePago && creditosReservados > 0) {
      try {
        await devolverCreditos(revendedorQuePago, creditosReservados);
      } catch (errorDevolucion) {
        console.error("Error al devolver créditos:", errorDevolucion);
      }
    }

    if (
      error instanceof Error &&
      (error.message === "401" || error.message === "403")
    ) {
      return responderError(error);
    }

    if (error instanceof Error && error.message === "CREDITOS_INSUFICIENTES") {
      return responderErrorCreditos(error);
    }

    const codigo = (error as { code?: string })?.code;

    if (codigo === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "Ese correo ya está registrado." },
        { status: 409 }
      );
    }

    if (codigo === "auth/invalid-email") {
      return NextResponse.json(
        { error: "El correo electrónico no es válido." },
        { status: 400 }
      );
    }

    console.error("Error al crear cuenta:", error);

    return NextResponse.json(
      { error: "No se pudo crear la cuenta." },
      { status: 500 }
    );
  }
}

// PATCH: gestionar revendedores, créditos, clientes y renovaciones.
export async function PATCH(request: NextRequest) {
  let creditosReservados = 0;
  let revendedorQuePago: string | undefined;

  try {
    const usuarioActual = await verificarUsuario(request);
    const accion = request.nextUrl.searchParams.get("accion");
    const cuerpo = await request.json();

    // Asignar créditos: exclusivamente administrador.
    if (accion === "creditos") {
      if (usuarioActual.rol !== "admin") {
        return NextResponse.json(
          { error: "Solo el administrador puede asignar créditos." },
          { status: 403 }
        );
      }

      const uid = typeof cuerpo.uid === "string" ? cuerpo.uid : "";
      const cantidad = cuerpo.cantidad;

      if (
        !uid ||
        !Number.isSafeInteger(cantidad) ||
        cantidad <= 0
      ) {
        return NextResponse.json(
          { error: "Ingresá un revendedor válido y una cantidad positiva de créditos." },
          { status: 400 }
        );
      }

      const referencia = adminDb.ref(`revendedores/${uid}`);
      const snapshot = await referencia.get();

      if (!snapshot.exists()) {
        return NextResponse.json(
          { error: "No se encontró el revendedor." },
          { status: 404 }
        );
      }

      const usuarioAuth = await adminAuth.getUser(uid);

      if (usuarioAuth.customClaims?.role !== "revendedor") {
        return NextResponse.json(
          { error: "La cuenta no tiene el rol de revendedor." },
          { status: 400 }
        );
      }

      const saldoRef = referencia.child("creditos");

      const resultado = await saldoRef.transaction((saldoActual) => {
        const saldo =
          typeof saldoActual === "number" &&
          Number.isSafeInteger(saldoActual) &&
          saldoActual >= 0
            ? saldoActual
            : 0;

        const nuevoSaldo = saldo + cantidad;

        if (!Number.isSafeInteger(nuevoSaldo)) return;

        return nuevoSaldo;
      });

      if (!resultado.committed) {
        return NextResponse.json(
          { error: "No se pudieron asignar los créditos. Intentá nuevamente." },
          { status: 409 }
        );
      }

      return NextResponse.json({
        mensaje: "Créditos asignados correctamente.",
        creditos: resultado.snapshot.val(),
      });
    }

    // Activar/desactivar revendedores.
    if (accion === "revendedores") {
      if (usuarioActual.rol !== "admin") {
        return NextResponse.json(
          { error: "Solo el administrador puede modificar revendedores." },
          { status: 403 }
        );
      }

      const uid = typeof cuerpo.uid === "string" ? cuerpo.uid : "";
      const activo = cuerpo.activo;

      if (!uid || typeof activo !== "boolean") {
        return NextResponse.json(
          { error: "Datos de revendedor no válidos." },
          { status: 400 }
        );
      }

      const referencia = adminDb.ref(`revendedores/${uid}`);
      const snapshot = await referencia.get();

      if (!snapshot.exists()) {
        return NextResponse.json(
          { error: "No se encontró el revendedor." },
          { status: 404 }
        );
      }

      const registro = snapshot.val();
      const usuarioAuth = await adminAuth.getUser(uid);

      if (usuarioAuth.customClaims?.role !== "revendedor") {
        return NextResponse.json(
          { error: "La cuenta no tiene el rol de revendedor." },
          { status: 400 }
        );
      }

      const estadoAnterior = registro.activo === true;

      try {
        if (!activo) {
          await adminAuth.updateUser(uid, { disabled: true });
          await adminAuth.revokeRefreshTokens(uid);
          await referencia.update({ activo: false });
        } else {
          await referencia.update({ activo: true });

          try {
            await adminAuth.updateUser(uid, { disabled: false });
          } catch (error) {
            await referencia.update({ activo: false }).catch(() => {});
            throw error;
          }
        }
      } catch (error) {
        await referencia.update({ activo: estadoAnterior }).catch(() => {});
        await adminAuth
          .updateUser(uid, { disabled: !estadoAnterior })
          .catch(() => {});
        throw error;
      }

      return NextResponse.json({
        mensaje: activo
          ? "Revendedor activado correctamente."
          : "Revendedor desactivado correctamente.",
      });
    }

    const uid = typeof cuerpo.uid === "string" ? cuerpo.uid : "";

    if (!uid) {
      return NextResponse.json({ error: "Falta el UID" }, { status: 400 });
    }

    const referencia = adminDb.ref(`usuarios/${uid}`);
    const existente = await referencia.get();

    if (!existente.exists()) {
      return NextResponse.json(
        { error: "No se encontró el cliente" },
        { status: 404 }
      );
    }

    const datosCliente = existente.val() as Record<string, unknown>;

    if (
      usuarioActual.rol !== "admin" &&
      datosCliente.creadoPor !== usuarioActual.uid
    ) {
      return NextResponse.json(
        { error: "No tenés permiso para modificar este cliente." },
        { status: 403 }
      );
    }

    // Renovar: reservar créditos antes de cambiar el vencimiento.
    if (accion === "renovar") {
      const plan = typeof cuerpo.plan === "string" ? cuerpo.plan : "";

      if (!esPlanValido(plan)) {
        return NextResponse.json(
          { error: "Plan no válido. Elegí 1, 2 o 3 meses." },
          { status: 400 }
        );
      }

      const meses = MESES_POR_PLAN[plan];
      const hoy = obtenerFechaArgentina();
      const vencimientoActual =
        typeof datosCliente.vencimiento === "string"
          ? datosCliente.vencimiento
          : "";

      // Una prueba no aporta "días a favor": al renovarla, cuenta desde hoy.
      const fechaBase =
        datosCliente.esPrueba !== true &&
        esFechaValida(vencimientoActual) &&
        vencimientoActual > hoy
          ? vencimientoActual
          : hoy;

      const nuevoVencimiento = sumarMesesAFecha(fechaBase, meses);

      if (usuarioActual.rol === "revendedor") {
        // La comprobación de propiedad ya se realizó arriba.
        revendedorQuePago = usuarioActual.uid;
        await reservarCreditos(revendedorQuePago, meses);
        creditosReservados = meses;
      }

      try {
        await referencia.update({
          plan,
          vencimiento: nuevoVencimiento,
          vencimientoMs: finDeDiaArgentinaMs(nuevoVencimiento),
          // null elimina la marca: una prueba renovada (acción explícita del
          // administrador o revendedor) pasa a ser una suscripción normal.
          esPrueba: null,
          activo: true,
        });
      } catch (error) {
        if (revendedorQuePago && creditosReservados > 0) {
          await devolverCreditos(
            revendedorQuePago,
            creditosReservados
          );
          creditosReservados = 0;
        }

        throw error;
      }

      const saldoRestante =
        revendedorQuePago
          ? (await adminDb
              .ref(`revendedores/${revendedorQuePago}/creditos`)
              .get()).val()
          : null;

      return NextResponse.json({
        mensaje: "Cliente renovado correctamente.",
        plan,
        vencimiento: nuevoVencimiento,
        activo: true,
        ...(revendedorQuePago ? { creditosRestantes: saldoRestante } : {}),
      });
    }

    // Las pruebas gratuitas no se pueden extender ni reactivar editándolas a
    // mano. Para convertirlas en suscripción hay que usar "renovar".
    if (datosCliente.esPrueba === true) {
      const intentaCambiarPlazo =
        typeof cuerpo.plan === "string" ||
        typeof cuerpo.vencimiento === "string";
      const intentaReactivarVencida =
        cuerpo.activo === true && estaVencido(datosCliente, Date.now());

      if (intentaCambiarPlazo || intentaReactivarVencida) {
        return NextResponse.json(
          {
            error:
              "Esta cuenta es una prueba gratuita: no se puede extender ni reactivar. Para convertirla en suscripción, renovala con un plan.",
          },
          { status: 409 }
        );
      }
    }

    // Edición manual de clientes, conservada.
    const cambios: Record<string, unknown> = {};

    if (typeof cuerpo.activo === "boolean") {
      cambios.activo = cuerpo.activo;
    }

    if (typeof cuerpo.plan === "string") {
      if (!esPlanValido(cuerpo.plan)) {
        return NextResponse.json({ error: "Plan no válido" }, { status: 400 });
      }

      cambios.plan = cuerpo.plan;
    }

    if (typeof cuerpo.vencimiento === "string") {
      if (!esFechaValida(cuerpo.vencimiento)) {
        return NextResponse.json({ error: "Fecha no válida" }, { status: 400 });
      }

      cambios.vencimiento = cuerpo.vencimiento;
      // Se mantiene sincronizado el instante exacto que usan la app y las
      // reglas de Firebase.
      cambios.vencimientoMs = finDeDiaArgentinaMs(cuerpo.vencimiento);
    }

    if (Object.keys(cambios).length === 0) {
      return NextResponse.json(
        { error: "No hay cambios válidos" },
        { status: 400 }
      );
    }

    await referencia.update(cambios);

    return NextResponse.json({
      mensaje: "Cliente actualizado correctamente",
    });
  } catch (error) {
    if (revendedorQuePago && creditosReservados > 0) {
      try {
        await devolverCreditos(revendedorQuePago, creditosReservados);
      } catch (errorDevolucion) {
        console.error("Error al devolver créditos:", errorDevolucion);
      }
    }

    if (
      error instanceof Error &&
      (error.message === "401" || error.message === "403")
    ) {
      return responderError(error);
    }

    if (error instanceof Error && error.message === "CREDITOS_INSUFICIENTES") {
      return responderErrorCreditos(error);
    }

    console.error("Error en PATCH /api/admin:", error);
    return responderError(error);
  }
}

// DELETE: eliminar clientes de Authentication y Realtime Database.
export async function DELETE(request: NextRequest) {
  try {
    const usuarioActual = await verificarUsuario(request);
    const cuerpo = await request.json();
    const uid = typeof cuerpo.uid === "string" ? cuerpo.uid : "";

    if (!uid) {
      return NextResponse.json({ error: "Falta el UID" }, { status: 400 });
    }

    const referencia = adminDb.ref(`usuarios/${uid}`);
    const existente = await referencia.get();

    if (!existente.exists()) {
      return NextResponse.json(
        { error: "No se encontró el cliente" },
        { status: 404 }
      );
    }

    const datosCliente = existente.val() as Record<string, unknown>;

    if (
      usuarioActual.rol !== "admin" &&
      datosCliente.creadoPor !== usuarioActual.uid
    ) {
      return NextResponse.json(
        { error: "No tenés permiso para eliminar este cliente." },
        { status: 403 }
      );
    }

    await adminAuth.deleteUser(uid);
    await referencia.remove();

    return NextResponse.json({
      mensaje: "Cliente eliminado correctamente",
    });
  } catch (error) {
    console.error("Error en DELETE /api/admin:", error);
    return responderError(error);
  }
}
