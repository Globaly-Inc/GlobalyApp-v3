import type { AdminRole } from "../../../apis/types";

export type { AdminRole };

export type ListParams = {
  page?: number;
  limit?: number;
  search?: string;
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
