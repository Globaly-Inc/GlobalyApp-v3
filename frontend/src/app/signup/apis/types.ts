export type AuthUser = {
  email: string;
  type: "admin" | "platform_user" | "agent";
  role: string | null;
  user_category: string | null;
};

export type RegisterParams = {
  firstName: string;
  lastName: string;
  email: string;
};

export type SendOtpParams = {
  email: string;
};

export type VerifyOtpParams = {
  email: string;
  otp: string;
};
