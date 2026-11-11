import { apiSend } from "@/services/api/client";
import type {
  Address,
  AddressInput,
  ProfileInput,
  ProfileResult,
} from "@/types/auth";

// Mutaciones de cuenta (client). Todas envían la cookie de sesión.

export async function updateProfile(payload: ProfileInput): Promise<ProfileResult> {
  return apiSend<ProfileResult>("/api/users/me", { method: "PUT", body: payload });
}

export async function createAddress(payload: AddressInput): Promise<Address> {
  return apiSend<Address>("/api/users/me/addresses", {
    body: { ...payload },
  });
}

export async function updateAddress(
  id: string,
  payload: Partial<AddressInput>,
): Promise<Address> {
  return apiSend<Address>(`/api/users/me/addresses/${id}`, {
    method: "PUT",
    body: payload,
  });
}

export async function deleteAddress(
  id: string,
): Promise<{ deleted: boolean; addressId: string }> {
  return apiSend<{ deleted: boolean; addressId: string }>(
    `/api/users/me/addresses/${id}`,
    { method: "DELETE" },
  );
}

export async function setDefaultAddress(id: string): Promise<Address> {
  return apiSend<Address>(`/api/users/me/addresses/${id}/default`, {
    method: "PUT",
  });
}
