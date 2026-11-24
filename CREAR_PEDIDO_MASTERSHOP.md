Integración: pago Wompi aprobado → creación automática de pedido en Mastershop
Eres un ingeniero backend senior. Trabajas sobre un e-commerce propio en Node.js + Express + PostgreSQL que ya tiene una integración con Mastershop (hoy solo lectura: catálogo de productos y consulta de estados de pedido) y un checkout con Wompi como pasarela.

Objetivo único de esta tarea: cuando una transacción de Wompi quede en APPROVED, crear automáticamente el pedido correspondiente en Mastershop vía su API pública, sin intervención manual.

Fuera de alcance (no lo implementes): reembolsos, anulaciones, conciliación de billetera, retiros, sincronización de catálogo hacia Mastershop, cambios de UI/checkout, migración de la pasarela.

0. Reglas de trabajo (obligatorias)
   Primero leer, después proponer, después escribir código. No generes archivos nuevos ni refactorices hasta terminar la Fase 0 y recibir mi aprobación del plan.
   No inventes endpoints, campos ni comportamientos. Todo lo que uses de Mastershop o Wompi debe estar respaldado por la sección Anexo A de este documento o por el código existente del repo. Si algo falta, pregúntame o márcalo como TODO: verificar con api@mastershop.com.
   Reutiliza lo que ya existe: cliente HTTP, manejo de errores, logger, configuración, migraciones, patrón de rutas y estilo del proyecto. Si ya hay un módulo mastershop, extiéndelo; no crees un segundo cliente paralelo.
   No toques código no relacionado, ni reformatees archivos completos, ni cambies dependencias sin justificarlo.
   Una fase = una rama/PR pequeño y revisable. Al cerrar cada fase: resume qué cambió, qué probaste y qué quedó pendiente.
   Nunca escribas secretos en el repo. Solo variables de entorno; actualiza .env.example con nombres y comentarios, jamás con valores.
   Migraciones: solo aditivas, reversibles y con IF NOT EXISTS. No borres ni renombres columnas existentes.
   Si una decisión afecta dinero, stock o datos del cliente y no está clara: detente y pregunta. No asumas.
   Todo el código, comentarios y documentación en español.
   Al final de cada fase ejecuta lint + tests existentes y reporta el resultado real (no "debería funcionar").
   0.bis Optimización de tokens (obligatoria)
   Aplícala en todas las fases para no desperdiciar contexto:

Lee archivos por partes: usa búsquedas con grep/find y lecturas con offset/limit; nunca leas un archivo completo si solo necesitas una función o un bloque. No releas un archivo que ya leíste salvo que lo hayas modificado.
Resume, no pegues: en el documento de auditoría y en los resúmenes de fase, cita archivo:ruta:línea en lugar de volcar bloques de código. Máximo 10 líneas de código citado por hallazgo.
Una sola pasada de investigación: agrupa las búsquedas (una pasada por tema: Mastershop, Wompi, migraciones, tests) y acumula los hallazgos antes de escribir. No iteres busqueda→escritura→búsqueda.
Salidas de comando acotadas: al correr scripts o tests, usa flags de salida resumida (--reporter=dot, tail) y redirige logs largos a archivo; reporta el resultado, no el log completo.
No regeneres entregables: si un archivo o script falla, edítalo en el punto exacto; nunca reescribas todo el documento o script desde cero por un cambio puntual.
Delegación selectiva: solo usa subagentes para búsquedas amplias e independientes; para un dato puntual búscalo tú directamente. Nunca lances más de 2 en paralelo.

1. Fase 0 — Auditoría del backend actual (sin escribir código de negocio)
   Investiga el repo y responde por escrito. Entrega docs/auditoria-mastershop.md con:

