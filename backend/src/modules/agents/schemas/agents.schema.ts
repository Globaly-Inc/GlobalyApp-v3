import { z } from "zod";

export const InviteAgentSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  role: z.string().min(1).default("member"),
});

export const AcceptInviteSchema = z.object({
  token: z.string().min(1),
});

export const AgentParamsSchema = z.object({
  id: z.coerce.number().int(),
});

export type InviteAgentInput = z.infer<typeof InviteAgentSchema>;
