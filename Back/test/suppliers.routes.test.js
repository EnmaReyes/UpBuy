// Pruebas de proteccion de las rutas administrativas (sin supertest).
//
// Se invoca el router de Express directamente con una peticion falsa sin
// cookie de sesion y se verifica que responda 401 antes de tocar la base.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const suppliersRoutes = require("../Rutas/suppliers/index.js");
const adminProductsRoutes = require("../Rutas/adminProducts.js");
const adminCategoriesRoutes = require("../Rutas/adminCategories.js");
const cronRoutes = require("../Rutas/cron.js");

const callRouter = (router, { method = "GET", url = "/", headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      originalUrl: url,
      headers,
      cookies: {},
      query: {},
      body: {},
      ip: "127.0.0.1",
      get: (name) => headers[String(name).toLowerCase()],
    };

    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: statusCode, body });
        return this;
      },
      send(body) {
        resolve({ status: statusCode, body });
        return this;
      },
      setHeader() {},
      end() {
        resolve({ status: statusCode, body: null });
      },
    };

    try {
      router(req, res, (error) => {
        if (error) reject(error);
        else resolve({ status: statusCode, body: null });
      });
    } catch (error) {
      reject(error);
    }
  });

test("las rutas de proveedores exigen sesión", async () => {
  const response = await callRouter(suppliersRoutes, {
    url: "/venndelo/status",
  });
  assert.equal(response.status, 401);
});

test("la sincronización manual exige sesión", async () => {
  const response = await callRouter(suppliersRoutes, {
    method: "POST",
    url: "/venndelo/sync",
  });
  assert.equal(response.status, 401);
});

test("publicar un producto exige sesión", async () => {
  const response = await callRouter(suppliersRoutes, {
    method: "POST",
    url: "/venndelo/products/abc/publish",
  });
  assert.equal(response.status, 401);
});

test("el catálogo administrativo exige sesión", async () => {
  const products = await callRouter(adminProductsRoutes, { url: "/" });
  const categories = await callRouter(adminCategoriesRoutes, { url: "/" });
  assert.equal(products.status, 401);
  assert.equal(categories.status, 401);
});

test("el cron de catálogo exige el Bearer CRON_SECRET", async () => {
  const response = await callRouter(cronRoutes, { url: "/sync-catalog" });
  assert.equal(response.status, 401);
});