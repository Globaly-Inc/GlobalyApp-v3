import { httpGet } from "@/lib/api/http";
import type { ReferralConfig, ReferralLookup } from "./types";

export const joinRealApi = {
  // Unknown OR unusable codes both return a generic 404, so httpGet throws either way and the caller
  // cannot tell them apart — deliberately, so this is not an enumeration oracle.
  lookup: (code: string): Promise<ReferralLookup> =>
    httpGet(`/referrals/lookup/${encodeURIComponent(code)}`),
  getConfig: (): Promise<ReferralConfig> => httpGet("/referrals/config"),
};
