import { httpGet, httpPatch, httpPost } from "@/lib/api/http";
import { saveAccessToken, saveTokens } from "@/lib/session";
import type {
  AcceptInviteParams, AcceptInviteResult, AuthMeBusiness, AuthMeUser, AuthUser, SendOtpParams,
  SwitchAccountParams, SwitchAccountResult, UpdateRoleParams, VerifyOtpParams,
} from "./types";

export const authRealApi = {
  sendOtp: ({ email }: SendOtpParams): Promise<void> =>
    httpPost("/auth/send-otp", { email: email.trim().toLowerCase() }),

  acceptInvite: ({ token }: AcceptInviteParams): Promise<AcceptInviteResult> =>
    httpPost("/admin/users/invite/accept", { token }),

  updateRole: (params: UpdateRoleParams): Promise<void> =>
    httpPatch("/platform-users/me/category", { user_category: params.category }),

  verifyOtp: async ({ email, otp }: VerifyOtpParams): Promise<AuthUser> => {
    const data = await httpPost<{
      access_token: string;
      refresh_token: string;
      user: { id: number; email: string; type: AuthUser["type"]; role: string | null };
    }>("/auth/verify-otp", { email: email.trim().toLowerCase(), otp: otp.trim() });
    saveTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
    return { email, type: data.user.type, role: data.user.role, user_category: null, businesses: [], orgId: null };
  },

  /** The businesses this user is an agent in — the org_ids valid for switch-account. */
  listMyBusinesses: async (): Promise<AuthMeBusiness[]> => {
    const data = await httpGet<{ user: AuthMeUser }>("/auth/me");
    return data.user.businesses ?? [];
  },

  getMe: async (): Promise<AuthUser> => {
    const data = await httpGet<{ user: AuthMeUser }>("/auth/me");
    let user_category: AuthUser["user_category"] = null;
    if (data.user.is_business_account) user_category = "business";
    else if (data.user.is_personal_account) user_category = "personal";
    return {
      email: data.user.email,
      type: data.user.type,
      role: data.user.admin_role ?? null,
      user_category,
      businesses: data.user.businesses ?? [],
      orgId: data.user.orgId ?? null,
    };
  },

  switchAccount: async ({ org_id }: SwitchAccountParams): Promise<SwitchAccountResult> => {
    const data = await httpPost<{ access_token: string }>("/auth/switch-account", { org_id });
    saveAccessToken(data.access_token);
    return { access_token: data.access_token };
  },
};
