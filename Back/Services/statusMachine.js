// Maquina de estados canonica del pedido.
//
// Upbuy es la fuente de verdad. Este archivo decide SI un cambio de estado
// es valido y QUE otras cosas pasan cuando ocurre. No toca la base de datos:
// es logica pura, facil de probar.
//
// Los dos ciclos son independientes:
//   fulfillmentStatus -> donde va el pedido fisicamente.
//   paymentState      -> donde va el dinero.
//
// Regla critica: fulfillmentStatus = "paid" significa "cumplimiento
// liberado", NO "dinero cobrado". En COD el cumplimiento se libera al
// confirmar el pedido (el courier garantiza el cobro) y el dinero entra
// al entregar.

const {
  FULFILLMENT_STATUS,
  FULFILLMENT_STATUS_VALUES,
  FULFILLMENT_TRANSITIONS,
  PAYMENT_STATE,
  PAYMENT_STATE_VALUES,
  PAYMENT_TRANSITIONS,
  PAYMENT_METHOD_CODE,
  COD_PAYMENT_METHOD_CODES,
  PROVIDER,
  STATUS_SOURCE,
} = require("../DataBase/models/enums.js");
const HttpError = require("../Utils/HttpError.js");

// ---------------------------------------------------------------------------
// Consultas basicas
// ---------------------------------------------------------------------------

const isFulfillmentStatus = (value) =>
  FULFILLMENT_STATUS_VALUES.includes(value);

const isPaymentState = (value) => PAYMENT_STATE_VALUES.includes(value);

// El metodo de pago es contra entrega (el dinero entra despues).
const isCod = (paymentMethodCode) =>
  COD_PAYMENT_METHOD_CODES.includes(paymentMethodCode);

// Un pedido es COD si su metodo de pago lo es.
const isCodOrder = (order) => isCod(order?.paymentMethodCode);

// Se puede pasar de un estado de pago a otro?
const canTransitionPayment = (from, to) =>
  (PAYMENT_TRANSITIONS[from] || []).includes(to);

// Se puede pasar de un estado de cumplimiento a otro?
const canTransitionFulfillment = (from, to) =>
  (FULFILLMENT_TRANSITIONS[from] || []).includes(to);

// ---------------------------------------------------------------------------
// Cancelacion por el comprador
//
// Se puede cancelar mientras el pedido no haya entrado en preparacion:
//   - pending_payment: pedido Wompi que aun no paga.
//   - paid: pedido COD confirmado, todavia sin empacar.
// Nunca si el dinero ya esta settled/refunded/collected (pago online
// aprobado o COD ya cobrado). `paid` en el ciclo logistico NO significa
// "dinero cobrado": por eso la regla mira los dos ciclos.
// ---------------------------------------------------------------------------
const CANCELLABLE_FULFILLMENT = new Set([
  FULFILLMENT_STATUS.PENDING_PAYMENT,
  FULFILLMENT_STATUS.PAID,
]);
const NON_CANCELLABLE_PAYMENT = new Set([
  PAYMENT_STATE.SETTLED,
  PAYMENT_STATE.REFUNDED,
  PAYMENT_STATE.COLLECTED,
]);

const canCustomerCancel = (order) =>
  CANCELLABLE_FULFILLMENT.has(order?.fulfillmentStatus) &&
  !NON_CANCELLABLE_PAYMENT.has(order?.paymentState);

// ---------------------------------------------------------------------------
// Validacion de transiciones
//
// Una transicion invalida se rechaza con 422 (no 400, no 409): el valor es
// un estado valido, lo que no es valido es la transicion entre esos dos
// estados.
// ---------------------------------------------------------------------------

const assertFulfillmentTransition = (from, to) => {
  if (!isFulfillmentStatus(to)) {
    throw new HttpError(
      422,
      `Estado de cumplimiento inválido: "${to}"`,
    );
  }

  if (!isFulfillmentStatus(from)) {
    throw new HttpError(
      422,
      `El pedido tiene un estado de cumplimiento desconocido ("${from}")`,
    );
  }

  if (from === to) {
    throw new HttpError(
      422,
      `El pedido ya está en estado de cumplimiento "${to}"`,
    );
  }

  if (!canTransitionFulfillment(from, to)) {
    throw new HttpError(
      422,
      `No se puede pasar el cumplimiento de "${from}" a "${to}"`,
    );
  }

  return true;
};

