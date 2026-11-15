// Ruta del "dashboard" según el rol. Única fuente de verdad del destino del
// botón "Mi cuenta"/"Perfil" en toda la app:
//   - usuario del panel (admin true)  -> /admin
//   - comprador                       -> /cuenta/perfil
//   - sin sesión                      -> /login
//
// El flag `admin` llega en la sesión (`GET /api/auth/me`) y el backend lo
// mantiene sincronizado con `usuarios.role`; no se agrega estado nuevo.

type WithAdmin = { admin: boolean } | null | undefined;

export function getDashboardRoute(user: WithAdmin): string {
  if (!user) return "/login";
  return user.admin ? "/admin" : "/cuenta/perfil";
}
