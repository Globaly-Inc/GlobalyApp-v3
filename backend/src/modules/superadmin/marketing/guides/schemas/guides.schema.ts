// Validation schemas for the guides lead-gen landing pages — admin CRUD + public lead capture.

import { z } from "zod";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

const slug = z.string().trim().min(1).max(300).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens");

// z.coerce.boolean() coerces via JS `Boolean(value)`, so the *string* "false" — exactly
// what a query param carries — comes out `true`. Only "true"/"false" text is accepted here.
const booleanQueryParam = z.enum(["true", "false"]).transform((v) => v === "true");

export const GuideInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  slug,
  country: z.string().max(100).nullable().optional(),
  context: z.string().nullable().optional(),
  background_image_url: z.string().url().nullable().optional(),
  background_video_url: z.string().url().nullable().optional(),
  // Relative GCS storage path, not a URL — pdf_url is never public (see storageService).
  pdf_url: z.string().nullable().optional(),
  pdf_cover_image_url: z.string().url().nullable().optional(),
  is_published: z.boolean().optional(),
});

export const GuideListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  is_published: booleanQueryParam.optional(),
});

// `website` is a honeypot: real visitors never see or fill this field (hidden via CSS),
// so a non-empty value marks the submission as a bot — see guides.service.ts#submitLead.
export const PublicLeadInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  website: z.string().trim().max(500).optional().default(""),
});

export type GuideInput = z.infer<typeof GuideInputSchema>;
export type PublicLeadInput = z.infer<typeof PublicLeadInputSchema>;
