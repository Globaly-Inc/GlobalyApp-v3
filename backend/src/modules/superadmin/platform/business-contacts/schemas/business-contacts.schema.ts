// Validation schemas for the business_contacts table — private, Super-Admin-only contact
// records (ported from V1). Same shape for a business or an institution.

import { z } from "zod";
import { PaginationSchema } from "../../../../../shared/pagination.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const SubIdParamSchema = z.object({ id: z.coerce.number().int().positive(), subId: z.string().uuid() });

export const ContactListQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
});

const urlField = z.string().regex(/^https?:\/\/.+/i, "Enter a valid URL").nullable().optional();

export const ContactInputSchema = z
  .object({
    full_name: z.string().trim().min(2, "Name must be at least 2 characters"),
    job_title: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    email: z.string().email("Enter a valid email").nullable().optional(),
    phone: z.string().nullable().optional(),
    phone_country_code: z.string().nullable().optional(),
    linkedin_url: urlField,
    other_url: urlField,
    tags: z.array(z.string()).default([]),
    preferred_channel: z.enum(["email", "phone", "whatsapp", "linkedin"]).nullable().optional(),
    is_primary: z.boolean().default(false),
    notes: z.string().max(2000, "Notes must be 2000 characters or fewer").nullable().optional(),
  })
  .refine((d) => !!d.email || !!d.phone || !!d.linkedin_url, {
    message: "Provide at least one of email, phone, or LinkedIn.",
    path: ["email"],
  });

export const ContactPatchSchema = z.object({
  full_name: z.string().trim().min(2, "Name must be at least 2 characters").optional(),
  job_title: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  email: z.string().email("Enter a valid email").nullable().optional(),
  phone: z.string().nullable().optional(),
  phone_country_code: z.string().nullable().optional(),
  linkedin_url: urlField,
  other_url: urlField,
  tags: z.array(z.string()).optional(),
  preferred_channel: z.enum(["email", "phone", "whatsapp", "linkedin"]).nullable().optional(),
  is_primary: z.boolean().optional(),
  notes: z.string().max(2000, "Notes must be 2000 characters or fewer").nullable().optional(),
});

export type ContactInput = z.infer<typeof ContactInputSchema>;
export type ContactPatch = z.infer<typeof ContactPatchSchema>;
