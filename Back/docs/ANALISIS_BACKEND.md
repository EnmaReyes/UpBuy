# Análisis del backend (estado actual)

## 1. Resumen ejecutivo

El backend es **Node 22 + Express 4 + Sequelize 6 + PostgreSQL** (CommonJS),
organizado en capas `Rutas → Controllers → Services → DataBase/models`. Las
reglas de negocio viven en `Services/`; los controladores solo traducen HTTP y
las rutas validan y delegan.

La suite `npm test` cubre **241 casos** (`node --test --test-concurrency=1`) y
pasa completa. Cubre transiciones de estado, efectos COD, gating de perfil,
`netProfit`, idempotencia y firmas de webhooks, catálogo (Venndelo y
MasterShop), MFA admin, campañas, WhatsApp y panel administrativo.

Documentación relacionada:

- [`ESTADOS.md`](ESTADOS.md) — los dos ciclos de estado y sus transiciones.
- [`PROVEEDORES.md`](PROVEEDORES.md) — catálogo Venndelo/MasterShop y pedidos.
- [`SEGURIDAD_ADMIN.md`](SEGURIDAD_ADMIN.md) — MFA, step-up, IP allowlist.
- [`VENNDELO_WALLET_Y_PEDIDOS.md`](VENNDELO_WALLET_Y_PEDIDOS.md) — wallet y
  sincronización de pedidos.

## 2. Estructura

```
Back/
├─ index.js                  # bootstrap, middlewares, rutas, cierre ordenado
├─ config.js                 # env validado (falla rápido en producción)
├─ DataBase/
│  ├─ db.js                  # instancia, pool y SSL para Neon
│  ├─ models/                # modelos, asociaciones y enums
│  ├─ ensureBaseSchema.js    # esquema base (idempotente)
│  ├─ ensureAdminSecuritySchema.js
│  ├─ ensureCampaignSchema.js
│  ├─ ensureCatalogSchema.js
│  ├─ ensureDropshippingSchema.js
│  └─ ensurePanelIndexes.js
├─ Middleware/               # guards de sesión: requireAuth, requireAdminSession, requirePermission
├─ Middlewares/              # errors, rateLimits, requireAdminIp, requireCompleteProfile,
│                            # requireStepUp, requireTrustedOrigin
├─ Rutas/, Controllers/, Services/, Utils/
├─ integrations/suppliers/   # venndelo, mastershop, ...
├─ docs/                     # ESTADOS, PROVEEDORES, SEGURIDAD_ADMIN, este archivo
├─ scripts/                  # bootstrap, verificación y utilidades manuales
└─ test/                     # node:test (241 casos)
```

## 3. Fortalezas (ya aplicadas)

- **Arranque seguro:** `config.js` falla en producción si falta `JWT_SECRET`
  (mínimo 32 caracteres), `FRONTEND_URLS` o el secreto de MFA cuando aplica. En
  desarrollo sin secreto genera uno efímero y avisa.
- **Operación:** `helmet`, `compression`, CORS con origen explícito,
  `trust proxy` según `TRUST_PROXY`, rate limiting por IP/usuario y cierre
  ordenado con `SIGTERM`/`SIGINT` (`server.close()` + `sequelize.close()`).
- **Webhooks:** firma calculada sobre el **cuerpo crudo** (`req.rawBody`), sin
  fallback de secreto; idempotencia por `(provider, eventId)`; el webhook de
  Venndelo responde **503** si falta `VENNDELO_WEBHOOK_SECRET` (fail-closed).
- **Pedidos:** transacciones con bloqueo (`FOR UPDATE`) en creación, pago,
  cancelación y sincronización; la máquina de estados valida cada transición
  (422) y deja historial + auditoría.
- **Inventario:** el stock son **unidades reales**; reserva y descuento usan
  `UPDATE ... WHERE stock >= cantidad` para evitar sobreventa.
- **Fuente de verdad:** los estados crudos del proveedor se mapean a los
  canónicos; `manualOverride` nunca se pisa por auto-sync.
- **Observabilidad:** `Utils/logger.js` centraliza los logs con scope, nivel
  (`LOG_LEVEL`) y redacción de secretos. No hay `console.*` en código de
  producción fuera de `config.js`, el propio logger y los scripts/ensure*.
