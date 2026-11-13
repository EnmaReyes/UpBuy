import { NextResponse, type NextRequest } from "next/server";

// Protección de rutas privadas.
//
// El front NO valida el JWT: el secreto vive solo en el backend. Aquí se
// comprueba únicamente que exista la cookie de sesión para redirigir temprano
// y evitar renderizar la cuenta. La validación real (firma y expiración) la
// hace el backend en cada petición, y la página de cuenta vuelve a comprobarlo.
//
// Next.js 16 renombró el archivo `middleware.ts` a `proxy.ts` y la función
// exportada de `middleware` a `proxy` (el anterior está deprecado).

const PROTECTED_PREFIXES = ["/cuenta", "/checkout", "/admin"];

// ADM-S4: en produccion la cookie se llama `__Host-upbuy_session`. Se mantiene
// `access_token` como respaldo durante la transicion de despliegue.
const SESSION_COOKIE_NAMES = ["__Host-upbuy_session", "access_token"];

const hasSessionCookie = (request: NextRequest) =>
  SESSION_COOKIE_NAMES.some((name) =>
    Boolean(request.cookies.get(name)?.value),
  );

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = hasSessionCookie(request);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/cuenta/:path*", "/checkout"],
};
