import { httpPost } from "@/lib/api/http";
import { saveTokens } from "@/lib/session";
import type { AuthUser, SendOtpParams, UpdateRoleParams, VerifyOtpParams } from "./types";

export const authRealApi = {
  sendOtp: ({ email }: SendOtpParams): Promise<void> =>
    httpPost("/auth/send-otp", { email: email.trim().toLowerCase() }),

  updateRole: (params: UpdateRoleParams): Promise<void> => httpPost("/user/update", params),

  verifyOtp: async ({ email, otp }: VerifyOtpParams): Promise<AuthUser> => {
    const data = await httpPost<{
      access_token: string;
      refresh_token: string;
      type: AuthUser["type"];
      role: string | null;
    }>("/auth/verify-otp", { email: email.trim().toLowerCase(), otp: otp.trim() });
    saveTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
    return { email, type: data.type, role: data.role };
  },
};
