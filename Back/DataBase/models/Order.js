const { DataTypes } = require("sequelize");
const { sequelize } = require("../db.js");
const { v4: uuidv4 } = require("uuid");
const {
  SALE_CHANNEL,
  SALE_CHANNEL_VALUES,
  PAYMENT_METHOD_VALUES,
  CURRENCY,
  FULFILLMENT_STATUS,
  FULFILLMENT_STATUS_VALUES,
  PAYMENT_STATE,
  PAYMENT_STATE_VALUES,
  PAYMENT_METHOD_CODE,
  PAYMENT_METHOD_CODE_VALUES,
  PROVIDER,
  PROVIDER_VALUES,
  STATUS_SOURCE,
  STATUS_SOURCE_VALUES,
} = require("./enums.js");

// Pedido. Los datos del comprador/envio son un snapshot: el pedido no
// depende de que el usuario o el producto sigan existiendo igual.
// status (logistico) y paymentStatus (pago) viven separados a proposito.
const Order = sequelize.define(
  "Order",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: uuidv4,
      allowNull: false,
      primaryKey: true,
    },

    orderNumber: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
    },

    // Puede ser NULL: las ventas externas (presencial/WhatsApp) se registran
    // a mano y no requieren una cuenta de usuario en la tienda.
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "usuarios",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },

    // Canal por el que entro la venta: 'web' (checkout) o los externos que
    // registra un administrador.
    channel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: SALE_CHANNEL.WEB,
      validate: { isIn: [SALE_CHANNEL_VALUES] },
    },

    // Metodo de pago de las ventas manuales (efectivo, Nequi, ...). Null en
    // los pedidos web, que se cobran por Wompi.
    paymentMethod: {
      type: DataTypes.STRING(30),
      allowNull: true,
      validate: {
        // Se permite null; solo se valida cuando hay valor.
        isInOrNull(value) {
          if (value === null || value === undefined) return;
          if (!PAYMENT_METHOD_VALUES.includes(value)) {
            throw new Error("Método de pago inválido");
          }
        },
      },
    },

    // ---------------------------------------------------------------------
    // Estados canonicos (dropshipping).
    //
    // Son la UNICA fuente de verdad del pedido. Las columnas historicas
    // status / paymentStatus se retiraron en la Fase 2 (no habia front que
    // las consumiera).
    // ---------------------------------------------------------------------

    // Ciclo de cumplimiento: donde va el pedido fisicamente.
    fulfillmentStatus: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: FULFILLMENT_STATUS.PENDING_PAYMENT,
      validate: { isIn: [FULFILLMENT_STATUS_VALUES] },
    },

    // Ciclo del dinero: donde va el pago.
    paymentState: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: PAYMENT_STATE.UNPAID,
      validate: { isIn: [PAYMENT_STATE_VALUES] },
    },

    // Que pasarela mueve el dinero: wompi | vendelo | cod_dropi |
    // cod_vendelo. Los dos ultimos son pago contra entrega (COD).
    paymentMethodCode: {
      type: DataTypes.STRING(30),
      allowNull: true,
      validate: { isInOrNull: [PAYMENT_METHOD_CODE_VALUES] },
    },

    currency: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      defaultValue: CURRENCY,
    },

    // Montos en pesos COP (enteros), igual que la tarifa de precios
    subtotal: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    shippingCost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    discountTotal: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    total: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },

    // ---------------------------------------------------------------------
    // Contabilidad del pedido.
    //
    // Todo en pesos COP enteros, igual que subtotal/total.
    //   netProfit = subtotal + shippingCost - providerCost - gatewayFee
    //               - providerFee
    //
    // "Utilidad ganada" (pedido entregado) y "efectivo recibido" (COD
    // liquidado) son cosas distintas: el panel las separa.
    // ---------------------------------------------------------------------
    providerCost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },

    gatewayFee: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },

    // Comision que cobra el proveedor logistico, si aplica.
    providerFee: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },

    netProfit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    // Snapshot de envio. En ventas externas solo el nombre y el telefono son
    // obligatorios; el correo y la direccion pueden faltar (entrega en mano).
    recipientName: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmailOrNull(value) {
          if (value === null || value === undefined) return;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            throw new Error("Correo electrónico inválido");
          }
        },
      },
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    department: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    postalCode: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // 'antioquia' | 'nacional' (y 'medellin' historico) — determina la
    // tarifa de envio. Antioquia se cobra por distancia desde Itagui.
    shippingZone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    // Snapshot del plazo prometido al comprador (dias habiles), calculado al
    // crear el pedido segun la zona: Antioquia = 3, resto del pais = 10.
    // Es un snapshot: cambiar la regla despues no altera pedidos ya hechos.
    estimatedDeliveryDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 0 },
    },

    // Momento en que el pago del pedido quedo aprobado (Wompi o manual).
    paymentApprovedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Logistica / seguimiento
    trackingCarrier: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    trackingNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    // Enlace directo al rastreo del courier. El front lo muestra como boton
    // "Rastrear pedido".
    trackingUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // ---------------------------------------------------------------------
    // Proveedor logistico (dropshipping).
    //
    // Upbuy guarda el estado crudo en providerStatus y el canonico en
    // fulfillmentStatus/paymentState. El usuario nunca ve el crudo.
    // ---------------------------------------------------------------------
    provider: {
      type: DataTypes.STRING(30),
      allowNull: true,
      validate: { isInOrNull: [PROVIDER_VALUES] },
    },

    // Id del pedido en el proveedor. Con el forma la clave del auto-sync.
    providerOrderId: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },

    // Ultimo estado crudo reportado por el proveedor.
    providerStatus: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },

    // Quien produjo el ultimo cambio de estado. Permite que el auto-sync
    // no pise un cambio manual del administrador.
    statusSource: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: STATUS_SOURCE.MANUAL_ADMIN,
      validate: { isIn: [STATUS_SOURCE_VALUES] },
    },

    // Cuando es true, ningun auto-sync pisa este pedido. Lo activa el
    // administrador al cambiar un estado a mano.
    manualOverride: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    // El cambio local se guardo pero el push al proveedor fallo. El pedido
    // sigue como esta en Upbuy: nunca se revierte un cambio local.
    providerOutOfSync: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    // Direccion congelada al momento de la compra. Es la que ve el courier:
    // si el usuario cambia su direccion despues, el pedido no se mueve.
    addressSnapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },

    // Momento en que el perfil del comprador quedo completo. Se guarda para
    // saber cuando se desbloqueo la compra.
    profileCompleteAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    shippedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Stock booleano reservado con expiracion (sin cantidades)
    stockReservedUntil: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "orders",
    timestamps: true,
    indexes: [
      { fields: ["userId"], name: "orders_user_id_idx" },
      { fields: ["fulfillmentStatus"], name: "orders_fulfillment_status_idx" },
      { fields: ["paymentState"], name: "orders_payment_state_idx" },
      {
        fields: ["provider", "providerOrderId"],
        name: "orders_provider_order_id_idx",
      },
      { fields: ["channel"], name: "orders_channel_idx" },
      { fields: ["createdAt"], name: "orders_created_at_idx" },
    ],
  },
);

module.exports = { Order };
