// Regenera el catalogo de municipios de Venndelo (`venndelo.cities.json`).
//
// Uso (desde Back/):
//   npm run venndelo:cities
//
// Consulta GET /region/cities (paginado, 500 por pagina) y guarda solo los
// municipios (codigo DANE terminado en 000), deduplicados por nombre +
// departamento. El resultado se usa para resolver la ciudad de un pedido sin
// hacer llamadas de red en tiempo de compra.
const fs = require("fs");
const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const { sequelize, Supplier } = require("../DataBase/models/index.js");
const {
  adminJson,
} = require("../integrations/suppliers/venndelo/venndelo.client.js");

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const run = async () => {
  const supplier = await Supplier.findOne({ where: { slug: "venndelo" } });
  if (!supplier) throw new Error("No existe el proveedor 'venndelo'");

  let pageToken = "";
  const all = [];
  for (let page = 0; page < 60; page += 1) {
    const data = await adminJson(supplier, "GET", "/region/cities", {
      params: { page_token: pageToken, page_size: 500 },
    });
    all.push(...(Array.isArray(data.items) ? data.items : []));
    pageToken = data.next_page_token || "";
    if (!pageToken) break;
  }

  const seen = new Set();
  const cities = [];
  for (const city of all) {
    const code = String(city.code || "").trim();
    // Solo municipios: los barrios/veredas no se usan para cotizar envio.
    if (!/000$/.test(code)) continue;
    const name = String(city.name || "").trim();
    if (!name) continue;

    const key = `${normalize(name)}|${normalize(city.subdivision_name)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    cities.push({
      code,
      name,
      subdivision_code: String(city.subdivision_code || "").trim(),
      subdivision_name: String(city.subdivision_name || "").trim(),
      service_status: String(city.service_status || "ACTIVE").toUpperCase(),
      ...(city.service_unavailable_message
        ? {
            service_unavailable_message: String(
              city.service_unavailable_message,
            ),
          }
        : {}),
    });
  }

  cities.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const target = path.join(
    __dirname,
    "..",
    "integrations",
    "suppliers",
    "venndelo",
    "venndelo.cities.json",
  );
  fs.writeFileSync(target, `${JSON.stringify(cities, null, 2)}\n`, "utf8");

  console.log(
    `✅ Catálogo actualizado: ${cities.length} municipios (de ${all.length} ciudades) en ${target}`,
  );
};

run()
  .catch((error) => {
    console.error(
      "❌",
      error.providerStatus ? `HTTP ${error.providerStatus}` : "",
      error.message,
    );
    if (error.providerBody) console.error(JSON.stringify(error.providerBody));
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());