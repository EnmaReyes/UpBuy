import type { LegalDocument } from "./types";

// Contenido de la Política de Privacidad y Tratamiento de Datos Personales.
// Redactado para Colombia (Ley 1581 de 2012) y Argentina (Ley 25.326).
// Los datos de los titulares son los verificados por la empresa: no se
// agrega una razón social que no esté confirmada.

export const privacyDocument: LegalDocument = {
  id: "privacidad",
  eyebrow: "Políticas",
  title: "Política de Privacidad y Tratamiento de Datos Personales",
  description:
    "Cómo recoge, usa, conserva y protege UPBUY los datos personales de quienes compran o interactúan con la marca en Colombia y Argentina.",
  updatedAt: "2026-11-17",
  updatedLabel: "17 de noviembre de 2026",
  intro: [
    "Esta política explica, en lenguaje claro, qué datos personales recogemos cuando usas el sitio de UPBUY, compras, escribes por WhatsApp o te comunicas con nosotros.",
    "También describe para qué usamos esos datos, con quién los compartimos, cuánto tiempo los conservamos y cómo puedes ejercer tus derechos en Colombia y en Argentina.",
  ],
  sections: [
    {
      id: "responsable",
      number: "01",
      title: "Identificación del responsable",
      blocks: [
        {
          kind: "paragraph",
          text: "UPBUY es el nombre comercial bajo el cual operan conjuntamente los siguientes titulares, responsables del tratamiento de los datos personales que se recolectan a través del sitio y de los canales de atención.",
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
          text: "El domicilio principal de operación está en Colombia y se realizan envíos y operación hacia Argentina. Las solicitudes relacionadas con datos personales se atienden por el correo oficial upbuy.official@gmail.com, con el asunto “Protección de datos”, o por el teléfono y WhatsApp +57 320 3775834.",
        },
        {
          kind: "links",
          items: [
            { label: "upbuy.official@gmail.com", href: "mailto:upbuy.official@gmail.com" },
            { label: "+57 320 3775834", href: "tel:+573203775834" },
          ],
        },
        {
          kind: "note",
          text: "Los documentos, el NIT y el CUIT indicados identifican a los titulares para todos los efectos de esta política. Si la ley llega a exigir una razón social o un domicilio electrónico específico, UPBUY lo informará por este mismo canal antes de iniciar el tratamiento correspondiente.",
        },
      ],
    },
    {
      id: "alcance",
      number: "02",
      title: "Alcance de esta política",
      blocks: [
        {
          kind: "paragraph",
          text: "Esta política aplica a los datos que UPBUY recolecta en el sitio web, en el proceso de compra, en la atención por WhatsApp, correo electrónico y redes sociales, y en cualquier interacción presencial en la que se soliciten datos para una compra o un servicio de UPBUY.",
        },
        {
          kind: "paragraph",
          text: "Cuando compras a través de una pasarela de pagos, de una transportadora o de una plataforma de mensajería, esos terceros también tratan datos bajo sus propias políticas. UPBUY no controla esos tratamientos, pero exige a sus proveedores deberes de confidencialidad y seguridad cuando actúan por cuenta de la marca.",
        },
        {
          kind: "paragraph",
          text: "Esta política no cubre sitios, aplicaciones o promociones de terceros que se enlacen desde el sitio de UPBUY. Te recomendamos leer sus políticas antes de entregarles datos.",
        },
      ],
    },
    {
      id: "datos",
      number: "03",
      title: "Datos que recolectamos",
      blocks: [
        {
          kind: "paragraph",
          text: "Recolectamos únicamente los datos necesarios para las finalidades descritas en la sección 04. No solicitamos datos sensibles ni información que no tenga relación con la compra o la atención.",
        },
        { kind: "subheading", text: "Identificación y contacto" },
        {
          kind: "list",
          items: [
            "Nombre y apellido, nombre de usuario, correo electrónico y teléfono o WhatsApp.",
            "Documento de identidad cuando sea necesario para facturar, entregar o atender una reclamación.",
            "Dirección de entrega y, si corresponde, dirección de facturación.",
          ],
        },
        { kind: "subheading", text: "Datos de la compra" },
        {
          kind: "list",
          items: [
            "Productos, tallas, cantidades, importes, descuentos y estado del pedido.",
            "Número de pedido con el formato UPBUY-AAAA-NNNNNN.",
            "Dirección de envío, referencias de entrega y datos de contacto del destinatario.",
            "Comunicaciones relacionadas con el pedido, cambios, devoluciones o garantías.",
          ],
        },
        { kind: "subheading", text: "Datos de pago" },
        {
          kind: "paragraph",
          text: "UPBUY no almacena números de tarjeta, códigos de seguridad ni credenciales bancarias. Cuando pagas con tarjeta, los datos se ingresan directamente en la pasarela habilitada, que los procesa bajo su propia política. Cuando el pago se coordina por transferencia, Nequi u otro medio manual, solo tratamos el comprobante y los datos necesarios para verificar la operación. En todos los casos conservamos el resultado de la transacción, el medio de pago utilizado, el valor y la referencia necesarios para conciliar el pedido y cumplir obligaciones contables.",
        },
        { kind: "subheading", text: "Datos de navegación y dispositivo" },
        {
          kind: "list",
          items: [
            "Dirección IP, tipo de navegador, sistema operativo, idioma y páginas visitadas.",
            "Fecha y hora de acceso, eventos de seguridad y errores técnicos.",
            "Identificadores de cookies y almacenamiento local descritos en la Política de Cookies.",
          ],
        },
        { kind: "subheading", text: "Identidad en proveedores externos" },
        {
          kind: "list",
          items: [
            "Si eliges iniciar sesión con Google o con Facebook, recibimos de ese proveedor tu nombre, apellidos, correo electrónico verificado y, cuando lo compartes, tu foto de perfil.",
            "No recibimos tu contraseña de Google o Facebook: la autenticación ocurre en sus propios dominios y solo se conserva el identificador necesario para vincular la cuenta.",
          ],
        },
        { kind: "subheading", text: "Comunicaciones y datos de terceros" },
        {
          kind: "paragraph",
          text: "Cuando escribes por WhatsApp, correo o redes sociales, conservamos el contenido necesario para responder y dejar registro de la atención. Si entregas datos de otra persona, como el destinatario de un regalo, declaras que cuentas con su autorización para compartirlos con UPBUY.",
        },
      ],
    },
    {
      id: "finalidades",
      number: "04",
      title: "Finalidades y base legal",
      blocks: [
        {
          kind: "paragraph",
          text: "Tratamos tus datos solo para finalidades determinadas, explícitas y legítimas. La siguiente tabla resume cada finalidad y la base legal que la sostiene en Colombia y en Argentina.",
        },
        {
          kind: "table",
          head: ["Finalidad", "Base legal", "Qué implica"],
          rows: [
            [
              "Gestionar tu cuenta, tu carrito y tus pedidos",
              "Ejecución del contrato",
              "Crear el pedido, cobrar, preparar el envío, atender cambios y devoluciones.",
            ],
            [
              "Permitir el inicio de sesión con Google o Facebook",
              "Consentimiento al usar el botón y ejecución del contrato",
              "Verificar tu identidad con el proveedor que elijas, vincular la cuenta y crear tu perfil si aún no existe.",
            ],
            [
              "Emitir comprobantes y cumplir obligaciones contables y tributarias",
              "Obligación legal",
              "Conservar facturas, comprobantes y registros por los plazos que exija la ley.",
            ],
            [
              "Prevenir fraude, proteger la cuenta y garantizar la seguridad del sitio",
              "Interés legítimo",
              "Verificar operaciones inusuales, registrar accesos y bloquear abusos.",
            ],
            [
              "Atender consultas, reclamos, garantías y solicitudes de datos personales",
              "Ejecución del contrato y obligación legal",
              "Responder por los canales oficiales y dejar trazabilidad de la atención.",
            ],
            [
              "Enviar comunicaciones comerciales y medir campañas",
              "Consentimiento",
              "Solo si lo autorizas de forma previa, expresa e informada. Puedes retirarlo en cualquier momento.",
            ],
            [
              "Usar cookies de analítica o marketing no esenciales",
              "Consentimiento",
              "Solo si las aceptas en el panel de preferencias. Hoy esas categorías no están activas.",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: "Aplicamos los principios de finalidad determinada, minimización y seguridad: pedimos solo lo necesario, lo usamos para lo que informamos y lo protegemos con medidas razonables y proporcionales. No vendemos datos personales ni los usamos para finalidades incompatibles con las aquí descritas.",
        },
      ],
    },
    {
      id: "autorizacion",
      number: "05",
      title: "Cómo otorgas y revocas la autorización",
      blocks: [
        {
          kind: "paragraph",
          text: "La autorización se otorga mediante una casilla de aceptación que no viene premarcada. Al crear tu cuenta aceptas esta política y los Términos y Condiciones; al finalizar una compra confirmas haberlos leído. La aceptación de la política no equivale, por sí sola, al consentimiento para recibir publicidad.",
        },
        {
          kind: "list",
          items: [
            "Registro: casilla obligatoria y no premarcada con enlace a esta política y a los términos.",
            "Checkout: aviso visible con enlaces antes de confirmar el pedido.",
            "Boletín y marketing: casilla propia, separada y no premarcada. La suscripción solo se activa cuando el canal de envío está operativo; mientras tanto, el formulario no almacena tu correo.",
            "WhatsApp: la atención del pedido no requiere marketing; las promociones se envían solo con consentimiento.",
          ],
        },
        {
          kind: "paragraph",
          text: "Como prueba de la autorización conservamos la fecha y hora, la versión del documento aceptado y el canal por el que se otorgó. Puedes revocar la autorización o limitar el uso de tus datos escribiendo a upbuy.official@gmail.com con el asunto “Protección de datos”. La revocatoria no afecta los tratamientos necesarios para un pedido en curso ni los que la ley obligue a conservar.",
        },
        {
          kind: "links",
          items: [
            { label: "Términos y Condiciones", href: "/terminos-y-condiciones" },
            { label: "Preferencias de cookies", href: "/preferencias-de-cookies" },
          ],
        },
      ],
    },
    {
      id: "sensibles-menores",
      number: "06",
      title: "Datos sensibles y menores de edad",
      blocks: [
        {
          kind: "paragraph",
          text: "UPBUY no solicita datos sensibles, entendidos como aquellos que revelan origen étnico, orientación sexual, convicciones religiosas o políticas, estado de salud, datos biométricos o información especialmente protegida. Si por error recibimos un dato de esa naturaleza, lo eliminaremos o lo trataremos solo cuando exista una obligación legal que lo justifique.",
        },
        {
          kind: "paragraph",
          text: "Las compras de personas menores de edad deben contar con la autorización de su representante legal. Si eres representante y detectas que un menor entregó datos sin tu autorización, escríbenos y procederemos a verificar y, si corresponde, eliminar la información.",
        },
      ],
    },
    {
      id: "encargados",
      number: "07",
      title: "Encargados y terceros",
      blocks: [
        {
          kind: "paragraph",
          text: "Un encargado del tratamiento (o encargado de tratamiento) es el proveedor que trata datos personales por cuenta de UPBUY y siguiendo sus instrucciones. No decide sobre las finalidades y está obligado a guardar confidencialidad.",
        },
        {
          kind: "table",
          head: ["Categoría de proveedor", "Función", "Datos implicados"],
          rows: [
            [
              "Hosting y servicios en la nube",
              "Alojar el sitio, la base de datos y los respaldos.",
              "Datos de cuenta, pedidos y registros técnicos.",
            ],
            [
              "Pasarela de pagos",
              "Procesar el cobro y confirmar la transacción.",
              "Datos de pago y referencia del pedido.",
            ],
            [
              "Transportadoras y operadores logísticos",
              "Entregar los pedidos y gestionar novedades.",
              "Nombre, dirección, teléfono y contenido del pedido.",
            ],
            [
              "Mensajería y correo electrónico",
              "Enviar confirmaciones, avisos y comunicaciones autorizadas.",
              "Correo, teléfono y datos del pedido.",
            ],
            [
              "Proveedores de identidad (Google y Facebook)",
              "Autenticar tu cuenta cuando eliges el botón social y entregarnos los datos básicos de tu perfil.",
              "Nombre, apellidos, correo verificado, foto de perfil e identificador de la cuenta en el proveedor.",
            ],
            [
              "Analítica y publicidad",
              "Medir uso y campañas, solo si aceptas esas cookies.",
              "Datos de navegación e identificadores. Hoy no están activos.",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: "UPBUY no comparte datos con terceros para que los usen con finalidades propias sin una base legal. Cuando un proveedor actúa como responsable independiente, su propia política regula el tratamiento. En todos los casos exigimos medidas de seguridad y deberes de confidencialidad compatibles con esta política.",
        },
      ],
    },
    {
      id: "transferencias",
      number: "08",
      title: "Transferencias nacionales e internacionales",
      blocks: [
        {
          kind: "paragraph",
          text: "Para operar la tienda, los datos pueden circular entre Colombia y Argentina y alojarse en servidores de proveedores de nube ubicados en otros países. Esa circulación es necesaria para gestionar pedidos, atender garantías y mantener la seguridad del servicio.",
        },
        {
          kind: "list",
          items: [
            "Colombia: las transferencias internacionales se realizan con una base legal de la Ley 1581 de 2012, en especial cuando son necesarias para la ejecución del contrato, cuando existe autorización del titular o cuando el país receptor ofrece un nivel adecuado de protección.",
            "Argentina: cuando corresponda, se aplican las excepciones del artículo 16 de la Ley 25.326, el consentimiento del titular o las cláusulas contractuales que garanticen un nivel de protección adecuado.",
            "Proveedores en la nube: se seleccionan por sus medidas de seguridad y se les exige confidencialidad y uso limitado a las instrucciones de UPBUY.",
          ],
        },
        {
          kind: "paragraph",
          text: "Si necesitas información sobre el país de alojamiento o la base legal aplicable a una transferencia concreta, puedes solicitarla por el canal de protección de datos indicado en la sección 11.",
        },
      ],
    },
    {
      id: "conservacion",
      number: "09",
      title: "Cuánto tiempo conservamos los datos",
      blocks: [
        {
          kind: "paragraph",
          text: "Conservamos los datos solo durante el tiempo necesario para la finalidad que los justifica y para cumplir obligaciones legales. Después los eliminamos, los anonimizamos o los bloqueamos cuando la ley permita conservarlos para una reclamación.",
        },
        {
          kind: "table",
          head: ["Tipo de dato", "Plazo de conservación", "Motivo"],
          rows: [
            [
              "Cuenta y perfil",
              "Mientras la cuenta esté activa y hasta 5 años después de la última compra.",
              "Atender reclamaciones y obligaciones de consumo.",
            ],
            [
              "Pedidos, facturas y comprobantes",
              "Hasta 10 años desde la operación, o el plazo legal aplicable.",
              "Obligaciones contables y tributarias en Colombia y Argentina.",
            ],
            [
              "Conversaciones de atención y PQR",
              "Hasta 5 años desde el cierre del caso.",
              "Trazabilidad y defensa ante autoridades.",
            ],
            [
              "Marketing y boletín",
              "Hasta que retires el consentimiento o solicites la baja.",
              "Puedes revocarlo en cualquier momento.",
            ],
            [
              "Cookies y almacenamiento local",
              "Según la duración indicada en la Política de Cookies.",
              "Funcionamiento del sitio y preferencias.",
            ],
            [
              "Registros de seguridad e incidentes",
              "Hasta 2 años, salvo que una investigación exija más tiempo.",
              "Prevención de fraude y seguridad de la información.",
            ],
          ],
        },
        {
          kind: "note",
          text: "Los plazos anteriores son referencias operativas. Si una norma exige un plazo distinto, prevalece la norma y ajustamos la conservación en consecuencia.",
        },
      ],
    },
    {
      id: "seguridad",
      number: "10",
      title: "Seguridad de la información",
      blocks: [
        {
          kind: "paragraph",
          text: "Aplicamos medidas técnicas y organizativas razonables y proporcionales al riesgo: control de acceso por roles, autenticación, cifrado en tránsito, respaldos, registro de eventos y revisión de proveedores. No prometemos seguridad absoluta, porque ningún sistema es infalible, pero sí actuamos con diligencia para prevenir, detectar y contener incidentes.",
        },
        {
          kind: "list",
          items: [
            "Acceso limitado al personal y a los proveedores que necesitan los datos para su función.",
            "Contraseñas y credenciales gestionadas fuera del código y de los repositorios públicos.",
            "Registro de incidentes con análisis de causa, medidas correctivas y evidencia.",
            "Notificación a los titulares y a las autoridades cuando la ley lo exija y el incidente pueda afectar sus derechos.",
          ],
        },
        {
          kind: "paragraph",
          text: "Si detectas un uso no autorizado de tu cuenta o un posible incidente de seguridad, escríbenos de inmediato a upbuy.official@gmail.com con el asunto “Seguridad de la información”.",
        },
      ],
    },
    {
      id: "derechos",
      number: "11",
      title: "Tus derechos y cómo ejercerlos",
      blocks: [
        {
          kind: "paragraph",
          text: "Puedes ejercer los derechos que reconoce la Ley 1581 de 2012 en Colombia y la Ley 25.326 en Argentina. La siguiente tabla resume qué puedes pedir y cómo lo atendemos.",
        },
        {
          kind: "table",
          head: ["Derecho", "Qué puedes solicitar", "Plazo de respuesta"],
          rows: [
            [
              "Conocer y acceder",
              "Saber qué datos tenemos, para qué los usamos y cómo los obtuvimos; recibir una copia cuando corresponda.",
              "Colombia: 10 días hábiles para consultas. Argentina: 10 días corridos para el acceso.",
            ],
            [
              "Actualizar y rectificar",
              "Corregir datos inexactos, incompletos o desactualizados.",
              "Colombia: 15 días hábiles para reclamos, prorrogables 8 más. Argentina: 5 días hábiles.",
            ],
            [
              "Suprimir",
              "Eliminar datos cuando ya no sean necesarios o su tratamiento no sea legítimo, sin afectar obligaciones legales.",
              "Mismo plazo de reclamos o rectificación.",
            ],
            [
              "Revocar la autorización",
              "Retirar el consentimiento para marketing o para tratamientos que dependan de él.",
              "Se atiende sin demora; los efectos aplican hacia el futuro.",
            ],
            [
              "Oponerte",
              "Solicitar que dejemos de usar tus datos para una finalidad concreta, incluida la publicidad.",
              "Mismo plazo de reclamos o rectificación.",
            ],
            [
              "Presentar una queja",
              "Acudir a la autoridad de protección de datos o de consumo de tu país.",
              "Según el procedimiento de cada autoridad.",
            ],
          ],
        },
        {
          kind: "paragraph",
          text: "Canal único: envía tu solicitud a upbuy.official@gmail.com con el asunto “Protección de datos” o comunícate al +57 320 3775834. Para tramitarla necesitamos tu nombre completo, documento de identidad, un correo o teléfono de contacto, la descripción clara de lo que solicitas y, si actúas por otra persona, la prueba de representación.",
        },
        {
          kind: "paragraph",
          text: "La solicitud es gratuita. Si la información está incompleta, te pediremos que la completes dentro de los plazos legales. Si no estamos de acuerdo con tu solicitud, te explicaremos el motivo y podrás acudir a la autoridad competente.",
        },
        {
          kind: "links",
          items: [
            { label: "Escribir a Protección de datos", href: "mailto:upbuy.official@gmail.com?subject=Protecci%C3%B3n%20de%20datos" },
            { label: "Llamar al +57 320 3775834", href: "tel:+573203775834" },
          ],
        },
      ],
    },
    {
      id: "cookies",
      number: "12",
      title: "Cookies y tecnologías similares",
      blocks: [
        {
          kind: "paragraph",
          text: "Usamos cookies y almacenamiento local para mantener la sesión, conservar el carrito y recordar tu decisión sobre cookies. Las cookies no necesarias solo se activan si las aceptas. Hoy no tenemos cookies de analítica ni de marketing activas.",
        },
        {
          kind: "paragraph",
          text: "El inicio de sesión social carga los SDK de Google Identity Services y de Facebook únicamente cuando abres /login o /registro y, en el caso de Facebook, cuando pulsas su botón. No se instalan píxeles de esos proveedores ni se usan para publicidad.",
        },
        {
          kind: "paragraph",
          text: "Puedes revisar el detalle, cambiar tus preferencias o retirar el consentimiento en cualquier momento desde la página de preferencias de cookies.",
        },
        {
          kind: "links",
          items: [
            { label: "Ver la Política de Cookies y preferencias", href: "/preferencias-de-cookies" },
          ],
        },
      ],
    },
    {
      id: "cambios",
      number: "13",
      title: "Cambios a esta política",
      blocks: [
        {
          kind: "paragraph",
          text: "Podemos actualizar esta política para reflejar cambios normativos, operativos o de seguridad. Publicaremos la nueva versión en esta misma página con su fecha de última actualización y, si el cambio es sustancial, te avisaremos por el correo registrado o mediante un aviso visible en el sitio.",
        },
        {
          kind: "paragraph",
          text: "La versión vigente es la que aparece publicada en esta página. Las versiones anteriores se conservan como evidencia del consentimiento otorgado.",
        },
      ],
    },
    {
      id: "autoridades",
      number: "14",
      title: "Autoridades y reclamos",
      blocks: [
        {
          kind: "paragraph",
          text: "Si consideras que no atendimos correctamente una solicitud de datos personales, puedes presentar una queja ante la autoridad de tu país. También puedes acudir a las autoridades de protección al consumidor cuando el asunto esté relacionado con una compra.",
        },
        {
          kind: "list",
          items: [
            "Colombia: Superintendencia de Industria y Comercio (SIC), Delegatura para la Protección de Datos Personales y Protección al Consumidor. Registro Nacional de Bases de Datos (RNBD) cuando la ley lo exija.",
            "Argentina: Agencia de Acceso a la Información Pública (AAIP) para protección de datos personales; Defensa del Consumidor para conflictos de consumo.",
          ],
        },
        {
          kind: "paragraph",
          text: "Antes de acudir a una autoridad, te pedimos intentar la solución directa con nosotros: la mayoría de los casos se resuelven por el correo o el WhatsApp oficial en menos tiempo.",
        },
      ],
    },
    {
      id: "marco-normativo",
      number: "15",
      title: "Marco normativo aplicable",
      blocks: [
        {
          kind: "paragraph",
          text: "Esta política se redacta para cumplir las obligaciones concretas de información, finalidad, autorización, derechos, canales y plazos de las siguientes normas. No transcribe artículos completos.",
        },
        { kind: "subheading", text: "Colombia" },
        {
          kind: "list",
          items: [
            "Ley 1581 de 2012 y Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015: tratamiento de datos personales, autorización previa, expresa e informada, finalidades, derechos del titular, deberes del responsable y plazos de consulta y reclamo.",
            "Ley 1266 de 2008: hábeas data financiero, cuando resulte aplicable a reportes de pago.",
            "Ley 1480 de 2011 (Estatuto del Consumidor): información veraz y suficiente, precio total, retracto, reversión del pago, garantía legal y atención de PQR.",
            "Ley 527 de 1999: comercio electrónico, mensajes de datos y firma electrónica.",
          ],
        },
        { kind: "subheading", text: "Argentina" },
        {
          kind: "list",
          items: [
            "Ley 25.326 de Protección de Datos Personales y sus normas reglamentarias: consentimiento libre, expreso e informado, derechos de acceso, rectificación, supresión y actualización, transferencia internacional y deber de confidencialidad.",
            "Ley 24.240 de Defensa del Consumidor, con las modificaciones de la Ley 26.361: información clara, veraz y detallada, revocación en compras a distancia, trato digno y garantía legal.",
            "Código Civil y Comercial de la Nación, artículos 1092 a 1122: contratos de consumo, deber de información, publicidad y cláusulas abusivas.",
            "Ley 25.506 de Firma Digital, cuando resulte aplicable a la aceptación electrónica.",
          ],
        },
        { kind: "subheading", text: "Transversal" },
        {
          kind: "paragraph",
          text: "En ambos países rigen los principios de finalidad determinada, minimización y seguridad. El Reglamento General de Protección de Datos de la Unión Europea (RGPD) se aplicaría únicamente si en el futuro UPBUY dirige bienes o servicios a personas en la Unión Europea; esta política no afirma que ese supuesto ya ocurra.",
        },
      ],
    },
  ],
  closing:
    "Este documento es informativo y no constituye asesoría legal. UPBUY recomienda revisión profesional antes de cambios normativos.",
};
