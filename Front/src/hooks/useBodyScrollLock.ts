"use client";

import { useEffect } from "react";

// Bloqueo del scroll del documento con contador compartido.
//
// El Drawer de Base UI no bloquea el scroll de la pagina (solo el gesto dentro
// del panel). La ficha del producto y el dialogo de step-up pueden estar
// abiertos a la vez, asi que el bloqueo se cuenta: mientras quede un consumidor
// activo, `html`/`body` siguen sin desplazarse. Asi cerrar el dialogo no libera
// el scroll si la ficha sigue abierta.

let lockCount = 0;
let previousHtmlOverflow = "";
let previousBodyOverflow = "";
let previousBodyPaddingRight = "";

function acquireScrollLock() {
  if (typeof document === "undefined") return;

  if (lockCount === 0) {
    const html = document.documentElement;
    const body = document.body;

    previousHtmlOverflow = html.style.overflow;
    previousBodyOverflow = body.style.overflow;
    previousBodyPaddingRight = body.style.paddingRight;

    // Compensa el ancho de la barra de scroll para no mover el layout.
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  lockCount += 1;
}

function releaseScrollLock() {
  if (typeof document === "undefined") return;

  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;

  const html = document.documentElement;
  const body = document.body;

  html.style.overflow = previousHtmlOverflow;
  body.style.overflow = previousBodyOverflow;
  body.style.paddingRight = previousBodyPaddingRight;
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    acquireScrollLock();
    return () => releaseScrollLock();
  }, [active]);
}
