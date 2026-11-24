// Pruebas del cliente HTTP de MasterShop (SIN red real).
//
// Se reemplaza `global.fetch` por un mock y se verifica:
//   1. La URL y que la UNICA credencial sea el header `ms-api-key`.
//   2. La traduccion de errores del proveedor a nuestra API.
//   3. La lectura de los headers de rate limit.
//   4. Que la llave nunca aparezca en los mensajes de error.
//   5. La paginacion por indice de pagina del catalogo.
process.env.UPBUY_SKIP_DOTENV = "1";

process.env.MASTERSHOP_API_URL = "https://mastershop.test";
process.env.MASTERSHOP_API_KEY = "test-ms-api-key-secreta";
process.env.MASTERSHOP_HTTP_TIMEOUT_MS = "2000";

const test = require("node:test");
const assert = require("node:assert/strict");

const client = require("../integrations/suppliers/mastershop/mastershop.client.js");
const catalog = require("../integrations/suppliers/mastershop/mastershop.catalog.js");

const originalFetch = global.fetch;
const SECRET = "test-ms-api-key-secreta";

// Imita una Response de fetch. Los headers van en minusculas, como los
// entrega `Headers.entries()` en produccion.
const jsonResponse = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { entries: () => Object.entries(headers) },
  text: async () =>
    body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body),
});

const captureFetch = (handler) => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return calls;
};

test.after(() => {
  global.fetch = originalFetch;
});

test("envia la llave en ms-api-key y ninguna otra credencial", async () => {
  const calls = captureFetch(() =>
    jsonResponse(200, { results: [], resultsCount: { totalProducts: 0 } }),
  );

  await client.requestJson("GET", "/api/products", {
    params: { page: 1, limit: 20 },
  });

  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, "https://mastershop.test/api/products?page=1&limit=20");
  assert.equal(options.method, "GET");
  assert.equal(options.headers["ms-api-key"], SECRET);
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.headers.authorization, undefined);
  // No se mandan identificadores de negocio/usuario: los deriva MasterShop.
  assert.deepEqual(
    Object.keys(options.headers).sort(),
    ["Accept", "ms-api-key"],
  );
  // La llave no viaja en la URL.
  assert.ok(!url.includes(SECRET));
});

test("los parametros vacios no se envian", async () => {
  const calls = captureFetch(() => jsonResponse(200, { results: [] }));
  await client.requestJson("GET", "api/products", {
    params: { page: 2, category: "", search: undefined },
  });
  assert.equal(
    calls[0].url,
    "https://mastershop.test/api/products?page=2",
  );
});

test("400 se propaga como 400 (peticion invalida)", async () => {
  captureFetch(() =>
    jsonResponse(400, { data: [], error: "Parametros invalidos", success: false }),
  );

  await assert.rejects(
    () => client.requestJson("GET", "/api/products"),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.upstreamStatus, 400);
      assert.ok(!error.message.includes(SECRET));
      return true;
    },
  );
});

test("401 y 403 se reportan como 502 (configuracion nuestra)", async () => {
  for (const status of [401, 403]) {
    captureFetch(() => jsonResponse(status, { error: "sin permiso" }));
    await assert.rejects(
      () => client.requestJson("GET", "/api/products"),
      (error) => {
        assert.equal(error.status, 502);
        assert.equal(error.upstreamStatus, status);
        assert.ok(!error.message.includes(SECRET));
        return true;
      },
    );
  }
});

test("429 se reporta como 503 e informa el reintento sugerido", async () => {
  captureFetch(() =>
    jsonResponse(
      429,
      { error: "Demasiadas solicitudes, intenta de nuevo más tarde" },
      {
        "ratelimit-limit": "60",
        "ratelimit-remaining": "0",
        "ratelimit-reset": "30",
      },
    ),
  );

  await assert.rejects(
    () => client.requestJson("GET", "/api/products"),
    (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.upstreamStatus, 429);
      assert.equal(error.retryAfterSeconds, 30);
      assert.deepEqual(error.rateLimit, {
        limit: 60,
        remaining: 0,
        resetSeconds: 30,
      });
      return true;
    },
  );
});

test("500 se reporta como 502", async () => {
  captureFetch(() => jsonResponse(500, { error: "boom" }));
  await assert.rejects(
    () => client.requestJson("GET", "/api/products"),
    (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.upstreamStatus, 500);
      return true;
    },
  );
});

test("un 200 con HTML se rechaza como 502", async () => {
  captureFetch(() => jsonResponse(200, "<!doctype html><html></html>"));
  await assert.rejects(
    () => client.requestJson("GET", "/api/products"),
    (error) => {
      assert.equal(error.status, 502);
      assert.match(error.message, /HTML/);
      return true;
    },
  );
});