1.1 Inventario de lo existente
¿Dónde vive la integración actual con Mastershop? Lista archivos, módulos, rutas y funciones.
¿Cómo se autentica hoy contra Mastershop? ¿Existe ya un cliente HTTP con ms-api-key? ¿Se lee de process.env o de base de datos (multi-negocio)?
¿Cómo se obtienen y guardan los productos/variantes de Mastershop? ¿Hay tablas de mapeo de SKU? ¿Qué columnas tienen?
¿Cómo se consultan hoy los estados de pedido? ¿Hay webhooks de Mastershop ya registrados? ¿Se validan firmas/origen?
¿Existe ya algo de Wompi en el repo (checkout, webhook, firmas, tablas de transacciones)? ¿Dónde?
¿Qué ORM/query builder y qué runner de migraciones se usan? ¿Hay patrón de repositorios/servicios?
¿Hay cola/worker (BullMQ, pg-boss, cron, tabla de outbox)? ¿Cómo se ejecuta trabajo asíncrono hoy?
¿Qué logger, qué manejo de errores y qué formato de respuesta HTTP usan las rutas existentes?
¿Cómo se maneja la idempotencia en cualquier flujo existente (constraints únicos, tablas de eventos)?
¿Hay suite de tests y cómo se corren? ¿Existe algún mock/stub HTTP?
1.2 Llamada de prueba para verificar el esquema real de variantes
Además de leer el repo, haz una llamada de prueba real a la API de Mastershop para confirmar el esquema de variantes antes de diseñar las tablas de mapeo de la Fase 1:

Usa la ms-api-key disponible (variable de entorno, nunca la escribas en el repo ni en el documento).
GET /api/products?page=1&limit=5 → registra la forma real del objeto de producto (campos, nombres exactos, tipos).
Elige al menos un producto que tenga variaciones y llama GET /api/products/:id?includeAllVariations=true y también con includeAllVariations=false; documenta la diferencia real entre ambas respuestas.
Entrega en el documento, sección 1.2: la estructura exacta (campos y tipos) de variation tal como la devuelve la API — especialmente cómo llegan los atributos (talla/color), sku, stock, price y el id_variant — con un ejemplo real (redactado) por producto. Si la llave de datos es de solo lectura o la llamada falla, documéntalo y márcalo TODO: verificar con api@mastershop.com.
Confronta ese esquema real con las columnas de las tablas de mapeo propuestas en la Fase 1 y anota cualquier campo faltante o con otro nombre.
Esto es una operación de solo lectura y no cuenta como "escribir código de negocio".

1.3 Diagnóstico (esto es lo importante)
Qué se puede reutilizar tal cual, qué hay que extender y qué hay que crear.
Riesgos concretos del código actual para este flujo: falta de transacciones, float en montos, ausencia de unique constraints, webhooks síncronos, falta de timeouts, secretos en el repo.
Preguntas abiertas que necesitas que yo responda antes de la Fase 2 (máximo 8, concretas y con opciones).
Propuesta de arquitectura en 1 página: módulos, tablas nuevas, flujo del evento, puntos de fallo y cómo se reintenta. Incluye un diagrama ASCII.
Detente aquí y espera mi aprobación explícita del documento antes de continuar.

Criterio de aceptación F0: el documento responde todas las preguntas de 1.1 con rutas de archivo reales, incluye la verificación real del esquema de variantes (sección 1.2), propone un plan por fases coherente con el código existente y no modifica ningún archivo de src/.

2. Fase 1 — Modelo de datos y mapeo de productos/variantes
   Objetivo: poder resolver, para cada ítem del carrito, el id_product + id_variant reales de Mastershop, incluyendo talla/color/atributos.

Tablas mínimas (ajusta nombres al estilo del repo):

mastershop_product_map: id, ms_id_product (int, único), sku_base, name, active, last_synced_at, raw_json (jsonb).
mastershop_variant_map: id, ms_id_product (FK), ms_id_variant (int), sku (único), attributes (jsonb: talla, color, etc. tal como los devuelve Mastershop), stock, price, active, raw_json, last_synced_at. Unique (ms_id_product, ms_id_variant).
mastershop_attr_alias (o campo equivalente): normalización de atributos entre tu catálogo y Mastershop ("Talla"/"talla"/"size", "Azul"/"BLUE"/"azul marino"), con dirección de mapeo explícita.
Constraint de integridad: un SKU de tu tienda no puede apuntar a dos variantes de Mastershop (unique en tu variant_id local).
Tareas:

