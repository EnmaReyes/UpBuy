# Análisis del backend (Node.js + PostgreSQL + Sequelize)

## 1. Resumen ejecutivo

El backend está bien organizado en capas (Rutas → Controladores → Servicios → DataBase/Models), usa Sequelize con asociaciones centralizadas, transacciones para operaciones críticas y un manejo de errores que oculta detalles internos. Las pruebas existentes (`npm test`) pasan (17/17).

Principales fortalezas: separación de estados (fulfillment vs. payment), snapshots de pedido, idempotencia de webhooks, rate limiting, helmet, health check con reintentos para Neon.

Principales riesgos a vigilar: secreto JWT con valor por defecto débil, ausencia de graceful shutdown, validación manual dispersa, posibles N+1 en bucles, y dependencia de scripts idempotentes en lugar de migraciones formales.

## 2. Estructura

```
Back/
├─ index.js                 # bootstrap Express, DB init con reintentos, middlewares
├─ config.js                # env, dialecto, Wompi, cron, etc.
├─ DataBase/
│  ├─ db.js                 # Sequelize instance, pool, SSL
│  ├─ models/               # modelos + index.js + associations.js
│  ├─ ensurePricing.js      # schema idempotente
│  └─ ensureDropshippingSchema.js
├─ Rutas/, Controllers/, Services/, Middlewares/, Utils/
├─ test/                    # rules.test.js, db.test.js
└─ scripts/                 # migraciones/verificación
```

## 3. Fortalezas (mejores prácticas ya aplicadas)

- Pool pequeño y timeouts cortos para serverless (Vercel/Neon) en `DataBase/db.js`.
- `sequelize.sync()` solo en desarrollo; producción usa esquemas idempotentes.
- Transacciones con `rollback` en `createOrderCore`, `cancelOrder`.
- Control de sobreventa con `UPDATE ... WHERE stock = true` y `affected === 0`.
- Validación de transiciones de estado (422) y efectos COD en `statusMachine.js`.
- Índices declarados en modelos (`orders_*_idx`, etc.).
- Rate limiting por IP/usuario, helmet, CORS con origen explícito.
- Errores internos no se filtran al cliente (`Middlewares/errors.js` + `describeError`).
- Webhooks idempotentes (`beginWebhookEvent`/`finishWebhookEvent`).
- Raw SQL con `replacements` (parametrizado) en `accounting.js`.

## 4. Riesgos y posibles bugs

### Alta prioridad

1. **JWT_SECRET con default débil en desarrollo.** `config.js` usa `process.env.JWT_SECRET || "jwtkey"`. Aunque en producción (Vercel) la variable está configurada, si falta en un entorno nuevo el sistema arranca silenciosamente con un secreto trivial.  
   → Recomendado: fallar el arranque en producción si falta la variable (`if (isProduction && !process.env.JWT_SECRET) throw`), manteniendo el default solo para desarrollo local.

2. **Sin graceful shutdown.** No se cierra `sequelize` ni el servidor ante SIGTERM/SIGINT. En Vercel las funciones son efímeras, pero en local/desarrollo y en cualquier host con contenedor deja conexiones colgadas.  
   → Añadir handlers que llamen `sequelize.close()` y `server.close()`.

3. **SSL hacia Neon con `rejectUnauthorized: false`** (`db.js`). Neon exige SSL y el flag actual desactiva la verificación del certificado (mitiga MITM pero no lo elimina).  
   → Opcional: descargar el CA de Neon y configurar `ssl: { ca: fs.readFileSync(...) }` con `rejectUnauthorized: true`. Si se mantiene `false`, documentar el motivo (compatibilidad con el pooler).

4. **Validación dispersa y manual.** No hay Zod/Joi; cada controlador valida a mano. Riesgo de inconsistencias y bypass.  
   → Centralizar con un middleware de validación (Zod) por ruta.

5. **N+1 en bucles.** `detectStockConflicts` consulta producto por ítem; `releaseOrderStock`/`restoreOrderStock` actualizan uno por uno. Aceptable para pedidos pequeños, pero escala mal.  
   → Usar `Model.update({..}, { where: { id: { [Op.in]: ids } } })` o bulk.":

### Media prioridad

6. **Sin compresión HTTP.** Respuestas JSON grandes (listados) sin gzip.  
   → `app.use(compression())`.

7. **Sin request id / logging estructurado de correlación.** Dificulta depurar en producción.  
   → Middleware que genere `X-Request-Id` y lo incluya en logs.

8. **Esquema gestionado por scripts, no migraciones versionadas.** `ensure*` es idempotente pero no hay rollback ni historial.  
   → Introducir `sequelize-cli` migrations para cambios futuros; mantener ensure* solo para bootstrap.

9. **`express.json()` sin límite explícito.** Default 100kb; verificar que cubra payloads legítimos (imágenes en base64, etc.).  
   → Definir `limit` explícito según necesidad.

10. **Tests solo cubren lógica pura + 3 casos con DB.** Sin cobertura de controladores/rutas.  
    → Añadir tests de integración (supertest) para rutas críticas.

### Baja prioridad

11. **Sin TypeScript.** El skill recomienda TS para prevenir errores en runtime. Migración gradual con JSDoc + `// @ts-check` es viable.
12. **`optionalAuth` ignora tokens inválidos silenciosamente.** Correcto para rutas públicas, pero puede ocultar problemas. Documentar.

## 5. Checklist de hardening recomendado

- [ ] Validar `JWT_SECRET` no vacío en producción al arrancar.
- [ ] Añadir graceful shutdown (SIGTERM/SIGINT).
- [ ] Añadir `compression`.
- [ ] Centralizar validación de entrada con Zod (empezar por auth y orders).
- [ ] Reemplazar bucles N+1 por operaciones bulk.
- [ ] Definir límite explícito de `express.json()`.
- [ ] Añadir request id en logs.
- [ ] Crear migraciones versionadas para cambios de esquema.
- [ ] Ampliar cobertura de tests (rutas críticas con supertest).
- [ ] Revisar `rejectUnauthorized` de SSL y documentar.

## 6. Conclusión

La base es sólida y sigue la mayoría de las mejores prácticas, con producción desplegada en Vercel + Neon. Los cambios sugeridos son incrementales y no requieren reescritura. Priorizar fail-fast del JWT secret y graceful shutdown antes de optimizaciones de rendimiento.
