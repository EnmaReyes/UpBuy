const { Sequelize } = require("sequelize");
const { DATABASE_URL, DB_DIALECT } = require("../config.js");

const isProduction = process.env.NODE_ENV === "production";

// Neon exige SSL. DB_SSL permite apagarlo para correr el flujo de produccion
// contra un Postgres local (por ejemplo al reproducir un deploy).
//   DB_SSL=false  -> sin SSL   |   DB_SSL=true -> con SSL
// Si no se define, el valor por defecto es "true" en produccion.
const sslFlag = (process.env.DB_SSL || "").trim().toLowerCase();
const useSsl = sslFlag
  ? !["0", "false", "no", "off"].includes(sslFlag)
  : isProduction;

const options = {
  dialect: DB_DIALECT || "postgres",
  dialectModule: require("pg"),
  logging: false,

  pool: {
    // En Vercel cada instancia abre su propio pool. Mantenerlo pequeño evita
    // agotar las conexiones de Neon mientras varias funciones arrancan.
    max: isProduction ? 2 : 5,
    min: 0,
    // Neon cierra conexiones inactivas al entrar en scale-to-zero; si el pool
    // las conserva demasiado tiempo, la siguiente consulta recibe un socket
    // muerto. Un idle corto hace que se renueven solas.
    idle: isProduction ? 5000 : 10000,
    // En serverless no tiene sentido esperar 30s por una conexion: la funcion
    // ya fue terminada por la plataforma antes.
    acquire: isProduction ? 15000 : 30000,
    evict: 1000,
  },

  dialectOptions: {
    ...(useSsl && {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    }),
    // Neon puede tardar en despertar tras scale-to-zero: cada intento no debe
    // quedarse colgado indefinidamente (el reintento vive en index.js).
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  },
};

const sequelize = new Sequelize(DATABASE_URL, options);

// Host de la base (sin credenciales). Se registra al conectar para poder
// confirmar en los logs de Vercel a que base se esta apuntando.
// Nota: la cadena DIRECTA de Neon (sin -pooler) es la que usa produccion y
// funciona bien con este pool. No cambiar a -pooler sin medir antes.
const databaseHost = (() => {
  try {
    return new URL(DATABASE_URL).hostname;
  } catch {
    return "desconocido";
  }
})();

module.exports = { sequelize, useSsl, databaseHost };
