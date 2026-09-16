import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";

export const MemberListQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
});

export const InviteAgentSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(50).nullable().optional(),
  role: z.string().min(1).default("member"),
  admin_point_of_contact: z.boolean().optional().default(false),
  position: z.string().max(255).nullable().optional(),
});

export const AcceptInviteSchema = z.object({
  token: z.string().min(1),
});

export const AgentParamsSchema = z.object({
  id: z.coerce.number().int(),
});

export const InvitationParamsSchema = z.object({
  id: z.string().uuid(),
});

export const AgentPatchSchema = z.object({
  role: z.string().min(1).optional(),
  admin_point_of_contact: z.boolean().optional(),
  account_status: z.number().int().optional(),
  is_owner: z.boolean().optional(),
  position: z.string().max(255).nullable().optional(),
  is_public: z.boolean().optional(),
  // Contact-CRM fields (formerly the separate business_contacts table — now on agents/members
  // directly, see the 20260921_007 migrations).
  job_title: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  other_url: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  preferred_channel: z.string().nullable().optional(),
  is_primary: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
}).strict();

// ── Contacts ("Add Contact" — creates a dormant agent/member row, no invite email) ──

const contactUrlField = z.string().regex(/^https?:\/\/.+/i, "Enter a valid URL").nullable().optional();

export const ContactInputSchema = z.object({
  full_name: z.string().trim().min(2, "Name must be at least 2 characters"),
  job_title: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  email: z.string().email("Enter a valid email"),
  phone: z.string().nullable().optional(),
  phone_country_code: z.string().nullable().optional(),
  linkedin_url: contactUrlField,
  other_url: contactUrlField,
  tags: z.array(z.string()).default([]),
  preferred_channel: z.enum(["email", "phone", "whatsapp", "linkedin"]).nullable().optional(),
  is_primary: z.boolean().default(false),
  notes: z.string().max(2000, "Notes must be 2000 characters or fewer").nullable().optional(),
});

export const ContactPatchSchema = ContactInputSchema.partial();

export type ContactInput = z.infer<typeof ContactInputSchema>;
export type ContactPatch = z.infer<typeof ContactPatchSchema>;

// ── Custom roles (Settings → Roles) ──

export const RoleParamsSchema = z.object({
  id: z.coerce.number().int(),
});

export const RoleCreateSchema = z.object({
  display_name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  permission_ids: z.array(z.number().int()).default([]),
});

export const RolePatchSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  permission_ids: z.array(z.number().int()).optional(),
}).strict();

export type InviteAgentInput = z.infer<typeof InviteAgentSchema>;
export type AgentPatchInput = z.infer<typeof AgentPatchSchema>;
export type RoleCreateInput = z.infer<typeof RoleCreateSchema>;
export type RolePatchInput = z.infer<typeof RolePatchSchema>;
