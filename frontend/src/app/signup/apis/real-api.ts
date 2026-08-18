import { httpPost } from "@/lib/api/http";
import { saveTokens } from "@/lib/session";
import type { AuthUser, ClaimRequestParams, RegisterParams, SendOtpParams, VerifyOtpParams } from "./types";

export const signupRealApi = {
  register: ({ firstName, lastName, email, refToken }: RegisterParams): Promise<void> =>
    httpPost("/auth/register", {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim().toLowerCase(),
      // Omitted entirely when absent, so the backend zod schema sees an optional field rather than null.
      ...(refToken ? { ref_token: refToken } : {}),
    }),

  sendOtp: ({ email }: SendOtpParams): Promise<void> =>
    httpPost("/auth/send-otp", { email: email.trim().toLowerCase() }),

  requestBusinessClaim: ({ email }: ClaimRequestParams): Promise<void> =>
    httpPost("/businesses/claim/request", { email: email.trim().toLowerCase() }),

  verifyOtp: async ({ email, otp }: VerifyOtpParams): Promise<AuthUser> => {
    const data = await httpPost<{
      access_token: string;
      refresh_token: string;
      user: { id: number; email: string; type: AuthUser["type"]; role: string | null };
    }>("/auth/verify-otp", { email: email.trim().toLowerCase(), otp: otp.trim() });
    saveTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
    // verify-otp doesn't return user_category — the caller dispatches fetchMe() right after to get it.
    return { email, type: data.user.type, role: data.user.role, user_category: null };
  },
};