Migraciones aditivas.
Script/comando de sincronización que lea GET /api/products y, por cada producto, GET /api/products/:id?includeAllVariations=true, y haga upsert de productos y variantes guardando attributes y raw_json.
Reporte de sincronización: productos sin mapeo, variantes duplicadas por SKU, variantes sin stock, atributos no reconocidos.
Vista o query de diagnóstico: ítems de pedidos pagados que no pueden resolverse a id_variant.
Criterio de aceptación F1: correr la sincronización dos veces seguidas deja la base idéntica (idempotente); el reporte lista los huecos de mapeo reales de mi catálogo; ninguna migración rompe datos existentes.

3. Fase 2 — Cliente de creación de pedidos (Mastershop)
   Módulo mastershop/orders con una función pura + un cliente HTTP:

js
buildOrderPayload(input) -> { payload, errors[] } // pura, testeable, sin I/O
createOrder(payload) -> { ok, idOrder, status, raw, retryable }
Requisitos:

Header ms-api-key desde configuración; Content-Type: application/json; Accept: application/json.
Timeout explícito y AbortController.
Mapeo de errores (ver Anexo A): 400 → error de validación con el detalle de data[] (path + message); 401/403 → error de configuración, no reintentar, alertar; 429 → reintentar respetando RateLimit-Reset; 500 con "Código 409 - La orden ya existe" → tratar como éxito idempotente; otros 500 → reintentar con backoff exponencial (máx. 3, con jitter).
Validaciones previas en buildOrderPayload (fallar antes de llamar a la API):
total = Σ(price × quantity) + Σ(additional_charge.value) calculado con decimal exacto (usa numeric/decimal.js/Dinero.js; nunca number en coma flotante).
currency legal para el país de la dirección (COP + CO en este caso).
documentType y documentNumber: ambos o ninguno.
Las 11 llaves de shipping_address y billing_address presentes (pueden ser null, no ausentes).
Cada ítem con id_product existente y, si el producto tiene variantes, id_variant resuelto.
Sin ítems duplicados sin consolidar; cantidades > 0.
Logging estructurado con correlationId (id de tu orden), reference de Wompi, latencia y código de respuesta. Nunca loguear la API key ni datos completos de tarjeta.
Tests unitarios de buildOrderPayload con casos límite (redondeo, decimales, documento incompleto, dirección con null, variante faltante).
Criterio de aceptación F2: los tests cubren payload válido y cada error de validación; el cliente no lanza excepciones no controladas y distingue reintentable de no reintentable.

4. Fase 3 — Endpoint de webhook de Wompi
   Ruta nueva (respeta el prefijo del proyecto), POST /webhooks/wompi:

Verificar firma (Anexo B): concatenar en orden los valores de signature.properties + timestamp + secreto de eventos, SHA256, comparar en mayúsculas contra X-Event-Checksum o signature.checksum. Comparación timing-safe. Si no coincide → 401, log de intento, no procesar.
Responder 200 de inmediato y procesar en background (Wompi reintenta 3 veces en 24 h si no recibe 200).
Ignorar eventos distintos de transaction.updated (responde 200 igual).
No confiar en el estado del payload: reconsultar GET /v1/transactions/{id} con la llave privada (Anexo B) y usar ese resultado como fuente de verdad.
Persistir cada evento recibido en wompi_events (unique por transaction.id + status + timestamp) para auditoría y deduplicación.
Validar environment según el entorno (test en staging, prod en producción) y rechazar cruces.
Criterio de aceptación F3: evento con firma inválida → 401 sin efectos; evento duplicado → 200 y un solo efecto; evento con PENDING → no crea pedido, lo deja registrado; el endpoint responde en < 1 s.

