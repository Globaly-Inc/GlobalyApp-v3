import { z } from "zod";
import { webUrl } from "../../../shared/url.js";

export const SendMessageSchema = z.object({
  session_id: z.coerce.number().int().positive().optional(),
  content: z.string().trim().min(1).max(5000),
  attachments: z.array(z.string()).max(3).optional(),
});

export const SessionIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const MessageIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const UpdateSessionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  is_archived: z.boolean().optional(),
  delete: z.boolean().optional(),
});

export const FeedbackSchema = z.object({
  feedback: z.enum(["positive", "negative"]).nullable(),
});

export const ListSessionsQuerySchema = z.object({
  include_archived: z.coerce.boolean().default(false),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type SessionIdParam = z.infer<typeof SessionIdParamSchema>;
export type MessageIdParam = z.infer<typeof MessageIdParamSchema>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;
export type FeedbackInput = z.infer<typeof FeedbackSchema>;
export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;

export const CreditGrantSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().positive(),
  balance_type: z.enum(["free", "subscription", "purchased"]),
  reason: z.enum(["signup_grant", "admin_grant", "subscription_grant", "purchase"]),
});

export const GuestMessageSchema = z.object({
  content: z.string().trim().min(1).max(5000),
  fingerprint: z.string().min(1),
  embed_key: z.string().uuid().optional(),
});

export const EmbedConfigCreateSchema = z.object({
  display_name: z.string().trim().min(1).max(120).optional(),
  // webUrl(), never z.string().url(): this value is rendered into the embed
  // widget's <img src>, and the URL constructor accepts javascript:/data: schemes.
  logo_url: webUrl({ max: 500 }).optional(),
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  custom_instructions: z.string().trim().max(2000).optional(),
  monthly_credit_limit: z.coerce.number().int().min(1).max(100000).optional(),
});

export const EmbedConfigIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const EmbedKeyQuerySchema = z.object({
  key: z.string().uuid(),
});

export const GuestMigrateSchema = z.object({
  fingerprint_hash: z.string().min(1),
});

export type CreditGrantInput = z.infer<typeof CreditGrantSchema>;
export type GuestMessageInput = z.infer<typeof GuestMessageSchema>;
export type GuestMigrateInput = z.infer<typeof GuestMigrateSchema>;
