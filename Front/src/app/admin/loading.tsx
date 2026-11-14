import Loader from "@/components/kokonutui/loader";

// Estado de carga compartido de las rutas administrativas: aparece mientras
// el Server Component hace streaming y desaparece cuando llega el contenido.
export default function AdminLoading() {
  return (
    <div className="flex min-h-40 items-center justify-center" role="status" aria-label="Cargando">
      <Loader />
    </div>
  );
}
