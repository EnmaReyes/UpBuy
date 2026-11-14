# Integración de MasterShop en el e-commerce

Actúa como ingeniero senior de Backend Node.js. Analiza el repositorio antes de modificar código e integra **MasterShop** en el e-commerce, aprovechando la arquitectura y los componentes existentes de Venddelo cuando sean realmente reutilizables.

Si compartir código compromete el aislamiento o la claridad de las integraciones, implementa MasterShop de forma independiente.

## 1. Documentación oficial

- API: https://documenter.getpostman.com/view/33212980/2sB3WnxNAk

Lee la documentación completa antes de implementar. Confirma host, endpoints, métodos, parámetros, esquemas, respuestas, permisos y paginación. No inventes contratos ni deduzcas comportamientos.

Reglas conocidas:
- Todas las solicitudes utilizan JSON sobre HTTPS.
- Autenticación exclusiva mediante el header `ms-api-key`.
- El contexto de usuario y negocio se obtiene de la API Key.
- No envíes headers internos de contexto ni IDs de usuario/negocio para definir ese contexto.
- Códigos documentados: `400`, `401`, `403`, `429` y `500`.
- Límites: `RateLimit-Limit`, `RateLimit-Remaining` y `RateLimit-Reset`.

La documentación menciona productos, marketplace, pedidos, envíos, webhooks y movimientos de billetera. No implementes todas estas funcionalidades automáticamente: selecciona únicamente las necesarias para el flujo actual del e-commerce.

## 2. Contexto técnico

Backend: Node.js 22, Express, Sequelize y PostgreSQL.

El proyecto ya contiene:
- Integración con Venddelo.
- Dependencias como Axios, dotenv, Express, pg, Sequelize y uuid.
- Pruebas con `node --test test/*.test.js`.
- Scripts de migración y verificación del catálogo/dropshipping.
- Script `venndelo:check`.

Verifica siempre el `package.json` y la estructura reales. No reemplaces configuraciones, dependencias ni scripts existentes sin justificación.

## 3. Metodología obligatoria

**Fase 1 — Auditoría**

Inspecciona:
- Estructura, configuración y dependencias.
- Modelos y relaciones de Sequelize.
- Rutas, controladores y servicios.
- Integración completa de Venddelo.
- Migraciones, scripts y pruebas existentes.

Busca todas las referencias a Venddelo, incluyendo variantes de mayúsculas y `venndelo`. Sigue sus flujos desde las entradas HTTP hasta la persistencia y respuesta.

**Fase 2 — Análisis y planificación**

Antes de editar:
1. Resume brevemente la arquitectura existente.
2. Identifica qué componentes de Venddelo pueden reutilizarse.
3. Define qué debe implementarse específicamente para MasterShop.
4. Presenta un plan breve de archivos y cambios.

Nunca reutilices contratos, autenticación, endpoints ni reglas de negocio propias de Venddelo como si pertenecieran a MasterShop.

Si falta información imprescindible en la documentación, no inventes soluciones. Identifica el bloqueo y pregunta cuando sea necesario.

**Fase 3 — Implementación**

Implementa con cambios mínimos, siguiendo las convenciones del repositorio. Mantén separadas las particularidades de cada proveedor y evita refactors ajenos a esta integración.

**Fase 4 — Verificación**

Ejecuta las pruebas existentes y las nuevas. Comprueba que Venddelo siga funcionando y documenta cualquier limitación o paso manual pendiente.

## 4. Requisitos técnicos

### Configuración y seguridad
- Utiliza `MASTERSHOP_API_KEY` como variable de entorno, salvo que la documentación o las convenciones del proyecto justifiquen otro nombre.
- Configura el host exclusivamente según la documentación oficial.
- Nunca expongas credenciales al frontend, logs o respuestas HTTP.
- Actualiza `.env.example` con valores ficticios si existe.
- No modifiques el `.env` real.

