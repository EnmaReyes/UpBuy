// Ranking de unidades vendidas de los ultimos N dias.
//
// Lo comparten la seccion "Favoritos de la comunidad" de la Home y el filtro
// `sort=best_sellers` del catalogo publico. Una sola agregacion, sin N+1.
const { sequelize } = require("../../DataBase/models/index.js");
const { FULFILLMENT_STATUS } = require("../../DataBase/models/enums.js");

const COMMUNITY_FAVORITES_WINDOW_DAYS = 90;

const sinceDate = (days) =>
  new Date(Date.now() - Number(days || COMMUNITY_FAVORITES_WINDOW_DAYS) * 86400000);

// Devuelve [{ productId, units }] ordenado de mayor a menor. Los pedidos
// cancelados no cuentan como venta.
const fetchUnitsSold = async ({
  days = COMMUNITY_FAVORITES_WINDOW_DAYS,
  limit = 20,
  productIds,
} = {}) => {
  const since = sinceDate(days);
  const filterProducts =
    Array.isArray(productIds) && productIds.length > 0
      ? `AND oi."productId" IN (:productIds)`
      : "";

  const rows = await sequelize.query(
    `SELECT oi."productId" AS "productId", SUM(oi.quantity)::int AS units
       FROM order_items oi
       JOIN orders o ON o.id = oi."orderId"
      WHERE oi."productType" = 'product'
        AND o."fulfillmentStatus" <> :cancelled
        AND o."createdAt" >= :since
        ${filterProducts}
      GROUP BY oi."productId"
      ORDER BY units DESC`,
    {
      replacements: {
        since,
        cancelled: FULFILLMENT_STATUS.CANCELLED,
        ...(filterProducts ? { productIds } : {}),
      },
      type: sequelize.QueryTypes.SELECT,
    },
  );

  return rows
    .map((row) => ({
      productId: row.productId,
      units: Number(row.units) || 0,
    }))
    .filter((row) => row.units > 0)
    .slice(0, Math.max(Number(limit) || 20, 1));
};

// Expresion de orden para `sort=best_sellers`. Se usa como subconsulta para
// que la paginacion siga siendo correcta. Los dias son una constante del
// codigo: no se interpola entrada del usuario.
const unitsSoldOrderExpression = (days = COMMUNITY_FAVORITES_WINDOW_DAYS) => {
  const windowDays = Math.max(Number(days) || COMMUNITY_FAVORITES_WINDOW_DAYS, 1);
  return `COALESCE((
    SELECT SUM(oi.quantity)
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
     WHERE oi."productId" = "Product"."id"
       AND oi."productType" = 'product'
       AND o."fulfillmentStatus" <> '${FULFILLMENT_STATUS.CANCELLED}'
       AND o."createdAt" >= NOW() - INTERVAL '${windowDays} days'
  ), 0)`;
};

module.exports = {
  COMMUNITY_FAVORITES_WINDOW_DAYS,
  fetchUnitsSold,
  unitsSoldOrderExpression,
};
