import type { NextConfig } from "next";

// Proxy de la API: todas las llamadas del navegador a /api/* se reescriben al
// backend. La cookie de sesion (`__Host-upbuy_session`) se emite entonces sobre
// el dominio del PROPIO front (first-party), lo que evita el bloqueo de cookies
// de terceros de los navegadores modernos y hace que `cookies()` del servidor
// (Server Components) vea la sesion.
//
// En produccion NEXT_PUBLIC_API_URL apunta al back desplegado (p. ej.
// https://upbuy-phi.vercel.app); en desarrollo, a localhost:3000. Si la
// variable no existe, no se define el rewrite y queda el comportamiento previo.
const BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

// Next 16 bloquea en dev cualquier hostname distinto a localhost. Los túneles
// de Cloudflare (típicos para probar Wompi en local) necesitan declararse aquí.
// Solo se aplica a `next dev`; el build de producción lo ignora.
const DEV_TUNNEL_ORIGINS = ["*.trycloudflare.com"];

const nextConfig: NextConfig = {
  // El monorepo tiene un package-lock.json vacio en la raiz (para skills). Sin
  // esta clave Turbopack infiere E:/UpBuy como raiz y vigila/resuelve tambien
  // Back/, docs/ y demas, lo que encarece cada compilacion en `next dev`.
  // Front es un proyecto independiente: su raiz es el propio directorio.
  // Lo mismo aplica al tracing de archivos de produccion: sin esta clave Next
  // intenta trazar desde la raiz del monorepo.
  turbopack: {
    root: __dirname,
  },
  outputFileTracingRoot: __dirname,
  allowedDevOrigins: DEV_TUNNEL_ORIGINS,
  ...(BACKEND_URL
    ? {
        async rewrites() {
          return [
            { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
          ];
        },
      }
    : {}),
};

export default nextConfig;
