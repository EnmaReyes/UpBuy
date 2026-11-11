"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/services/auth";

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    setPending(true);
    try {
      await logout();
    } catch {
      // Aunque falle la llamada, se sale igual: la cookie se limpia cuando
      // pueda y el usuario no debe quedar atrapado en la cuenta.
    }
    // Recarga completa: el navbar (cliente) guardaba el nombre del usuario y
    // un `router.replace` no lo remonta, así que seguiría mostrándolo.
    window.location.assign("/");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-lg border border-cream/25 px-5 text-sm font-semibold text-cream transition-colors hover:border-cream hover:bg-cream/10 disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {pending ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}
