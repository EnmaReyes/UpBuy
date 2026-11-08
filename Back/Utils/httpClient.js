// Cliente HTTP con reintentos y backoff exponencial.
//
// El repo hacia `fetch` a mano (Services/wompi.js). Para las llamadas a
// proveedores (Vendelo, Dropi) hace falta algo comun: timeout siempre,
// reintentos solo cuando tiene sentido (un 429 o un 503 del proveedor son
// transitorios; un 400 es un bug nuestro y reintentarlo solo gasta tiempo),
// y un backoff que no golpee al proveedor cada 100 ms.
//
// Regla importante: por defecto SOLO se reintentan metodos idempotentes
// (GET, HEAD). Un POST se reintenta solo si el cuerpo es seguro de repetir
// (la peticion es idempotente por clave) y quien llama lo pide explicito.

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_MAX_DELAY_MS = 8000;

// Metodos que se pueden repetir sin efectos secundarios.
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Backoff exponencial con jitter: evita que todos los reintentos de una
// oleada peguen al proveedor en el mismo milisegundo.
const backoffDelay = (attempt, { baseDelayMs, maxDelayMs }) => {
  const exponential = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  const jitter = Math.floor(Math.random() * Math.max(baseDelayMs, 50));
  return Math.min(exponential + jitter, maxDelayMs);
};

// Una respuesta 429 o 5xx se puede reintentar; el resto no.
const isRetryableStatus = (status) => status === 429 || status >= 500;

class HttpError extends Error {
  constructor(message, { status = 0, code = "HTTP_ERROR", body = null, url } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.body = body;
    this.url = url;
  }
}

// Una sola peticion, sin reintentos.
const fetchOnce = async (url, options = {}) => {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: signalExterno,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Si el llamador pasa su propia signal, se respeta (cancelacion externa).
  const onAbortExterno = () => controller.abort();
  if (signalExterno) {
    if (signalExterno.aborted) controller.abort();
    else signalExterno.addEventListener("abort", onAbortExterno, { once: true });
  }

  try {
    const respuesta = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const texto = await respuesta.text();
    let datos = null;
    if (texto) {
      try {
        datos = JSON.parse(texto);
      } catch {
        // No es JSON: se conserva el texto plano para diagnostics.
        datos = texto;
      }
    }

    return {
      status: respuesta.status,
      ok: respuesta.ok,
      headers: Object.fromEntries(respuesta.headers.entries()),
      data: datos,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new HttpError(`Timeout de ${timeoutMs} ms en ${method} ${url}`, {
        code: "ETIMEDOUT",
        url,
      });
    }
    throw new HttpError(
      `Fallo de red en ${method} ${url}: ${error.message}`,
      { code: "ENETWORK", url },
    );
  } finally {
    clearTimeout(timeout);
    if (signalExterno) {
      signalExterno.removeEventListener("abort", onAbortExterno);
    }
  }
};

// Peticion con reintentos.
//
// Devuelve { status, ok, headers, data }. No lanza por un status 4xx/5xx:
// el llamador decide que hacer con el cuerpo de la respuesta (muchas APIs
// de pago devuelven 200 con un estado de error adentro). Solo lanza cuando
// la peticion fallo de red o se agotaron los reintentos.
const request = async (url, options = {}) => {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    retryOnStatus = isRetryableStatus,
    allowRetryOnNonIdempotent = false,
    signal,
    onRetry,
  } = options;

  const metodo = String(method).toUpperCase();
  const maxIntentos = retries + 1;
  const puedeReintentar =
    allowRetryOnNonIdempotent || IDEMPOTENT_METHODS.has(metodo);

  let ultimoError = null;

  for (let intento = 0; intento < maxIntentos; intento += 1) {
    try {
      const respuesta = await fetchOnce(url, {
        method: metodo,
        headers,
        body,
        timeoutMs,
        signal,
      });

      if (respuesta.ok || !retryOnStatus(respuesta.status) || !puedeReintentar) {
        return respuesta;
      }

      ultimoError = new HttpError(
        `HTTP ${respuesta.status} en ${metodo} ${url}`,
        { status: respuesta.status, code: "HTTP_STATUS", body: respuesta.data, url },
      );

      if (intento === maxIntentos - 1) return respuesta;
    } catch (error) {
      ultimoError = error;

      // Un timeout probablemente no se arregla reintentando en caliente.
      if (error.code === "ETIMEDOUT") throw error;
      if (intento === maxIntentos - 1) throw error;
      if (!puedeReintentar) throw error;
    }

    const espera = backoffDelay(intento, { baseDelayMs, maxDelayMs });
    if (typeof onRetry === "function") {
      onRetry({ intento: intento + 1, espera, error: ultimoError });
    }
    await sleep(espera);
  }

  throw ultimoError || new HttpError(`Fallo en ${metodo} ${url}`, { url });
};

// Atajo: GET que devuelve el cuerpo parseado y lanza si el status no es 2xx.
const getJson = async (url, options = {}) => {
  const respuesta = await request(url, { ...options, method: "GET" });
  if (!respuesta.ok) {
    throw new HttpError(`HTTP ${respuesta.status} en GET ${url}`, {
      status: respuesta.status,
      code: "HTTP_STATUS",
      body: respuesta.data,
      url,
    });
  }
  return respuesta.data;
};

// Atajo: POST con cuerpo JSON.
const postJson = async (url, payload, options = {}) => {
  const respuesta = await request(url, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: JSON.stringify(payload),
  });
  if (!respuesta.ok) {
    throw new HttpError(`HTTP ${respuesta.status} en POST ${url}`, {
      status: respuesta.status,
      code: "HTTP_STATUS",
      body: respuesta.data,
      url,
    });
  }
  return respuesta.data;
};

module.exports = {
  request,
  getJson,
  postJson,
  fetchOnce,
  backoffDelay,
  isRetryableStatus,
  HttpError,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RETRIES,
  IDEMPOTENT_METHODS,
};
