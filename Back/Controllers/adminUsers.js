// Controlador HTTP de clientes (ADM-9). Capa delgada: valida lo minimo y
// delega en Services/adminClients.js. La logica (filtros, resumen,
// consentimientos, auditoria) vive en el servicio.

const {
  ClientError,
  clientDetail,
  clientOrders,
  exportClientsCsv,
  listClients,
  updateClient,
} = require("../Services/adminClients.js");
const { sendError } = require("../Utils/respond.js");

const respondError = (res, error, fallback = "No se pudo procesar la solicitud") => {
  if (error instanceof ClientError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  return sendError(res, error, fallback);
};

// GET /api/admin/users?limit=&offset=&q=&segment=&consent=&registeredFrom=
const list = async (req, res) => {
  try {
    const data = await listClients({
      q: req.query.q,
      segment: req.query.segment,
      consent: req.query.consent,
      registeredFrom: req.query.registeredFrom,
      registeredTo: req.query.registeredTo,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json(data);
  } catch (error) {
    return respondError(res, error, "No se pudieron cargar los usuarios");
  }
};

// GET /api/admin/users/:id
const detail = async (req, res) => {
  try {
    const data = await clientDetail(req.params.id);
    if (!data) {
      return res.status(404).json({ message: "No se encontró el usuario" });
    }
    return res.json(data);
  } catch (error) {
    return respondError(res, error, "No se pudo cargar el cliente");
  }
};

// GET /api/admin/users/:id/orders
const orders = async (req, res) => {
  try {
    return res.json(
      await clientOrders(req.params.id, {
        limit: req.query.limit,
        offset: req.query.offset,
      }),
    );
  } catch (error) {
    return respondError(res, error, "No se pudieron cargar los pedidos");
  }
};

// PATCH /api/admin/users/:id
const update = async (req, res) => {
  try {
    const result = await updateClient({
      id: req.params.id,
      payload: req.body || {},
      actorId: req.user?.id,
      ip: req.ip,
    });
    return res.json(result);
  } catch (error) {
    return respondError(res, error, "No se pudo actualizar el cliente");
  }
};

// GET /api/admin/users/export.csv
const exportCsv = async (req, res) => {
  try {
    const csv = await exportClientsCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="clientes-upbuy.csv"',
    );
    return res.send(csv);
  } catch (error) {
    return respondError(res, error, "No se pudo exportar el CSV");
  }
};

module.exports = { detail, exportCsv, list, orders, update };
