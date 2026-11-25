// Catalogo de municipios de Venndelo (codigos DANE) empaquetado con el codigo.
//
// Venndelo exige `city_code`/`subdivision_code` DANE y valida que `city_name`
// coincida con su nombre canonico. UpBuy captura ciudad y departamento como
// texto libre, sin codigos. Este modulo traduce ese texto al municipio oficial
// usando el catalogo generado desde `GET /region/cities`.
//
// El archivo `venndelo.cities.json` se regenera con:
//   npm run venndelo:cities
//
// Se guardan solo municipios (codigo DANE terminado en 000). Los barrios y
// veredas del catalogo de Venndelo no son necesarios para cotizar el envio.
const cities = require("./venndelo.cities.json");

// Texto comparable: minusculas, sin tildes, espacios colapsados.
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Quita sufijos que no forman parte del nombre oficial ("Bogota D.C." ->
// "bogota"). Nunca inventa coincidencias: solo limpia la consulta.
const normalizeCityQuery = (value) =>
  normalize(value)
    .replace(/\bd[\s.]*c\b/g, " ")
    .replace(/\bdistrito capital\b/g, " ")
    .replace(/[.,;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const byName = new Map();
for (const city of cities) {
  const key = normalize(city.name);
  if (!key) continue;
  const list = byName.get(key) || [];
  list.push(city);
  byName.set(key, list);
}

// Resuelve una ciudad por nombre (y opcionalmente departamento).
// Devuelve el municipio o null si no hay coincidencia.
const resolveCity = ({ city, department } = {}) => {
  const query = normalizeCityQuery(city);
  if (!query) return null;

  let candidates = byName.get(query) || [];
  if (candidates.length === 0) {
    candidates = byName.get(normalize(city)) || [];
  }
  if (candidates.length === 0) return null;

  if (department) {
    const dept = normalize(department);
    const byDepartment = candidates.filter(
      (item) => normalize(item.subdivision_name) === dept,
    );
    if (byDepartment.length > 0) candidates = byDepartment;
  }

  const active = candidates.filter(
    (item) => String(item.service_status || "").toUpperCase() === "ACTIVE",
  );
  const pool = active.length > 0 ? active : candidates;

  return pool.find((item) => /000$/.test(String(item.code || ""))) || pool[0];
};

module.exports = {
  resolveCity,
  normalizeCityQuery,
  cityCount: cities.length,
};