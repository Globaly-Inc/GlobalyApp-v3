import type { AdminUser, AdminRole } from "../../../apis/types";

export type { AdminUser, AdminRole };

export type PaginatedAdmins = {
  data: AdminUser[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type ListAdminsParams = {
  page?: number;
  limit?: number;
};

export type InviteAdminParams = {
  name: string;
  email: string;
  role: AdminRole;
};
