// Constants shared across the billing module.

/** Matches the enquiry-unlock placeholder this wallet replaces (credits.service.ts). */
export const SIGNUP_GRANT_CREDITS = Number(process.env.BUSINESS_SIGNUP_CREDITS) || 500;

export type CreditReason = "signup_grant" | "enquiry_unlock" | "unlock_refund" | "purchase" | "admin_grant" | "subscription_grant";

export type ReferenceType = "enquiry_distribution" | "stripe_subscription" | "stripe_checkout_session";
