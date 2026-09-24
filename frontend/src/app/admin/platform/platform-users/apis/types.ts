export type PlatformUserType = "personal" | "business" | "institution";
export type PlatformUserAdminRole = "super_admin" | "data_admin";

export type ListParams = {
  page?: number;
  limit?: number;
  search?: string;
  type?: PlatformUserType;
  admin?: boolean;
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
  admin_role: PlatformUserAdminRole | null;
  completion_percentage: number | null;
  country: string | null;
};

export type UpdatePlatformUserParams = {
  account_status?: number;
  is_email_verified?: boolean;
};

export type PaginatedPlatformUsers = {
  data: PlatformUser[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
