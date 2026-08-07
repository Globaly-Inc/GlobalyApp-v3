// Shared across the whole admin portal — not just one feature (see admin-shell.tsx).

export type AdminRole = "super_admin" | "admin" | "data_admin" | "moderator";

export type AdminUser = {
  id: number;
  uuid: string;
  name: string;
  email: string;
  role: AdminRole;
  photo_url: string | null;
  account_status: number;
  is_email_verified: boolean;
};
