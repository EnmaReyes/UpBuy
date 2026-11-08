// Contabilidad del negocio.
//
// La regla central: "utilidad ganada" y "efectivo recibido" son cosas
// distintas.
//
//   - Utilidad ganada: pedidos ENTREGADOS. El margen ya se gano, aunque la
//     plata todavia no este en el banco.
//   - Efectivo recibido: lo que el proveedor/pasarela ya liquido.
//
// Y en pago contra entrega (COD) hay tres momentos:
//
//   pending_collection  el pedido va en camino; nadie ha pagado
//   collected           el courier cobro al cliente (plata en transito)
//   settled             el proveedor nos deposito (menos sus fees)
//
// Todo sale de las columnas del pedido, no del panel del proveedor: si
// Vendelo/Dropi cambian sus reportes, estos numeros siguen cuadrando.

const { QueryTypes } = require("sequelize");
const { sequelize } = require("../DataBase/db.js");
const {
  FULFILLMENT_STATUS,
  PAYMENT_STATE,
  PAYMENT_STATE_VALUES,
  COD_PAYMENT_METHOD_CODES,
  PROVIDER_VALUES,
} = require("../DataBase/models/enums.js");
const { parseBogotaDay } = require("../Utils/dates.js");
const HttpError = require("../Utils/HttpError.js");

const toNumber = (value) => Number(value) || 0;

const emptyBucket = () => ({ orders: 0, amount: 0 });

// Construye el filtro comun de pedidos. Devuelve SQL + replacements para no
// concatenar valores.
const buildOrderFilter = ({ from, to, provider }) => {
  const clauses = [];
  const replacements = {};

  if (from) {
    replacements.from = parseBogotaDay(from, "from");
    clauses.push(`o."createdAt" >= :from`);
  }
  if (to) {
    replacements.to = parseBogotaDay(to, "to", true);
    clauses.push(`o."createdAt" <= :to`);
  }
  if (provider) {
    if (!PROVIDER_VALUES.includes(provider)) {
      throw new HttpError(400, "Proveedor inválido");
    }
    replacements.provider = provider;
    clauses.push(`o.provider = :provider`);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    replacements,
  };
};

