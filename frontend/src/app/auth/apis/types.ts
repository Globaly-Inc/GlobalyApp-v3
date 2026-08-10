export type AuthUser = {
  email: string;
  type: "admin" | "platform_user" | "agent";
  role: string | null;
  user_category: string | null;
};

export type SendOtpParams = {
  email: string;
};

export type VerifyOtpParams = {
  email: string;
  otp: string;
};

export type UpdateRoleParams = {
  category: "personal" | "business";
};

export type AcceptInviteParams = {
  token: string;
};

export type AcceptInviteResult = {
  message: string;
};
