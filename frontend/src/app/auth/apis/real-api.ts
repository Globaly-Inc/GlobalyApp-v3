import { httpGet, httpPatch, httpPost, runExclusiveSwitch } from "@/lib/api/http";
import { getRefreshToken, saveAccessToken, saveTokens } from "@/lib/session";
import type {
  AcceptInviteParams, AcceptInviteResult, AuthMeBusiness, AuthMeInstitution, AuthMeUser, AuthUser, SendOtpParams,
  SwitchAccountParams, SwitchAccountResult, UpdateRoleParams, VerifyOtpParams,
} from "./types";

function resolveUserCategory(user: AuthMeUser): AuthUser["user_category"] {
  if (user.is_business_account) return "business";
  if (user.is_institution_account) return "institution";
  if (user.is_personal_account) return "personal";
  return null;
}

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
    // Accurate at login time — the token was just minted, so it can't yet be business-scoped
    // (only a later /auth/switch-account can turn `type` into "platform_user" for an admin).
    return {
      email,
      type: data.user.type,
      role: data.user.role,
      is_admin: data.user.type === "admin",
      user_category: null,
      businesses: [],
      institutions: [],
      orgId: null,
    };
  },

  /** The businesses this user is an agent in — the org_ids valid for switch-account. */
  listMyBusinesses: async (): Promise<AuthMeBusiness[]> => {
    const data = await httpGet<{ user: AuthMeUser }>("/auth/me");
    return data.user.businesses ?? [];
  },

  /** The institutions this user is a member of — used by BusinessShell as a fallback
   * when the user has no businesses (institution accounts act as businesses in the UI). */
  listMyInstitutions: async (): Promise<AuthMeInstitution[]> => {
    const data = await httpGet<{ user: AuthMeUser }>("/auth/me");
    return data.user.institutions ?? [];
  },

  getMe: async (): Promise<AuthUser> => {
    const data = await httpGet<{ user: AuthMeUser }>("/auth/me");
    return {
      email: data.user.email,
      type: data.user.type,
      role: data.user.admin_role ?? null,
      is_admin: data.user.is_admin,
      user_category: resolveUserCategory(data.user),
      businesses: data.user.businesses ?? [],
      institutions: data.user.institutions ?? [],
      orgId: data.user.orgId ?? null,
    };
  },

  switchAccount: ({ org_id }: SwitchAccountParams): Promise<SwitchAccountResult> =>
    // Serialized against ensureBusinessContext()'s own switch-account call (http.ts) — both
    // can fire on the same page mount, and racing them lets whichever resolves last silently
    // clobber the other's saved token, leaving the app scoped to the wrong business.
    runExclusiveSwitch(async () => {
      // Sending the refresh token lets the backend remember this choice on the session, so the
      // next silent /refresh doesn't reset back to the default business (see auth.service.ts).
      const data = await httpPost<{ access_token: string }>("/auth/switch-account", {
        org_id,
        refresh_token: getRefreshToken() ?? undefined,
      });
      saveAccessToken(data.access_token);
      return { access_token: data.access_token };
    }),
};
