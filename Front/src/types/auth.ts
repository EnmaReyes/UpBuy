// Tipos de autenticación, perfil y direcciones.
//
// Reflejan la forma real del backend:
//   - `GET /api/auth/me`            -> AuthUser
//   - `GET /api/users/me`           -> Profile
//   - `GET /api/users/me/addresses` -> { addresses }

export type MissingProfileField = "name" | "lastName" | "phone" | "address";

export type AuthUser = {
  id: string;
  username: string | null;
  email: string;
  admin: boolean;
  image: string | null;
  name: string | null;
  lastName: string | null;
  phone: string | null;
  address: string | null;
  profileComplete: boolean;
  profileCompleteAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Address = {
  id: string;
  userId: string;
  department: string | null;
  city: string | null;
  address: string;
  reference: string | null;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ProfileResult = AuthUser & {
  profileComplete: boolean;
  missing: MissingProfileField[];
};

export type Profile = ProfileResult & {
  defaultAddress: Address | null;
};

export type ProfileInput = {
  name?: string;
  lastName?: string;
  phone?: string;
  image?: string;
  address?: string;
};

export type AddressInput = {
  department?: string;
  city?: string;
  address: string;
  reference?: string;
  isDefault?: boolean;
};

export type Credentials = {
  username: string;
  password: string;
};

export type RegisterInput = Credentials & {
  email: string;
};

export const MISSING_FIELD_LABELS: Record<MissingProfileField, string> = {
  name: "Nombre",
  lastName: "Apellido",
  phone: "Teléfono",
  address: "Dirección",
};
