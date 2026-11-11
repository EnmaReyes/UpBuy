import { NextResponse, type NextRequest } from "next/server";

// Protección de rutas privadas.
//
// El front NO valida el JWT: el secreto vive solo en el backend. Aquí se
// comprueba únicamente que exista la cookie de sesión para redirigir temprano
// y evitar renderizar la cuenta. La validación real (firma y expiración) la
// hace el backend en cada petición, y la página de cuenta vuelve a comprobarlo.

const PROTECTED_PREFIXES = ["/cuenta", "/checkout"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get("access_token")?.value);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasSessionCookie) {
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
