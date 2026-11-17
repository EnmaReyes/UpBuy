// Tipos del contenido legal. El texto vive en constantes tipadas (nunca en
// HTML suelto) para que sea mantenible, revisable y seguro de renderizar.

export type LegalLink = {
  label: string;
  href: string;
};

export type LegalBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[]; ordered?: boolean }
  | { kind: "subheading"; text: string }
  | {
      kind: "table";
      caption?: string;
      head: string[];
      rows: string[][];
    }
  | { kind: "links"; items: LegalLink[] }
  | { kind: "note"; title?: string; text: string };

export type LegalSectionData = {
  /** Ancla estable usada por el índice y los enlaces internos. */
  id: string;
  /** Numeración editorial: "01", "02"... */
  number: string;
  title: string;
  blocks: LegalBlock[];
  /**
   * Clave opcional para insertar un componente interactivo dentro de la
   * sección (por ejemplo, el panel de preferencias de cookies).
   */
  slotKey?: string;
};

export type LegalDocument = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  /** Fecha ISO de última actualización. */
  updatedAt: string;
  /** La misma fecha en formato legible: "17 de noviembre de 2026". */
  updatedLabel: string;
  intro: string[];
  sections: LegalSectionData[];
  closing?: string;
};
