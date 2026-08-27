import { z } from "zod";

// The only keys the API accepts — a fixed catalogue, not a free-form KV store.
export const INTEGRATION_KEYS = ["higgsfield_api_key", "gsc_service_account_json", "gsc_site_url"] as const;
export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

export const UpdateIntegrationsSchema = z.object({
  higgsfield_api_key: z.string().trim().max(4096).optional(),
  gsc_service_account_json: z
    .string()
    .trim()
    .max(16384)
    .optional()
    .refine((v) => v === undefined || v === "" || isServiceAccountJson(v), {
      message: "Must be a Google service-account JSON with client_email and private_key",
    }),
  gsc_site_url: z.string().trim().max(512).optional(),
});
export type UpdateIntegrationsInput = z.infer<typeof UpdateIntegrationsSchema>;

function isServiceAccountJson(v: string): boolean {
  try {
    const parsed = JSON.parse(v);
    return typeof parsed.client_email === "string" && typeof parsed.private_key === "string";
  } catch {
    return false;
  }
}
