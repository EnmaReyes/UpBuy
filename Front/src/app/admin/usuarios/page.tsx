import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { adminClientsCsvUrl, listAdminClients } from "@/services/admin/users";
import { ApiError } from "@/services/api/client";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { AdminClientFilters, AdminClientListItem } from "@/types/admin";

// Clientes (ADM-9): búsqueda, filtros y paginación. Todo va por querystring
// (Server Component) para que los filtros sean compartibles con la URL.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Usuarios — Panel UPBUY",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string =>
  typeof value === "string" ? value : "";

const pick = (value: string, allowed: string[]): string =>
  allowed.includes(value) ? value : "";

const dateOnly = (value: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";

const SEGMENTS = ["con_compras", "sin_compras"];
const CONSENTS = ["email", "whatsapp", "ninguno"];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;

  const filters: AdminClientFilters = {
    q: one(raw.q).trim(),
    segment: pick(one(raw.segment), SEGMENTS) as AdminClientFilters["segment"],
    consent: pick(one(raw.consent), CONSENTS) as AdminClientFilters["consent"],
    registeredFrom: dateOnly(one(raw.registeredFrom)),
    registeredTo: dateOnly(one(raw.registeredTo)),
  };

  const requestedPage = Math.max(1, Number(one(raw.page)) || 1);
  const offset = (requestedPage - 1) * PAGE_SIZE;

  let result;
  try {
    result = await listAdminClients({ ...filters, limit: PAGE_SIZE, offset });
  } catch (error) {
    return <UsersError error={error} />;
  }

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-carbon">
            Usuarios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} cliente(s)
            {hasFilters ? " con los filtros aplicados" : " en total"}. Página{" "}
            {page} de {totalPages}.
          </p>
        </div>
        <a
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          download="clientes-upbuy.csv"
          href={adminClientsCsvUrl()}
        >
          Exportar CSV
        </a>
      </header>

      <UsersFilters filters={filters} />

      {result.users.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/50 text-xs tracking-wide text-coffee-deep uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Cliente
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Registro
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Pedidos
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Gasto total
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Consentimientos
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.users.map((user) => (
                  <UserRow key={user.id} user={user} />
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 md:hidden">
            {result.users.map((user) => (
              <li key={user.id}>
                <UserCard user={user} />
              </li>
            ))}
          </ul>

          <Pagination page={page} totalPages={totalPages} filters={filters} />
        </>
      )}
    </div>
  );
}

