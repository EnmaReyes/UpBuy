const express = require("express");

const authRoutes = require("./Rutas/auth.js");
const userRoutes = require("./Rutas/user.js");
const usersRoutes = require("./Rutas/users.js");
const notificationsRoutes = require("./Rutas/notifications.js");
const ordersRoutes = require("./Rutas/orders.js");
const adminOrdersRoutes = require("./Rutas/adminOrders.js");
const adminUsersRoutes = require("./Rutas/adminUsers.js");
const paymentsRoutes = require("./Rutas/payments.js");
const webhooksRoutes = require("./Rutas/webhooks.js");
const cronRoutes = require("./Rutas/cron.js");
const productsRoutes = require("./Rutas/products.js");
const categoriesRoutes = require("./Rutas/categories.js");
const adminProductsRoutes = require("./Rutas/adminProducts.js");
const adminCategoriesRoutes = require("./Rutas/adminCategories.js");
const suppliersRoutes = require("./Rutas/suppliers/index.js");

const { sequelize, databaseHost } = require("./DataBase/db.js");
const { ensureBaseSchema } = require("./DataBase/ensureBaseSchema.js");
const {
  ensureCatalogSchema,
} = require("./DataBase/ensureCatalogSchema.js");
const {
  ensureDropshippingSchema,
} = require("./DataBase/ensureDropshippingSchema.js");

// Carga todos los modelos y asociaciones antes de cualquier consulta.
require("./DataBase/models/index.js");

const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const compression = require("compression");
const { FRONTEND_URL, TRUST_PROXY } = require("./config.js");
const { globalLimiter } = require("./Middlewares/rateLimits.js");
const { notFound, errorHandler } = require("./Middlewares/errors.js");

const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const debugDb = process.env.DB_DEBUG === "true";

// Reintentos de conexion inicial. Neon tarda unos segundos en despertar tras
// scale-to-zero, pero cada intento debe ser corto: en Vercel la funcion se
// termina antes de que valga la pena esperar mas.
const CONNECT_ATTEMPTS = Math.max(
  1,
  Number(process.env.DB_CONNECT_ATTEMPTS) || 3,
);
const RETRY_BASE_MS = 500;
// Tras un fallo, no volver a golpear la base en cada request durante un rato.
const RETRY_COOLDOWN_MS = 3000;

const app = express();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectWithRetry = async () => {
  let lastError = null;

  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
    try {
      await sequelize.authenticate();
      return;
    } catch (error) {
      lastError = error;
      console.error(
        `⚠️ Conexión a la base falló (intento ${attempt}/${CONNECT_ATTEMPTS}): ${error.name}: ${error.message}`,
      );

      if (attempt < CONNECT_ATTEMPTS) {
        await sleep(RETRY_BASE_MS * attempt);
      }
    }
  }

  throw lastError;
};

// Autenticacion + esquema. En produccion NO se usa sequelize.sync(): el
// esquema se aplica solo con ensureCatalogSchema() y
// ensureDropshippingSchema(), que son idempotentes y no hacen nada cuando
// ya esta todo al dia.
const initializeDatabase = async () => {
  await connectWithRetry();
  console.log(`✅ Conexión a la base establecida (${databaseHost})`);

  if (!isProduction) {
    await sequelize.sync();
  }

  // Tablas base (usuarios, orders, order_items, ...). En produccion
  // sequelize.sync() no corre, asi que sin este paso una base nueva no tenia
  // donde aplicar los ensure* (que solo hacen ALTER/CREATE de lo nuevo).
  await ensureBaseSchema();

  // Catalogo: productos, categorias, imagenes y catalogo de proveedores.
  // Tambien retira el esquema viejo (articulos / price_variants) si esta vacio.
  await ensureCatalogSchema();

  // Dropshipping: estados canonicos, proveedores de pedidos, contabilidad y
  // auditoria.
  await ensureDropshippingSchema();

  console.log("✅ Base de datos inicializada");
};

// Estado de inicializacion de ESTA instancia.
//
// Importante: si la inicializacion falla, el estado se descarta para que el
// siguiente request lo vuelva a intentar. Antes se guardaba la promesa
// rechazada y la instancia devolvia 503 para siempre, incluso despues de que
// Neon volviera a estar disponible. Eso es lo que hacia parecer que "la
// conexion no funcionaba" aunque la base estuviera bien.
let dbReady = null;
let lastDbError = null;
let retryAfter = 0;

