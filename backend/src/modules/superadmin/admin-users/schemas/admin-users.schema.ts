// Validation schemas for admin user auth, CRUD, and invitations.

import { z } from "zod";

const ADMIN_ROLES = ["super_admin", "admin", "data_admin", "moderator"] as const;

export const LoginRequestOtpSchema = z.object({
  email: z.string().email(),
});

export const LoginVerifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const InviteAdminSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  role: z.enum(ADMIN_ROLES).default("admin"),
});

export const AcceptInviteSchema = z.object({
  token: z.string().min(1),
});

export const UpdateAdminSchema = z
  .object({
    name: z.string().min(1).max(200),
    role: z.enum(ADMIN_ROLES),
    account_status: z.number().int(),
    photo_url: z.string().url(),
  })
  .partial()
  .strict();

export const AdminParamsSchema = z.object({
  id: z.coerce.number().int(),
});

export type LoginRequestOtpInput = z.infer<typeof LoginRequestOtpSchema>;
export type LoginVerifyOtpInput = z.infer<typeof LoginVerifyOtpSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type InviteAdminInput = z.infer<typeof InviteAdminSchema>;
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;
export type UpdateAdminInput = z.infer<typeof UpdateAdminSchema>;
export type AdminParams = z.infer<typeof AdminParamsSchema>;
