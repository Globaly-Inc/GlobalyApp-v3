// Wire types for /api/v3/billing/*. Matches backend/src/modules/billing/schemas + services.

export type Plan = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  billing_interval: "month" | "year";
  included_credits: number;
  features: string[];
};

export type SubscriptionStatus = {
  plan_code: string | null;
  plan_name: string | null;
  subscription_id: string | null;
  currency: string | null;
  credit_balance: number;
  has_customer: boolean;
};

export type WalletBalance = {
  balance: number;
};

export type CheckoutSession = {
  url: string;
};

export type PortalSession = {
  url: string;
};