const getDbReady = () => {
  if (dbReady) return dbReady;

  // Fallo reciente: responder rapido en lugar de encadenar timeouts.
  if (lastDbError && Date.now() < retryAfter) {
    return Promise.reject(lastDbError);
  }

  dbReady = initializeDatabase()
    .then(() => {
      lastDbError = null;
      retryAfter = 0;
      return true;
    })
    .catch((error) => {
      lastDbError = error;
      retryAfter = Date.now() + RETRY_COOLDOWN_MS;
      dbReady = null;
      throw error;
    });

  return dbReady;
};

// Middlewares
//
// Detras del proxy de Vercel la conexion llega desde el proxy: sin trust proxy
// el rate limit veria una sola IP para todos y req.ip seria inutil.
app.set("trust proxy", TRUST_PROXY);
app.disable("x-powered-by");

// Cabeceras de seguridad. La API no sirve HTML, por eso se desactiva la CSP
// (solo protege documentos) y se permite que el frontend cargue recursos.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
  }),
);

app.use(compression());

app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    credentials: true,
  }),
);

app.use(cookieParser());

// Techo general de peticiones por IP (ver Middlewares/rateLimits.js).
app.use(globalLimiter);

// Ruta principal. No toca la base: sirve para comprobar que la funcion
// arranco (si esto responde y /api/* da 503, el problema es la base).
app.get("/", (req, res) => {
  res.json({
    message: "UPBUY API funcionando correctamente 🚀",
  });
});

// Diagnostico de la base. Con DB_DEBUG=true incluye el mensaje real del error.
app.get("/health", async (req, res) => {
  const started = Date.now();

  try {
    await getDbReady();
    const [rows] = await sequelize.query("SELECT 1 AS ok");

    res.json({
      ok: Boolean(rows?.[0]?.ok),
      db: "up",
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      db: "down",
      latencyMs: Date.now() - started,
      error: {
        name: error.name,
        ...(debugDb && { message: error.message }),
      },
    });
  }
});

// Verifica que la base este inicializada antes de atender las rutas de datos.
app.use(async (req, res, next) => {
  try {
    await getDbReady();
    next();
  } catch (error) {
    console.error("❌ Base de datos no disponible:", error.message);
    res.status(503).json({
      message: "Base de datos temporalmente no disponible",
    });
  }
});

// Rutas
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
// API canonica del comprador: /api/users/me (+ direcciones).
app.use("/api/users", usersRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/orders", ordersRoutes);
// Catalogo publico: productos publicados y categorias activas.
app.use("/api/products", productsRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/admin/orders", adminOrdersRoutes);
app.use("/api/admin/users", adminUsersRoutes);
// Catalogo administrativo y proveedores.
app.use("/api/admin/products", adminProductsRoutes);
app.use("/api/admin/categories", adminCategoriesRoutes);
app.use("/api/admin/suppliers", suppliersRoutes);
app.use("/api/payments", paymentsRoutes);
// Webhooks canonicos: /api/webhooks/wompi y /api/webhooks/vendelo.
app.use("/api/webhooks", webhooksRoutes);
// Tareas periodicas: /api/cron/sync-providers (Bearer CRON_SECRET).
app.use("/api/cron", cronRoutes);

// Red de seguridad: ruta inexistente y errores no controlados. Va al final,
// despues de todas las rutas (ver Middlewares/errors.js).
app.use(notFound);
app.use(errorHandler);

// Servidor local.
// En Vercel, la aplicacion se exporta sin app.listen().
let server = null;
if (!isProduction) {
  getDbReady()
    .then(() => {
      server = app.listen(port, () => {
        console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
      });
    })
    .catch((error) => {
      console.error("❌ No se pudo iniciar el servidor:", error.message);
      process.exit(1);
    });
}

// Cierre ordenado: libera conexiones y el servidor HTTP.
const gracefulShutdown = async (signal) => {
  console.log(`${signal} recibido, cerrando ordenadamente...`);
  try {
    if (server) server.close();
    await sequelize.close();
    console.log("✅ Conexiones cerradas");
  } catch (error) {
    console.error("❌ Error al cerrar:", error.message);
  } finally {
    process.exit(0);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

module.exports = app;
