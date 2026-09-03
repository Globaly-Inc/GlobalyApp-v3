export type AuthMeBusiness = {
  id: number;
  org_id: string;
  business_name: string;
  subdomain: string;
  logo_url: string | null;
  /** Authoritative owner. Prefer this over `is_owner`, which is a denormalised
   * copy that only registerBusiness maintains. */
  owner_id: number;
  role: string;
  is_owner: boolean;
};

export type AuthMeInstitution = {
  id: number;
  org_id: string;
  institution_name: string;
  subdomain: string;
  logo_url: string | null;
  role: string;
  is_owner: boolean;
};

export type AuthUser = {
  first_name: string | null;
  last_name: string | null;
  email: string;
  type: "admin" | "platform_user" | "agent";
  role: string | null;
  /** Whether this platform_user is an admin at all, independent of `type` — a business-scoped
   * token reads `type: "platform_user"` even for an admin who switched into a business they
   * own, so this is what UI that needs to know "is this person also an admin" should check. */
  is_admin: boolean;
  user_category: string | null;
  /** Whether this platform_user has completed personal onboarding — independent of
   * `user_category`, which only names the highest-priority role for a dual-role user
   * (business/institution beats personal). A business-account user can still have a
   * personal profile and needs to be able to view it. */
  is_personal_account: boolean;
  businesses: AuthMeBusiness[];
  institutions: AuthMeInstitution[];
  orgId: string | null;
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
  is_institution_account: boolean;
  account_categories: unknown[];
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  type: AuthUser["type"];
  is_admin: boolean;
  admin_role: string | null;
  admin_id: number | null;
  orgId?: string;
  orgRole?: string;
  businesses: AuthMeBusiness[];
  institutions: AuthMeInstitution[];
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

export type SwitchAccountParams = {
  org_id: string;
};

export type SwitchAccountResult = {
  access_token: string;
};