5. Fase 4 — Orquestador pago aprobado → pedido creado
   Servicio syncPaidOrderToMastershop(reference):

Cargar tu orden local por reference (única en Wompi). Si no existe → error de negocio, alertar, no crear nada.
Si ya tiene ms_id_order guardado → no hacer nada (idempotente).
Resolver ítems → id_product/id_variant vía Fase 1. Si falta algún mapeo → no crear pedido parcial; marcar la orden como mastershop_sync_failed con motivo y alertar.
Construir payload y llamar createOrder. Guardar idOrder de Mastershop + status + timestamp en tu orden (ms_id_order, ms_synced_at, ms_status).
Manejar el duplicado (Código 409 - La orden ya existe) como éxito: recuperar el pedido existente con GET /api/orders?externalOrderId={reference} y persistir ese idOrder. (Verifica con id_order vs externalOrderId cuál corresponde; documenta la conclusión.)
Registrar el resultado en una tabla de intentos (mastershop_order_attempts) con request/response redactados.
Si el pago luego pasa a VOIDED/DECLINED, no crees el pedido; solo deja el evento registrado (la anulación es fuera de alcance).
Criterio de aceptación F4: un pago aprobado produce exactamente un pedido en Mastershop, incluso con 3 entregas del mismo webhook y 1 reintento tras timeout; un fallo de mapeo no genera pedidos incompletos y deja rastro accionable.

6. Fase 5 — Robustez: idempotencia, reintentos y conciliación
   Unique constraint en wompi_events y en orders.reference; ms_id_order único cuando no sea null.
   Patrón outbox o job persistente: si el proceso muere entre "pago aprobado" y "pedido creado", un worker lo retoma. Sin setTimeout en memoria como única garantía.
   Reintentos con backoff solo para errores reintentables; los 400 de esquema van a una cola de revisión manual.
   Comando de conciliación npm run reconcile:mastershop que liste: pagos APPROVED sin ms_id_order, pedidos en Mastershop sin pago local, y ms_status desincronizado.
   Alarmas/log ERROR para: firma inválida repetida, 401/403 de Mastershop, tasa de fallos de creación > umbral.
   Criterio de aceptación F5: matar el proceso justo después del 200 del webhook no pierde el pedido; la conciliación detecta y repara el caso.

7. Fase 6 — Pruebas, smoke test y documentación
   Tests unitarios: payload, decimales, firma, mapeo de errores, resolución de variantes.
   Tests de integración con fetch mockeado (éxito, 400, 401, 429, 500 duplicado, timeout).
   Smoke test controlado contra la API real (no hay sandbox documentado): crear un pedido de prueba con un producto barato, verificar idOrder, y cancelarlo con PUT /api/orders/{idOrder} → {"idStatus": 9}. Documenta el resultado y el ID usado.
   docs/integracion-mastershop-wompi.md: flujo, variables de entorno, runbook de incidentes, cómo reintentar un pedido fallido, cómo leer los logs.
   Checklist final de verificación manual end-to-end en staging con Wompi test.
   Criterio de aceptación F6: npm test verde, smoke test documentado, runbook con pasos concretos (no genéricos).

