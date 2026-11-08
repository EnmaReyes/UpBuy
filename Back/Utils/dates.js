// Helpers de fecha/hora.
//
// El negocio esta en Colombia (UTC-5) pero el servidor corre en UTC. Todo lo
// que el panel pide por dia se interpreta como un dia completo en hora de
// Bogota, no en la zona del servidor.

const BOGOTA_OFFSET = "-05:00";
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Convierte "YYYY-MM-DD" en el instante UTC que corresponde al inicio (o al
// final) de ese dia en Bogota. Lanza HttpError 400 si el formato es invalido.
const parseBogotaDay = (value, field, endOfDay = false) => {
  const HttpError = require("./HttpError.js");
  const raw = String(value || "").trim();
  if (!DATE_ONLY.test(raw)) {
    throw new HttpError(400, `Fecha inválida en "${field}" (YYYY-MM-DD)`);
  }
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const date = new Date(`${raw}T${time}${BOGOTA_OFFSET}`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `Fecha inválida en "${field}"`);
  }
  return date;
};

// Inicio del dia actual en Colombia, expresado en UTC.
const startOfTodayBogota = () => {
  const now = new Date(Date.now() - BOGOTA_OFFSET_MS);
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5),
  );
};

module.exports = {
  BOGOTA_OFFSET,
  BOGOTA_OFFSET_MS,
  parseBogotaDay,
  startOfTodayBogota,
};
