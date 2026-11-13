// Resumen del tablero administrativo (ADM-1).
//
// Compone en una sola llamada lo que el panel necesita al entrar: stats,
// ventas del periodo, contabilidad del mes, ultimas compras y estado de los
// proveedores. Evita cuatro waterfalls desde el navegador.
//
// No agrega reglas de negocio nuevas: reutiliza los servicios que ya usan las
// rutas del panel (adminOrders, accounting y providers).

const {
  orderStats,
  salesByPeriod,
  listOrdersAdmin,
} = require("./adminOrders.js");
const { getAccounting } = require("./accounting.js");
const { listProviders } = require("./providers/index.js");
const { BOGOTA_OFFSET_MS } = require("../Utils/dates.js");

const pad = (value) => String(value).padStart(2, "0");

// Rango del mes en curso, expresado como dias de Bogota (YYYY-MM-DD), que es
// lo que `getAccounting` espera. `now` es inyectable para las pruebas.
const monthRangeBogota = (now = new Date()) => {
  const bogota = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  const year = bogota.getUTCFullYear();
  const month = bogota.getUTCMonth() + 1;
  const day = bogota.getUTCDate();

  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(day)}`,
  };
};

const getDashboardSummary = async ({ periodo = "mes", recentLimit = 5 } = {}) => {
  const range = monthRangeBogota();

  const [stats, sales, accounting, recent, providers] = await Promise.all([
    orderStats(),
    salesByPeriod({ periodo }),
    getAccounting(range),
    listOrdersAdmin({ limit: recentLimit }),
    Promise.resolve(listProviders()),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    period: {
      sales: periodo,
      accounting: range,
    },
    stats,
    sales,
    accounting,
    recentOrders: recent.orders,
    providers,
  };
};

module.exports = {
  monthRangeBogota,
  getDashboardSummary,
};
