// Compara cada modelo de Sequelize (Api/DataBase/models/) con la tabla real.
// Sirve para detectar desalineaciones antes de un deploy, ya que en
// produccion sequelize.sync() nunca corre.
//
// Uso (desde Api/):
//   node scripts/checkSchema.js
//
// Sale con codigo 1 si encuentra diferencias.

const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(__dirname, "..", ".env.local"),
  override: true,
});

const models = require("../DataBase/models/index.js");
const { sequelize } = require("../DataBase/db.js");

// Tipos que usan los modelos -> data_type de information_schema
const TYPE_MAP = {
  UUID: "uuid",
  STRING: "character varying",
  TEXT: "text",
  INTEGER: "integer",
  BOOLEAN: "boolean",
  DATE: "timestamp with time zone",
  JSON: "json",
  JSONB: "jsonb",
  BIGINT: "bigint",
  DECIMAL: "numeric",
  CHAR: "character",
};

const run = async () => {
  const [columns] = await sequelize.query(
    `SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public'`,
  );

  const dbColumns = new Map();
  for (const column of columns) {
    if (!dbColumns.has(column.table_name)) dbColumns.set(column.table_name, new Map());
    dbColumns.get(column.table_name).set(column.column_name, column);
  }

  let problems = 0;

  for (const [modelName, model] of Object.entries(sequelize.models)) {
    const table = model.getTableName();
    const tableName = typeof table === "string" ? table : table.tableName;
    const dbCols = dbColumns.get(tableName);
    const issues = [];

    if (!dbCols) {
      console.log(`\n── ${modelName} -> ${tableName}\n   ❌ falta la tabla`);
      problems += 1;
      continue;
    }

    const attrs = model.getAttributes();
    const modelCols = new Set();

    for (const [attrName, attr] of Object.entries(attrs)) {
      const columnName = attr.field || attr.fieldName || attrName;
      modelCols.add(columnName);

      const dbCol = dbCols.get(columnName);
      if (!dbCol) {
        issues.push(`❌ falta la columna ${columnName}`);
        continue;
      }

      const expected = TYPE_MAP[attr.type?.key];
      if (expected && dbCol.data_type !== expected) {
        issues.push(
          `⚠️ ${columnName}: modelo ${attr.type.key} -> base ${dbCol.data_type}`,
        );
      }

      const modelNotNull = attr.allowNull === false;
      const dbNotNull = dbCol.is_nullable === "NO";
      if (modelNotNull !== dbNotNull) {
        issues.push(
          `⚠️ ${columnName}: allowNull=${attr.allowNull} pero la base es ${dbCol.is_nullable}`,
        );
      }
    }

    for (const columnName of dbCols.keys()) {
      if (!modelCols.has(columnName)) {
        issues.push(`⚠️ columna en la base sin modelo: ${columnName}`);
      }
    }

    console.log(`\n── ${modelName} -> ${tableName}`);
    if (issues.length === 0) {
      console.log("   ✅ coincide");
    } else {
      for (const issue of issues) console.log(`   ${issue}`);
      problems += issues.length;
    }
  }

  console.log(
    problems === 0
      ? "\n✅ TODOS LOS MODELOS COINCIDEN CON LAS TABLAS"
      : `\n⚠️ ${problems} diferencia(s) encontradas`,
  );

  return problems;
};

run()
  .then((problems) => {
    process.exitCode = problems === 0 ? 0 : 1;
  })
  .catch((error) => {
    console.error("❌", error.name, error.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());