### Cliente HTTP
- Centraliza las solicitudes en un cliente o servicio específico.
- Utiliza Axios si resulta adecuado.
- Configura timeout razonable y manejo uniforme de errores.
- Protege la API Key y evita filtrarla en excepciones o logs.
- No agregues dependencias innecesarias.

### Catálogo y base de datos
- Mapea explícitamente las respuestas de MasterShop a los modelos internos.
- Evalúa productos, precios y stock según el contrato documentado y las capacidades actuales del modelo.
- Conserva los contratos existentes del e-commerce.
- Modifica el esquema únicamente cuando sea necesario.
- Si necesitas migraciones, deben ser seguras, reversibles y verificables.
- No asumas equivalencia entre IDs externos e internos.

### Pedidos y envíos
- Implementa únicamente los flujos necesarios y respaldados por la API.
- Respeta el modelo de pedidos y estados existente.
- Garantiza consistencia entre los pedidos locales y los registros del proveedor.
- No implementes billetera, marketplace o funcionalidades adicionales sin necesidad real.

### Webhooks
- Implementa webhooks únicamente si son necesarios para el flujo.
- Utiliza exclusivamente los mecanismos de autenticación o validación documentados.
- No inventes firmas, tokens ni mecanismos de seguridad.

### Errores, límites e idempotencia
- Respeta paginación y filtros documentados.
- Diferencia errores de validación, autenticación, permisos, límites e internos.
- Gestiona `429` considerando los headers de rate limit.
- Limita los reintentos y evita repetir operaciones de escritura que puedan duplicar pedidos.
- Garantiza idempotencia en sincronizaciones y operaciones cuando el contrato y el modelo permitan identificar inequívocamente los registros.

### Validación y autorización
- Valida todas las entradas.
- No confíes en IDs de usuario o negocio enviados por el cliente.
- Respeta la autorización y el aislamiento multi-tenant existentes.
- No confundas el contexto de MasterShop derivado de su API Key con la autorización de usuarios locales.

## 5. Pruebas automatizadas

Utiliza respuestas HTTP simuladas. No realices llamadas reales ni dependas de credenciales.

Cubre:
- Respuestas exitosas.
- Paginación.
- Errores `400`, `401`, `403`, `429` y errores internos.
- Transformaciones de datos.
- Sincronización de productos y stock, si se implementa.
- Flujos de pedidos y envíos, si se implementan.
- Idempotencia.
- Protección y no exposición de credenciales.

No rompas las pruebas existentes de Venddelo.

## 6. Documentación

Documenta:
- Variables de entorno.
- Configuración de MasterShop.
- Obtención y almacenamiento de la API Key.
- Funcionalidades implementadas.
- Comandos de prueba y verificación.
- Límites conocidos y pasos manuales pendientes.

Nunca incluyas credenciales reales.

## 7. Criterios de aceptación

- Integración basada exclusivamente en la documentación oficial.
- Autenticación mediante `ms-api-key`.
- Venddelo permanece intacto y sus pruebas siguen pasando.
- Código organizado según la arquitectura existente.
- Sin duplicaciones ni refactors innecesarios.
- Validaciones, errores seguros e idempotencia.
- Migraciones justificadas y verificables.
- Pruebas automatizadas satisfactorias.
- Documentación técnica actualizada.

## 8. Entrega final

Presenta:
1. Resumen de la arquitectura encontrada.
2. Decisiones de reutilización entre Venddelo y MasterShop.
3. Funcionalidades implementadas.
4. Archivos creados y modificados.
5. Cambios en la base de datos y migraciones.
6. Pruebas y comandos ejecutados, con resultados.
7. Variables de entorno necesarias.
8. Limitaciones, bloqueos y acciones manuales pendientes.

**IMPORTANTE:** Primero inspecciona y presenta el plan. Después implementa y verifica. No modifiques código antes de completar la auditoría. Si la documentación no permite confirmar un contrato imprescindible, detente en ese punto y solicita la información necesaria. Nunca inventes endpoints, parámetros ni comportamientos.