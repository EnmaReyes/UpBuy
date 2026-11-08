// Prueba de POST /api/orders/:id/payment a nivel de servicio (sin HTTP).
// Usa el pedido pendiente_pago indicado por argumentos para generar la URL de
// Web Checkout y verifica la firma de integridad por separado.
//
// Uso: node scripts/testCheckout.js <orderId> <userId>

process.chdir(require("path").join(__dirname, ".."));

const crypto = require("crypto");
const { createCheckoutForOrder } = require("../Services/wompi.js");
const { WOMPI_INTEGRITY_SECRET } = require("../config.js");
const { sequelize, Payment } = require("../DataBase/models/index.js");

const [orderId, userId] = process.argv.slice(2);

const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

let referenceCreada = null;

(async () => {
  try {
    if (!orderId || !userId) {
      throw new Error("Faltan argumentos: node scripts/testCheckout.js <orderId> <userId>");
    }

    const result = await createCheckoutForOrder({ orderId, userId });
    referenceCreada = result.reference;
    console.log("Checkout generado:");
    console.log("  reference:", result.reference);
    console.log("  amountInCents:", result.amountInCents);
    console.log("  currency:", result.currency);
    console.log("  env:", result.env);

    // Firma esperada: SHA256(reference + amountInCents + currency + secret)
    const esperada = sha256(
      `${result.reference}${result.amountInCents}${result.currency}${WOMPI_INTEGRITY_SECRET}`,
    );
    const url = new URL(result.url);
    const recibida = url.searchParams.get("signature:integrity");

    console.log("\nFirma de integridad:");
    console.log("  calculada:", esperada);
    console.log("  en la URL:", recibida);
    console.log(recibida === esperada ? "OK   coinciden" : "FAIL no coinciden");

    console.log("\nURL de checkout:");
    console.log(result.url);
  } catch (error) {
    console.error("ERR", error.name, error.status || "", error.message);
    process.exitCode = 1;
  } finally {
    // El intento de pago creado es solo para la prueba: se elimina.
    if (referenceCreada) {
      const n = await Payment.destroy({ where: { reference: referenceCreada } });
      console.log(`\nPago de prueba eliminado: ${n}`);
    }
    await sequelize.close();
  }
})();
