import { serverFetch } from "@/services/api/server";
import type { AdminProfile } from "@/types/admin";

// Perfil del administrador autenticado. Se lee en el servidor para que el
// shell no parpadee: si no hay sesión administrativa, la API responde 401/403
// y el layout redirige antes de renderizar.
export async function getAdminMe(): Promise<AdminProfile> {
  return serverFetch<AdminProfile>("/api/admin/me");
}
