export type FeatureFlag = {
  /** The backend's `flag_key` — this is what PATCH /admin/platform/feature-flags/:key takes. */
  key: string;
  label: string;
  enabled: boolean;
};
