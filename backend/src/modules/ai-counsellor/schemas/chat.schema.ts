import { z } from "zod";

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
  logo_url: z.string().url().max(500).optional(),
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

export const GuestSessionQuerySchema = z.object({
  embed_key: z.string().uuid(),
  fingerprint: z.string().min(1),
});

export const GuestMigrateSchema = z.object({
  fingerprint_hash: z.string().min(1),
});

/**
 * The visitor's answer to the contact card — both answers, one endpoint, because "not now"
 * is as much a recorded decision as a submission is (it restarts the cooldown).
 *
 * `website` is a honeypot, copied from the public guide-lead form: a real visitor never sees
 * the field, and a bot that fills every field gets a plausible success with no write, so it
 * has nothing to adapt to.
 *
 * The refine is the reason this is one schema rather than two — a "submit" without a name or
 * email would otherwise write half a contact and trip the DB's contact-pair CHECK as a 500.
 */
export const GuestContactSchema = z
  .object({
    embed_key: z.string().uuid(),
    fingerprint: z.string().min(1),
    action: z.enum(["submit", "skip"]),
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().max(320).optional(),
    website: z.string().max(200).optional(),
  })
  .refine((v) => v.action === "skip" || (!!v.name && !!v.email), {
    message: "Name and email are both required",
    path: ["email"],
  });

/**
 * The visitor's answer to the end-of-chat offer.
 *
 * The only thing that makes a summary due immediately. A quiet half hour still sends one
 * eventually, but only claiming to be the conversation they had — never that it was resolved.
 */
export const GuestConversationEndSchema = z.object({
  embed_key: z.string().uuid(),
  fingerprint: z.string().min(1),
  action: z.enum(["end", "continue"]),
});

export type CreditGrantInput = z.infer<typeof CreditGrantSchema>;
export type GuestMessageInput = z.infer<typeof GuestMessageSchema>;
export type GuestMigrateInput = z.infer<typeof GuestMigrateSchema>;
export type GuestSessionQuery = z.infer<typeof GuestSessionQuerySchema>;
export type GuestContactInput = z.infer<typeof GuestContactSchema>;
export type GuestConversationEndInput = z.infer<typeof GuestConversationEndSchema>;
