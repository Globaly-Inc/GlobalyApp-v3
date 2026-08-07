import { httpGet, httpPatch } from "@/lib/api/http";
import type { FeatureFlag } from "./types";

export const featureFlagsRealApi = {
  getFlags: (): Promise<FeatureFlag[]> => httpGet("/admin/feature-flags"),

  toggleFlag: (id: string, enabled: boolean): Promise<FeatureFlag> =>
    httpPatch(`/admin/feature-flags/${id}`, { enabled }),
};
