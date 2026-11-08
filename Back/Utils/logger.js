// Logger estructurado de la API.
//
// Antes de este archivo el repo usaba console.log/console.error a mano.
// Aqui se centraliza para poder filtrar por scope en Vercel (los logs de
// funciones serverless son lineas sueltas: un JSON por linea se puede
// filtrar y buscar mucho mejor).
//
// Reglas:
//   1. Nunca se registran secretos (tokens, llaves, contraseñas). redact() se
//      encarga y se aplica a los metadatos que llegan de fuera.
//   2. En produccion la salida es JSON (una linea por evento). En local es
//      texto legible.
//   3. El nivel por defecto se puede mover con LOG_LEVEL.

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const isProduction = process.env.NODE_ENV === "production";

const levelName = (() => {
  const raw = String(process.env.LOG_LEVEL || "").trim().toLowerCase();
  return raw && LEVELS[raw] ? raw : isProduction ? "info" : "debug";
})();

const minLevel = LEVELS[levelName];

// Claves cuyo valor nunca debe salir en un log.
const SECRET_KEYS = new Set([
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "authorization",
  "apikey",
  "api_key",
  "secret",
  "password",
  "contrasena",
  "contraseña",
  "privatekey",
  "private_key",
  "integritysecret",
  "integrity_secret",
  "eventssecret",
  "events_secret",
  "publickey",
  "public_key",
  "cookie",
  "setcookie",
  "set_cookie",
]);

// Recorta un valor que podria ser un secreto: deja solo lo necesario para
// diagnostico (los ultimos 4 caracteres).
const maskSecret = (value) => {
  const text = String(value);
  if (!text) return "";
  if (text.length <= 8) return "***";
  return `***${text.slice(-4)}`;
};

// Limpia un objeto de claves sensibles, recursivamente. Limita a 3 niveles
// para no recorrer un payload entero.
const redact = (value, depth = 0) => {
  if (depth > 3) return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  if (typeof value !== "object") return value;

  const salida = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEYS.has(key.toLowerCase())) {
      salida[key] = maskSecret(item);
      continue;
    }
    salida[key] = redact(item, depth + 1);
  }
  return salida;
};

const emit = (nivel, scope, mensaje, datos) => {
  if (LEVELS[nivel] < minLevel) return;

  const payload = {
    at: new Date().toISOString(),
    nivel,
    scope,
    mensaje,
    ...(datos && typeof datos === "object" ? redact(datos) : {}),
  };

  if (isProduction) {
    const linea = JSON.stringify(payload);
    if (nivel === "error") console.error(linea);
    else if (nivel === "warn") console.warn(linea);
    else console.log(linea);
    return;
  }

  const extra =
    payload.datos !== undefined ? ` ${JSON.stringify(payload.datos)}` : "";
  const linea = `[${payload.at}] ${nivel.toUpperCase().padEnd(5)} [${scope}] ${mensaje}${extra}`;

  if (nivel === "error") console.error(linea);
  else if (nivel === "warn") console.warn(linea);
  else console.log(linea);
};

// Crea un logger con un scope fijo: logger("wompi.webhook").info("...", {...})
const createLogger = (scope) => ({
  scope,
  debug: (mensaje, datos) => emit("debug", scope, mensaje, datos),
  info: (mensaje, datos) => emit("info", scope, mensaje, datos),
  warn: (mensaje, datos) => emit("warn", scope, mensaje, datos),
  error: (mensaje, datos) => emit("error", scope, mensaje, datos),
});

// Logger global (scope "app") para los casos sueltos.
const logger = createLogger("app");

module.exports = { createLogger, logger, redact, maskSecret, LEVELS, levelName };
