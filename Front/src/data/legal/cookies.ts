import type { LegalDocument } from "./types";

// Contenido de la Política de Cookies y del panel de preferencias.
// La tabla refleja lo que el sitio usa HOY: no se inventan cookies de
// analítica ni de marketing mientras no estén instaladas.

export const cookiesDocument: LegalDocument = {
  id: "cookies",
  eyebrow: "Cookies",
  title: "Política de Cookies y Preferencias",
  description:
    "Qué cookies y almacenamiento local usa UPBUY, para qué sirven y cómo aceptar, rechazar o cambiar tus preferencias en cualquier momento.",
  updatedAt: "2026-11-17",
  updatedLabel: "17 de noviembre de 2026",
  intro: [
    "Las cookies y el almacenamiento local permiten que la tienda recuerde tu sesión, tu carrito y tus decisiones. Aquí explicamos cada uso con honestidad.",
    "Hoy UPBUY solo utiliza tecnologías estrictamente necesarias. Las categorías de preferencias, analítica y marketing están disponibles en el panel, pero no tienen cookies activas. Los SDK de Google y Facebook del inicio de sesión social se cargan solo cuando interactúas con esos botones.",
  ],
  sections: [
    {
      id: "que-son",
      number: "01",
      title: "Qué son las cookies y tecnologías similares",
      blocks: [
        {
          kind: "paragraph",
          text: "Una cookie es un archivo pequeño que un sitio guarda en tu navegador. El almacenamiento local (localStorage) funciona de forma parecida: guarda información en tu dispositivo para que el sitio la pueda leer después. También existen píxeles e identificadores técnicos que cumplen funciones de medición o seguridad.",
        },
        {
          kind: "paragraph",
          text: "Algunas cookies son necesarias para que la tienda funcione: sin ellas no podrías iniciar sesión, mantener el carrito o completar una compra. Otras son opcionales y solo se activan si das tu consentimiento.",
        },
        {
          kind: "note",
          text: "Puedes borrar o bloquear cookies desde tu navegador, pero si bloqueas las necesarias es posible que el inicio de sesión, el carrito o el checkout dejen de funcionar.",
        },
      ],
    },
    {
      id: "clasificacion",
      number: "02",
      title: "Clasificación por finalidad",
      blocks: [
        {
          kind: "table",
          head: ["Categoría", "Finalidad", "¿Requiere consentimiento?", "Estado actual"],
          rows: [
            [
              "Estrictamente necesarias",
              "Sesión, seguridad, carrito y registro de tu decisión de cookies.",
              "No. Son imprescindibles para prestar el servicio.",
              "Activas.",
            ],
            [
              "Preferencias",
              "Recordar idioma, país, moneda o la última categoría vista.",
              "Sí, salvo que sean imprescindibles.",
              "Sin cookies activas.",
            ],
            [
              "Analítica",
              "Medir de forma agregada cómo se usa el sitio para mejorarlo.",
              "Sí.",
              "Sin cookies activas.",
            ],
            [
              "Marketing",
              "Medir campañas y mostrar publicidad relacionada en otros sitios.",
              "Sí.",
              "Sin cookies activas.",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: "Las categorías no necesarias no vienen premarcadas. Si rechazas, solo quedan activas las estrictamente necesarias. Puedes cambiar la decisión cuando quieras desde el panel de esta página o desde el enlace del pie de página.",
        },
      ],
    },
    {
      id: "cookies-actuales",
      number: "03",
      title: "Cookies y almacenamiento que usamos actualmente",
      blocks: [
        {
          kind: "paragraph",
          text: "La siguiente tabla describe los elementos activos en el sitio. No incluimos proveedores de analítica ni de publicidad porque, a la fecha de esta versión, no están instalados.",
        },
        {
          kind: "table",
          caption: "Tecnologías activas",
          head: ["Nombre", "Tipo", "Proveedor", "Finalidad", "Duración", "Base legal"],
          rows: [
            [
              "__Host-upbuy_session y access_token",
              "Cookie httpOnly",
              "UPBUY",
              "Mantener la sesión iniciada y autenticar las solicitudes al backend.",
              "Sesión; máximo 12 horas.",
              "Ejecución del contrato y seguridad.",
            ],
            [
              "upbuy_session",
              "Cookie legible",
              "UPBUY",
              "Marcador que evita consultar la sesión en cada visita. No es una credencial.",
              "12 horas.",
              "Interés legítimo en el rendimiento y la seguridad.",
            ],
            [
              "upbuy.cart.v1",
              "Almacenamiento local",
              "UPBUY",
              "Conservar los productos del carrito entre visitas y dispositivos del mismo navegador.",
              "Hasta que borres los datos del navegador.",
              "Ejecución del contrato.",
            ],
            [
              "upbuy.consent.v1",
              "Almacenamiento local",
              "UPBUY",
              "Registrar tus preferencias de cookies, la versión y la fecha del consentimiento.",
              "Hasta que borres los datos o cambie la versión del aviso.",
              "Obligación legal y consentimiento.",
            ],
            [
              "SDK de Google Identity Services y SDK de Facebook",
              "Script de terceros",
              "Google y Meta",
              "Permitir el inicio de sesión social. Google se carga al abrir /login o /registro; Facebook, solo al pulsar su botón. No se usan para publicidad.",
              "Mientras la página está abierta.",
              "Consentimiento al usar el botón y ejecución del contrato.",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: "El SDK de Facebook se inicializa con cookie: false, así que no escribe cookies de Facebook antes de que decidas en esta página. El token de acceso se usa solo para autenticar tu cuenta en UPBUY y no se conserva en el navegador.",
        },
        {
          kind: "table",
          caption: "Categorías sin cookies activas",
          head: ["Categoría", "Estado", "Qué implicaría", "Base legal"],
          rows: [
            [
              "Preferencias",
              "No se utilizan actualmente.",
              "Guardar idioma, país, moneda o última categoría vista.",
              "Requeriría consentimiento, salvo que fuera imprescindible.",
            ],
            [
              "Analítica",
              "No se utilizan actualmente.",
              "Medir visitas, páginas y conversiones de forma agregada.",
              "Requeriría consentimiento.",
            ],
            [
              "Marketing",
              "No se utilizan actualmente.",
              "Remarketing, píxeles de campañas y medición publicitaria.",
              "Requeriría consentimiento.",
            ],
          ],
        },
      ],
    },
    {
      id: "preferencias-cookies",
      number: "04",
      title: "Tus preferencias de cookies",
      slotKey: "cookie-preferences",
      blocks: [
        {
          kind: "paragraph",
          text: "Elige qué categorías autorizas. Las necesarias permanecen activas porque sin ellas la tienda no puede funcionar. Tu decisión se guarda en este navegador bajo la clave upbuy.consent.v1, junto con la fecha y la versión del aviso.",
        },
      ],
    },
    {
      id: "aviso",
      number: "05",
      title: "Aviso en la primera visita",
      blocks: [
        {
          kind: "paragraph",
          text: "La primera vez que visitas el sitio mostramos un aviso en la parte inferior de la pantalla. No bloquea la lectura ni la navegación. Desde allí puedes aceptar todas las categorías, rechazar las no necesarias con un solo clic o abrir este panel para elegir una por una.",
        },
        {
          kind: "paragraph",
          text: "Mientras no tomes una decisión, solo funcionan las cookies necesarias. Si cierras el aviso sin elegir, volverá a aparecer en una próxima visita.",
        },
      ],
    },
    {
      id: "cambiar-consentimiento",
      number: "06",
      title: "Cómo cambiar o retirar tu consentimiento",
      blocks: [
        {
          kind: "list",
          items: [
            "Desde esta página: ajusta los interruptores y pulsa “Guardar preferencias”.",
            "Desde el pie de página: el enlace “Preferencias de cookies” reabre el aviso de consentimiento.",
            "Borrando los datos del navegador: elimina upbuy.consent.v1 y volverá a pedirte una decisión.",
            "Escribiendo a upbuy.official@gmail.com si necesitas ayuda para retirar el consentimiento.",
          ],
        },
        {
          kind: "paragraph",
          text: "Retirar el consentimiento no afecta la licitud del tratamiento realizado antes del retiro. Tampoco elimina las cookies necesarias para un pedido en curso.",
        },
      ],
    },
    {
      id: "borrar-cookies",
      number: "07",
      title: "Cómo borrar cookies en tu navegador",
      blocks: [
        {
          kind: "paragraph",
          text: "Cada navegador tiene su propio menú de privacidad. Estos son los accesos habituales; los nombres pueden variar según la versión y el idioma.",
        },
        {
          kind: "list",
          items: [
            "Chrome: Configuración → Privacidad y seguridad → Borrar datos de navegación.",
            "Safari: Preferencias o Configuración → Privacidad → Gestionar datos de sitios web.",
            "Firefox: Ajustes → Privacidad y seguridad → Cookies y datos del sitio.",
            "Edge: Configuración → Privacidad, búsqueda y servicios → Borrar datos de navegación.",
          ],
        },
        {
          kind: "paragraph",
          text: "Si usas el modo incógnito o una ventana privada, las cookies y el almacenamiento local se borran al cerrar la ventana. Ten en cuenta que eso también elimina el carrito guardado en ese navegador.",
        },
      ],
    },
    {
      id: "base-legal",
      number: "08",
      title: "Base legal, derechos y contacto",
      blocks: [
        {
          kind: "paragraph",
          text: "El tratamiento de datos asociado a cookies se rige por la Política de Privacidad. En Colombia aplica la Ley 1581 de 2012 y el Decreto 1377 de 2013; en Argentina, la Ley 25.326. Los lineamientos de la Agencia de Acceso a la Información Pública (AAIP) sobre cookies y rastreo en línea se toman como referencia de buenas prácticas.",
        },
        {
          kind: "paragraph",
          text: "Puedes ejercer tus derechos de acceso, actualización, rectificación, supresión y oposición por el canal indicado en la Política de Privacidad. Para asuntos de consumo, también puedes acudir a la autoridad de tu país.",
        },
        {
          kind: "links",
          items: [
            { label: "Política de Privacidad", href: "/politica-de-privacidad" },
            { label: "Términos y Condiciones", href: "/terminos-y-condiciones" },
            { label: "Escribir a UPBUY", href: "mailto:upbuy.official@gmail.com" },
          ],
        },
      ],
    },
    {
      id: "cambios",
      number: "09",
      title: "Cambios y fecha de actualización",
      blocks: [
        {
          kind: "paragraph",
          text: "Si instalamos nuevas cookies o cambiamos sus finalidades, actualizaremos esta política y volveremos a solicitar tu consentimiento cuando sea necesario. La versión vigente es la publicada en esta página.",
        },
        {
          kind: "paragraph",
          text: "Última actualización: 17 de noviembre de 2026. Versión del aviso: 1.",
        },
      ],
    },
  ],
  closing:
    "Este documento es informativo y no constituye asesoría legal. UPBUY recomienda revisión profesional antes de cambios normativos.",
};
