// config.js
if (process.env.NODE_ENV !== "production") {
  try {
    const dotenv = require("dotenv");
    dotenv.config(); // .env (plantilla versionada, sin secretos)
    // .env.local (NO versionado) tiene prioridad: aqui van los valores reales
    dotenv.config({ path: ".env.local", override: true });
  } catch (err) {
    console.warn("dotenv no disponible:", err.message);
  }
}

const FRONTEND_URL =
  process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL
    : "http://localhost:5173";

const isProduction = process.env.NODE_ENV === "production";

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Interpreta flags tipo "true/1/yes/on". Sin valor -> fallback.
const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(
    String(value).trim().toLowerCase(),
  );
};

const DATABASE_URL =
  process.env.DATABASE_URL ||
  (() => {
    const DB_HOST = process.env.DB_HOST || "localhost";
    const DB_USER = process.env.DB_USER || "postgres";
    const DB_PASSWORD = process.env.DB_PASSWORD || "password";
    const DB_NAME = process.env.DB_NAME || "ByGio";
    const DB_PORT = process.env.DB_PORT || 5432;

    return `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
  })();

// Dialecto de Sequelize. Un valor invalido en DB_DIALECT (p. ej. "https" por
// error en Vercel) antes tumbaba toda la funcion con "The dialect https is not
// supported". Ahora la cadena de conexion manda: si DATABASE_URL es de Postgres
// el dialecto es "postgres"; si no, se valida el valor explicito y se cae a
// "postgres" con un aviso en vez de romper el arranque.
const SUPPORTED_DIALECTS = new Set([
  "postgres",
  "mysql",
  "mariadb",
  "mssql",
  "sqlite",
  "db2",
  "oracle",
]);

const inferDialectFromUrl = (url) => {
  const raw = String(url || "").trim().toLowerCase();
  if (raw.startsWith("postgres://") || raw.startsWith("postgresql://")) {
    return "postgres";
  }
  if (raw.startsWith("mysql://")) return "mysql";
  if (raw.startsWith("mariadb://")) return "mariadb";
  if (raw.startsWith("mssql://") || raw.startsWith("sqlserver://")) {
    return "mssql";
  }
  if (raw.startsWith("sqlite:")) return "sqlite";
  return "";
};

const resolveDialect = (explicit, url) => {
  const fromUrl = inferDialectFromUrl(url);
  if (fromUrl) return fromUrl;

  const raw = String(explicit || "").trim().toLowerCase();
  const normalized = raw === "postgresql" ? "postgres" : raw;
  if (!normalized) return "postgres";

  if (SUPPORTED_DIALECTS.has(normalized)) return normalized;

  console.warn(
    `DB_DIALECT="${explicit}" no es un dialecto válido; se usa "postgres".`,
  );
  return "postgres";
};

const DB_DIALECT = resolveDialect(process.env.DB_DIALECT, DATABASE_URL);

module.exports = {
  FRONTEND_URL,
  DATABASE_URL,
  DB_DIALECT,
  // Secreto JWT: en produccion DEBE venir de process.env.JWT_SECRET.
  JWT_SECRET: process.env.JWT_SECRET || "jwtkey",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID || "",
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET || "",
  GOOGLE_MAIL_FROM: process.env.GOOGLE_MAIL_FROM || "bygionay.88@gmail.com",

  // Ecommerce
  // Precios por defecto de las variantes DTF (pesos COP)
  DTF_PRICE_BASICO: toNumber(process.env.DTF_PRICE_BASICO, 22000),
  DTF_PRICE_OVERSIZE: toNumber(process.env.DTF_PRICE_OVERSIZE, 32000),

  // Punto de despacho para calcular la distancia de envio (bodega en Itagui).
  WAREHOUSE_LAT: toNumber(process.env.WAREHOUSE_LAT, 6.1724352),
  WAREHOUSE_LNG: toNumber(process.env.WAREHOUSE_LNG, -75.6093254),

  // Reserva de stock (bloqueo temporal durante el pago).
  // Apagada por defecto: con stock booleano esconde el producto de un carrito
  // abandonado y permite bloquear el catalogo creando pedidos. Se activara
  // cuando el stock sea por cantidad.
  STOCK_RESERVATION_ENABLED: toBool(
    process.env.STOCK_RESERVATION_ENABLED,
    false,
  ),

  // ---------------------------------------------------------------------
  // Wompi (pagos en linea, Web Checkout)
  //
  // Los valores reales NUNCA van al repositorio: van en Api/.env.local
  // (local) o en las Environment Variables del proyecto en Vercel.
  // Sin WOMPI_PUBLIC_KEY ni WOMPI_INTEGRITY_SECRET los endpoints de pago en
  // linea responden 503 y el checkout sigue funcionando con el flujo manual
  // (transferencia/Nequi por WhatsApp).
  // ---------------------------------------------------------------------
  WOMPI_PUBLIC_KEY: (process.env.WOMPI_PUBLIC_KEY || "").trim(),
  WOMPI_PRIVATE_KEY: (process.env.WOMPI_PRIVATE_KEY || "").trim(),
  WOMPI_INTEGRITY_SECRET: (process.env.WOMPI_INTEGRITY_SECRET || "").trim(),
  WOMPI_EVENTS_SECRET: (process.env.WOMPI_EVENTS_SECRET || "").trim(),

  // "test" (sandbox) | "prod". Si no se indica se deduce del prefijo de la
  // llave publica (pub_test_ / pub_prod_).
  WOMPI_ENV: (() => {
    const explicit = (process.env.WOMPI_ENV || "").trim().toLowerCase();
    if (explicit === "test" || explicit === "prod") return explicit;
    return (process.env.WOMPI_PUBLIC_KEY || "").includes("_test_")
      ? "test"
      : "prod";
  })(),

  // API de Wompi (consulta de transacciones). Se puede sobreescribir para
  // pruebas locales. El checkout se sirve siempre desde checkout.wompi.co.
  WOMPI_BASE_URL: (
    process.env.WOMPI_BASE_URL || ""
  ).trim() ||
    ((process.env.WOMPI_PUBLIC_KEY || "").includes("_test_")
      ? "https://sandbox.wompi.co/v1"
      : "https://production.wompi.co/v1"),

  WOMPI_CHECKOUT_URL: "https://checkout.wompi.co/p/",

  // URL publica de retorno tras el cobro. Wompi (CloudFront/WAF) bloquea las
  // redirecciones a localhost con un 403, asi que al probar en local hay que
  // apuntar esto a un tunel publico aunque FRONTEND_URL siga siendo localhost.
  // Vacia = se usa FRONTEND_URL.
  WOMPI_REDIRECT_URL: (process.env.WOMPI_REDIRECT_URL || "").trim(),

  // Los eventos vencidos (replay de una peticion vieja) se rechazan. Wompi
  // reintenta sus eventos durante horas, por eso la ventana es amplia.
  // 0 desactiva la comprobacion.
  WOMPI_EVENT_MAX_AGE_SECONDS: toNumber(
    process.env.WOMPI_EVENT_MAX_AGE_SECONDS,
    86400,
  ),

  // ---------------------------------------------------------------------
  // Endurecimiento HTTP (Fase E)
  // ---------------------------------------------------------------------

  // Sin esto, detras del proxy de Vercel todos los requests llegan con la IP
  // del proxy y el rate limit acabaria bloqueando a todo el mundo a la vez.
  TRUST_PROXY: (() => {
    const raw = String(process.env.TRUST_PROXY ?? "").trim();
    if (raw === "") return isProduction ? 1 : false;
    if (raw === "false" || raw === "0") return false;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  })(),

  // Permite apagar los limites en pruebas de carga.
  RATE_LIMIT_ENABLED: toBool(process.env.RATE_LIMIT_ENABLED, true),

  // Nivel minimo de log: debug | info | warn | error.
  // En produccion el default es "info".
  LOG_LEVEL: (() => {
    const raw = String(process.env.LOG_LEVEL || "").trim().toLowerCase();
    return ["debug", "info", "warn", "error"].includes(raw)
      ? raw
      : isProduction
        ? "info"
        : "debug";
  })(),

  // ---------------------------------------------------------------------
  // Proveedores de dropshipping (Vendelo / Dropi)
  //
  // Upbuy es la fuente de verdad de los estados. Ningun usuario ni admin ve
  // los estados crudos de estos proveedores: se mapean a los canonicos
  // (ver Services/statusMachine.js -> mapProviderToCanonical).
  //
  // VENDELO_API_URL y VENDELO_TOKEN vacios = el proveedor no esta conectado:
  // las rutas que lo necesitan responden 503 y el flujo manual sigue igual.
  // ---------------------------------------------------------------------
  VENDELO_API_URL: (process.env.VENDELO_API_URL || "").trim(),
  VENDELO_TOKEN: (process.env.VENDELO_TOKEN || "").trim(),
  // Llave de pago de Vendelo (para el checkout hosted del proveedor).
  VENDELO_PAYMENT_KEY: (process.env.VENDELO_PAYMENT_KEY || "").trim(),

  // Secreto para verificar la firma del webhook de pagos de Vendelo.
  // Vacio = el endpoint /api/webhooks/vendelo responde 503.
  VENDELO_WEBHOOK_SECRET: (process.env.VENDELO_WEBHOOK_SECRET || "").trim(),

  // Dropi no tiene API publica confirmada. Con DROPI_API_URL y DROPI_TOKEN
  // vacios el adaptador funciona en modo MANUAL: el pedido se registra y se
  // exporta a CSV/panel de Dropi. Si el proveedor habilita la API, se
  // configuran estas dos variables y el mismo adaptador la usa.
  DROPI_API_URL: (process.env.DROPI_API_URL || "").trim(),
  DROPI_TOKEN: (process.env.DROPI_TOKEN || "").trim(),
  // Proveedor por defecto cuando el pedido no dice de donde viene.
  DROPI_DEFAULT_PROVIDER: (() => {
    const raw = String(process.env.DROPI_DEFAULT_PROVIDER || "").trim().toLowerCase();
    return ["vendelo", "dropi"].includes(raw) ? raw : "vendelo";
  })(),

  // Markup por defecto (porcentaje) cuando el producto no trae uno propio.
  DEFAULT_MARKUP_PERCENT: toNumber(process.env.DEFAULT_MARKUP_PERCENT, 30),

  // ---------------------------------------------------------------------
  // Cron (sincronizacion con proveedores)
  //
  // El cron corre en Vercel: no hay workers permanentes, ni Redis, ni
  // colas. Todo el trabajo asincrono se registra en sync_logs y se reintenta
  // en la siguiente corrida.
  //
  // CRON_SECRET vacio = el endpoint de cron responde 401 siempre. Nunca
  // hay un valor por defecto: un secreto de ejemplo seria un fallo de
  // seguridad silencioso.
  // ---------------------------------------------------------------------
  CRON_SECRET: (process.env.CRON_SECRET || "").trim(),

  // Schedule del cron. OJO: vercel.json NO lee variables de entorno, asi
  // que el schedule real vive en vercel.json. Este valor es la referencia
  // de lo que se deployo, y sirve para detectarlos.
  //
  // Plan Hobby de Vercel: los cron corren 1 vez al dia. El schedule por
  // defecto es diario a las 12:00 UTC (07:00 Colombia).
  // Plan Pro: cambiar a "*/15 * * * *" en vercel.json.
  CRON_SCHEDULE: (process.env.CRON_SCHEDULE || "0 12 * * *").trim(),
};
