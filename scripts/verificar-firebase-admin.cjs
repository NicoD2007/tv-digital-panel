
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

async function verificar() {
  try {
    const app = initializeApp({
      credential: applicationDefault(),
      projectId: "tv-digital-2442d",
    });

    const resultado = await getAuth(app).getUser(
      "sllVcBXdWxRGFlBAaRJNg80gn8w1"
    );

    console.log("Firebase Admin funciona correctamente.");
    console.log("UID verificado:", resultado.uid);
    console.log("La cuenta existe:", Boolean(resultado.uid));
  } catch (error) {
    console.error("No se pudo verificar Firebase Admin.");
    console.error(error.code || error.message);
    process.exitCode = 1;
  }
}

verificar();
