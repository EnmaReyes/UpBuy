// Verificacion temporal de la UI de ADM-3 con un admin real.
const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const bcrypt = require("bcryptjs");
const { Usuarios } = require("../DataBase/models/index.js");

const run = async () => {
  const email = `adm3ui${Date.now()}@test.local`;
  await Usuarios.create({
    username: `adm3ui${Date.now()}`,
    email,
    password: bcrypt.hashSync("Prueba1234!", 8),
    name: "Ana",
    lastName: "Panel",
    role: "admin",
    admin: true,
    mfaEnabled: false,
  });
  console.log(email);
  await require("../DataBase/db.js").sequelize.close();
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
