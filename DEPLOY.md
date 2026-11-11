# Despliegue en Vercel — UpBuy

El repositorio tiene dos aplicaciones independientes que se despliegan como
**dos proyectos de Vercel**:

| App    | Carpeta  | Tipo               | Root Directory |
| ------ | -------- | ------------------ | -------------- |
| Back   | `Back/`  | Express (zero-config) | `Back`      |
| Front  | `Front/` | Next.js 16         | `Front`        |

> **Importante:** en Vercel, cada proyecto debe tener su **Root Directory**
> apuntando a `Back` o `Front`. Si importas el repo completo sin cambiar el Root
> Directory, no detectará ni la API ni el front.

---

## 1. Backend (`Back/`)

Vercel detecta la app **Express sin configuración extra**: `index.js` exporta la
app y Vercel la empaqueta como una sola Vercel Function. No hay `builds` ni
carpeta `api/`.

### Variables de entorno (Production)

Obligatorias:

| Variable        | Ejemplo / nota                                            |
| --------------- | --------------------------------------------------------- |
| `DATABASE_URL`  | `postgresql://...@...neon.tech/db?sslmode=require` (Neon) |
| `JWT_SECRET`    | Secreto largo y aleatorio (el arranque falla sin él)      |
| `FRONTEND_URL`  | URL pública del front, p. ej. `https://upbuy.vercel.app`  |
| `CRON_SECRET`   | Secreto largo y aleatorio (sin él el cron responde 401)   |

Recomendadas / según servicio:

- `NODE_ENV=production` (Vercel ya lo define; no lo sobrescribas).
- Wompi: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`,
  `WOMPI_EVENTS_SECRET`, `WOMPI_ENV`.
- Venndelo Pro: `VENNDELO_CLIENT_ID`, `VENNDELO_CLIENT_SECRET`,
  `VENNDELO_REFRESH_TOKEN`, `SUPPLIER_CREDENTIALS_ENCRYPTION_KEY`.
- `TRUST_PROXY` no hace falta: en producción se asume `1`.

Las plantillas completas están en `Back/.env.example`. El archivo `.env.local`
**no** se sube a git y no se usa en Vercel.

### Crons

`vercel.json` declara los crons diarios (`0 12 * * *`, plan Hobby = 1 vez/día):

- `/api/cron/sync-providers`
- `/api/cron/sync-catalog`

Necesitan `CRON_SECRET` definido. En plan Pro puedes bajar el schedule a
`*/15 * * * *` editando `vercel.json`.

### Comprobación

Tras desplegar, abre `https://<back>.vercel.app/health`. Debe responder
`{ "ok": true, "db": "up" }`. Si responde 503, revisa `DATABASE_URL` y que Neon
esté despierto.

Las tablas se crean **automáticamente** en el primer arranque: `ensureBaseSchema`
crea las tablas base si la base está vacía y `ensureCatalogSchema` /
`ensureDropshippingSchema` aplican el resto (CHECKs, índices, secuencia,
semillas). Todo es idempotente.

Para preparar la base a mano antes del primer deploy:
`DATABASE_URL="postgresql://...@...neon.tech/db?sslmode=require" npm run db:bootstrap`

---

## 2. Frontend (`Front/`)

Next.js se despliega con cero configuración. Solo hay que definir una variable
en **Production y Preview** (se incrusta en build):

| Variable               | Valor                                              |
| ---------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`  | URL pública del backend, sin barra final (ver nota) |

### Notas

- La cookie de sesión es cross-site (front y back en dominios distintos): el
  backend ya la emite con `sameSite=none` + `secure` en producción. No requiere
  configuración adicional, pero **ambos deben estar en `https`**.
- El CORS del backend usa `FRONTEND_URL`; debe ser exactamente el dominio del
  front (sin barra final).
- La migración de `middleware.ts` → `proxy.ts` (Next.js 16) ya está aplicada.

---

## 3. Orden recomendado

1. Desplegar **Back** → copiar su URL.
2. Desplegar **Front** con `NEXT_PUBLIC_API_URL` = URL del Back.
3. Volver al proyecto del **Back** y fijar `FRONTEND_URL` = URL del Front.
4. Redeploy del Back para aplicar la variable.
5. Verificar `/health` y abrir el front.

---

## 4. Verificación local antes de subir

```bash
# Back
cd Back
npm install
npm test
node -e "require('./index.js')"   # no debe lanzar en producción

# Front
cd ../Front
npm install
npm run build
```

---

## 5. Notas de la estructura del repo

- No hay `vercel.json` en la raíz ni en `Front/`: no se necesitan.
- `Back/vercel.json` solo contiene los crons.
- Los secretos viven únicamente en las Environment Variables de Vercel.
