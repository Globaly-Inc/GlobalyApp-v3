import { httpGet, httpPost } from "@/lib/api/http";
import type { CheckoutSession, Plan, PortalSession, SubscriptionStatus, WalletBalance } from "./types";

export const businessBillingRealApi = {
  listPlans: (): Promise<Plan[]> => httpGet("/billing/plans"),

  getSubscription: (): Promise<SubscriptionStatus> => httpGet("/billing/subscription"),

  getWallet: (): Promise<WalletBalance> => httpGet("/billing/wallet"),

  startCheckout: (planCode: string): Promise<CheckoutSession> =>
    httpPost("/billing/subscription/checkout", { plan_code: planCode }),

  openPortal: (): Promise<PortalSession> => httpPost("/billing/portal", {}),
};
