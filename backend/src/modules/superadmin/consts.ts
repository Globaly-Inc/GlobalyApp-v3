export const ADMIN_ROLES = ["super_admin", "admin", "data_admin", "moderator"] as const;

export const ROLE_DISPLAY: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  data_admin: "Data Admin",
  moderator: "Moderator",
};
