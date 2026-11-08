const { describeError } = require("../Utils/respond.js");

// ---------------------------------------------------------------------------
// Red de seguridad de la API (Fase E).
//
// Cualquier error que llegue aqui (incluidos los que no pasa nadie por
// sendError) se responde con un mensaje corto y sin datos internos: nada de
// stack, SQL, nombres de tablas ni rutas del servidor.
// ---------------------------------------------------------------------------

// Ruta inexistente. Se monta al final, despues de todas las rutas reales.
const notFound = (req, res) =>
  res.status(404).json("Recurso no encontrado");

// Errores de express.json(): cuerpo mal formado o demasiado grande.
const TRANSPORT_ERRORS = {
  "entity.parse.failed": { status: 400, body: "JSON inválido en la petición" },
  "entity.too.large": { status: 413, body: "La petición es demasiado grande" },
  "encoding.unsupported": { status: 415, body: "Codificación no soportada" },
};

const errorHandler = (err, req, res, next) => {
  // Si la respuesta ya empezo a salir, solo se puede delegar.
  if (res.headersSent) return next(err);

  const transport = TRANSPORT_ERRORS[err?.type];
  if (transport) {
    return res.status(transport.status).json(transport.body);
  }

  const known = describeError(err);

  if (!known) {
    // Log del servidor con contexto util; el cliente nunca ve esto.
    console.error(
      `❌ [${req.method} ${req.originalUrl}] ${err?.name || "Error"}: ${
        err?.message || "sin mensaje"
      }`,
    );
    return res.status(500).json("Error interno del servidor");
  }

  return res.status(known.status).json(known.body);
};

module.exports = { notFound, errorHandler };
