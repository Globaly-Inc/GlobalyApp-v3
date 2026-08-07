import type { AdminRole } from "./apis/types";

export const ADMIN_ROLES: AdminRole[] = ["super_admin", "admin", "data_admin", "moderator"];

export const ROLE_DISPLAY: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  data_admin: "Data Admin",
  moderator: "Moderator",
};
