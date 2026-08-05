export const RATE_LIMITS = {
  register: { max: 5, timeWindow: "15 minutes" },
  sendOtp: { max: 5, timeWindow: "1 minute" },
  verifyOtp: { max: 10, timeWindow: "5 minutes" },
} as const;
