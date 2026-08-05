import type { AuthUser, SendOtpParams, UpdateRoleParams, VerifyOtpParams } from "./types";

const MOCK_OTP = "123456";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const authMockApi = {
  sendOtp: async (params: SendOtpParams): Promise<void> => {
    void params;
    await delay(500);
  },

  updateRole: async (params: UpdateRoleParams): Promise<void> => {
    console.log("[mock] POST /user/update", params);
    await delay(300);
  },

  verifyOtp: async ({ email, otp }: VerifyOtpParams): Promise<AuthUser> => {
    await delay(500);
    if (otp !== MOCK_OTP) {
      throw new Error(`Invalid or expired code. (mock mode: use ${MOCK_OTP})`);
    }
    return { email, type: "student", role: null };
  },
};
