// Mapa estatico de roles y permisos del panel administrativo.
//
// La fuente de verdad del rol es `usuarios.role`. La columna legacy `admin`
// se conserva sincronizada durante la transicion (ver
// DataBase/ensureAdminSecuritySchema.js) para no romper codigo anterior.
//
// Este modulo es logica pura: no consulta la base ni conoce HTTP. La cadena
// de middlewares (Middleware/auth.js) lo usa despues de revalidar el rol.

const ROLES = Object.freeze([
  "customer",
  "support",
  "admin",
  "superadmin",
]);

// Roles con acceso al panel. `customer` nunca entra.
const ADMIN_ROLES = Object.freeze(["support", "admin", "superadmin"]);

// Permisos por rol, tal como se definen en docs/SEGURIDAD_ADMIN.md (4.2).
const PERMISSIONS_BY_ROLE = Object.freeze({
  customer: Object.freeze([]),
  support: Object.freeze(["orders.read", "users.read"]),
  admin: Object.freeze([
    "orders.read",
    "orders.write",
    "orders.refund",
    "catalog.write",
    "users.read",
    "users.write",
    "campaigns.read",
    "campaigns.send",
    "providers.manage",
  ]),
  superadmin: Object.freeze([
    "orders.read",
    "orders.write",
    "orders.refund",
    "catalog.write",
    "users.read",
    "users.write",
    "campaigns.read",
    "campaigns.send",
    "providers.manage",
    "admins.manage",
    "audit.read",
  ]),
});

const isValidRole = (role) => ROLES.includes(role);
const isAdminRole = (role) => ADMIN_ROLES.includes(role);

// Resuelve el rol efectivo de una fila de usuario.
//
// - `role` valido y distinto de customer manda.
// - Si no hay `role` (base anterior a ADM-S1) o el valor es customer, se usa
//   el booleano legacy `admin` como respaldo.
const resolveRole = (user) => {
  const role = String(user?.role || "")
    .trim()
    .toLowerCase();
  if (isValidRole(role) && role !== "customer") return role;
  return user?.admin === true ? "admin" : "customer";
};

// Lista de permisos efectivos. Devuelve una copia para que nadie mute el mapa.
const permissionsFor = (role) => [...(PERMISSIONS_BY_ROLE[role] || [])];

const hasPermission = (role, permission) =>
  Boolean(permission) && permissionsFor(role).includes(permission);

// ---------------------------------------------------------------------------
// Step-up para acciones destructivas (ADM-S3)
//
// No todos los permisos exigen un segundo factor reciente: leer pedidos no, pero
// mover dinero, cancelar, despublicar catalogo o cambiar roles si. El mapa dice
// que permiso habilita cada accion critica y el middleware
// `Middlewares/requireStepUp.js` comprueba `admin_sessions.mfaAt`.
// ---------------------------------------------------------------------------
const STEP_UP_ACTIONS = Object.freeze({
  "orders.refund": "orders.refund",
  "orders.cancel": "orders.write",
  "campaigns.send": "campaigns.send",
  "admins.manage": "admins.manage",
  "catalog.unpublish": "catalog.write",
});

const isStepUpAction = (action) =>
  Object.prototype.hasOwnProperty.call(STEP_UP_ACTIONS, action);

const permissionForStepUpAction = (action) => STEP_UP_ACTIONS[action] || null;

// ---------------------------------------------------------------------------
// Gobierno de administradores (ADM-S3)
//
// Reglas puras que el controlador aplica antes de escribir:
//   - nadie cambia su propio rol ni desactiva su propia cuenta;
//   - no se puede degradar ni desactivar al ultimo superadmin activo.
// `otherActiveSuperAdmins` es el conteo de superadmins activos distintos del
// usuario objetivo. La base la calcula el controlador.
// ---------------------------------------------------------------------------
const evaluateAdminChange = ({
  actorId,
  targetId,
  targetRole,
  targetDisabled = false,
  nextRole,
  nextDisabled = false,
  otherActiveSuperAdmins = 0,
} = {}) => {
  const changingRole = nextRole !== undefined && nextRole !== targetRole;
  const changingDisabled = Boolean(nextDisabled) !== Boolean(targetDisabled);

  if (changingRole || changingDisabled) {
    if (actorId && targetId && String(actorId) === String(targetId)) {
      return {
        ok: false,
        status: 409,
        code: "SELF_ADMIN_CHANGE",
        message: "No puedes cambiar tu propio rol ni desactivar tu cuenta",
      };
    }
  }

  const leavesSuperadmin =
    targetRole === "superadmin" &&
    (nextRole !== "superadmin" || nextDisabled === true);

  if (leavesSuperadmin && Number(otherActiveSuperAdmins) < 1) {
    return {
      ok: false,
      status: 409,
      code: "LAST_SUPERADMIN",
      message: "Debe quedar al menos un superadministrador activo",
    };
  }

  return { ok: true };
};

module.exports = {
  ROLES,
  ADMIN_ROLES,
  PERMISSIONS_BY_ROLE,
  STEP_UP_ACTIONS,
  isValidRole,
  isAdminRole,
  resolveRole,
  permissionsFor,
  hasPermission,
  isStepUpAction,
  permissionForStepUpAction,
  evaluateAdminChange,
};
