const { ShippingRate } = require("../DataBase/models/index.js");
const { DELIVERY_DAYS } = require("../DataBase/models/enums.js");
const { WAREHOUSE_LAT, WAREHOUSE_LNG } = require("../config.js");
const {
  ANTIOQUIA_MUNICIPIOS,
} = require("./data/antioquiaMunicipios.js");
const HttpError = require("../Utils/HttpError.js");

// Zonas de envio.
//  - antioquia: rango por distancia (km) desde la bodega en Itagui.
//  - nacional:  tarifa plana para el resto del pais.
//  - medellin:  esquema anterior (bandas solo para Medellin). Ya no se genera,
//               se conserva por compatibilidad con pedidos historicos.
const ZONES = ["medellin", "antioquia", "nacional"];

// Plazo prometido al comprador (dias habiles) segun la zona de envio.
// Antioquia = 3 dias; resto del pais = 10. Se guarda como snapshot en el
// pedido al crearlo.
const deliveryDaysForZone = (zone) =>
  zone === "medellin" || zone === "antioquia"
    ? DELIVERY_DAYS.ANTIOQUIA
    : DELIVERY_DAYS.NACIONAL;

// Normaliza texto para comparar sin tildes ni mayusculas: "Medellín" -> "medellin"
const normalize = (value) =>
  String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Indice nombre-normalizado -> coordenadas del casco urbano. Se construye una
// sola vez al cargar el modulo.
const MUNICIPIO_COORDS = new Map(
  ANTIOQUIA_MUNICIPIOS.map((m) => [
    normalize(m.nombre),
    { lat: m.lat, lng: m.lng },
  ]),
);

// Coordenadas de un municipio a partir del texto que escribe el cliente.
// Primero busca coincidencia exacta; si no, una coincidencia parcial (por
// ejemplo "san vicente" -> "San Vicente Ferrer"). Devuelve null si no lo
// encuentra (municipio lejano): el cotizador caera en la tarifa por defecto.
const coordsForCity = (city) => {
  const key = normalize(city);
  if (!key) return null;

  const exact = MUNICIPIO_COORDS.get(key);
  if (exact) return exact;

  // Coincidencia parcial solo para textos razonables ("san vicente" ->
  // "San Vicente Ferrer"), evitando fragmentos cortos que generen falsos
  // positivos ("la" -> "La Estrella").
  if (key.length < 4) return null;

  for (const [name, coords] of MUNICIPIO_COORDS) {
    if (key.includes(name) || name.includes(key)) return coords;
  }

  return null;
};

// Zona segun el departamento:
//  - Antioquia -> rangos por distancia desde la bodega en Itagui
//  - resto del pais -> tarifa plana nacional
const resolveZone = ({ department }) => {
  const dept = normalize(department);
  return dept.includes("antioquia") ? "antioquia" : "nacional";
};

// Distancia en linea recta (haversine) entre el punto de despacho y el cliente
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const isValidCoord = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

// Elige la tarifa aplicable.
// Orden de preferencia para ubicar al cliente:
//   1. Coordenadas GPS que envie el checkout (mas exactas).
//   2. Coordenadas del municipio (tabla ANTIOQUIA_MUNICIPIOS) para Antioquia.
//   3. Tarifa marcada como isDefault (municipios lejanos / sin ubicacion).
const quoteShipping = async ({
  department,
  city,
  lat,
  lng,
  transaction,
} = {}) => {
  if (!department || !city) {
    throw new HttpError(400, "Departamento y ciudad son obligatorios");
  }

  const zone = resolveZone({ department, city });

  const rates = await ShippingRate.findAll({
    where: { zone, active: true },
    order: [
      ["isDefault", "DESC"],
      ["minKm", "ASC"],
    ],
    ...(transaction ? { transaction } : {}),
  });

  if (rates.length === 0) {
    throw new HttpError(503, "No hay tarifas de envío configuradas");
  }

  let coords = null;
  if (isValidCoord(lat) && isValidCoord(lng)) {
    coords = { lat: Number(lat), lng: Number(lng) };
  } else if (zone === "antioquia") {
    coords = coordsForCity(city);
  }

  let distanceKm = null;
  let rate = null;

  if (coords) {
    distanceKm = haversineKm(
      WAREHOUSE_LAT,
      WAREHOUSE_LNG,
      coords.lat,
      coords.lng,
    );

    rate = rates.find((r) => {
      const min = r.minKm === null ? null : Number(r.minKm);
      const max = r.maxKm === null ? null : Number(r.maxKm);
      const okMin = min === null || distanceKm >= min;
      const okMax = max === null || distanceKm < max;
      return okMin && okMax;
    });
  }

  if (!rate) {
    rate = rates.find((r) => r.isDefault) || rates[0];
  }

  return {
    zone,
    rateId: rate.id,
    label: rate.label,
    cost: Number(rate.price),
    distanceKm:
      distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
  };
};

// Listado publico (checkout) agrupado por zona
const listShippingRates = async () => {
  const rates = await ShippingRate.findAll({
    where: { active: true },
    order: [
      ["zone", "ASC"],
      ["minKm", "ASC"],
    ],
  });

  return rates.map((rate) => ({
    id: rate.id,
    zone: rate.zone,
    label: rate.label,
    minKm: rate.minKm === null ? null : Number(rate.minKm),
    maxKm: rate.maxKm === null ? null : Number(rate.maxKm),
    price: Number(rate.price),
    isDefault: rate.isDefault,
  }));
};

module.exports = {
  ZONES,
  normalize,
  resolveZone,
  coordsForCity,
  haversineKm,
  deliveryDaysForZone,
  quoteShipping,
  listShippingRates,
};
