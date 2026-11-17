import type { LegalDocument } from "./types";

// Contenido de los Términos y Condiciones de uso y compra.
// Contrato de compraventa a distancia para Colombia y Argentina.

export const termsDocument: LegalDocument = {
  id: "terminos",
  eyebrow: "Legal",
  title: "Términos y Condiciones de Uso y Compra",
  description:
    "Reglas de uso del sitio de UPBUY y condiciones de compra, envío, retracto, cambios y garantía en Colombia y Argentina.",
  updatedAt: "2026-11-17",
  updatedLabel: "17 de noviembre de 2026",
  intro: [
    "Estos términos regulan el uso del sitio de UPBUY y la compra de indumentaria y accesorios a través de nuestros canales oficiales.",
    "Al navegar, crear una cuenta o confirmar un pedido aceptas estas condiciones. Si no estás de acuerdo, no uses el sitio ni completes la compra.",
  ],
  sections: [
    {
      id: "aceptacion",
      number: "01",
      title: "Aceptación y capacidad legal",
      blocks: [
        {
          kind: "paragraph",
          text: "Al usar el sitio, crear una cuenta o confirmar un pedido aceptas estos Términos y Condiciones y la Política de Privacidad. La aceptación puede otorgarse marcando la casilla correspondiente en el registro o confirmando la compra después de leer los enlaces que se muestran en el checkout.",
        },
        {
          kind: "paragraph",
          text: "La aceptación electrónica tiene validez conforme a la Ley 527 de 1999 en Colombia y a la Ley 25.506 de Firma Digital en Argentina, cuando resulte aplicable. Conservamos registro de la fecha, la versión aceptada y el canal utilizado.",
        },
        {
          kind: "paragraph",
          text: "Debes ser mayor de edad y tener capacidad legal para contratar. Si eres menor de edad, la compra debe realizarla tu representante legal o contar con su autorización. UPBUY puede solicitar la verificación correspondiente y cancelar un pedido cuando existan dudas fundadas sobre la capacidad o la identidad.",
        },
        {
          kind: "links",
          items: [
            { label: "Política de Privacidad", href: "/politica-de-privacidad" },
            { label: "Preferencias de cookies", href: "/preferencias-de-cookies" },
          ],
        },
      ],
    },
    {
      id: "vendedor",
      number: "02",
      title: "Identificación del vendedor",
      blocks: [
        {
          kind: "paragraph",
          text: "El vendedor es UPBUY, nombre comercial bajo el cual operan conjuntamente los titulares identificados a continuación. Para efectos de estos términos, el domicilio contractual es el domicilio indicado en la tabla.",
        },
        {
          kind: "table",
          head: ["Titular", "Documento", "Domicilio"],
          rows: [
            [
              "Enmanuel Alejandro Reyes Coronel",
              "DNI 96418943 · CUIT 27-96418943-4",
              "Constitución 1255, 1152, Buenos Aires, Argentina",
            ],
            [
              "Jacinto Alfonso Aillon Daza",
              "C.I. 1149460409 · NIT 1149460409-3",
              "Barrio Barichara, Calle 52 Sur #66-32, apto 1215, Jardines de la Hacienda, Antioquia, Colombia",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: "Canales oficiales de atención: correo upbuy.official@gmail.com y teléfono o WhatsApp +57 320 3775834. Cualquier otro canal no representa a UPBUY ni está autorizado para recibir pagos o modificar pedidos.",
        },
        {
          kind: "links",
          items: [
            { label: "upbuy.official@gmail.com", href: "mailto:upbuy.official@gmail.com" },
            { label: "+57 320 3775834", href: "tel:+573203775834" },
          ],
        },
      ],
    },
    {
      id: "objeto",
      number: "03",
      title: "Objeto del contrato",
      blocks: [
        {
          kind: "paragraph",
          text: "UPBUY vende indumentaria y accesorios a través del sitio. La operación principal se realiza desde Colombia, con envíos y operación hacia Argentina. La descripción, las tallas, los materiales y las condiciones de cada producto se muestran en su ficha; el pedido se forma con los productos que confirmes en el checkout.",
        },
        {
          kind: "paragraph",
          text: "Las imágenes y textos son informativos. No constituyen una oferta ilimitada: la disponibilidad depende del stock real y se confirma al crear el pedido.",
        },
      ],
    },
    {
      id: "cuenta",
      number: "04",
      title: "Registro y cuenta",
      blocks: [
        {
          kind: "paragraph",
          text: "Para comprar puedes crear una cuenta o usar los canales habilitados. Debes entregar datos veraces, completos y actualizados. Los datos falsos, suplantados o de terceros sin autorización pueden provocar la suspensión de la cuenta y la cancelación del pedido.",
        },
        {
          kind: "list",
          items: [
            "Eres responsable de custodiar tu usuario y contraseña y de cerrar la sesión en dispositivos compartidos.",
            "Debes informarnos de inmediato cualquier uso no autorizado de tu cuenta.",
            "Podemos suspender o cancelar una cuenta ante fraude, abuso, incumplimiento de estos términos o riesgo para otros usuarios.",
            "La suspensión no elimina las obligaciones pendientes de pedidos ya confirmados.",
          ],
        },
      ],
    },
    {
      id: "productos",
      number: "05",
      title: "Productos, imágenes y disponibilidad",
      blocks: [
        {
          kind: "paragraph",
          text: "Los colores pueden variar según la pantalla, la calibración y la luz. Las medidas y tallas son aproximadas y se basan en las fichas técnicas de cada pieza. Si necesitas una confirmación antes de comprar, escríbenos por WhatsApp.",
        },
        {
          kind: "paragraph",
          text: "El stock se confirma al crear el pedido. Si un producto no está disponible después de la compra, te informaremos y podrás elegir entre un cambio, un vale o el reembolso total del valor pagado por ese producto. UPBUY no está obligada a mantener una promoción ni un precio si el stock se agota.",
        },
      ],
    },
    {
      id: "precios",
      number: "06",
      title: "Precios, moneda e impuestos",
      blocks: [
        {
          kind: "paragraph",
          text: "Los precios se muestran en pesos colombianos (COP) para Colombia y en pesos argentinos (ARS) para Argentina, salvo que el checkout indique expresamente otra moneda. El precio aplicable es el que aparece confirmado al momento de crear el pedido.",
        },
        {
          kind: "list",
          items: [
            "El precio indica si incluye impuestos o si estos se calculan por separado antes del pago.",
            "El costo de envío se muestra antes de confirmar la compra y puede ser gratuito según la promoción vigente.",
            "Los precios pueden actualizarse sin efecto retroactivo sobre pedidos ya confirmados.",
            "Si detectamos un error evidente de precio o de descripción, te informaremos antes de cobrar y podrás cancelar sin costo.",
          ],
        },
      ],
    },
    {
      id: "compra-pago",
      number: "07",
      title: "Proceso de compra y pago",
      blocks: [
        {
          kind: "paragraph",
          text: "El proceso comienza cuando agregas productos al carrito y termina cuando confirmas el pedido. Antes de confirmar revisas la dirección, el contenido, el precio y el medio de pago. Una vez creado el pedido recibirás un número con el formato UPBUY-AAAA-NNNNNN, que es la referencia visible para consultas y seguimiento.",
        },
        {
          kind: "list",
          items: [
            "Los medios de pago disponibles se muestran en el checkout y pueden incluir pasarela en línea, pago contra entrega y transferencia o Nequi coordinados por WhatsApp.",
            "La pasarela puede rechazar una transacción por seguridad, fondos insuficientes o datos incorrectos. En ese caso el pedido no se considera pagado y puedes reintentar con otro medio.",
            "UPBUY no recibe ni almacena números de tarjeta. El cobro lo procesa la pasarela habilitada.",
            "El comprobante y la confirmación se envían al correo registrado. Si no los recibes, revisa la carpeta de spam y escríbenos.",
          ],
        },
        {
          kind: "paragraph",
          text: "La confirmación del pedido no equivale al pago cuando eliges contra entrega o transferencia manual. En esos casos el pedido queda pendiente hasta que se acredite el pago o se entregue el producto, según el medio elegido.",
        },
      ],
    },
    {
      id: "envios",
      number: "08",
      title: "Envíos y entregas",
      blocks: [
        {
          kind: "paragraph",
          text: "Enviamos a las zonas de cobertura publicadas en el checkout. Los plazos que mostramos son estimados y dependen de la transportadora, la dirección y las condiciones de la ruta. No son plazos garantizados, salvo que la ley o una promoción indiquen lo contrario.",
        },
        {
          kind: "list",
          items: [
            "La transportadora realiza los intentos de entrega que permita su operación. Si no encuentra a nadie, dejará constancia y reprogramará o devolverá el pedido según su procedimiento.",
            "Si la dirección está incompleta o es errónea, pueden generarse costos adicionales o la devolución del pedido. Te contactaremos para coordinar.",
            "La pérdida o el daño en tránsito se investigan con la transportadora. Mientras se resuelve, UPBUY te mantiene informado y, si corresponde, repone el producto o reembolsa el valor pagado.",
            "Los tiempos de entrega pueden extenderse por temporadas altas, paros, fenómenos naturales o causas ajenas a UPBUY.",
          ],
        },
      ],
    },
    {
      id: "retracto",
      number: "09",
      title: "Derecho de retracto o revocación",
      blocks: [
        {
          kind: "paragraph",
          text: "En compras a distancia tienes derecho a retractarte dentro de los plazos legales de tu país, sin necesidad de explicar el motivo. El plazo se cuenta desde la entrega del producto y exige que lo devuelvas en las condiciones indicadas.",
        },
        {
          kind: "table",
          head: ["País", "Norma", "Plazo", "Desde cuándo", "Costo del retorno", "Reembolso"],
          rows: [
            [
              "Colombia",
              "Ley 1480 de 2011, arts. 34 y 47",
              "5 días hábiles",
              "Entrega del producto",
              "Se informa por escrito al recibir la solicitud y se rige por la ley aplicable.",
              "Hasta 30 días calendario desde que ejerces el retracto, o el plazo legal menor.",
            ],
            [
              "Argentina",
              "Ley 24.240, art. 34",
              "10 días corridos",
              "Recepción del producto",
              "Se informa por escrito al recibir la solicitud y se rige por la ley aplicable.",
              "Hasta 30 días calendario desde que ejerces el retracto, o el plazo legal menor.",
            ],
          ],
        },
        {
          kind: "list",
          items: [
            "El producto debe estar sin uso, con sus etiquetas, accesorios y empaque original.",
            "Debes conservar el comprobante o número de pedido para agilizar la devolución.",
            "El reembolso se hace por el mismo medio de pago utilizado. Si no es posible, se acuerda contigo un medio equivalente.",
            "No aplican las excepciones legales, como productos personalizados, perecederos, de higiene personal abiertos o aquellos excluidos por la ley.",
          ],
        },
        {
          kind: "note",
          text: "Para ejercer el retracto escribe a upbuy.official@gmail.com con el asunto “Retracto” e indica tu número de pedido, el producto y la fecha de entrega. Te responderemos con las instrucciones de devolución y, antes de que envíes el producto, con el costo aplicable.",
        },
      ],
    },
    {
      id: "cambios",
      number: "10",
      title: "Cambios y devoluciones por talla o defecto",
      blocks: [
        {
          kind: "paragraph",
          text: "Además del retracto legal, ofrecemos cambios voluntarios dentro de los 30 días calendario siguientes a la entrega, sujetos a disponibilidad de talla o color. Este plazo comercial no reduce ni reemplaza tus derechos legales.",
        },
        {
          kind: "table",
          head: ["Tipo de solicitud", "Plazo", "Condiciones", "Costo"],
          rows: [
            [
              "Cambio voluntario de talla o color",
              "30 días calendario desde la entrega",
              "Producto sin uso, con etiquetas y empaque original; sujeto a stock.",
              "El retorno corre por tu cuenta, salvo promoción vigente.",
            ],
            [
              "Producto defectuoso o distinto al pedido",
              "Garantía legal",
              "Falla de fabricación, error de referencia o producto incompleto.",
              "UPBUY asume el retorno cuando se confirma el defecto o el error.",
            ],
            [
              "Producto dañado en el transporte",
              "Al momento de la entrega o dentro de las 48 horas siguientes",
              "Conserva el empaque y documenta el daño con fotos.",
              "UPBUY asume la investigación y la solución.",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: "Un cambio voluntario no es una garantía: si el producto presenta una falla, se tramita por la garantía legal y no se te puede exigir que aceptes un cambio de talla como única solución.",
        },
      ],
    },
    {
      id: "garantia",
      number: "11",
      title: "Garantía legal",
      blocks: [
        {
          kind: "paragraph",
          text: "Todos los productos tienen garantía legal por defectos de calidad, idoneidad o seguridad, conforme a la Ley 1480 de 2011 en Colombia y a la Ley 24.240 en Argentina. La garantía cubre fallas de fabricación y no el desgaste normal, el mal uso o los daños causados por terceros.",
        },
        {
          kind: "list",
          items: [
            "Escríbenos con el número de pedido, una descripción de la falla y fotos o videos que permitan evaluarla.",
            "UPBUY revisa el caso y puede reparar, reponer el producto o reembolsar el valor pagado, según la naturaleza de la falla y la ley aplicable.",
            "Los costos de envío derivados de una garantía procedente corren por cuenta de UPBUY.",
            "Si la reclamación no procede, te explicaremos el motivo y podrás acudir a la autoridad de consumo.",
          ],
        },
      ],
    },
    {
      id: "promociones",
      number: "12",
      title: "Promociones, cupones y sorteos",
      blocks: [
        {
          kind: "paragraph",
          text: "Las promociones y cupones tienen vigencia, condiciones y stock limitado. Salvo que se indique expresamente, no son acumulables entre sí, no aplican sobre pedidos anteriores y no son canjeables por dinero.",
        },
        {
          kind: "list",
          items: [
            "El cupón debe ingresarse antes de confirmar el pedido; no se aplica retroactivamente.",
            "Los sorteos y concursos publican sus bases, requisitos, vigencia y premio antes de la participación.",
            "UPBUY puede cancelar una promoción por error evidente, fraude o causa de fuerza mayor, informando a los participantes.",
            "La participación en promociones no obliga a comprar, salvo que las bases lo indiquen de forma clara.",
          ],
        },
      ],
    },
    {
      id: "propiedad-intelectual",
      number: "13",
      title: "Propiedad intelectual",
      blocks: [
        {
          kind: "paragraph",
          text: "La marca UPBUY, los logotipos, las fotografías, los textos, las ilustraciones, el diseño del sitio y los demás contenidos son propiedad de UPBUY o se usan con autorización. No puedes reproducirlos, modificarlos, distribuirlos ni usarlos comercialmente sin permiso escrito.",
        },
        {
          kind: "paragraph",
          text: "Puedes compartir enlaces y capturas para uso personal o informativo, siempre que no sugieras una asociación, patrocinio o endorsement inexistente. El uso indebido puede dar lugar a reclamaciones legales.",
        },
      ],
    },
    {
      id: "conducta",
      number: "14",
      title: "Conducta del usuario",
      blocks: [
        {
          kind: "paragraph",
          text: "Debes usar el sitio de forma lícita y respetuosa. No está permitido intentar fraudes, suplantar a otra persona, vulnerar la seguridad, extraer datos de forma abusiva, publicar contenido ilícito ni interferir con el funcionamiento del servicio.",
        },
        {
          kind: "list",
          items: [
            "No usar bots, scrapers o automatizaciones que saturen el sitio o extraigan información masiva.",
            "No intentar acceder a cuentas, paneles o datos que no te pertenecen.",
            "No usar el sitio para lavado de activos, financiación del terrorismo u otras actividades ilegales.",
            "No publicar reseñas falsas ni manipular la reputación de UPBUY o de otros usuarios.",
          ],
        },
        {
          kind: "paragraph",
          text: "El incumplimiento puede provocar la suspensión de la cuenta, la cancelación de pedidos y las acciones legales que correspondan.",
        },
      ],
    },
    {
      id: "responsabilidad",
      number: "15",
      title: "Limitación de responsabilidad",
      blocks: [
        {
          kind: "paragraph",
          text: "En la medida permitida por la ley, UPBUY no responde por daños indirectos, lucro cesante, pérdida de oportunidades o perjuicios derivados del uso indebido del sitio, de la interrupción del servicio o de la información publicada por terceros.",
        },
        {
          kind: "paragraph",
          text: "Nada de estos términos excluye ni limita los derechos irrenunciables del consumidor, la responsabilidad por dolo o culpa grave, ni las garantías legales. Si una cláusula se declara inválida, las demás siguen vigentes y la cláusula inválida se interpreta de la forma más favorable al consumidor.",
        },
        {
          kind: "paragraph",
          text: "UPBUY responde por los productos que vende y por los servicios que presta directamente. No responde por las políticas, la disponibilidad o el funcionamiento de sitios de terceros enlazados.",
        },
      ],
    },
    {
      id: "suspension",
      number: "16",
      title: "Suspensión del servicio y fuerza mayor",
      blocks: [
        {
          kind: "paragraph",
          text: "UPBUY puede suspender temporalmente el sitio por mantenimiento, actualizaciones, seguridad o causas técnicas. Cuando sea razonable, avisaremos con antelación. La suspensión no afecta los pedidos ya confirmados, que se gestionan por los canales oficiales.",
        },
        {
          kind: "paragraph",
          text: "No habrá incumplimiento cuando una obligación se vea impedida por fuerza mayor o caso fortuito, como desastres naturales, conflictos, medidas de autoridad, fallas generalizadas de internet o bloqueos logísticos. En ese caso informaremos la situación y haremos lo razonable para cumplir o acordar una solución.",
        },
      ],
    },
    {
      id: "ley-conflictos",
      number: "17",
      title: "Ley aplicable y resolución de conflictos",
      blocks: [
        {
          kind: "paragraph",
          text: "Para los consumidores, estos términos se rigen por la ley de su domicilio y por las normas de orden público que resulten aplicables. Las partes se someten a los tribunales competentes del domicilio del consumidor, sin perjuicio de las acciones que correspondan ante autoridades administrativas.",
        },
        {
          kind: "paragraph",
          text: "Antes de acudir a una autoridad, te pedimos intentar una solución directa: escríbenos a upbuy.official@gmail.com o al +57 320 3775834 con el número de pedido y una descripción del conflicto. Responderemos dentro de los plazos de la sección 18.",
        },
        {
          kind: "paragraph",
          text: "En Colombia puedes acudir a la Superintendencia de Industria y Comercio; en Argentina, a Defensa del Consumidor. Nada de esta sección impide ejercer el derecho de retracto, garantía o reversión del pago.",
        },
      ],
    },
    {
      id: "atencion",
      number: "18",
      title: "Atención al cliente y PQR",
      blocks: [
        {
          kind: "paragraph",
          text: "Atendemos consultas, peticiones, quejas y reclamos (PQR) por los canales oficiales. Para agilizar la respuesta incluye tu nombre, número de pedido, correo o teléfono y una descripción clara del caso.",
        },
        {
          kind: "table",
          head: ["Canal", "Dato", "Uso recomendado"],
          rows: [
            [
              "Correo electrónico",
              "upbuy.official@gmail.com",
              "PQR, protección de datos, retractos y garantías.",
            ],
            [
              "Teléfono y WhatsApp",
              "+57 320 3775834",
              "Consultas rápidas, coordinación de entregas y seguimiento.",
            ],
            [
              "Horario",
              "Lunes a viernes, 9:00 a 18:00 (hora de Colombia), excepto festivos.",
              "Fuera de ese horario, la solicitud se atiende el siguiente día hábil.",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: "Plazos de respuesta: consultas en un máximo de 10 días hábiles y reclamos en un máximo de 15 días hábiles, prorrogables por 8 días hábiles cuando la complejidad lo justifique. Si la ley aplicable exige un plazo menor, se aplicará ese plazo. Te informaremos cualquier prórroga antes de que venza.",
        },
        {
          kind: "links",
          items: [
            { label: "Escribir a UPBUY", href: "mailto:upbuy.official@gmail.com" },
            { label: "Llamar al +57 320 3775834", href: "tel:+573203775834" },
          ],
        },
      ],
    },
    {
      id: "modificaciones",
      number: "19",
      title: "Modificaciones de los términos",
      blocks: [
        {
          kind: "paragraph",
          text: "Podemos modificar estos términos por cambios normativos, operativos o comerciales. La nueva versión se publica en esta página con su fecha de vigencia y aplica desde ese momento, sin afectar pedidos ya confirmados ni derechos adquiridos.",
        },
        {
          kind: "paragraph",
          text: "Si el cambio es sustancial, lo informaremos por el correo registrado o mediante un aviso visible antes de que entre en vigor. Si no estás de acuerdo, puedes dejar de usar el sitio; los pedidos en curso se rigen por la versión aceptada al confirmarlos.",
        },
      ],
    },
  ],
  closing:
    "Este documento es informativo y no constituye asesoría legal. UPBUY recomienda revisión profesional antes de cambios normativos.",
};
