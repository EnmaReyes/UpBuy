// Estados y constantes compartidas del ecommerce.
// Se centralizan aqui para que modelos, servicios y controladores usen
// exactamente los mismos valores (y coincidan con los CHECK del SQL).

const ORDER_STATUS = {
  PENDIENTE_PAGO: "pendiente_pago",
  PAGADO: "pagado",
  EN_PREPARACION: "en_preparacion",
  ENVIADO: "enviado",
  ENTREGADO: "entregado",
  CANCELADO: "cancelado",
};

const ORDER_STATUS_VALUES = Object.values(ORDER_STATUS);

// Transiciones permitidas del estado logistico. Se validaran en el servicio
// de pedidos (fase de endpoints); aqui queda documentado el flujo.
const ORDER_STATUS_TRANSITIONS = {
  pendiente_pago: ["pagado", "cancelado"],
  pagado: ["en_preparacion", "cancelado"],
  en_preparacion: ["enviado", "cancelado"],
  enviado: ["entregado"],
  entregado: [],
  cancelado: [],
};

const PAYMENT_STATUS = {
  PENDIENTE: "pendiente",
  APROBADO: "aprobado",
  RECHAZADO: "rechazado",
  ANULADO: "anulado",
  REEMBOLSADO: "reembolsado",
  EN_REVISION: "en_revision",
  // Wompi reporta ERROR cuando la transaccion no pudo procesarse. La columna
  // ya lo acepta (migracion 005); sin esta constante la validacion isIn del
  // modelo rechazaria ese estado.
  ERROR: "error",
};

const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS);

const HISTORY_KIND = {
  LOGISTICA: "logistica",
  PAGO: "pago",
};

const HISTORY_KIND_VALUES = Object.values(HISTORY_KIND);

const PRODUCT_TYPE = {
  ARTICULO: "articulo",
  DTF: "dtf",
};

const PRODUCT_TYPE_VALUES = Object.values(PRODUCT_TYPE);

// Canal por el que entro la venta. 'web' lo asigna el checkout; los demas
// los registra un administrador para ventas externas (presencial/WhatsApp).
const SALE_CHANNEL = {
  WEB: "web",
  PRESENCIAL: "presencial",
  WHATSAPP: "whatsapp",
  OTRO: "otro",
};

const SALE_CHANNEL_VALUES = Object.values(SALE_CHANNEL);

// Metodo de pago. Solo aplica a ventas registradas a mano: el pago con
// Wompi vive en la tabla payments (provider = 'wompi').
const PAYMENT_METHOD = {
  EFECTIVO: "efectivo",
  NEQUI: "nequi",
  TRANSFERENCIA: "transferencia",
  TARJETA: "tarjeta",
  OTRO: "otro",
};

const PAYMENT_METHOD_VALUES = Object.values(PAYMENT_METHOD);

const CURRENCY = "COP";

// Dias habiles de entrega prometidos al cliente. Se guardan como snapshot en
// el pedido (orders.estimatedDeliveryDays) al crearlo, para que un cambio de
// reglas no altere pedidos ya hechos.
//   - Medellin y el resto de Antioquia: 3 dias habiles
//   - Cualquier otro departamento: 10 dias habiles
const DELIVERY_DAYS = {
  ANTIOQUIA: 3,
  NACIONAL: 10,
};

// Minutos que se reserva el stock de un pedido sin pagar.
//
// HOY NO SE USA: con stock booleano el bloqueo de 30 minutos solo esconde el
// producto de un carrito abandonado (y permite bloquear el catalogo entero
// creando pedidos). La reserva se activa con STOCK_RESERVATION_ENABLED y se
// implementara de verdad cuando el stock sea por cantidad
// (tabla inventory_reservations). La estructura se conserva para no reescribir
// el flujo despues.
const STOCK_RESERVATION_MINUTES = 30;

