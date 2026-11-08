// Entry point para Vercel (@vercel/node).
//
// En produccion `index.js` no hace app.listen(): exporta la app de Express,
// que es justamente el handler que Vercel espera. Este archivo solo existe
// para respetar la convencion `api/index.js` y no duplicar la configuracion.
//
// El cron vive en vercel.json:
//   GET /api/cron/sync-providers  ->  Authorization: Bearer ${CRON_SECRET}
//
// La inicializacion de la base (ensurePricingSchema + ensureDropshippingSchema)
// se ejecuta una vez por instancia en el primer request, igual que en local.

module.exports = require("../index.js");
