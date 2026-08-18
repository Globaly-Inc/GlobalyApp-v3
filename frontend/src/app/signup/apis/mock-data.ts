import { ApiError } from "@/lib/api/http";
import type { AuthUser, ClaimRequestParams, RegisterParams, SendOtpParams, VerifyOtpParams } from "./types";

const MOCK_OTP = "123456";
// ponytail: no mock businesses list to check against — hardcode one email to exercise the claim-offer UI in mock mode.
const MOCK_CLAIMABLE_EMAIL = "claim@example.com";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const signupMockApi = {
  register: async ({ email }: RegisterParams): Promise<void> => {
    await delay(500);
    if (email.trim().toLowerCase() === MOCK_CLAIMABLE_EMAIL) {
      throw new ApiError(
        `A business profile ("Mock Claimable Business") already exists for this email. Would you like to claim it?`,
        "BUSINESS_CLAIM_AVAILABLE",
      );
    }
  },

  requestBusinessClaim: async (params: ClaimRequestParams): Promise<void> => {
    console.log("[mock] POST /businesses/claim/request", params);
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
    return { email, type: "platform_user", role: null, user_category: null };
  },
};
