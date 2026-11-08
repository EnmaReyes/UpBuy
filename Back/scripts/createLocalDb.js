// Crea la base de datos local si no existe.
//
// Util para desarrollo: la base "upbuy" del Postgres local a veces no esta
// creada (se borra al reinstalar Postgres o al empezar con una maquina
// nueva). Sin ella la API no arranca.
//
// Uso (desde Back/):
//   node scripts/createLocalDb.js
//
// NO hace nada en produccion: solo se ejecuta a mano, en local.

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { Sequelize } = require("sequelize");
const { DATABASE_URL, DB_DIALECT } = require("../config.js");

const run = async () => {
  const nombreBase = new URL(DATABASE_URL).pathname.replace(/^\//, "");
  if (!nombreBase) {
    console.log("No se pudo deducir el nombre de la base de la URL.");
    return;
  }

  // Se conecta a la base "postgres" (siempre existe) para poder crear la otra.
  const urlAdmin = new URL(DATABASE_URL);
  urlAdmin.pathname = "/postgres";

  const admin = new Sequelize(urlAdmin.toString(), {
    dialect: DB_DIALECT || "postgres",
    logging: false,
  });

  try {
    await admin.authenticate();
    const [rows] = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = :nombre",
      { replacements: { nombre: nombreBase } },
    );

    if (rows.length) {
      console.log(`✅ La base "${nombreBase}" ya existe.`);
      return;
    }

    // El nombre viene de la configuracion, no de entrada de usuario: aun
    // asi se escapa por si alguien lo cambia a mano.
    await admin.query(`CREATE DATABASE "${nombreBase.replace(/"/g, '""')}"`);
    console.log(`✅ Base "${nombreBase}" creada.`);
  } finally {
    await admin.close();
  }
};

run()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error("❌", error.name, error.message);
    process.exitCode = 1;
  });
