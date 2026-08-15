// Validation schemas for admin-managed business listings.

import { z } from "zod";
import { PaginationSchema } from "../../../../../shared/pagination.js";

export { PaginationSchema as ActivityListQuerySchema } from "../../../../../shared/pagination.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const MemberParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  memberId: z.coerce.number().int().positive(),
});

export const MemberInviteSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(50).nullable().optional(),
  role: z.string().min(1).default("member"),
  admin_point_of_contact: z.boolean().optional().default(false),
});

export const MemberPatchSchema = z.object({
  role: z.string().min(1).optional(),
  admin_point_of_contact: z.boolean().optional(),
  account_status: z.number().int().optional(),
  is_owner: z.boolean().optional(),
}).strict();

export const MemberListQuerySchema = PaginationSchema.extend({
  point_of_contact: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

export const ListQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
  status: z.string().optional(),
  category: z.coerce.number().int().positive().optional(),
  category_slug: z.string().optional(),
});

export const StatusPatchSchema = z.object({
  status: z.enum(["unverified", "claim_pending", "verified", "suspended", "rejected"]),
});

export const PublishedPatchSchema = z.object({ is_published: z.boolean() });

export const EnquirySettingsPatchSchema = z.object({
  enquiry_enabled: z.boolean().optional(),
  enquiry_coin_cost: z.number().int().min(0).optional(),
  enquiry_max_distributions: z.number().int().min(0).optional(),
}).strict();

export const BusinessPatchSchema = z.object({
  business_name: z.string().min(1),
  business_type: z.string().nullable(),
  business_category_id: z.number().int().positive().nullable(),
  description: z.string().nullable(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  country_id: z.number().int().positive().nullable(),
  state: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  postcode: z.string().nullable(),
  logo_url: z.string().nullable(),
  cover_url: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  facebook_url: z.string().nullable(),
  instagram_url: z.string().nullable(),
  twitter_url: z.string().nullable(),
  youtube_url: z.string().nullable(),
  whatsapp_url: z.string().nullable(),
  gallery_images: z.array(z.string()).nullable(),
  video_urls: z.array(z.string()).nullable(),
}).partial().strict();

export const BusinessCreateSchema = z.object({
  business_name: z.string().min(1),
  business_category_id: z.number().int().positive(),
  subdomain: z.string().min(1),
  description: z.string().nullable().optional(),
  email: z.string().email(),
  first_name: z.string().min(1).max(100).nullable().optional(),
  last_name: z.string().min(1).max(100).nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  country_id: z.number().int().positive().nullable().optional(),
  state: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  cover_url: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  facebook_url: z.string().nullable().optional(),
  instagram_url: z.string().nullable().optional(),
  twitter_url: z.string().nullable().optional(),
});

export type BusinessCreateInput = z.infer<typeof BusinessCreateSchema>;
export type BusinessPatchInput = z.infer<typeof BusinessPatchSchema>;
export type EnquirySettingsPatchInput = z.infer<typeof EnquirySettingsPatchSchema>;
export type BusinessStatus = z.infer<typeof StatusPatchSchema>["status"];
export type MemberInviteInput = z.infer<typeof MemberInviteSchema>;
export type MemberPatchInput = z.infer<typeof MemberPatchSchema>;
