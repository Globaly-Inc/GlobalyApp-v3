import { createApi } from "@/lib/api/create-api";
import { referralsMockApi } from "./mock-data";
import { referralsRealApi } from "./real-api";

export const referralsApi = createApi({ mock: referralsMockApi, real: referralsRealApi });

export type {
  MyReferrals,
  ReferralConfig,
  ReferralRow,
  ReferralStats,
  ReferralActionType,
  ReferralState,
} from "./types";
