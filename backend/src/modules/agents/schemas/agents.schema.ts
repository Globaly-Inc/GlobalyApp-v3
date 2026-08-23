import { z } from "zod";

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
}).strict();

export type InviteAgentInput = z.infer<typeof InviteAgentSchema>;
export type AgentPatchInput = z.infer<typeof AgentPatchSchema>;