test("un fallo de red se reporta como 502 sin filtrar la llave", async () => {
  captureFetch(() => {
    throw new Error("ECONNREFUSED");
  });

  await assert.rejects(
    () => client.requestJson("GET", "/api/products"),
    (error) => {
      assert.equal(error.status, 502);
      assert.ok(!error.message.includes(SECRET));
      return true;
    },
  );
});

test("checkAuth usa la llamada mas barata y devuelve el total", async () => {
  const calls = captureFetch(() =>
    jsonResponse(200, {
      results: [{ idProduct: 1 }],
      resultsCount: { totalProducts: 4321 },
    }),
  );

  const result = await client.checkAuth();
  assert.equal(result.ok, true);
  assert.equal(result.totalProducts, 4321);
  assert.match(calls[0].url, /page=1&limit=1/);
});

test("mapStatus traduce los estados del proveedor", () => {
  assert.equal(client.mapStatus(400), 400);
  assert.equal(client.mapStatus(404), 404);
  assert.equal(client.mapStatus(429), 503);
  assert.equal(client.mapStatus(401), 502);
  assert.equal(client.mapStatus(403), 502);
  assert.equal(client.mapStatus(500), 502);
});

test("con url y llave configuradas el cliente queda listo", async () => {
  assert.equal(client.isConfigured(), true);
  assert.equal(client.buildUrl("/api/products"), "https://mastershop.test/api/products");
});

test("la paginacion avanza por indice y se detiene al llegar al total", async () => {
  const pages = [];
  const calls = captureFetch((url) => {
    const page = Number(new URL(url).searchParams.get("page"));
    pages.push(page);
    return jsonResponse(200, {
      results: [
        { idProduct: page * 10 + 1, name: `Producto ${page}-1`, stockTotal: 1 },
        { idProduct: page * 10 + 2, name: `Producto ${page}-2`, stockTotal: 1 },
      ],
      resultsCount: { totalProducts: 4 },
    });
  });

  const seen = [];
  const summary = await catalog.iteratePages(
    null,
    { pageSize: 2 },
    (chunk) => {
      seen.push(...chunk.items.map((item) => item.idProduct));
    },
  );

  assert.deepEqual(pages, [1, 2]);
  assert.equal(summary.pages, 2);
  assert.equal(summary.received, 4);
  assert.deepEqual(seen, [11, 12, 21, 22]);
  assert.equal(calls.length, 2);
});

test("una pagina incompleta termina la iteracion", async () => {
  const calls = captureFetch(() =>
    jsonResponse(200, {
      results: [{ idProduct: 1, name: "Uno" }],
      resultsCount: { totalProducts: 99 },
    }),
  );

  const summary = await catalog.iteratePages(null, { pageSize: 50 });
  assert.equal(calls.length, 1);
  assert.equal(summary.pages, 1);
  assert.equal(summary.received, 1);
});

test("getProduct valida el id antes de llamar al proveedor", async () => {
  const calls = captureFetch(() => jsonResponse(200, { results: [] }));

  await assert.rejects(
    () => catalog.getProduct(null, "abc"),
    (error) => {
      assert.equal(error.status, 400);
      return true;
    },
  );
  assert.equal(calls.length, 0);
});

test("getProduct devuelve el producto normalizado", async () => {
  const calls = captureFetch(() =>
    jsonResponse(200, {
      results: [
        {
          idProduct: 55,
          name: "Lampara",
          basePrice: 30000,
          baseCurrencyPrice: "COP",
          stockTotal: 3,
          urlImageProduct: "https://cdn.mastershop.test/lampara.jpg",
        },
      ],
    }),
  );

  const product = await catalog.getProduct(null, "55");
  assert.equal(product.externalId, "55");
  assert.equal(product.name, "Lampara");
  assert.equal(product.totalQuantity, 3);
  assert.equal(product.assets[0].externalAssetId, "img-1");
  // El detalle SIEMPRE pide las variaciones completas (antes se omitia el
  // parametro y MasterShop podia recortarlas).
  assert.match(calls[0].url, /\/api\/products\/55\?includeAllVariations=true$/);
});

test("getProduct puede pedir el detalle sin variaciones", async () => {
  const calls = captureFetch(() => jsonResponse(200, { results: [] }));

  await catalog
    .getProduct(null, "55", { includeAllVariations: false })
    .catch(() => null);

  assert.match(calls[0].url, /includeAllVariations=false$/);
});

test("getProduct sin resultado responde 404", async () => {
  captureFetch(() => jsonResponse(200, { results: [] }));
  await assert.rejects(
    () => catalog.getProduct(null, "55"),
    (error) => {
      assert.equal(error.status, 404);
      return true;
    },
  );
});

test("el tamano de pagina se recorta al tope documentado de 50", async () => {
  const calls = captureFetch(() =>
    jsonResponse(200, { results: [], resultsCount: { totalProducts: 0 } }),
  );

  await catalog.listPage(null, { pageSize: 500 });
  assert.match(calls[0].url, /limit=50/);
});