// ---------------------------------------------------------------------------
// Estados canonicos del dropshipping (Upbuy).
//
// A diferencia de ORDER_STATUS / PAYMENT_STATUS (vocabulario historico en
// espanol, que se migra en la Fase 1), estos son los valores que:
//   - se guardan en orders.fulfillmentStatus / orders.paymentState,
//   - viajan por la API,
//   - ve el front.
//
// Upbuy es la fuente de verdad: los estados crudos de Dropi/Vendelo NUNCA se
// exponen; se mapean a estos con mapProviderToCanonical().
//
// Los dos ciclos son independientes:
//   fulfillmentStatus -> donde va el pedido fisicamente.
//   paymentState      -> donde va el dinero.
// ---------------------------------------------------------------------------

// Ciclo de cumplimiento (envio).
const FULFILLMENT_STATUS = {
  PENDING_PAYMENT: "pending_payment",
  PAID: "paid",
  PACKING: "packing",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
};

const FULFILLMENT_STATUS_VALUES = Object.values(FULFILLMENT_STATUS);

// Transiciones permitidas del ciclo de cumplimiento. delivered y cancelled
// son terminales: de delivered solo sale un reembolso (ciclo del dinero).
const FULFILLMENT_TRANSITIONS = {
  [FULFILLMENT_STATUS.PENDING_PAYMENT]: [
    FULFILLMENT_STATUS.PAID,
    FULFILLMENT_STATUS.CANCELLED,
  ],
  [FULFILLMENT_STATUS.PAID]: [
    FULFILLMENT_STATUS.PACKING,
    FULFILLMENT_STATUS.CANCELLED,
  ],
  [FULFILLMENT_STATUS.PACKING]: [
    FULFILLMENT_STATUS.SHIPPED,
    FULFILLMENT_STATUS.CANCELLED,
  ],
  [FULFILLMENT_STATUS.SHIPPED]: [
    FULFILLMENT_STATUS.DELIVERED,
    FULFILLMENT_STATUS.CANCELLED,
  ],
  [FULFILLMENT_STATUS.DELIVERED]: [],
  [FULFILLMENT_STATUS.CANCELLED]: [],
};

// Ciclo del dinero.
const PAYMENT_STATE = {
  UNPAID: "unpaid",
  PENDING_COLLECTION: "pending_collection",
  COLLECTED: "collected",
  SETTLED: "settled",
  REFUNDED: "refunded",
};

const PAYMENT_STATE_VALUES = Object.values(PAYMENT_STATE);

// Transiciones permitidas del ciclo del dinero.
const PAYMENT_TRANSITIONS = {
  [PAYMENT_STATE.UNPAID]: [
    PAYMENT_STATE.PENDING_COLLECTION,
    PAYMENT_STATE.SETTLED,
    PAYMENT_STATE.REFUNDED,
  ],
  [PAYMENT_STATE.PENDING_COLLECTION]: [
    PAYMENT_STATE.COLLECTED,
    PAYMENT_STATE.REFUNDED,
  ],
  [PAYMENT_STATE.COLLECTED]: [
    PAYMENT_STATE.SETTLED,
    PAYMENT_STATE.REFUNDED,
  ],
  [PAYMENT_STATE.SETTLED]: [PAYMENT_STATE.REFUNDED],
  [PAYMENT_STATE.REFUNDED]: [],
};

// Metodo de pago, en el vocabulario del front.
//
// OJO: esto NO es lo mismo que PAYMENT_METHOD (efectivo/nequi/...), que
// describe como pago una venta registrada a mano. Aqui se describe QUE
// pasarela mueve el dinero, y por eso distingue el pago contra entrega.
const PAYMENT_METHOD_CODE = {
  WOMPI: "wompi",
  VENDELO: "vendelo",
  COD_DROPI: "cod_dropi",
  COD_VENDELO: "cod_vendelo",
};

const PAYMENT_METHOD_CODE_VALUES = Object.values(PAYMENT_METHOD_CODE);

// Metodos contra entrega: el dinero entra DESPUES de la entrega.
const COD_PAYMENT_METHOD_CODES = [
  PAYMENT_METHOD_CODE.COD_DROPI,
  PAYMENT_METHOD_CODE.COD_VENDELO,
];

// Proveedor logistico (dropshipping).
const PROVIDER = {
  VENDELO: "vendelo",
  DROPI: "dropi",
};

