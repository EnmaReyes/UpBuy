const HttpError = require("./HttpError.js");
const { createLogger } = require("./logger.js");

const log = createLogger("http");

// Traduce un error a una respuesta segura. Devuelve null cuando es un error
// inesperado: esos nunca exponen mensaje, stack ni detalles de Sequelize.
const describeError = (error) => {
  if (error instanceof HttpError) {
    return { status: error.status, body: error.message };
  }

  if (error?.name === "SequelizeValidationError") {
    return { status: 400, body: error.errors?.[0]?.message || "Datos invalidos" };
  }

  if (error?.name === "SequelizeUniqueConstraintError") {
    return { status: 409, body: "El registro ya existe" };
  }

  if (error?.name === "SequelizeForeignKeyConstraintError") {
    return { status: 409, body: "El registro está en uso" };
  }

  if (error?.name === "SequelizeConnectionError" || error?.name === "SequelizeConnectionRefusedError") {
    return { status: 503, body: "Base de datos temporalmente no disponible" };
  }

  if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
    return { status: 403, body: "Token no válido" };
  }

  return null;
};

// Responde errores respetando la convencion actual de la API:
// strings planos para mensajes de negocio y 500 generico para lo inesperado.
const sendError = (res, error, fallback = "Error interno del servidor") => {
  const known = describeError(error);
  if (known) {
    return res.status(known.status).json(known.body);
  }

  log.error("Error no controlado", {
    name: error?.name,
    error: error?.message,
    stack: error?.stack,
  });
  return res.status(500).json(fallback);
};

module.exports = { describeError, sendError };