const assertPaymentTransition = (from, to) => {
  if (!isPaymentState(to)) {
    throw new HttpError(422, `Estado de pago inválido: "${to}"`);
  }

  if (!isPaymentState(from)) {
    throw new HttpError(
      422,
      `El pedido tiene un estado de pago desconocido ("${from}")`,
    );
  }

  if (from === to) {
    throw new HttpError(422, `El pago ya está en estado "${to}"`);
  }

  if (!canTransitionPayment(from, to)) {
    throw new HttpError(
      422,
      `No se puede pasar el pago de "${from}" a "${to}"`,
    );
  }

  return true;
};

// ---------------------------------------------------------------------------
// Efectos laterales del ciclo de cumplimiento
//
// Devuelve los valores que el pedido debe quedar con. NO escribe en la base:
// eso lo hace quien llama (dentro de su transaccion).
//
//   shipped   -> exige guia. En COD promotes el pago a pending_collection.
//   delivered -> en COD, el pago pasa a collected (el courier cobro).
// ---------------------------------------------------------------------------

const applyFulfillmentSideEffects = (order, to) => {
  const resultado = {
    fulfillmentStatus: to,
    paymentState: order.paymentState,
  };

  const pendientes = [];

  if (to === FULFILLMENT_STATUS.SHIPPED) {
    // Sin guia no se puede despachar: ni el courier ni el cliente saben
    // donde esta el pedido.
    const tieneGuia = Boolean(
      (order.trackingNumber && String(order.trackingNumber).trim()) ||
        (order.trackingUrl && String(order.trackingUrl).trim()),
    );

    if (!tieneGuia) {
      throw new HttpError(
        422,
        "No se puede marcar como enviado sin número de guía",
      );
    }

    if (isCodOrder(order)) {
      // El courier va a cobrar: el pago deja de estar "unpaid" y pasa a
      // "pending_collection".
      //
      // Solo si la transicion es valida: un pedido que ya esta "settled"
      // (pago online) no se degrada por un error de configuracion.
      if (
        canTransitionPayment(
          order.paymentState,
          PAYMENT_STATE.PENDING_COLLECTION,
        )
      ) {
        resultado.paymentState = PAYMENT_STATE.PENDING_COLLECTION;
        pendientes.push({
          paymentState: PAYMENT_STATE.PENDING_COLLECTION,
          from: order.paymentState,
        });
      }
    }
  }

  if (to === FULFILLMENT_STATUS.DELIVERED) {
    if (isCodOrder(order)) {
      // El courier entrego y cobro: el dinero ya esta en camino de la
      // cuenta (falta la liquidacion del proveedor).
      if (
        canTransitionPayment(order.paymentState, PAYMENT_STATE.COLLECTED)
      ) {
        resultado.paymentState = PAYMENT_STATE.COLLECTED;
        pendientes.push({
          paymentState: PAYMENT_STATE.COLLECTED,
          from: order.paymentState,
        });
      }
    }
  }

  return { ...resultado, pendientes };
};

// ---------------------------------------------------------------------------
// Mapeo de estados crudos del proveedor -> estados canonicos
//
// Los proveedores usan sus propios vocabularios. Upbuy nunca los expone:
// se guardan crudos en orders.providerStatus y se mapean a los canonicos
// aqui.
//
// AVISO IMPORTANTE: los mapas de abajo son un punto de partida. Hay que
// ajustarlos a la documentacion real de cada proveedor (ver
// docs/PROVEEDORES.md). Un estado que no se reconoce NO se cambia: es
// preferible dejar el pedido como esta (y avisar) que moverlo a un estado
// equivocado.
// ---------------------------------------------------------------------------

