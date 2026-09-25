// Self-service institution profile — the institution twin of businesses' BusinessProfilePatchSchema.

import { z } from "zod";

export {
  StartExtractionSchema, SiteUrlsQuerySchema, SiteUrlSnapshotQuerySchema, SiteUrlSnapshotUpdateSchema, SiteUrlRefreshSchema,
  type StartExtractionInput, type SiteUrlsQueryInput, type SiteUrlSnapshotQueryInput, type SiteUrlSnapshotUpdateInput,
  type SiteUrlRefreshInput,
} from "../../superadmin/data-extraction/schemas/self-service.schema.js";

export const InstitutionProfilePatchSchema = z.object({
  institution_name: z.string().min(1),
  // Ownership sector. The enum mirrors `institutions_institution_type_check` exactly — anything
  // else reaches the database as a constraint violation rather than a 400 (see 20260909_003).
  // Nullable so an owner can clear a classification they set by mistake.
  institution_type: z.enum(["Public", "Private"]).nullable(),
  description: z.string().nullable(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  country_id: z.number().int().positive().nullable(),
  state: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  postcode: z.string().nullable(),
  currency: z.string().nullable(),
  registration_licenses: z.record(z.string(), z.unknown()).nullable(),
  linkedin_url: z.string().nullable(),
  facebook_url: z.string().nullable(),
  instagram_url: z.string().nullable(),
  twitter_url: z.string().nullable(),
  youtube_url: z.string().nullable(),
  whatsapp_url: z.string().nullable(),
  logo_url: z.string().nullable(),
  cover_url: z.string().nullable(),
  is_published: z.boolean(),
  // Per-section public/private map, e.g. { contact: true, registration: false } — same shape and
  // same default-public read rule as businesses'.
  public_visibility: z.record(z.string(), z.boolean()).nullable(),
}).partial().strict();

export type InstitutionProfilePatchInput = z.infer<typeof InstitutionProfilePatchSchema>;

