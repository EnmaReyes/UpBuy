// Adaptador de WhatsApp Cloud API (ADM-8).
//
// REGLAS:
// - La difusion SOLO usa plantillas aprobadas por Meta (Cloud API). Nunca se
//   automatiza WhatsApp Web ni se usan librerias no oficiales (whatsapp-web.js,
//   Baileys): riesgo de bloqueo del numero y de incumplimiento de terminos.
// - `sendText` es operacional: solo dentro de la ventana de 24 horas abierta
//   por un mensaje del cliente. NUNCA para difusion.
// - Sin credenciales el servicio queda `isConfigured() = false` y el panel
//   ofrece modo manual (enlaces wa.me uno a uno). No se simulan envios.
//
// Telefono en formato E.164: para Colombia `+57` seguido del numero celular
// (10 digitos que empiezan por 3). Se acepta entrada con +57, 57 o el numero
// desnudo; cualquier otra cosa devuelve null (destinatario invalido).

const logger = require("../../Utils/logger");
const config = require("../../config");

const GRAPH_BASE = "https://graph.facebook.com";

// ---------------------------------------------------------------------------
// Normalizacion de telefonos
// ---------------------------------------------------------------------------

// Solo digitos.
const digitsOnly = (raw) => String(raw || "").replace(/\D+/g, "");

// Normaliza un telefono a E.164 Colombia (+57XXXXXXXXXX) o devuelve null.
// Reglas:
//  - "+573001234567" / "573001234567" -> tal cual (57 + 10 digitos en 3).
//  - "3001234567" (10 digitos que empiezan por 3) -> se antepone +57.
//  - Resto: null (muy corto, fijo, otro pais sin +, etc.).
const normalizePhone = (raw) => {
  const rawTrim = String(raw || "").trim();
  if (!rawTrim) return null;

  const hasPlus = rawTrim.startsWith("+");
  const digits = digitsOnly(rawTrim);
  if (!digits) return null;

  let e164;
  if (hasPlus) {
    // Con "+": debe ser un numero internacional valido (7 a 15 digitos).
    if (digits.length < 7 || digits.length > 15) return null;
    e164 = `+${digits}`;
  } else if (digits.length === 10 && digits.startsWith("3")) {
    // Celular colombiano desnudo.
    e164 = `+57${digits}`;
  } else if (
    digits.length === 12 &&
    digits.startsWith("57") &&
    digits.slice(2, 3) === "3"
  ) {
    // "57" + celular colombiano, sin "+".
    e164 = `+57${digits.slice(2)}`;
  } else {
    return null;
  }

  // Colombia: +57 + 10 digitos que empiezan por 3.
  if (e164.startsWith("+57")) {
    const local = e164.slice(3);
    if (local.length !== 10 || !local.startsWith("3")) return null;
  }

  return e164;
};

const isConfigured = () => config.isWhatsappConfigured();

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

// POST /{version}/{phone_number_id}/messages con la Graph API.
// Devuelve { ok, messageId } o { ok: false, error } con el mensaje de Meta.
const postMessage = async (body) => {
  const url = `${GRAPH_BASE}/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    return {
      ok: false,
      error: `Fallo de red contra la Graph API: ${networkError.message}`,
    };
  }

  const payloadText = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    // Respuesta no JSON: se trata como error generico.
  }

  if (!response.ok) {
    const metaError =
      payload?.error?.message ||
      payloadText.slice(0, 300) ||
      `HTTP ${response.status}`;
    return { ok: false, error: metaError };
  }

  const messageId = payload?.messages?.[0]?.id;
  if (!messageId) {
    return { ok: false, error: "Meta no devolvio id de mensaje" };
  }
  return { ok: true, messageId };
};

// Envio con plantilla aprobada. `variables` son los valores de los parámetros
// de cuerpo {{1}}, {{2}}, ... en orden.
const sendTemplate = async ({ to, template, language, variables }) => {
  if (!isConfigured()) {
    return { ok: false, error: "WhatsApp no configurado" };
  }
  const toE164 = normalizePhone(to);
  if (!toE164) {
    return { ok: false, error: "Telefono invalido" };
  }
  if (!template) {
    return { ok: false, error: "Falta el nombre de la plantilla" };
  }

  const body = {
    messaging_product: "whatsapp",
    to: toE164,
    type: "template",
    template: {
      name: template,
      language: { code: language || config.WHATSAPP_TEMPLATE_LANG || "es" },
      components: [
        {
          type: "body",
          parameters: (variables || []).map((text) => ({
            type: "text",
            text: String(text ?? ""),
          })),
        },
      ],
    },
  };

  const result = await postMessage(body);
  if (result.ok) {
    logger.info(`WhatsApp plantilla ${template} enviada a ${toE164}`);
  } else {
    logger.warn(`WhatsApp fallo para ${toE164}: ${result.error}`);
  }
  return result;
};

// Envio de texto libre: SOLO ventana de 24h abierta por el cliente (mensajes
// operacionales de pedido). NUNCA para difusion.
const sendText = async ({ to, text }) => {
  if (!isConfigured()) {
    return { ok: false, error: "WhatsApp no configurado" };
  }
  const toE164 = normalizePhone(to);
  if (!toE164) {
    return { ok: false, error: "Telefono invalido" };
  }

  const result = await postMessage({
    messaging_product: "whatsapp",
    to: toE164,
    type: "text",
    text: { preview_url: false, body: String(text || "") },
  });
  if (result.ok) {
    logger.info(`WhatsApp texto enviado a ${toE164} (ventana 24h)`);
  } else {
    logger.warn(`WhatsApp texto fallo para ${toE164}: ${result.error}`);
  }
  return result;
};

// Enlace wa.me para el modo manual (uno a uno, desde el telefono del admin).
const waMeLink = (phone, message) => {
  const e164 = normalizePhone(phone);
  if (!e164) return null;
  const number = e164.slice(1); // wa.me usa el numero sin "+"
  const query = message
    ? `?text=${encodeURIComponent(message)}`
    : "";
  return `https://wa.me/${number}${query}`;
};

module.exports = {
  normalizePhone,
  isConfigured,
  sendTemplate,
  sendText,
  waMeLink,
};