// Palabras clave -> estado canonico. Se comparan normalizadas (minusculas,
// sin tildes, sin guiones ni espacios).
const PALABRAS_CUMPLIMIENTO = {
  // Pendiente / sin Dispatch
  pendiente: FULFILLMENT_STATUS.PENDING_PAYMENT,
  pending: FULFILLMENT_STATUS.PENDING_PAYMENT,
  unpaid: FULFILLMENT_STATUS.PENDING_PAYMENT,
  created: FULFILLMENT_STATUS.PENDING_PAYMENT,
  nuevo: FULFILLMENT_STATUS.PENDING_PAYMENT,
  confirmado: FULFILLMENT_STATUS.PENDING_PAYMENT,

  // Pago recibido / liberado para despachar
  pagado: FULFILLMENT_STATUS.PAID,
  paid: FULFILLMENT_STATUS.PAID,
  approved: FULFILLMENT_STATUS.PAID,
  approved_payment: FULFILLMENT_STATUS.PAID,
  listo: FULFILLMENT_STATUS.PAID,
  to_pack: FULFILLMENT_STATUS.PAID,

  // En preparacion
  en_preparacion: FULFILLMENT_STATUS.PACKING,
  preparacion: FULFILLMENT_STATUS.PACKING,
  packing: FULFILLMENT_STATUS.PACKING,
  processing: FULFILLMENT_STATUS.PACKING,
  preparing: FULFILLMENT_STATUS.PACKING,
  packed: FULFILLMENT_STATUS.PACKING,
  en_empaque: FULFILLMENT_STATUS.PACKING,

  // En camino
  enviado: FULFILLMENT_STATUS.SHIPPED,
  shipped: FULFILLMENT_STATUS.SHIPPED,
  dispatched: FULFILLMENT_STATUS.SHIPPED,
  in_transit: FULFILLMENT_STATUS.SHIPPED,
  transit: FULFILLMENT_STATUS.SHIPPED,
  en_ruta: FULFILLMENT_STATUS.SHIPPED,
  en_transito: FULFILLMENT_STATUS.SHIPPED,
  out_for_delivery: FULFILLMENT_STATUS.SHIPPED,

  // Entregado
  entregado: FULFILLMENT_STATUS.DELIVERED,
  delivered: FULFILLMENT_STATUS.DELIVERED,
  completed: FULFILLMENT_STATUS.DELIVERED,
  delivered_to_customer: FULFILLMENT_STATUS.DELIVERED,

  // Cancelado / devuelto
  cancelado: FULFILLMENT_STATUS.CANCELLED,
  cancelled: FULFILLMENT_STATUS.CANCELLED,
  canceled: FULFILLMENT_STATUS.CANCELLED,
  devuelto: FULFILLMENT_STATUS.CANCELLED,
  returned: FULFILLMENT_STATUS.CANCELLED,
  rejected: FULFILLMENT_STATUS.CANCELLED,
  rejected_by_courier: FULFILLMENT_STATUS.CANCELLED,
};

const PALABRAS_PAGO = {
  unpaid: PAYMENT_STATE.UNPAID,
  pendiente: PAYMENT_STATE.UNPAID,
  pending: PAYMENT_STATE.UNPAID,
  rejected: PAYMENT_STATE.UNPAID,
  declined: PAYMENT_STATE.UNPAID,
  error: PAYMENT_STATE.UNPAID,

  pending_collection: PAYMENT_STATE.PENDING_COLLECTION,
  por_cobrar: PAYMENT_STATE.PENDING_COLLECTION,
  to_collect: PAYMENT_STATE.PENDING_COLLECTION,
  cash_on_delivery: PAYMENT_STATE.PENDING_COLLECTION,
  cod: PAYMENT_STATE.PENDING_COLLECTION,

  collected: PAYMENT_STATE.COLLECTED,
  cobrado: PAYMENT_STATE.COLLECTED,
  cash_collected: PAYMENT_STATE.COLLECTED,
  delivered_and_collected: PAYMENT_STATE.COLLECTED,

  settled: PAYMENT_STATE.SETTLED,
  liquidado: PAYMENT_STATE.SETTLED,
  paid: PAYMENT_STATE.SETTLED,
  paid_out: PAYMENT_STATE.SETTLED,
  payout: PAYMENT_STATE.SETTLED,

  refunded: PAYMENT_STATE.REFUNDED,
  reembolsado: PAYMENT_STATE.REFUNDED,
  devuelto_pago: PAYMENT_STATE.REFUNDED,
};

// Overrides por proveedor. Se aplican DESPUES de las palabras clave, asi
// que tienen prioridad. Se completan segun la documentacion de cada uno.
const OVERRIDES_POR_PROVEEDOR = {
  [PROVIDER.VENDELO]: {},
  [PROVIDER.DROPI]: {},
};

// Normaliza un estado crudo para compararlo: minusculas, sin tildes, sin
// separadores.
const normalizarEstado = (valor) =>
  String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-_.]+/g, "_");