function clientName(user: AdminClientListItem): string {
  return (
    [user.name, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username ||
    user.email
  );
}

function ConsentBadges({ user }: { user: AdminClientListItem }) {
  return (
    <span className="flex flex-wrap gap-1">
      <span
        className={
          user.marketingOptIn
            ? "rounded-full bg-[#DCF7C5] px-2 py-0.5 text-[11px] font-semibold text-[#2F5D0A]"
            : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-coffee-deep"
        }
      >
        Email {user.marketingOptIn ? "sí" : "no"}
      </span>
      <span
        className={
          user.whatsappOptIn
            ? "rounded-full bg-[#DCF7C5] px-2 py-0.5 text-[11px] font-semibold text-[#2F5D0A]"
            : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-coffee-deep"
        }
      >
        WhatsApp {user.whatsappOptIn ? "sí" : "no"}
      </span>
    </span>
  );
}

function UserRow({ user }: { user: AdminClientListItem }) {
  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <Link
          className="font-semibold text-carbon underline-offset-4 hover:text-terracotta-deep hover:underline"
          href={`/admin/usuarios/${user.id}`}
        >
          {clientName(user)}
        </Link>
        <p className="text-xs text-muted-foreground">{user.email}</p>
        <p className="text-xs text-muted-foreground">{user.phone || "—"}</p>
      </td>
      <td className="px-4 py-3 text-coffee-deep">
        {formatDateTime(user.createdAt)}
      </td>
      <td className="px-4 py-3 text-carbon [font-variant-numeric:tabular-nums]">
        {user.ordersCount ?? 0}
      </td>
      <td className="px-4 py-3 font-semibold text-carbon [font-variant-numeric:tabular-nums]">
        {formatPrice(Number(user.totalSpent ?? 0))}
      </td>
      <td className="px-4 py-3">
        <ConsentBadges user={user} />
      </td>
      <td className="px-4 py-3">
        {user.disabled ? (
          <span className="rounded-full bg-terracotta/15 px-2 py-0.5 text-[11px] font-semibold text-terracotta-deep">
            Desactivada
          </span>
        ) : user.profileComplete ? (
          <span className="rounded-full bg-[#DCF7C5] px-2 py-0.5 text-[11px] font-semibold text-[#2F5D0A]">
            Perfil completo
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-coffee-deep">
            Perfil incompleto
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-carbon transition-colors hover:border-carbon"
          href={`/admin/usuarios/${user.id}`}
        >
          Ver detalle
        </Link>
      </td>
    </tr>
  );
}

function UserCard({ user }: { user: AdminClientListItem }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            className="font-semibold text-carbon underline-offset-4 hover:text-terracotta-deep hover:underline"
            href={`/admin/usuarios/${user.id}`}
          >
            {clientName(user)}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="text-xs text-muted-foreground">
            Registro: {formatDateTime(user.createdAt)}
          </p>
        </div>
        <p className="shrink-0 font-semibold text-carbon [font-variant-numeric:tabular-nums]">
          {user.ordersCount ?? 0} pedidos
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ConsentBadges user={user} />
        {user.disabled ? (
          <span className="rounded-full bg-terracotta/15 px-2 py-0.5 text-[11px] font-semibold text-terracotta-deep">
            Desactivada
          </span>
        ) : null}
      </div>
      <Link
        className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep"
        href={`/admin/usuarios/${user.id}`}
      >
        Ver detalle
      </Link>
    </article>
  );
}

function UsersFilters({ filters }: { filters: AdminClientFilters }) {
  const inputClass =
    "h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-carbon placeholder:text-coffee focus-visible:border-terracotta focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
  const labelClass =
    "text-[11px] font-semibold tracking-[0.12em] text-coffee-deep uppercase";

  return (
    <form
      aria-label="Filtros de usuarios"
      className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2 lg:grid-cols-4"
    >
      <div className="flex flex-col gap-1.5">
        <label className={labelClass} htmlFor="users-q">
          Buscar
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-coffee"
          />
          <input
            className={`${inputClass} pl-9`}
            defaultValue={filters.q}
            id="users-q"
            name="q"
            placeholder="Nombre, correo, teléfono…"
            type="search"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={labelClass} htmlFor="users-segment">
          Compras
        </label>
        <select className={inputClass} defaultValue={filters.segment} id="users-segment" name="segment">
          <option value="">Todos</option>
          <option value="con_compras">Con compras</option>
          <option value="sin_compras">Sin compras</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className={labelClass} htmlFor="users-consent">
          Consentimiento
        </label>
        <select className={inputClass} defaultValue={filters.consent} id="users-consent" name="consent">
          <option value="">Todos</option>
          <option value="email">Email activo</option>
          <option value="whatsapp">WhatsApp activo</option>
          <option value="ninguno">Sin ninguno</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="users-from">
            Desde
          </label>
          <input
            className={inputClass}
            defaultValue={filters.registeredFrom}
            id="users-from"
            name="registeredFrom"
            type="date"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="users-to">
            Hasta
          </label>
          <input
            className={inputClass}
            defaultValue={filters.registeredTo}
            id="users-to"
            name="registeredTo"
            type="date"
          />
        </div>
      </div>
      <div className="flex items-end gap-2 md:col-span-2 lg:col-span-4">
        <button
          className="inline-flex h-11 items-center rounded-lg bg-carbon px-5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          type="submit"
        >
          Aplicar filtros
        </button>
        <Link
          className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold text-coffee-deep transition-colors hover:text-carbon focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          href="/admin/usuarios"
        >
          Limpiar
        </Link>
      </div>
    </form>
  );
}

function Pagination({
  page,
  totalPages,
  filters,
}: {
  page: number;
  totalPages: number;
  filters: AdminClientFilters;
}) {
  if (totalPages <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/admin/usuarios?${query}` : "/admin/usuarios";
  };

  return (
    <nav
      aria-label="Paginación de usuarios"
      className="flex items-center justify-between gap-3"
    >
      {page > 1 ? (
        <Link
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon"
          href={href(page - 1)}
          rel="prev"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-xs text-muted-foreground tabular-nums">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon"
          href={href(page + 1)}
          rel="next"
        >
          Siguiente
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-14 text-center">
      <Users aria-hidden="true" className="size-8 text-muted-foreground" />
      <h2 className="font-heading text-lg font-semibold text-carbon">
        {hasFilters ? "Ningún usuario coincide" : "Todavía no hay clientes"}
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {hasFilters
          ? "Prueba con otros filtros o limpia la búsqueda."
          : "Cuando alguien cree su cuenta aparecerá aquí."}
      </p>
      {hasFilters ? (
        <Link
          className="mt-2 inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-carbon transition-colors hover:border-carbon"
          href="/admin/usuarios"
        >
          Limpiar filtros
        </Link>
      ) : null}
    </div>
  );
}

function UsersError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : "No se pudo cargar la lista de usuarios.";

  return (
    <div role="alert" className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-6">
      <h1 className="font-heading text-lg font-semibold text-carbon">
        No pudimos cargar los usuarios
      </h1>
      <p className="mt-1 text-sm text-coffee-deep">{message}</p>
      <Link
        className="mt-4 inline-flex h-10 items-center rounded-lg bg-carbon px-4 text-sm font-semibold text-cream hover:bg-terracotta-deep"
        href="/admin/usuarios"
      >
        Reintentar
      </Link>
    </div>
  );
}
