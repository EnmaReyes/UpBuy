// Tipado mínimo de Google Identity Services (GIS).
//
// Solo se declara lo que usa el login social de UPBUY: inicializar, pintar el
// botón oficial, cancelar y desactivar la selección automática. No se instala
// `@types/google.accounts` para no agregar dependencias.

export {};

declare global {
  interface GoogleCredentialResponse {
    credential?: string;
    clientId?: string;
    select_by?: string;
  }

  interface GoogleIdConfiguration {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: "popup" | "redirect";
  }

  interface GoogleButtonConfiguration {
    type?: "standard" | "icon";
    theme?: "outline" | "filled_blue" | "filled_black";
    size?: "large" | "medium" | "small";
    shape?: "rectangular" | "pill" | "circle" | "square";
    text?:
      | "signin_with"
      | "signup_with"
      | "continue_with"
      | "signin";
    logo_alignment?: "left" | "center";
    locale?: string;
    width?: number;
  }

  interface GoogleAccountsId {
    initialize(config: GoogleIdConfiguration): void;
    renderButton(
      parent: HTMLElement,
      options: GoogleButtonConfiguration,
    ): void;
    disableAutoSelect(): void;
    cancel(): void;
  }

  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}
