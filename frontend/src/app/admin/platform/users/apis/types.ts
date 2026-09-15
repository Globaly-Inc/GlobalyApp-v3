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

export type RegistrantType = "student" | "institution" | "service_provider" | "other" | "newsletter";

export type WaitlistParams = ListParams & { registrant_type?: RegistrantType };

export type WaitlistEntry = {
  uuid: string;
  name: string;
  email: string;
  registrant_type: RegistrantType;
  created_at: string;
};

export type PaginatedWaitlist = {
  data: WaitlistEntry[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
