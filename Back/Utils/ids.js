const { validate: isUuid } = require("uuid");
const HttpError = require("./HttpError.js");

// Los ids de la base son UUID. Si llega cualquier otra cosa (un "abc", un
// numero, undefined), Postgres responde con un error de sintaxis y el cliente
// recibe un 500. Validar antes convierte eso en un 400 entendible.
const assertUuid = (value, label = "identificador") => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!isUuid(raw)) {
    throw new HttpError(400, `El ${label} no es válido`);
  }
  return raw;
};

module.exports = { assertUuid, isUuid };
