import { apiFetch } from "@/services/api/client";
import type { HomePayload } from "@/types/catalog";

// Portada pública: las tres secciones curadas + categorías. Una sola llamada
// para que todo el render sea coherente; ISR de 60 s.
export async function getHomePayload(): Promise<HomePayload> {
  return apiFetch<HomePayload>("/api/home", { revalidate: 60 });
}
