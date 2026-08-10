import { httpGet, httpPatch } from "@/lib/api/http";
import type { AdminUser } from "./types";

export const adminRealApi = {
  getMe: (): Promise<AdminUser> => httpGet("/admin/me"),

  updateMe: (id: number, patch: Partial<Pick<AdminUser, "name">>): Promise<AdminUser> =>
    httpPatch(`/admin/users/${id}`, patch),
};
