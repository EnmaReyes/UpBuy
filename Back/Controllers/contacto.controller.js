"use strict";

// Controlador delgado del formulario de contacto publico.
// La logica de negocio vive en Services/contacto.service.js.

const {
  enviarMensajeContacto,
} = require("../Services/contacto.service.js");
const { createLogger } = require("../Utils/logger.js");

const log = createLogger("contacto.controller");

const enviarMensaje = async (req, res) => {
  try {
    const resultado = await enviarMensajeContacto({
      body: req.body || {},
      ip: req.ip,
      userAgent: req.get("User-Agent") || null,
    });

    return res.status(200).json({
      message: "Mensaje enviado correctamente. Te respondemos pronto.",
      id: resultado.id,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        code: error.code,
        ...(error.missing && { missing: error.missing }),
      });
    }

    log.error("Error al enviar mensaje de contacto", {
      ip: req.ip,
      error: error.message,
    });
    return res.status(500).json("No se pudo enviar el mensaje. Intentalo de nuevo mas tarde.");
  }
};

module.exports = {
  enviarMensaje,
};
