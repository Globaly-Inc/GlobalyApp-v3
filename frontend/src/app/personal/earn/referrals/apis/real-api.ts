import { httpGet } from "@/lib/api/http";
import type { MyReferrals } from "./types";

export const referralsRealApi = {
  getMyReferrals: (): Promise<MyReferrals> => httpGet("/referrals/me"),
};
