import type { AdminUser, AdminRole } from "../../../apis/types";

export type { AdminUser, AdminRole };

export type ListParams = {
  page?: number;
  limit?: number;
  search?: string;
};

export type PaginatedAdminUsers = {
  data: AdminUser[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type AdminInvitation = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: AdminRole;
  status: "pending" | "accepted";
  invited_by: number;
  created_at: string;
  expired_at: string;
};

export type PaginatedInvitations = {
  data: AdminInvitation[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type InviteAdminParams = {
  first_name: string;
  last_name: string;
  email: string;
  role: AdminRole;
};

export type UpdateAdminParams = {
  role?: AdminRole;
  is_active?: boolean;
};

export type PlatformUser = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  account_status: number;
  is_email_verified: boolean;
  is_personal_account: boolean;
  is_business_account: boolean;
  is_institution_account: boolean;
  created_at: string;
};

export type UpdatePlatformUserParams = {
  account_status?: number;
  is_email_verified?: boolean;
};

export type PaginatedPlatformUsers = {
  data: PlatformUser[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
