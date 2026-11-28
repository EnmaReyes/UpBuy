import type { LegalDocument } from "./types";

// Contenido de los Términos y Condiciones de uso y compra.
// Contrato de compraventa a distancia para Colombia y Argentina.

export const termsDocument: LegalDocument = {
  id: "terminos",
  eyebrow: "Legal",
  title: "Términos y Condiciones de Uso y Compra",
  description:
    "Reglas de uso del sitio de UPBUY y condiciones de compra, envío, retracto, cambios, devoluciones, reembolsos y garantía en Colombia y Argentina.",
  updatedAt: "2026-11-26",
  updatedLabel: "26 de noviembre de 2026",
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
          text: "Canales oficiales de atención: correo upbuy.official@gmail.com y teléfono o WhatsApp +57 312 887 2019. Cualquier otro canal no representa a UPBUY ni está autorizado para recibir pagos o modificar pedidos.",
        },
        {
          kind: "links",
          items: [
            { label: "upbuy.official@gmail.com", href: "mailto:upbuy.official@gmail.com" },
            { label: "+57 312 887 2019", href: "tel:+573128872019" },
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
        {
          kind: "paragraph",
          text: "Sin perjuicio de los plazos estimados, si el producto no llega dentro de los 10 días hábiles siguientes a la confirmación del despacho, puedes solicitar el reembolso en los términos de la sección 11.",
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
          kind: "paragraph",
          text: "El retracto legal es independiente de la política comercial de cambios y devoluciones de la sección 10. Ningún plazo, revisión o condición comercial limita el ejercicio del retracto ni de la garantía legal.",
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
      title: "Cambios de producto y devoluciones",
      blocks: [
        {
          kind: "paragraph",
          text: "Además del retracto legal de la sección 09 y de la garantía legal de la sección 12, UPBUY ofrece una política comercial de cambios de producto dentro de los 15 días calendario siguientes a la entrega. Esta política no reduce ni reemplaza tus derechos legales.",
        },
        {
          kind: "paragraph",
          text: "El plazo de 15 días aplica únicamente a cambios de producto por talla, color o referencia. Las devoluciones no tienen un plazo automático dentro de esta política: toda solicitud se somete a revisión y autorización de un asesor de UPBUY, que valida el motivo, el estado del producto y si el caso amerita la devolución. Con esta revisión se busca mantener un volumen razonable de cambios y devoluciones y proteger la calidad del servicio.",
        },
        {
          kind: "table",
          head: ["Tipo de solicitud", "Plazo", "Condiciones", "Costo del envío"],
          rows: [
            [
              "Cambio por producto equivocado o en mal estado",
              "15 días calendario desde la entrega",
              "La talla, el color o la referencia no corresponde a lo pedido, o el producto llegó defectuoso o deteriorado. Se exige foto y conservar el empaque.",
              "UPBUY asume el envío de retorno y el reenvío del producto.",
            ],
            [
              "Cambio voluntario de talla, color o referencia",
              "15 días calendario desde la entrega",
              "Producto sin uso, con etiquetas, accesorios y empaque original; sujeto a stock. No aplica a productos personalizados.",
              "El cliente asume el envío de retorno. No hay reembolso de dinero.",
            ],
            [
              "Producto dañado en el transporte",
              "Al momento de la entrega o dentro de las 48 horas siguientes",
              "Conserva el empaque y documenta el daño con fotos o video.",
              "UPBUY asume la investigación y la solución.",
            ],
            [
              "Devolución voluntaria",
              "No automático: se evalúa según el caso",
              "No es automática: requiere revisión y autorización de un asesor. Solo procede si el caso lo amerita.",
              "Se informa por escrito antes de que envíes el producto.",
            ],
          ],
        },
        {
          kind: "subheading",
          text: "Cambios: reglas generales",
        },
        {
          kind: "list",
          items: [
            "El cambio se solicita por correo a upbuy.official@gmail.com con el asunto “Cambio”, indicando el número de pedido, el producto, la talla, el color o la referencia deseada y el motivo.",
            "El producto debe estar sin uso, sin lavar y sin alterar, con etiquetas, accesorios y empaque original. UPBUY puede rechazar el cambio si el producto no cumple estas condiciones.",
            "El cambio está sujeto a disponibilidad de stock. Si la talla, el color o la referencia solicitada no está disponible, puedes elegir un vale por el valor pagado o un producto equivalente.",
            "Un cambio voluntario no genera reembolso de dinero. Si el producto elegido cuesta más, pagas la diferencia; si cuesta menos, la diferencia queda a favor como vale.",
            "UPBUY no recibe cambios sin autorización previa ni envíos por cobrar. Un producto enviado sin autorización puede ser rechazado o devuelto al remitente a su costo.",
          ],
        },
        {
          kind: "subheading",
          text: "Devoluciones: revisión previa obligatoria",
        },
        {
          kind: "paragraph",
          text: "La devolución voluntaria no es un derecho automático dentro de la política comercial. Cada caso se revisa con un asesor para validar que el motivo sea verificable, que el producto conserve sus condiciones y que la devolución realmente proceda. UPBUY comunica la decisión por escrito y, si el caso no procede, ofrece las alternativas disponibles: cambio, vale o garantía legal cuando corresponda.",
        },
        {
          kind: "note",
          text: "El plazo de 15 días no convierte la devolución en automática ni amplía el retracto legal. Si tu solicitud es de retracto o de garantía, se tramita por la sección 09 o la sección 12, según corresponda.",
        },
      ],
    },
    {
      id: "reembolsos",
      number: "11",
      title: "Reembolsos",
      blocks: [
        {
          kind: "paragraph",
          text: "El reembolso en dinero no es la regla general de la política comercial. UPBUY reconoce el reembolso únicamente en los siguientes casos:",
        },
        {
          kind: "list",
          items: [
            "El producto no llega dentro del plazo máximo de 10 días hábiles contados desde la confirmación del despacho. Antes de reembolsar, UPBUY verifica el estado del envío con la transportadora. Si el producto figura como entregado, o la demora obedece a una dirección errónea o a la ausencia del destinatario, el plazo se suspende y se coordina una nueva entrega.",
            "Ejercer el retracto legal en los plazos y condiciones de la sección 09.",
            "La garantía legal de la sección 12 concluye que la solución aplicable es el reembolso.",
            "El producto no está disponible después de la compra y el cliente opta por el reembolso, conforme a la sección 05.",
          ],
        },
        {
          kind: "paragraph",
          text: "En los demás casos, incluido el cambio voluntario, no se reembolsa el dinero. Si el cambio no es posible por falta de stock, el cliente puede elegir un vale por el valor pagado o un producto equivalente; si el producto elegido cuesta más, paga la diferencia.",
        },
        {
          kind: "paragraph",
          text: "El reembolso se hace por el mismo medio de pago utilizado. Si no es posible, se acuerda contigo un medio equivalente. El valor se reconoce por el producto afectado y, cuando corresponda, por el envío. El procesamiento se realiza dentro de los 30 días calendario siguientes a la aprobación o al plazo legal menor que resulte aplicable.",
        },
        {
          kind: "note",
          text: "Para solicitar un reembolso escribe a upbuy.official@gmail.com con el asunto “Reembolso” e indica el número de pedido, el producto y el motivo. Te confirmaremos por escrito si el caso procede y los pasos siguientes.",
        },
      ],
    },
    {
      id: "garantia",
      number: "12",
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
      number: "13",
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
      number: "14",
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
      number: "15",
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
      number: "16",
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
      number: "17",
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
      number: "18",
      title: "Ley aplicable y resolución de conflictos",
      blocks: [
        {
          kind: "paragraph",
          text: "Para los consumidores, estos términos se rigen por la ley de su domicilio y por las normas de orden público que resulten aplicables. Las partes se someten a los tribunales competentes del domicilio del consumidor, sin perjuicio de las acciones que correspondan ante autoridades administrativas.",
        },
        {
          kind: "paragraph",
          text: "Antes de acudir a una autoridad, te pedimos intentar una solución directa: escríbenos a upbuy.official@gmail.com o al +57 312 887 2019 con el número de pedido y una descripción del conflicto. Responderemos dentro de los plazos de la sección 19.",
        },
        {
          kind: "paragraph",
          text: "En Colombia puedes acudir a la Superintendencia de Industria y Comercio; en Argentina, a Defensa del Consumidor. Nada de esta sección impide ejercer el derecho de retracto, garantía o reversión del pago.",
        },
      ],
    },
    {
      id: "atencion",
      number: "19",
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
              "+57 312 887 2019",
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
            { label: "Llamar al +57 312 887 2019", href: "tel:+573128872019" },
          ],
        },
      ],
    },
    {
      id: "modificaciones",
      number: "20",
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
