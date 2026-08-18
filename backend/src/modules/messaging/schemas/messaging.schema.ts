import { z } from "zod";

import { PaginationSchema } from "../../../shared/pagination.js";

export const ConversationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const StartConversationSchema = z
  .object({
    student_user_id: z.coerce.number().int().positive(),
    // App-level reference to enquiries.id (D1). Optional: a conversation can also be
    // started outside an enquiry, but when present it is the idempotency key.
    enquiry_id: z.coerce.number().int().positive().optional(),
    title: z.string().max(200).optional(),
  })
  .strict();

export const SendMessageSchema = z
  .object({
    content: z.string().max(10_000).nullable().optional(),
    message_type: z.enum(["text", "image", "file"]).default("text"),
    file_url: z.string().max(2000).nullable().optional(),
    file_name: z.string().max(500).nullable().optional(),
    file_size: z.coerce.number().int().nonnegative().nullable().optional(),
  })
  .strict()
  .refine((b) => (b.content && b.content.trim().length > 0) || !!b.file_url, {
    message: "A message needs text content or a file",
  });

export const InviteParticipantSchema = z
  .object({ invitee_user_id: z.coerce.number().int().positive() })
  .strict();

/**
 * History paging. `anchor_id` is the high-water message id captured on the first page;
 * every later page filters `id <= anchor_id`, so messages arriving mid-scroll land above
 * the anchor and cannot shift a row from one page to the next. Offsets stay meaningful,
 * and the shared PaginationSchema stays the contract.
 */
export const HistoryQuerySchema = PaginationSchema.extend({
  anchor_id: z.coerce.number().int().positive().optional(),
});

export const StreamQuerySchema = z.object({
  since_id: z.coerce.number().int().nonnegative().optional(),
});

export type StartConversationInput = z.infer<typeof StartConversationSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
