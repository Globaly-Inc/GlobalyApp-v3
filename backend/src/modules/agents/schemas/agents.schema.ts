// Validation schemas for agent auth, CRUD, and invitations.

import { z } from "zod";

export const LoginRequestOtpSchema = z.object({
  subdomain: z.string().min(1),
  email: z.string().email(),
});

export const LoginVerifyOtpSchema = z.object({
  subdomain: z.string().min(1),
  email: z.string().email(),
  otp: z.string().length(6),
});

export const RefreshSchema = z.object({
  subdomain: z.string().min(1),
  refresh_token: z.string().min(1),
});

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

export type LoginRequestOtpInput = z.infer<typeof LoginRequestOtpSchema>;
export type LoginVerifyOtpInput = z.infer<typeof LoginVerifyOtpSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type InviteAgentInput = z.infer<typeof InviteAgentSchema>;
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;
export type AgentParams = z.infer<typeof AgentParamsSchema>;
