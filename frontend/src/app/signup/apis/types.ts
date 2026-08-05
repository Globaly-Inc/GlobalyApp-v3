export type AuthUser = {
  email: string;
  type: "admin" | "student" | "agent";
  role: string | null;
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
