export type AuthUser = {
  email: string;
  type: "admin" | "platform_user" | "agent";
  role: string | null;
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
