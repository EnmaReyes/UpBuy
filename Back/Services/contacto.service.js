"use strict";

// Servicio de contacto publico: valida, sanitiza, envia correo y guarda el
// mensaje para el equipo de soporte de UPBUY.
//
// El correo se envia con la API de Gmail usando el refresh token de las
// variables de entorno (GOOGLE_MAIL_REFRESH_TOKEN), no de un usuario concreto.

const { ContactMessage } = require("../DataBase/models/ContactMessage.js");
const { sendEmail } = require("./gmail.js");
const {
  GOOGLE_MAIL_FROM,
} = require("../config.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("contacto");

// Campos obligatorios del formulario de contacto.
const CAMPOS_REQUERIDOS = ["name", "email", "subject", "message"];

const EMAIL_REGEX =
  /^(?=.{1,255}$)(?=.{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Elimina etiquetas HTML y caracteres de control para evitar inyeccion en el
// cuerpo del correo y en la base de datos.
const sanitizar = (valor) => {
  if (typeof valor !== "string") return valor;
  return valor
    .replace(/<[^>]*>/g, "")
    .replace(/[\r\n]+/g, " ")
    .trim();
};

// Valida el email con una expresion regular sencilla y segura.
const emailValido = (email) => EMAIL_REGEX.test(email);

// Construye el cuerpo de texto plano del correo que recibira el equipo de
// soporte de UPBUY.
const construirCuerpoTexto = ({ name, email, subject, message }) =>
  `Nuevo mensaje de contacto de UPBUY\n\n` +
  `Nombre: ${name}\n` +
  `Correo: ${email}\n` +
  `Asunto: ${subject}\n\n` +
  `Mensaje:\n${message}\n`;

// Construye el cuerpo HTML del correo para el equipo de soporte.
const construirCuerpoHtml = ({ name, email, subject, message }) => {
  const escaparHtml = (texto) =>
    String(texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nuevo mensaje de contacto - UPBUY</title>
</head>
<body style="font-family: Manrope, system-ui, -apple-system, sans-serif; line-height: 1.6; color: #0B0B0B; margin: 0; padding: 20px; background-color: #F5E9D7;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
    <tr>
      <td style="padding: 32px 32px 24px; background-color: #0B0B0B;">
        <h1 style="margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 24px; color: #F5E9D7; font-weight: bold;">UPBUY - Nuevo mensaje de contacto</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 32px;">
        <p style="margin: 0 0 16px; font-size: 16px;">Has recibido un nuevo mensaje desde el formulario de contacto de UPBUY:</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #D35400; width: 90px;">Nombre:</td>
            <td style="padding: 8px 0;">${escaparHtml(name)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #D35400;">Correo:</td>
            <td style="padding: 8px 0;">${escaparHtml(email)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #D35400;">Asunto:</td>
            <td style="padding: 8px 0;">${escaparHtml(subject)}</td>
          </tr>
        </table>
        <div style="margin-top: 20px; padding: 16px; background-color: #F5E9D7; border-radius: 8px;">
          <p style="margin: 0 0 8px; font-weight: bold; color: #0B0B0B;">Mensaje:</p>
          <p style="margin: 0; color: #0B0B0B; white-space: pre-wrap; font-family: Manrope, sans-serif;">${escaparHtml(message)}</p>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 32px; font-size: 12px; color: #8B6F56; border-top: 1px solid #D35400;">
        Este mensaje fue enviado desde el formulario publico de UPBUY. Responde directamente a ${escaparHtml(email)}.
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// Construye el correo de confirmacion que recibira el cliente.
const construirConfirmacionCliente = ({ name, email, subject }) => {
  const texto = `Hola ${name},\n\n` +
    `Hemos recibido tu mensaje sobre "${subject}".\n\n` +
    `El equipo de UPBUY lo revisara y te responderea a ${email} en un plazo de 1-2 dias habiles.\n\n` +
    `Mientras tanto, puedes escribirnos directamente a ${GOOGLE_MAIL_FROM} o por WhatsApp si lo necesitas.\n\n` +
    `Gracias por contactarnos.\n\n` +
    `Equipo UPBUY`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hemos recibido tu mensaje - UPBUY</title>
</head>
<body style="font-family: Manrope, system-ui, -apple-system, sans-serif; line-height: 1.6; color: #0B0B0B; margin: 0; padding: 20px; background-color: #F5E9D7;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
    <tr>
      <td style="padding: 32px 32px 24px; background-color: #0B0B0B;">
        <h1 style="margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 24px; color: #F5E9D7; font-weight: bold;">UPBUY</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 32px;">
        <p style="margin: 0 0 16px; font-size: 16px;">Hola ${name},</p>
        <p style="margin: 0 0 16px;">Hemos recibido tu mensaje sobre el asunto "<strong>${subject}</strong>".</p>
        <p style="margin: 0 0 16px;">El equipo de UPBUY lo revisara y te respondera a ${email} en un plazo de 1-2 dias habiles.</p>
        <p style="margin: 0;">Mientras tanto, puedes escribirnos directamente a ${GOOGLE_MAIL_FROM} o por WhatsApp si lo necesitas.</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 32px; font-size: 12px; color: #8B6F56; border-top: 1px solid #D35400;">
        Gracias por contactarnos.<br>Equipo UPBUY
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { texto, html };
};

// Valida y sanitiza los datos del formulario. Lanza HttpError si algo falla.
const validarYSanitizar = (body) => {
  const faltantes = CAMPOS_REQUERIDOS.filter(
    (campo) =>
      body[campo] === undefined || body[campo] === null || String(body[campo]).trim() === "",
  );
  if (faltantes.length > 0) {
    const error = new Error("Campos obligatorios faltantes: " + faltantes.join(", "));
    error.status = 422;
    error.code = "CAMPOS_OBLIGATORIOS";
    error.missing = faltantes;
    throw error;
  }

  const name = sanitizar(body.name);
  const email = sanitizar(body.email).toLowerCase();
  const subject = sanitizar(body.subject);
  const message = sanitizar(body.message);

  if (name.length < 2 || name.length > 120) {
    const error = new Error("El nombre debe tener entre 2 y 120 caracteres.");
    error.status = 422;
    error.code = "NOMBRE_INVALIDO";
    throw error;
  }

  if (!emailValido(email)) {
    const error = new Error("El correo electronico no es valido.");
    error.status = 422;
    error.code = "EMAIL_INVALIDO";
    throw error;
  }

  if (subject.length < 3 || subject.length > 160) {
    const error = new Error("El asunto debe tener entre 3 y 160 caracteres.");
    error.status = 422;
    error.code = "ASUNTO_INVALIDO";
    throw error;
  }

  if (message.length < 5 || message.length > 5000) {
    const error = new Error("El mensaje debe tener entre 5 y 5000 caracteres.");
    error.status = 422;
    error.code = "MENSAJE_INVALIDO";
    throw error;
  }

  return { name, email, subject, message };
};

// Procesa un mensaje de contacto: valida, envia correos y guarda en BD.
const enviarMensajeContacto = async ({ body, ip, userAgent }) => {
  const datos = validarYSanitizar(body);

  // Enviar correo al equipo de soporte de UPBUY.
  const soporteHtml = construirCuerpoHtml(datos);
  const soporteTexto = construirCuerpoTexto(datos);

  try {
    await sendEmail({
      to: GOOGLE_MAIL_FROM,
      subject: `[UPBUY Contacto] ${datos.subject}`,
      body: soporteTexto,
      html: soporteHtml,
      refreshToken: process.env.GOOGLE_MAIL_REFRESH_TOKEN,
    });
  } catch (error) {
    log.error("Error enviando correo al equipo de soporte", {
      email: datos.email,
      error: error.message,
    });
    throw new Error("No se pudo enviar el correo de soporte. Intentalo de nuevo mas tarde.");
  }

  // Enviar correo de confirmacion al cliente.
  const confirmacion = construirConfirmacionCliente(datos);
  try {
    await sendEmail({
      to: datos.email,
      subject: "Hemos recibido tu mensaje - UPBUY",
      body: confirmacion.texto,
      html: confirmacion.html,
      refreshToken: process.env.GOOGLE_MAIL_REFRESH_TOKEN,
    });
  } catch (error) {
    // El correo al cliente falla, pero el mensaje ya se guardo para el equipo de soporte.
    // No bloqueamos: seguimos guardando el mensaje y respondemos OK.
    log.error("Error enviando correo de confirmacion al cliente", {
      email: datos.email,
      error: error.message,
    });
  }

  // Guardar el mensaje en la base para auditoria y seguimiento del equipo de soporte.
  const contactoGuardado = await ContactMessage.create({
    name: datos.name,
    email: datos.email,
    subject: datos.subject,
    message: datos.message,
    status: "nuevo",
    ip,
    userAgent,
  });

  return {
    id: contactoGuardado.id,
    status: contactoGuardado.status,
    createdAt: contactoGuardado.createdAt,
  };
};

module.exports = {
  enviarMensajeContacto,
  validarYSanitizar,
};
