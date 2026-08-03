// Validation schemas for business registration and profile management.

import { z } from "zod";

const BUSINESS_TYPES = ["agent", "institution", "service_provider", "accreditation_body", "immigration_department"] as const;

export const BusinessRegisterSchema = z.object({
  // Tenant fields (existing registration)
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  subdomain: z.string().min(3).max(20).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase alphanumeric with hyphens"),
  business_name: z.string().min(1).max(200),
  // Business profile extension (from V2)
  business_type: z.enum(BUSINESS_TYPES).optional(),
  description: z.string().max(5000).optional(),
  phone: z.string().max(50).optional(),
  country_id: z.number().int().positive().optional(),
  state: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  postcode: z.string().max(20).optional(),
  website: z.string().url().optional(),
  registration_licenses: z.record(z.unknown()).optional(),
});

export const BusinessProfilePatchSchema = z.object({
  business_type: z.enum(BUSINESS_TYPES).nullable(),
  description: z.string().max(5000).nullable(),
  logo_url: z.string().url().nullable(),
  cover_url: z.string().url().nullable(),
  email: z.string().email().nullable(),
  phone: z.string().max(50).nullable(),
  country_id: z.number().int().positive().nullable(),
  state: z.string().max(100).nullable(),
  city: z.string().max(100).nullable(),
  address: z.string().max(500).nullable(),
  postcode: z.string().max(20).nullable(),
  linkedin_url: z.string().url().nullable(),
  facebook_url: z.string().url().nullable(),
  instagram_url: z.string().url().nullable(),
  twitter_url: z.string().url().nullable(),
  youtube_url: z.string().url().nullable(),
  whatsapp_url: z.string().url().nullable(),
  gallery_images: z.array(z.string()).nullable(),
  video_urls: z.array(z.string()).nullable(),
  registration_licenses: z.record(z.unknown()).nullable(),
  is_published: z.boolean(),
  onboarding_completed: z.boolean(),
}).partial().strict();

export type BusinessRegisterInput = z.infer<typeof BusinessRegisterSchema>;
export type BusinessProfilePatchInput = z.infer<typeof BusinessProfilePatchSchema>;
