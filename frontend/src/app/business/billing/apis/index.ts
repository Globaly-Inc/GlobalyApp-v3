import { createApi } from "@/lib/api/create-api";
import { businessBillingMockApi } from "./mock-data";
import { businessBillingRealApi } from "./real-api";

export const businessBillingApi = createApi({ mock: businessBillingMockApi, real: businessBillingRealApi });
export type { CheckoutSession, Plan, PortalSession, SubscriptionStatus, WalletBalance } from "./types";
