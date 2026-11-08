// Error con codigo HTTP para respuestas controladas desde servicios.
// El mensaje se devuelve como string plano, igual que el resto de la API.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

module.exports = HttpError;
