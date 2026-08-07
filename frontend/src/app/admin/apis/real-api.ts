import { httpGet } from "@/lib/api/http";
import type { AdminUser } from "./types";

export const adminRealApi = {
  getMe: (): Promise<AdminUser> => httpGet("/admin/me"),
};
