import Loader from "@/components/kokonutui/loader";

// Estado de carga compartido de las rutas administrativas: aparece mientras
// el Server Component hace streaming y desaparece cuando llega el contenido.
// El propio Loader ya anuncia el estado (`<output aria-live="polite">`): el
// contenedor no repite role/aria-label para no anunciarlo dos veces.
export default function AdminLoading() {
  return (
    <div className="flex min-h-40 items-center justify-center">
      <Loader size="sm" />
    </div>
  );
}