const PROVIDER_VALUES = Object.values(PROVIDER);

// Quien produjo el cambio de estado. Permite que el auto-sync (cron) no pise
// un cambio manual del administrador.
const STATUS_SOURCE = {
  AUTO_SYNC: "auto_sync",
  MANUAL_ADMIN: "manual_admin",
  MANUAL_ADMIN_PUSHED: "manual_admin_pushed",
  WEBHOOK: "webhook",
};

const STATUS_SOURCE_VALUES = Object.values(STATUS_SOURCE);

// Direccion de una sincronizacion con el proveedor.
const SYNC_DIRECTION = {
  IN: "in",
  OUT: "out",
};

const SYNC_DIRECTION_VALUES = Object.values(SYNC_DIRECTION);

// Canal de una notificacion. La in-app ya existe (notificaciones); email y
// whatsapp se registran aqui para que el historial de envios sea uniforme.
const NOTIFICATION_CHANNEL = {
  IN_APP: "in_app",
  EMAIL: "email",
  WHATSAPP: "whatsapp",
};

const NOTIFICATION_CHANNEL_VALUES = Object.values(NOTIFICATION_CHANNEL);

// ---------------------------------------------------------------------------
// Puentes entre el vocabulario historico (espanol) y el canonico.
//
// Los usan la migracion de datos (backfill) y, mientras el esquema legacy
// siga existiendo, la conversion de datos que llegan de la API.
// ---------------------------------------------------------------------------

const LEGACY_FULFILLMENT_MAP = {
  [ORDER_STATUS.PENDIENTE_PAGO]: FULFILLMENT_STATUS.PENDING_PAYMENT,
  [ORDER_STATUS.PAGADO]: FULFILLMENT_STATUS.PAID,
  [ORDER_STATUS.EN_PREPARACION]: FULFILLMENT_STATUS.PACKING,
  [ORDER_STATUS.ENVIADO]: FULFILLMENT_STATUS.SHIPPED,
  [ORDER_STATUS.ENTREGADO]: FULFILLMENT_STATUS.DELIVERED,
  [ORDER_STATUS.CANCELADO]: FULFILLMENT_STATUS.CANCELLED,
};

const LEGACY_PAYMENT_MAP = {
  [PAYMENT_STATUS.PENDIENTE]: PAYMENT_STATE.UNPAID,
  [PAYMENT_STATUS.RECHAZADO]: PAYMENT_STATE.UNPAID,
  [PAYMENT_STATUS.EN_REVISION]: PAYMENT_STATE.UNPAID,
  [PAYMENT_STATUS.ERROR]: PAYMENT_STATE.UNPAID,
  [PAYMENT_STATUS.APROBADO]: PAYMENT_STATE.SETTLED,
  [PAYMENT_STATUS.ANULADO]: PAYMENT_STATE.REFUNDED,
  [PAYMENT_STATUS.REEMBOLSADO]: PAYMENT_STATE.REFUNDED,
};

module.exports = {
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  ORDER_STATUS_TRANSITIONS,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
  HISTORY_KIND,
  HISTORY_KIND_VALUES,
  PRODUCT_TYPE,
  PRODUCT_TYPE_VALUES,
  SALE_CHANNEL,
  SALE_CHANNEL_VALUES,
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  CURRENCY,
  DELIVERY_DAYS,
  STOCK_RESERVATION_MINUTES,

  FULFILLMENT_STATUS,
  FULFILLMENT_STATUS_VALUES,
  FULFILLMENT_TRANSITIONS,
  PAYMENT_STATE,
  PAYMENT_STATE_VALUES,
  PAYMENT_TRANSITIONS,
  PAYMENT_METHOD_CODE,
  PAYMENT_METHOD_CODE_VALUES,
  COD_PAYMENT_METHOD_CODES,
  PROVIDER,
  PROVIDER_VALUES,
  STATUS_SOURCE,
  STATUS_SOURCE_VALUES,
  SYNC_DIRECTION,
  SYNC_DIRECTION_VALUES,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_CHANNEL_VALUES,
  LEGACY_FULFILLMENT_MAP,
  LEGACY_PAYMENT_MAP,
};