// Convierte un estado crudo del proveedor a los estados canonicos.
//
// Devuelve {} cuando el estado no se reconoce: en ese caso el pedido NO
// se mueve. Moverlo a un estado equivocado es peor que no moverlo.
const mapProviderToCanonical = (provider, providerStatus) => {
  if (!providerStatus) return {};

  const clave = normalizarEstado(providerStatus);
  if (!clave) return {};

  const overrides =
    OVERRIDES_POR_PROVEEDOR[String(provider || "").toLowerCase()] || {};

  const fulfillmentStatus =
    overrides[clave]?.fulfillmentStatus ||
    overrides[clave]?.fulfillment ||
    PALABRAS_CUMPLIMIENTO[clave] ||
    null;

  const paymentState =
    overrides[clave]?.paymentState ||
    overrides[clave]?.payment ||
    PALABRAS_PAGO[clave] ||
    null;

  const resultado = {};
  if (fulfillmentStatus) resultado.fulfillmentStatus = fulfillmentStatus;
  if (paymentState) resultado.paymentState = paymentState;

  return resultado;
};

// ---------------------------------------------------------------------------
// Etiquetas para el front
//
// El front consume solo estados canonicos; estas etiquetas son la
// traduccion que el usuario lee.
// ---------------------------------------------------------------------------

const FULFILLMENT_LABELS = {
  [FULFILLMENT_STATUS.PENDING_PAYMENT]: "Pendiente de pago",
  [FULFILLMENT_STATUS.PAID]: "Pagado",
  [FULFILLMENT_STATUS.PACKING]: "En preparación",
  [FULFILLMENT_STATUS.SHIPPED]: "Enviado",
  [FULFILLMENT_STATUS.DELIVERED]: "Entregado",
  [FULFILLMENT_STATUS.CANCELLED]: "Cancelado",
};

const PAYMENT_LABELS = {
  [PAYMENT_STATE.UNPAID]: "Sin pagar",
  [PAYMENT_STATE.PENDING_COLLECTION]: "Por cobrar",
  [PAYMENT_STATE.COLLECTED]: "Cobrado",
  [PAYMENT_STATE.SETTLED]: "Liquidado",
  [PAYMENT_STATE.REFUNDED]: "Reembolsado",
};

// Texto que ve el comprador. Depende de los DOS ciclos: un COD en camino
// dice "En camino — pagas al recibir", un pago online ya pagado dice
// "Pagado".
const userFacingMessage = (order) => {
  const f = order?.fulfillmentStatus;
  const p = order?.paymentState;
  const cod = isCodOrder(order);

  if (f === FULFILLMENT_STATUS.CANCELLED) {
    return p === PAYMENT_STATE.REFUNDED
      ? "Devolución — el dinero fue devuelto"
      : "Pedido cancelado";
  }

  if (f === FULFILLMENT_STATUS.DELIVERED) {
    return cod ? "Entregado ✓" : "Entregado ✓";
  }

  if (f === FULFILLMENT_STATUS.SHIPPED) {
    return cod ? "En camino — pagas al recibir" : "En camino";
  }

  if (f === FULFILLMENT_STATUS.PACKING) {
    return cod ? "En preparación — pagas al recibir" : "En preparación";
  }

  if (f === FULFILLMENT_STATUS.PAID) {
    return cod ? "Listo para despachar — pagas al recibir" : "Pagado ✓";
  }

  return cod ? "Pedido confirmado, pagas al recibir" : "Pendiente de pago";
};

module.exports = {
  // consultas
  isFulfillmentStatus,
  isPaymentState,
  isCod,
  isCodOrder,
  canTransitionPayment,
  canTransitionFulfillment,
  canCustomerCancel,
  // validacion
  assertFulfillmentTransition,
  assertPaymentTransition,
  // efectos
  applyFulfillmentSideEffects,
  // proveedores
  mapProviderToCanonical,
  normalizarEstado,
  // presentacion
  FULFILLMENT_LABELS,
  PAYMENT_LABELS,
  userFacingMessage,
  // re-exportados para no obligar a importar de dos lugares
  FULFILLMENT_STATUS,
  PAYMENT_STATE,
  PAYMENT_METHOD_CODE,
  STATUS_SOURCE,
  PROVIDER,
};
