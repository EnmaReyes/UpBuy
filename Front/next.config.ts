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

const nextConfig: NextConfig = BACKEND_URL
  ? {
      async rewrites() {
        return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
      },
    }
  : {};

export default nextConfig;
