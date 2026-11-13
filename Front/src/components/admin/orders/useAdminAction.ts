"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/services/api/client";

// Envuelve una acción del panel que puede exigir step-up.
//
// Si el backend responde `403 STEP_UP_REQUIRED`, guarda la acción y abre el
// diálogo de verificación. `retry` la repite después de validar el código. El
// mensaje real del backend (422/409/403) se conserva para mostrarlo tal cual.

const messageFor = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : "No se pudo completar la acción.";

export function useAdminAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const pending = useRef<(() => Promise<void>) | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);

    try {
      await action();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "STEP_UP_REQUIRED") {
        pending.current = action;
        setStepUpOpen(true);
        return;
      }
      setError(messageFor(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    const action = pending.current;
    if (!action) return;

    setBusy(true);
    setError(null);
    try {
      await action();
      pending.current = null;
      setStepUpOpen(false);
    } catch (caught) {
      setError(messageFor(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    error,
    setError,
    stepUpOpen,
    setStepUpOpen,
    run,
    retry,
  };
}
