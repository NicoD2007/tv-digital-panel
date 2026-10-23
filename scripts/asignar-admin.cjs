
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const UID_ADMIN = "sllVcBXdWxRGFlBAaRJNg80gn8w1";

async function asignarAdmin() {
  try {
    const app = initializeApp({
      credential: applicationDefault(),
      projectId: "tv-digital-2442d",
    });

    const auth = getAuth(app);
    const usuario = await auth.getUser(UID_ADMIN);

    await auth.setCustomUserClaims(UID_ADMIN, {
      ...(usuario.customClaims || {}),
      role: "admin",
    });

    console.log("Rol de administrador asignado correctamente.");
    console.log("UID:", UID_ADMIN);
    console.log("Cerrá y volvé a iniciar sesión para actualizar el token.");
  } catch (error) {
    console.error("No se pudo asignar el rol:", error.code || error.message);
    process.exitCode = 1;
  }
}

asignarAdmin();
