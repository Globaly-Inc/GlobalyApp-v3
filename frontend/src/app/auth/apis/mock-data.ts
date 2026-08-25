import type {
  AcceptInviteParams, AcceptInviteResult, AuthMeBusiness, AuthMeInstitution, AuthUser, SendOtpParams,
  SwitchAccountParams, SwitchAccountResult, UpdateRoleParams, VerifyOtpParams,
} from "./types";

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
    if (mockUser) mockUser = { ...mockUser, user_category: params.category };
  },

  verifyOtp: async ({ email, otp }: VerifyOtpParams): Promise<AuthUser> => {
    await delay(500);
    if (otp !== MOCK_OTP) {
      throw new Error(`Invalid or expired code. (mock mode: use ${MOCK_OTP})`);
    }
    mockUser = { email, type: "platform_user", role: null, is_admin: false, user_category: null, businesses: [], institutions: [], orgId: null };
    return mockUser;
  },

  listMyBusinesses: async (): Promise<AuthMeBusiness[]> => {
    console.log("[mock] GET /auth/me (businesses)");
    await delay(200);
    return [
      {
        id: 1,
        org_id: "mock-org-1",
        business_name: "Mock Consultancy",
        subdomain: "mock",
        logo_url: null,
        owner_id: 1,
        role: "owner",
        is_owner: true,
      },
    ];
  },

  listMyInstitutions: async (): Promise<AuthMeInstitution[]> => {
    console.log("[mock] GET /auth/me (institutions)");
    await delay(200);
    return [];
  },

  getMe: async (): Promise<AuthUser> => {
    console.log("[mock] GET /auth/me");
    await delay(300);
    if (!mockUser) throw new Error("Not signed in.");
    return mockUser;
  },

  acceptInvite: async ({ token }: AcceptInviteParams): Promise<AcceptInviteResult> => {
    console.log("[mock] GET /admin/users/invite/accept", { token });
    await delay(500);
    if (!token) throw new Error("Invitation not found or already used.");
    return { message: "Invitation accepted. Your account is being set up." };
  },

  switchAccount: async ({ org_id }: SwitchAccountParams): Promise<SwitchAccountResult> => {
    console.log("[mock] POST /auth/switch-account", { org_id });
    await delay(300);
    if (mockUser) mockUser = { ...mockUser, orgId: org_id };
    return { access_token: "mock-access-token" };
  },
};
