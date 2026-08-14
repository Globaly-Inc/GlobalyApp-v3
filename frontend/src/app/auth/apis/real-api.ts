import { httpGet, httpPatch, httpPost } from "@/lib/api/http";
import { saveTokens } from "@/lib/session";
import type { AcceptInviteParams, AcceptInviteResult, AuthMeUser, AuthUser, SendOtpParams, UpdateRoleParams, VerifyOtpParams } from "./types";

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
    return { email, type: data.user.type, role: data.user.role, user_category: null };
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
    };
  },
};
