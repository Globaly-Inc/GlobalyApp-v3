import type { AuthUser, SendOtpParams, UpdateRoleParams, VerifyOtpParams } from "./types";

const MOCK_OTP = "123456";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockUser: AuthUser | null = null;

export const authMockApi = {
  sendOtp: async (params: SendOtpParams): Promise<void> => {
    void params;
    await delay(500);
  },

  updateRole: async (params: UpdateRoleParams): Promise<void> => {
    console.log("[mock] PATCH /platform-users/me/category", params);
    await delay(300);
  },

  verifyOtp: async ({ email, otp }: VerifyOtpParams): Promise<AuthUser> => {
    await delay(500);
    if (otp !== MOCK_OTP) {
      throw new Error(`Invalid or expired code. (mock mode: use ${MOCK_OTP})`);
    }
    mockUser = { email, type: "platform_user", role: null };
    return mockUser;
  },

  getMe: async (): Promise<AuthUser> => {
    console.log("[mock] GET /auth/me");
    await delay(300);
    if (!mockUser) throw new Error("Not signed in.");
    return mockUser;
  },
};
