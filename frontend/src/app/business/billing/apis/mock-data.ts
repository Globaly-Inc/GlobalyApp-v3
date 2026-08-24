import type { CheckoutSession, Plan, PortalSession, SubscriptionStatus, WalletBalance } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const mockPlans: Plan[] = [
  {
    id: 1,
    code: "starter",
    name: "Starter",
    description: "For a single business getting started with enquiries.",
    price_minor: 4900,
    currency: "USD",
    billing_interval: "month",
    included_credits: 200,
    features: ["200 enquiry credits / month", "1 branch", "Email support"],
  },
  {
    id: 2,
    code: "growth",
    name: "Growth",
    description: "For a growing team unlocking enquiries across branches.",
    price_minor: 14900,
    currency: "USD",
    billing_interval: "month",
    included_credits: 1000,
    features: ["1,000 enquiry credits / month", "Up to 5 branches", "Priority support"],
  },
  {
    id: 3,
    code: "pro",
    name: "Pro",
    description: "For established businesses with high enquiry volume.",
    price_minor: 39900,
    currency: "USD",
    billing_interval: "month",
    included_credits: 3500,
    features: ["3,500 enquiry credits / month", "Unlimited branches", "Dedicated account manager"],
  },
];

let mockSubscription: SubscriptionStatus = {
  plan_code: null,
  plan_name: null,
  subscription_id: null,
  currency: null,
  credit_balance: 500,
  has_customer: false,
};

export const businessBillingMockApi = {
  listPlans: async (): Promise<Plan[]> => {
    console.log("[mock] GET /billing/plans");
    await delay(150);
    return mockPlans;
  },

  getSubscription: async (): Promise<SubscriptionStatus> => {
    console.log("[mock] GET /billing/subscription");
    await delay(150);
    return mockSubscription;
  },

  getWallet: async (): Promise<WalletBalance> => {
    console.log("[mock] GET /billing/wallet");
    await delay(100);
    return { balance: mockSubscription.credit_balance };
  },

  startCheckout: async (planCode: string): Promise<CheckoutSession> => {
    console.log("[mock] POST /billing/subscription/checkout", { planCode });
    await delay(300);
    const plan = mockPlans.find((p) => p.code === planCode);
    if (!plan) throw new Error("Unknown plan");
    // No real Stripe locally — simulate immediate activation instead of a redirect.
    mockSubscription = {
      plan_code: plan.code,
      plan_name: plan.name,
      subscription_id: `sub_mock_${plan.code}`,
      currency: plan.currency,
      credit_balance: mockSubscription.credit_balance + plan.included_credits,
      has_customer: true,
    };
    return { url: "" };
  },

  openPortal: async (): Promise<PortalSession> => {
    console.log("[mock] POST /billing/portal");
    await delay(200);
    if (!mockSubscription.has_customer) throw new Error("This business has no billing account yet — subscribe to a plan first");
    return { url: "" };
  },
};