- **Esquema:** `sequelize.sync()` solo fuera de producción. En producción cada
  `ensure*Schema` es idempotente y usa su propia llave `pg_advisory_lock`.
- **Catálogo:** adaptadores por proveedor en `integrations/suppliers/<slug>/`;
  los servicios de catálogo no cambian al agregar uno nuevo.
- **Errores:** `Utils/HttpError.js` + `Middlewares/errors.js` + `Utils/respond.js`
  no filtran stack, SQL ni nombres de tablas al cliente.

## 4. Riesgos y backlog

### Alta prioridad

1. **Validación de entrada dispersa.** No hay Zod/Joi: cada controlador valida a
   mano. Riesgo de inconsistencias entre rutas.
   → Centralizar con un esquema por ruta (empezar por auth, orders y admin).
2. **N+1 en inventario.** `detectStockConflicts` consulta producto por ítem y
   `reserveOrderStock`/`restoreOrderStock`/`releaseOrderStock` actualizan uno por
   uno. Aceptable para pedidos pequeños, pero escala mal.
   → Operaciones bulk con `Op.in` o `UPDATE ... FROM order_items`.
3. **Esquema sin migraciones versionadas.** `ensure*` es idempotente pero no
   tiene historial ni rollback. Un cambio destructivo exige script manual.
   → Mantener `ensure*` para bootstrap y evaluar migraciones para cambios
   futuros.
4. **SSL con `rejectUnauthorized: false`** (`DataBase/db.js`). Es lo habitual
   con el pooler de Neon, pero desactiva la verificación del certificado.
   → Documentar el motivo o fijar el CA de Neon con `rejectUnauthorized: true`.
5. **Cobertura de rutas.** La suite cubre mucha lógica y varios servicios, pero
   no todas las rutas HTTP de punta a punta.
   → Añadir integración con `supertest` en auth, checkout y admin.

### Media prioridad

6. **Sin request id de correlación.** En Vercel los logs son líneas sueltas; un
   `X-Request-Id` facilitaría seguir una petición entre capas.
   → Middleware que genere/propague el id y lo incluya en el logger.
7. **Crons dependen de `CRON_SECRET`.** Correcto (sin secreto → 401), pero un
   despliegue nuevo sin la variable falla silenciosamente para el operador.
   → Añadir una comprobación de arranque o un aviso en `/health`.
8. **`sequelize.sync()` en desarrollo** puede ocultar diferencias con el esquema
   que aplican los `ensure*` en producción.
   → Probar periódicamente `npm run db:check` contra una base limpia.

### Baja prioridad

9. **Sin TypeScript.** Migración gradual con JSDoc + `// @ts-check` es viable,
   pero no es prioritaria frente a la cobertura de rutas.
10. **Formato de logs.** El logger ya es estructurado; falta unificar la
    retención/consulta en el proveedor de hosting.

## 5. Checklist de hardening

- [x] Validar `JWT_SECRET` en producción al arrancar.
- [x] Cierre ordenado (`SIGTERM`/`SIGINT`).
- [x] `compression` y cabeceras con `helmet`.
- [x] `trust proxy` configurable para rate limit detrás de Vercel.
- [x] Firma de webhooks sobre el cuerpo crudo y fail-closed sin secreto.
- [x] Transacciones con bloqueo en pedidos, pagos y sincronización.
- [x] Inventario por unidades con control de sobreventa.
- [x] Logs estructurados con redacción de secretos.
- [ ] Validación centralizada de entrada (Zod u equivalente).
- [ ] Operaciones bulk en inventario.
- [ ] Migraciones versionadas para cambios de esquema.
- [ ] Revisar `rejectUnauthorized` de SSL y documentarlo.
- [ ] Ampliar cobertura de rutas con `supertest`.
- [ ] Request id en logs.

## 6. Conclusión

La base es sólida y los riesgos críticos de seguridad y consistencia ya están
cubiertos: arranque fail-fast, webhooks verificados e idempotentes, pedidos
transaccionales y estados canónicos. Lo pendiente es incremental: validación
centralizada, eficiencia del inventario y cobertura de rutas. No requiere
reescritura.
