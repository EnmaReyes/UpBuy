// Plantillas y escapado del cuerpo de campana (ADM-7).
//
// Logica pura, sin DB ni HTTP. Las variables `{{nombre}}`, `{{ultimoPedido}}`
// y `{{ciudad}}` se resuelven en el servidor y SIEMPRE se escapan: el texto
// que un admin escribe nunca puede ejecutar HTML en el correo del cliente.
// El cuerpo se envia como texto plano + HTML simple (parrafos), nunca HTML
// libre del admin.

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Variables soportadas. Cualquier otra marca se deja tal cual (sin resolver).
const VARIABLES = Object.freeze(["nombre", "ultimoPedido", "ciudad"]);

// Sustituye las marcas por los valores del destinatario, escapando TODO.
// Los valores llegan crudos del modelo; aqui se escapan para texto y para
// HTML por separado.
const renderTemplate = (template, values = {}) => {
  const text = String(template ?? "").replace(
    /\{\{\s*([a-zA-Z]+)\s*\}\}/g,
    (match, key) =>
      Object.prototype.hasOwnProperty.call(values, key)
        ? String(values[key] ?? "")
        : match,
  );

  return {
    text,
    html: escapeHtml(text).replace(/\n/g, "<br />"),
  };
};

// Documento HTML simple para multipart/alternative: el cuerpo escapado dentro
// de una plantilla minima de UPBUY.
const buildHtmlDocument = ({ textHtml, unsubscribeUrl }) => {
  const legal = unsubscribeUrl
    ? `<p style="font-size:12px;color:#8B6F56;margin-top:24px">Recibes este correo porque aceptaste recibir novedades de UPBUY. Puedes darte de baja aquí: <a href="${escapeHtml(
        unsubscribeUrl,
      )}" style="color:#D35400">dejar de recibir promociones</a>.</p>`
    : "";

  return [
    '<div style="background:#F5E9D7;padding:24px;font-family:Arial,Helvetica,sans-serif">',
    '<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:12px;padding:24px">',
    '<p style="font-family:Arial,Helvetica,sans-serif;font-weight:bold;letter-spacing:2px;color:#0B0B0B;margin:0 0 16px">UPBUY</p>',
    `<div style="color:#0B0B0B;font-size:15px;line-height:1.6">${textHtml}</div>`,
    legal,
    "</div>",
    "</div>",
  ].join("");
};

module.exports = { escapeHtml, renderTemplate, buildHtmlDocument, VARIABLES };