Anexo A — Contrato verificado de Mastershop (no inventar más)
Base URL: https://prod.api.mastershop.com. Único header requerido: ms-api-key. Alcance de datos derivado de la llave.
Crear pedido: POST /api/orders → 200 con idOrder, externalOrderId, status (Por Confirmar), orderTransaction, orderItems.
Cuerpo (todas las llaves de dirección son obligatorias, admiten null):
id*order, shipping_address{zip,country,city,address1,address2,full_name,first_name,last_name,phone,company,state,district}, billing_address{…}, order_transaction{total,currency,payment_method,payment_gateway}, customer{full_name,first_name,last_name,phone,email,documentType,documentNumber,tags[]}, order_items[{id_product,id_variant,quantity,sku,name,weight,price}], additional_charge[{type_charge,value}], notes[], tags[].
Reglas no expresadas en el esquema (responden 400): total exactamente Σ(price×quantity)+Σ(additional_charge.value) con aritmética decimal; currency legal en el país de la dirección; documentNumber y documentType ambos o ninguno.
Errores: 400 → {data:[{message,path}],error,success:false}; 401 API key ausente/inválida; 403 sin permiso; 429 con RateLimit-Limit|Remaining|Reset; 500 con mensaje que puede incluir "Código 409 - La orden ya existe" (duplicado de id_order).
Consultar pedido: GET /api/orders?idOrder=…&externalOrderId=…&carrierTrackingCode=… (al menos uno).
Listar pedidos: POST /api/orders/list?page=1&limit=20 — sin filtros solo devuelve 7 días, en silencio. Usar startDate/finalDate.
Actualizar pedido: PUT /api/orders/{idOrder} solo en estados 1 o 2; cancelar = {"idStatus":9}.
Productos: GET /api/products?page&limit&category&search; GET /api/products/:id?includeAllVariations=true|false. Con false (default) variation llega vacío si el producto solo tiene la variante por defecto.
Webhooks Mastershop: POST /api/webhooks (name, url, webhookName, idWebhook, idProduct — obligatorio pero ignorado) y PUT /api/webhooks (idProductWebhook, idProduct, isEnable).
Límites: paginación limit > 50 se recorta a 50 en silencio.
Soporte técnico: api@mastershop.com.
Anexo B — Contrato verificado de Wompi
Webhook: POST a tu URL con {event, data, environment, signature{properties[],checksum}, timestamp, sent_at}. transaction.updated en data.transaction{id, status, amount_in_cents, reference, currency, payment_method_type, customer_email, …}.
Firma: concatenar los valores de los campos listados en signature.properties (en ese orden, resolviendo rutas como transaction.id) + timestamp + secreto de eventos (prod_events*… / test*events*…) → SHA256 hex. Comparar con X-Event-Checksum o signature.checksum. El arreglo properties puede variar: nunca lo hardcodees.
Reintentos: si no respondes 200, reintenta 30 min, 3 h y 24 h después.
Consulta de transacción: GET https://production.wompi.co/v1/transactions/{id} con Authorization: Bearer <llave privada prv*\*> (solo backend; pub*\* devuelve 404).
Estados: PENDING, APPROVED, DECLINED, VOIDED, ERROR. amount_in_cents en centavos; moneda COP.
URL de eventos distinta para sandbox y producción.
Anexo C — Anti-patrones prohibidos en esta tarea
Crear el pedido en el handler del webhook de forma síncrona y bloquear la respuesta.
Confiar en evt.data.transaction.status sin reconsultar la transacción.
Usar Number/parseFloat para montos.
Enviar solo id_product en productos con talla/color.
Reintentar 400/401/403.
Crear un segundo cliente HTTP de Mastershop paralelo al existente.
Guardar la API key o la llave privada en base de datos sin cifrado, o en el repo.
Crear pedidos de prueba en producción sin cancelarlos después.
Desperdiciar contexto: releer archivos completos, volcar logs enteros o regenerar entregables desde cero por un cambio puntual (ver sección 0.bis).
Anexo D — Definición de terminado (global)
Auditoría aprobada y plan por fases respetado.
Esquema real de variantes verificado con llamada de prueba (sección 1.2) antes de diseñar las tablas.
Pago APPROVED en Wompi ⇒ 1 pedido en Mastershop, sin pasos manuales.
Reintentos y duplicados no generan pedidos dobles.
Fallo de mapeo de variante ⇒ 0 pedidos incompletos + alerta accionable.
Montos en decimal exacto, con test que lo demuestre.
Logs con correlationId y sin secretos.
Runbook + variables de entorno documentadas.
Smoke test documentado y pedido de prueba cancelado.
Empieza por la Fase 0. No escribas código de negocio todavía. Cuando termines docs/auditoria-mastershop.md, muéstrame el resumen (máx. 15 líneas) y las preguntas abiertas, y espera mi aprobación.