// GET /api/admin/accounting
const getAccounting = async ({ from, to, provider } = {}) => {
  const { where, replacements } = buildOrderFilter({ from, to, provider });

  // El pedido cancelado no factura: se excluye de los totales de dinero, pero
  // se cuenta aparte para que el panel muestre la realidad.
  const NOT_CANCELLED = `o."fulfillmentStatus" <> '${FULFILLMENT_STATUS.CANCELLED}'`;

  const [summaryRows, stateRows, providerRows, methodRows, payoutRows] =
    await Promise.all([
      sequelize.query(
        `SELECT
           COUNT(*)::int                                            AS orders,
           COUNT(*) FILTER (WHERE o."fulfillmentStatus" = 'cancelled')::int AS cancelled,
           COUNT(*) FILTER (WHERE o."fulfillmentStatus" = 'delivered')::int AS delivered,
           COUNT(*) FILTER (WHERE o."fulfillmentStatus" IN ('packing','shipped'))::int AS in_transit,
           COALESCE(SUM(o.subtotal)      FILTER (WHERE ${NOT_CANCELLED}), 0) AS subtotal,
           COALESCE(SUM(o."shippingCost") FILTER (WHERE ${NOT_CANCELLED}), 0) AS shipping,
           COALESCE(SUM(o."discountTotal") FILTER (WHERE ${NOT_CANCELLED}), 0) AS discounts,
           COALESCE(SUM(o.total)         FILTER (WHERE ${NOT_CANCELLED}), 0) AS gross,
           COALESCE(SUM(o."providerCost") FILTER (WHERE ${NOT_CANCELLED}), 0) AS provider_cost,
           COALESCE(SUM(o."gatewayFee")  FILTER (WHERE ${NOT_CANCELLED}), 0) AS gateway_fee,
           COALESCE(SUM(o."providerFee") FILTER (WHERE ${NOT_CANCELLED}), 0) AS provider_fee,
           COALESCE(SUM(o."netProfit")   FILTER (WHERE ${NOT_CANCELLED}), 0) AS net_profit,
           COALESCE(SUM(o."netProfit")   FILTER (WHERE o."fulfillmentStatus" = 'delivered'), 0) AS earned_profit
         FROM orders o
         ${where}`,
        { replacements, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT o."paymentState" AS state,
                COUNT(*)::int    AS orders,
                COALESCE(SUM(o.total), 0) AS amount
           FROM orders o
           ${where ? `${where} AND` : "WHERE"} ${NOT_CANCELLED}
          GROUP BY o."paymentState"`,
        { replacements, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT COALESCE(o.provider, 'sin_proveedor') AS provider,
                COUNT(*)::int AS orders,
                COALESCE(SUM(o.total), 0)         AS gross,
                COALESCE(SUM(o."providerCost"), 0) AS provider_cost,
                COALESCE(SUM(o."netProfit"), 0)    AS net_profit
           FROM orders o
           ${where ? `${where} AND` : "WHERE"} ${NOT_CANCELLED}
          GROUP BY COALESCE(o.provider, 'sin_proveedor')
          ORDER BY gross DESC`,
        { replacements, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT COALESCE(o."paymentMethodCode", 'sin_metodo') AS method,
                COUNT(*)::int AS orders,
                COALESCE(SUM(o.total), 0) AS amount,
                COALESCE(SUM(o."gatewayFee"), 0) AS gateway_fee
           FROM orders o
           ${where ? `${where} AND` : "WHERE"} ${NOT_CANCELLED}
          GROUP BY COALESCE(o."paymentMethodCode", 'sin_metodo')
          ORDER BY orders DESC`,
        { replacements, type: QueryTypes.SELECT },
      ),
      // Dinero efectivamente depositado: solo cuando hay payoutDate.
      sequelize.query(
        `SELECT COUNT(*)::int AS payouts,
                COALESCE(SUM(p."payoutAmount"), 0) AS paid_out
           FROM payments p
           JOIN orders o ON o.id = p."orderId"
          ${where ? `${where} AND` : "WHERE"} p."payoutDate" IS NOT NULL`,
        { replacements, type: QueryTypes.SELECT },
      ),
    ]);

  const s = summaryRows[0] || {};

  const byPaymentState = PAYMENT_STATE_VALUES.reduce((acc, value) => {
    acc[value] = emptyBucket();
    return acc;
  }, {});

  for (const row of stateRows) {
    byPaymentState[row.state] = {
      orders: toNumber(row.orders),
      amount: toNumber(row.amount),
    };
  }

  // Desglose COD: solo pedidos cobrados contra entrega.
  const cod = PAYMENT_STATE_VALUES.reduce((acc, value) => {
    acc[value] = emptyBucket();
    return acc;
  }, {});

  const codRows = await sequelize.query(
    `SELECT o."paymentState" AS state,
            COUNT(*)::int AS orders,
            COALESCE(SUM(o.total), 0) AS amount
       FROM orders o
       ${where ? `${where} AND` : "WHERE"} ${NOT_CANCELLED}
        AND o."paymentMethodCode" IN (:codCodes)
      GROUP BY o."paymentState"`,
    {
      replacements: { ...replacements, codCodes: COD_PAYMENT_METHOD_CODES },
      type: QueryTypes.SELECT,
    },
  );

  for (const row of codRows) {
    cod[row.state] = {
      orders: toNumber(row.orders),
      amount: toNumber(row.amount),
    };
  }

  const gross = toNumber(s.gross);
  const netProfit = toNumber(s.net_profit);

  return {
    range: {
      from: from || null,
      to: to || null,
      provider: provider || null,
    },
    orders: {
      total: toNumber(s.orders),
      cancelled: toNumber(s.cancelled),
      delivered: toNumber(s.delivered),
      inTransit: toNumber(s.in_transit),
    },
    revenue: {
      subtotal: toNumber(s.subtotal),
      shipping: toNumber(s.shipping),
      discounts: toNumber(s.discounts),
      gross,
    },
    costs: {
      providerCost: toNumber(s.provider_cost),
      gatewayFee: toNumber(s.gateway_fee),
      providerFee: toNumber(s.provider_fee),
      total:
        toNumber(s.provider_cost) +
        toNumber(s.gateway_fee) +
        toNumber(s.provider_fee),
    },
    profit: {
      net: netProfit,
      marginPercent: gross > 0 ? Math.round((netProfit / gross) * 10000) / 100 : 0,
    },
    // Utilidad ganada: la de los pedidos ya entregados.
    earnedProfit: toNumber(s.earned_profit),
    // Efectivo: lo cobrado (en transito) y lo liquidado.
    cash: {
      settled: byPaymentState[PAYMENT_STATE.SETTLED],
      collected: byPaymentState[PAYMENT_STATE.COLLECTED],
      pendingCollection: byPaymentState[PAYMENT_STATE.PENDING_COLLECTION],
      unpaid: byPaymentState[PAYMENT_STATE.UNPAID],
      // Lo que el proveedor ya deposito en el banco (payout con fecha).
      payouts: {
        count: toNumber(payoutRows[0]?.payouts),
        amount: toNumber(payoutRows[0]?.paid_out),
      },
    },
    cod,
    byPaymentState,
    byProvider: providerRows.map((row) => ({
      provider: row.provider,
      orders: toNumber(row.orders),
      gross: toNumber(row.gross),
      providerCost: toNumber(row.provider_cost),
      netProfit: toNumber(row.net_profit),
    })),
    byPaymentMethodCode: methodRows.map((row) => ({
      method: row.method,
      orders: toNumber(row.orders),
      amount: toNumber(row.amount),
      gatewayFee: toNumber(row.gateway_fee),
    })),
  };
};

module.exports = { getAccounting };
