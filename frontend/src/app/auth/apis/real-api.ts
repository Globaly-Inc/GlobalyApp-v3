import { httpGet, httpPatch, httpPost } from "@/lib/api/http";
import { saveTokens } from "@/lib/session";
import type { AcceptInviteParams, AcceptInviteResult, AuthUser, SendOtpParams, UpdateRoleParams, VerifyOtpParams } from "./types";

export const authRealApi = {
  sendOtp: ({ email }: SendOtpParams): Promise<void> =>
    httpPost("/auth/send-otp", { email: email.trim().toLowerCase() }),

  acceptInvite: ({ token }: AcceptInviteParams): Promise<AcceptInviteResult> =>
    httpGet(`/admin/users/invite/accept?token=${encodeURIComponent(token)}`),

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
    const data = await httpGet<{
      user: { email: string; type: AuthUser["type"]; role?: string | null; user_category?: string | null };
    }>("/auth/me");
    return {
      email: data.user.email,
      type: data.user.type,
      role: data.user.role ?? null,
      user_category: data.user.user_category ?? null,
    };
  },
};
