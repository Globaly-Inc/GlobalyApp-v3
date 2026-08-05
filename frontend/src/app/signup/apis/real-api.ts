import { httpPost } from "@/lib/api/http";
import { saveTokens } from "@/lib/session";
import type { AuthUser, RegisterParams, SendOtpParams, VerifyOtpParams } from "./types";

export const signupRealApi = {
  register: ({ firstName, lastName, email }: RegisterParams): Promise<void> =>
    httpPost("/students/register", {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim().toLowerCase(),
    }),

  sendOtp: ({ email }: SendOtpParams): Promise<void> =>
    httpPost("/auth/send-otp", { email: email.trim().toLowerCase() }),

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
