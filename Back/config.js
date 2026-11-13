// config.js
// UPBUY_SKIP_DOTENV=1 lo usan las pruebas que necesitan controlar el entorno
// (por ejemplo, las de OAuth con fetch mockeado): evita que .env.local
// sobrescriba los valores del test con credenciales reales.
if (
  process.env.NODE_ENV !== "production" &&
  process.env.UPBUY_SKIP_DOTENV !== "1"
) {
  try {
    const dotenv = require("dotenv");
    dotenv.config(); // .env (plantilla versionada, sin secretos)
    // .env.local (NO versionado) tiene prioridad: aqui van los valores reales
    dotenv.config({ path: ".env.local", override: true });
  } catch (err) {
    console.warn("dotenv no disponible:", err.message);
  }
}

const isProduction = process.env.NODE_ENV === "production";

// Un origen se compara por esquema + host (sin barra final ni path). Asi
// `https://upbuy.com/` y `https://upbuy.com` son el mismo origen.
const normalizeOrigin = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
};

const parseOrigins = (value) =>
  String(value || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

// FRONTEND_URLS es la lista canonica (separada por comas). FRONTEND_URL sigue
// funcionando por compatibilidad y se agrega a la lista.
const FRONTEND_URLS = [
  ...new Set([
    ...parseOrigins(process.env.FRONTEND_URLS),
    ...parseOrigins(process.env.FRONTEND_URL),
  ]),
];

if (isProduction && FRONTEND_URLS.length === 0) {
  throw new Error(
    "FRONTEND_URL (o FRONTEND_URLS) es obligatorio en producción. Configúralo en Vercel (Environment Variables).",
  );
}

if (!isProduction && FRONTEND_URLS.length === 0) {
  FRONTEND_URLS.push("http://localhost:3001");
}

const FRONTEND_URL = FRONTEND_URLS[0];

// ---------------------------------------------------------------------------
// JWT
//
// - En produccion el secreto es obligatorio y debe tener >= 32 caracteres.
// - Fuera de produccion, si no hay secreto se genera uno efimero (nunca un
//   valor conocido tipo "jwtkey"). Eso invalida sesiones al reiniciar, que es
//   el comportamiento correcto para un secreto no configurado.
// - El algoritmo, emisor y audiencia se fijan en un solo sitio para que la
//   firma y la verificacion no puedan divergir.
// ---------------------------------------------------------------------------
const isTest =
  process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
const rawJwtSecret = String(process.env.JWT_SECRET || "").trim();

if (isProduction && rawJwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET es obligatorio en producción y debe tener al menos 32 caracteres. Configúralo en Vercel (Environment Variables).",
  );
}

if (!isProduction && !isTest && rawJwtSecret && rawJwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET debe tener al menos 32 caracteres. Configúralo en Back/.env.local.",
  );
}

let JWT_SECRET = rawJwtSecret;

if (!JWT_SECRET) {
  if (isTest) {
    // Valor fijo solo para pruebas: no se usa en ningun despliegue.
    JWT_SECRET = "upbuy-test-jwt-secret-not-for-production";
  } else {
    JWT_SECRET = require("crypto").randomBytes(48).toString("hex");
    console.warn(
      "⚠️  JWT_SECRET no configurado: se generó uno efímero para este proceso. " +
        "Configúralo en Back/.env.local para conservar las sesiones al reiniciar.",
    );
  }
}

const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = "upbuy-api";
const JWT_AUDIENCE = "upbuy-web";

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

// ---------------------------------------------------------------------------
// Sesiones administrativas (ADM-S1)
//
// - IDLE: minutos de inactividad permitidos.
// - MAX: limite absoluto desde el login, aunque haya actividad.
// Los valores se acotan para que una variable mal escrita no cree sesiones
// eternas ni de un minuto.
// ---------------------------------------------------------------------------
const ADMIN_SESSION_IDLE_MINUTES = Math.min(
  Math.max(toNumber(process.env.ADMIN_SESSION_IDLE_MINUTES, 120), 5),
  24 * 60,
);
const ADMIN_SESSION_MAX_HOURS = Math.min(
  Math.max(toNumber(process.env.ADMIN_SESSION_MAX_HOURS, 8), 1),
  24 * 7,
);

// ---------------------------------------------------------------------------
// MFA de administradores (ADM-S2)
//
// TOTP obligatorio para roles administrativos. La clave de cifrado del
// secreto TOTP es AES-256-GCM (base64 de 32 bytes). En produccion, con MFA
// obligatorio, el arranque falla si falta o es invalida: guardar el secreto en
// claro o con una clave efimera seria peor que no arrancar.
// ---------------------------------------------------------------------------
const ADMIN_MFA_REQUIRED = toBool(process.env.ADMIN_MFA_REQUIRED, isProduction);

const parseMfaKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const buffer = Buffer.from(raw, "base64");
    return buffer.length === 32 ? buffer.toString("base64") : null;
  } catch {
    return null;
  }
};

const rawMfaKey = String(process.env.ADMIN_MFA_ENCRYPTION_KEY || "").trim();
let ADMIN_MFA_ENCRYPTION_KEY = parseMfaKey(rawMfaKey);

if (rawMfaKey && !ADMIN_MFA_ENCRYPTION_KEY) {
  throw new Error(
    "ADMIN_MFA_ENCRYPTION_KEY debe ser base64 de exactamente 32 bytes.",
  );
}

if (!ADMIN_MFA_ENCRYPTION_KEY) {
  if (isTest) {
    // Valor fijo solo para pruebas.
    ADMIN_MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  } else if (isProduction && ADMIN_MFA_REQUIRED) {
    throw new Error(
      "ADMIN_MFA_ENCRYPTION_KEY es obligatorio en producción con ADMIN_MFA_REQUIRED=true. " +
        "Genera una con: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  } else {
    ADMIN_MFA_ENCRYPTION_KEY = require("crypto")
      .randomBytes(32)
      .toString("base64");
    console.warn(
      "⚠️  ADMIN_MFA_ENCRYPTION_KEY no configurado: se generó una clave efímera. " +
        "Los secretos MFA no sobrevivirán al reinicio. Configúrala en Back/.env.local.",
    );
  }
}

const ADMIN_MFA_ENCRYPTION_KEY_PREVIOUS = parseMfaKey(
  process.env.ADMIN_MFA_ENCRYPTION_KEY_PREVIOUS,
);

const ADMIN_MFA_CHALLENGE_MINUTES = Math.min(
  Math.max(toNumber(process.env.ADMIN_MFA_CHALLENGE_MINUTES, 10), 1),
  60,
);

const ADMIN_MFA_MAX_ATTEMPTS = Math.min(
  Math.max(toNumber(process.env.ADMIN_MFA_MAX_ATTEMPTS, 5), 1),
  10,
);

const ADMIN_MFA_ISSUER =
  String(process.env.ADMIN_MFA_ISSUER || "UPBUY").trim() || "UPBUY";

// ---------------------------------------------------------------------------
// Step-up para acciones destructivas (ADM-S3)
//
// Una sesion administrativa vale para leer, pero reembolsar, cancelar,
// despublicar o cambiar roles exige un segundo factor reciente. La ventana se
// mide desde `admin_sessions.mfaAt` y se refresca con
// POST /api/auth/admin/step-up.
// ---------------------------------------------------------------------------
const ADMIN_STEP_UP_MINUTES = Math.min(
  Math.max(toNumber(process.env.ADMIN_STEP_UP_MINUTES, 10), 1),
  60,
);

// ---------------------------------------------------------------------------
// Endurecimiento de sesion (ADM-S4)
//
// En produccion la cookie usa el prefijo `__Host-`: exige Secure, Path=/ y
// ningun Domain, asi que un subdominio comprometido no puede fijarla. Fuera de
// produccion se mantiene `access_token` para no romper el flujo local.
//
// `ADMIN_IP_ALLOWLIST` es una lista separada por comas de IPs o rangos CIDR
// (p. ej. "190.1.2.3,10.0.0.0/8"). Vacia = sin restriccion.
// ---------------------------------------------------------------------------
const DEFAULT_SESSION_COOKIE_NAME = isProduction
  ? "__Host-upbuy_session"
  : "access_token";
const SESSION_COOKIE_NAME =
  String(process.env.SESSION_COOKIE_NAME || "").trim() ||
  DEFAULT_SESSION_COOKIE_NAME;

const SESSION_COOKIE_LEGACY_NAME = "access_token";

const parseAllowlist = (raw) =>
  String(raw || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const ADMIN_IP_ALLOWLIST = Object.freeze(
  parseAllowlist(process.env.ADMIN_IP_ALLOWLIST),
);

// Alertas de seguridad: N fallos dentro de la ventana avisan a los admins.
const SECURITY_ALERTS_ENABLED = toBool(
  process.env.SECURITY_ALERTS_ENABLED,
  true,
);
const ADMIN_ALERT_FAILED_ATTEMPTS = Math.min(
  Math.max(toNumber(process.env.ADMIN_ALERT_FAILED_ATTEMPTS, 5), 1),
  100,
);
const ADMIN_ALERT_WINDOW_MINUTES = Math.min(
  Math.max(toNumber(process.env.ADMIN_ALERT_WINDOW_MINUTES, 15), 1),
  24 * 60,
);

// Retencion de auth_events. `0` desactiva la limpieza automatica/manual.
const AUTH_EVENTS_RETENTION_DAYS = Math.min(
  Math.max(toNumber(process.env.AUTH_EVENTS_RETENTION_DAYS, 90), 0),
  3650,
);

const DATABASE_URL =
  process.env.DATABASE_URL ||
  (() => {
    const DB_HOST = process.env.DB_HOST || "localhost";
    const DB_USER = process.env.DB_USER || "postgres";
    const DB_PASSWORD = process.env.DB_PASSWORD || "password";
    const DB_NAME = process.env.DB_NAME || "upBuy";
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
  const raw = String(url || "")
    .trim()
    .toLowerCase();
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

  const raw = String(explicit || "")
    .trim()
    .toLowerCase();
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
  FRONTEND_URLS,
  DATABASE_URL,
  DB_DIALECT,
  // Secreto JWT: en produccion DEBE venir de process.env.JWT_SECRET.
  JWT_SECRET,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_AUDIENCE,

  // Sesiones administrativas revocables (ADM-S1).
  ADMIN_SESSION_IDLE_MINUTES,
  ADMIN_SESSION_MAX_HOURS,

  // MFA TOTP de administradores (ADM-S2).
  ADMIN_MFA_REQUIRED,
  ADMIN_MFA_ENCRYPTION_KEY,
  ADMIN_MFA_ENCRYPTION_KEY_PREVIOUS,
  ADMIN_MFA_CHALLENGE_MINUTES,
  ADMIN_MFA_MAX_ATTEMPTS,
  ADMIN_MFA_ISSUER,

  // Step-up para acciones destructivas (ADM-S3).
  ADMIN_STEP_UP_MINUTES,

  // Endurecimiento de sesion y alertas (ADM-S4).
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_LEGACY_NAME,
  ADMIN_IP_ALLOWLIST,
  SECURITY_ALERTS_ENABLED,
  ADMIN_ALERT_FAILED_ATTEMPTS,
  ADMIN_ALERT_WINDOW_MINUTES,
  AUTH_EVENTS_RETENTION_DAYS,

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID || "",
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET || "",
  GOOGLE_MAIL_FROM: process.env.GOOGLE_MAIL_FROM || "upbuy.official@gmail.com",

  // Ecommerce
  // Precios por defecto de las variantes DTF (pesos COP)
  DTF_PRICE_BASICO: toNumber(process.env.DTF_PRICE_BASICO, 22000),

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
  WOMPI_BASE_URL:
    (process.env.WOMPI_BASE_URL || "").trim() ||
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
    const raw = String(process.env.LOG_LEVEL || "")
      .trim()
      .toLowerCase();
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
  //
  // VENDELO_OAUTH_URL + VENDELO_CLIENT_ID + VENDELO_CLIENT_SECRET +
  // VENDELO_REFRESH_TOKEN se usan solo para obtener/renovar el token
  // (ver test-venndelo.js). Una vez tienes el token, guardalo en
  // VENDELO_TOKEN y el adaptador lo usa como Bearer.
  // ---------------------------------------------------------------------
  VENDELO_API_URL: (process.env.VENDELO_API_URL || "").trim(),
  // Token de acceso (Bearer) para llamar a la API de Vendelo.
  VENDELO_TOKEN: (process.env.VENDELO_TOKEN || "").trim(),
  // Llave de pago de Vendelo (para el checkout hosted del proveedor).
  VENDELO_PAYMENT_KEY: (process.env.VENDELO_PAYMENT_KEY || "").trim(),

  // Secreto para verificar la firma del webhook de pagos de Vendelo.
  // Vacio = el endpoint /api/webhooks/vendelo responde 503.
  VENDELO_WEBHOOK_SECRET: (process.env.VENDELO_WEBHOOK_SECRET || "").trim(),

  // Flujo OAuth de Vendelo (solo para obtener/renovar el token de acceso).
  // Estos valores no se usan directamente en el adaptador de API.
  VENDELO_OAUTH_URL: (process.env.VENDELO_OAUTH_URL || "").trim(),
  VENDELO_CLIENT_ID: (process.env.VENDELO_CLIENT_ID || "").trim(),
  VENDELO_CLIENT_SECRET: (process.env.VENDELO_CLIENT_SECRET || "").trim(),
  VENDELO_REFRESH_TOKEN: (process.env.VENDELO_REFRESH_TOKEN || "").trim(),

  // ---------------------------------------------------------------------
  // Venndelo Pro API (catalogo de proveedores).
  //
  // OJO: NO confundir con las variables VENDELO_* de arriba, que son del
  // adaptador de PEDIDOS (especulativo y hoy sin configurar). Estas VENNDELO_*
  // (con doble N) son de la API administrativa real:
  //
  //   base:      https://api.venndelo.com/v1/admin
  //   auth:      POST /oauth/token  (refresh_token, form-urlencoded)
  //   catalogo:  GET  /products     (paginacion por cursor)
  //
  // Vacio = Venndelo no configurado: las rutas de catalogo responden 503 y el
  // resto de la tienda sigue funcionando.
  // ---------------------------------------------------------------------
  VENNDELO_API_URL: (process.env.VENNDELO_API_URL || "https://api.venndelo.com").trim(),
  // Ruta de la API administrativa, relativa a VENNDELO_API_URL.
  VENNDELO_ADMIN_PATH: (process.env.VENNDELO_ADMIN_PATH || "/v1/admin").trim(),
  VENNDELO_OAUTH_URL: (
    process.env.VENNDELO_OAUTH_URL ||
    `${(process.env.VENNDELO_API_URL || "https://api.venndelo.com").replace(/\/+$/, "")}${(
      process.env.VENNDELO_ADMIN_PATH || "/v1/admin"
    ).replace(/\/+$/, "")}/oauth/token`
  ).trim(),
  VENNDELO_CLIENT_ID: (process.env.VENNDELO_CLIENT_ID || "").trim(),
  VENNDELO_CLIENT_SECRET: (process.env.VENNDELO_CLIENT_SECRET || "").trim(),
  VENNDELO_REFRESH_TOKEN: (process.env.VENNDELO_REFRESH_TOKEN || "").trim(),
  // Timeout de las llamadas a la API administrativa. El listado de pedidos de
  // Venndelo puede tardar >12s incluso con page_size=1; 15s se queda corto.
  VENNDELO_HTTP_TIMEOUT_MS: Math.max(
    toNumber(process.env.VENNDELO_HTTP_TIMEOUT_MS, 30000),
    1000,
  ),

  // URLs de retorno del checkout de topup de wallet (opcionales: si estan
  // vacias no se mandan a Venndelo).
  VENNDELO_RETURN_URL: (process.env.VENNDELO_RETURN_URL || "").trim(),
  VENNDELO_CANCEL_URL: (process.env.VENNDELO_CANCEL_URL || "").trim(),
  // Secreto HMAC del webhook de eventos de pedidos/envios (chatbot). Vacio =
  // los eventos se aceptan sin verificar firma (con aviso en el log).
  VENNDELO_WEBHOOK_SECRET: (process.env.VENNDELO_WEBHOOK_SECRET || "").trim(),

  // Clave AES-256-GCM (base64, 32 bytes) para cifrar las credenciales que se
  // persisten en supplier_credentials. Sin ella, la rotacion del refresh token
  // NO se guarda en la base (solo funciona con VENNDELO_REFRESH_TOKEN del
  // entorno). _PREVIOUS permite rotar la clave sin perder acceso.
  SUPPLIER_CREDENTIALS_ENCRYPTION_KEY: (
    process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY || ""
  ).trim(),
  SUPPLIER_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS: (
    process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY_PREVIOUS || ""
  ).trim(),

  // ---------------------------------------------------------------------
  // Sincronizacion del catalogo
  // ---------------------------------------------------------------------
  CATALOG_SYNC_ENABLED: toBool(process.env.CATALOG_SYNC_ENABLED, true),
  // Tamano de pagina del proveedor (Venndelo admite hasta 500).
  CATALOG_SYNC_PAGE_SIZE: Math.min(
    Math.max(toNumber(process.env.CATALOG_SYNC_PAGE_SIZE, 500), 1),
    500,
  ),
  // ANY | OWN_STOCK | DROPSHIP. Por defecto DROPSHIP: solo productos de la
  // bodega virtual del proveedor.
  CATALOG_SYNC_SUPPLY_MODEL: (() => {
    const raw = String(process.env.CATALOG_SYNC_SUPPLY_MODEL || "DROPSHIP")
      .trim()
      .toUpperCase();
    return ["ANY", "OWN_STOCK", "DROPSHIP"].includes(raw) ? raw : "DROPSHIP";
  })(),
  // Referencia del schedule desplegado (el real vive en vercel.json).
  CATALOG_SYNC_SCHEDULE: (process.env.CATALOG_SYNC_SCHEDULE || "0 12 * * *").trim(),

  // Dropi no tiene API publica confirmada. Con DROPI_API_URL y DROPI_TOKEN
  // vacios el adaptador funciona en modo MANUAL: el pedido se registra y se
  // exporta a CSV/panel de Dropi. Si el proveedor habilita la API, se
  // configuran estas dos variables y el mismo adaptador la usa.
  DROPI_API_URL: (process.env.DROPI_API_URL || "").trim(),
  DROPI_TOKEN: (process.env.DROPI_TOKEN || "").trim(),
  // Proveedor por defecto cuando el pedido no dice de donde viene.
  DROPI_DEFAULT_PROVIDER: (() => {
    const raw = String(process.env.DROPI_DEFAULT_PROVIDER || "")
      .trim()
      .toLowerCase();
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
