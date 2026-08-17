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
  feedback: z.enum(["positive", "negative"]),
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
