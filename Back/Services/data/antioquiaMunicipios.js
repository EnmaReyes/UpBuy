// Coordenadas del casco urbano de los municipios de Antioquia que pueden
// caer dentro de las bandas de distancia del envio (0-5, 5-10, 10-20 km)
// medidas desde la bodega en Itagui.
//
// Se usan como respaldo cuando el checkout NO comparte la ubicacion GPS del
// cliente: con el nombre del municipio se estima la distancia en linea recta.
// Si un municipio de Antioquia no aparece aqui, se asume que esta a mas de
// 20 km (tarifa "Antioquia · mas de 20 km"), que es el caso de la gran mayoria
// de los 125 municipios del departamento.
//
// Origen: centroides administrativos de OpenStreetMap (Nominatim), ODbL.
// Mantener `nombre` con tildes y mayusculas normales: la busqueda normaliza.
const ANTIOQUIA_MUNICIPIOS = [
  // Valle de Aburra (area metropolitana)
  { nombre: "Itagüí", lat: 6.1724352, lng: -75.6093254 },
  { nombre: "Medellín", lat: 6.2697324, lng: -75.6025597 },
  { nombre: "Bello", lat: 6.334997, lng: -75.5582665 },
  { nombre: "Envigado", lat: 6.1701348, lng: -75.587415 },
  { nombre: "Sabaneta", lat: 6.1515344, lng: -75.6153715 },
  { nombre: "La Estrella", lat: 6.1576781, lng: -75.6433878 },
  { nombre: "Caldas", lat: 6.0918609, lng: -75.6356917 },
  { nombre: "Copacabana", lat: 6.3461047, lng: -75.5080262 },
  { nombre: "Girardota", lat: 6.3773809, lng: -75.4459762 },
  { nombre: "Barbosa", lat: 6.4370185, lng: -75.3313779 },

  // Oriente cercano
  { nombre: "Guarne", lat: 6.2800171, lng: -75.4426875 },
  { nombre: "Rionegro", lat: 6.1536166, lng: -75.3741691 },
  { nombre: "La Ceja", lat: 6.0309532, lng: -75.4316155 },
  { nombre: "El Retiro", lat: 6.0572745, lng: -75.502611 },
  { nombre: "Marinilla", lat: 6.1736417, lng: -75.3346548 },
  { nombre: "El Carmen de Viboral", lat: 6.0833063, lng: -75.3353501 },
  { nombre: "Carmen de Viboral", lat: 6.0833063, lng: -75.3353501 },
  { nombre: "San Vicente Ferrer", lat: 6.2826782, lng: -75.3318244 },
  { nombre: "San Vicente", lat: 6.2826782, lng: -75.3318244 },

  // Suroeste y Occidente cercano
  { nombre: "Amagá", lat: 6.0406977, lng: -75.7030694 },
  { nombre: "Angelópolis", lat: 6.1115405, lng: -75.7102848 },
  { nombre: "San Jerónimo", lat: 6.4427228, lng: -75.727937 },
  { nombre: "Sopetrán", lat: 6.5009582, lng: -75.7424979 },

  // Norte cercano
  { nombre: "Donmatías", lat: 6.4862703, lng: -75.3946313 },
  { nombre: "Santa Rosa de Osos", lat: 6.6453171, lng: -75.4614576 },
];

module.exports = { ANTIOQUIA_MUNICIPIOS };
