import { serverFetch } from "@/services/api/server";

export const dynamic = "force-dynamic";

const conTimeout = async <T,>(
  etiqueta: string,
  ms: number,
  tarea: Promise<T>,
): Promise<string> => {
  let terminado = false;
  const guarda = tarea.then((valor) => {
    terminado = true;
    return valor;
  });
  const limite = new Promise<string>((resolve) =>
    setTimeout(() => resolve(`TIMEOUT ${etiqueta}`), ms),
  );
  const resultado = await Promise.race([guarda, limite]);
  return terminado ? `OK ${etiqueta}` : resultado;
};

export default async function ProbePage() {
  const marcas: string[] = [];

  marcas.push(
    await conTimeout("users/me sin query", 6000, serverFetch("/api/users/me").then(() => 1)),
  );
  marcas.push(
    await conTimeout("users/me con query", 6000, serverFetch("/api/users/me", { query: { x: 1 } }).then(() => 1)),
  );
  marcas.push(
    await conTimeout("admin/orders sin query", 6000, serverFetch("/api/admin/orders").then((d) => d.orders.length)),
  );
  marcas.push(
    await conTimeout("admin/orders con query", 6000, serverFetch("/api/admin/orders", { query: { limit: 2 } }).then((d) => d.orders.length)),
  );

  return <p>PROBE | {marcas.join(" | ")}</p>;
}
