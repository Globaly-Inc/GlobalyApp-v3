export type AuthUser = {
  email: string;
  type: "admin" | "platform_user" | "agent";
  role: string | null;
  user_category: string | null;
};

export type AuthMeBusiness = {
  id: number;
  org_id: string;
  business_name: string;
  subdomain: string;
  logo_url: string | null;
  role: string;
  is_owner: boolean;
};

export type AuthMeUser = {
  id: number;
  uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  account_status: number;
  photo_url: string | null;
  is_email_verified: boolean;
  is_personal_account: boolean;
  is_business_account: boolean;
  account_categories: unknown[];
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  type: AuthUser["type"];
  admin_role?: string | null;
  admin_id?: number;
  orgId?: string;
  orgRole?: string;
  businesses: AuthMeBusiness[];
};

export type SendOtpParams = {
  email: string;
};

export type VerifyOtpParams = {
  email: string;
  otp: string;
};

export type UpdateRoleParams = {
  category: "personal" | "business";
};

export type AcceptInviteParams = {
  token: string;
};

export type AcceptInviteResult = {
  message: string;
};
