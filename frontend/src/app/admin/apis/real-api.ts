import { httpGet, httpPatch, httpPostForm } from "@/lib/api/http";
import type { AdminUser } from "./types";

export type AdminMeWire = Omit<AdminUser, "name" | "uuid" | "is_email_verified"> & {
  first_name: string;
  last_name: string;
  uuid?: string;
  is_email_verified?: boolean;
};

export function toAdminUser(wire: AdminMeWire): AdminUser {
  return {
    ...wire,
    uuid: wire.uuid ?? "",
    name: `${wire.first_name} ${wire.last_name}`.trim(),
    is_email_verified: wire.is_email_verified ?? false,
  };
}

export const adminRealApi = {
  getMe: async (): Promise<AdminUser> => toAdminUser(await httpGet<AdminMeWire>("/admin/me")),

  updateMe: async (id: number, patch: Partial<Pick<AdminUser, "name">>): Promise<AdminUser> =>
    toAdminUser(await httpPatch<AdminMeWire>(`/admin/users/${id}`, patch)),

  uploadImage: (category: "profile" | "cover", file: File): Promise<{ storage_path: string }> => {
    const form = new FormData();
    form.append("file", file);
    return httpPostForm(`/platform-users/me/files?category=${category}`, form);
  },
};
