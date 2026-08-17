import { httpGet, httpPatch } from "@/lib/api/http";
import type { FeatureFlag } from "./types";

/** Row shape of superadmin.feature_flags as returned by the platform feature-flag routes. */
type FeatureFlagRow = {
  flag_key: string;
  is_enabled: boolean;
  description: string | null;
};

const toFlag = (row: FeatureFlagRow): FeatureFlag => ({
  key: row.flag_key,
  label: row.description ?? row.flag_key,
  enabled: row.is_enabled,
});

export const featureFlagsRealApi = {
  getFlags: async (): Promise<FeatureFlag[]> => {
    const res = await httpGet<{ flags: FeatureFlagRow[] }>("/admin/platform/feature-flags");
    return res.flags.map(toFlag);
  },

  // PATCH /admin/platform/feature-flags/:key — keyed by flag_key, body is { is_enabled }.
  toggleFlag: async (key: string, enabled: boolean): Promise<FeatureFlag> =>
    toFlag(await httpPatch<FeatureFlagRow>(`/admin/platform/feature-flags/${key}`, { is_enabled: enabled })),
};
