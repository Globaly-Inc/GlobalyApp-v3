import type { AuthUser, RegisterParams, SendOtpParams, VerifyOtpParams } from "./types";

const MOCK_OTP = "123456";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const signupMockApi = {
  register: async (params: RegisterParams): Promise<void> => {
    void params;
    await delay(500);
  },

  sendOtp: async (params: SendOtpParams): Promise<void> => {
    void params;
    await delay(500);
  },

  verifyOtp: async ({ email, otp }: VerifyOtpParams): Promise<AuthUser> => {
    await delay(500);
    if (otp !== MOCK_OTP) {
      throw new Error(`Invalid or expired code. (mock mode: use ${MOCK_OTP})`);
    }
    return { email, type: "student", role: null };
  },
};
