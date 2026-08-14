// Validation schemas for business registration and profile management.

import { z } from "zod";
import { BUSINESS_TYPES } from "../consts.js";

export const BusinessRegisterSchema = z.object({
  subdomain: z.string().min(3).max(20).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase alphanumeric with hyphens"),
  business_name: z.string().min(1).max(200),
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
  logo_url: z.string().nullable(),   // relative storage path or full URL
  cover_url: z.string().nullable(),  // relative storage path or full URL
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

export const BusinessSearchQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export type BusinessRegisterInput = z.infer<typeof BusinessRegisterSchema>;
export type BusinessProfilePatchInput = z.infer<typeof BusinessProfilePatchSchema>;
export type BusinessSearchQueryInput = z.infer<typeof BusinessSearchQuerySchema>;
