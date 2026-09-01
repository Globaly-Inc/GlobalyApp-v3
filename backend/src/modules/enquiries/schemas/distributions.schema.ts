// Zod schemas for business-facing distribution endpoints — list-only.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";

// Mirrors chk_business_enquiries_status / chk_enquiries_status — the tenant row's
// vocabulary, since that is what the list returns.
export const ENQUIRY_STATUSES = [
  "pending",
  "distributed",
  "unlocked",
  "in_conversation",
  "converted",
  "closed",
  "no_match",
  "expired",
] as const;

export const ListDistributionsQuerySchema = PaginationSchema.extend({
  // A comma-separated list of statuses, not a single enum member: one inbox tab covers several
  // ("Unlocked" = unlocked, in_conversation, converted). Validated against the enum per item so an
  // unknown status is still rejected.
  status: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.split(",").every((part) => (ENQUIRY_STATUSES as readonly string[]).includes(part.trim())),
      { message: "Unknown enquiry status" },
    ),
  search: z.string().trim().min(1).optional(),
});

// Response shape for GET /enquiry-distributions — read from the tenant table,
// enriched with central enquiry/course/institution fields for display.
export const DistributionListItemSchema = z.object({
  enquiry_id: z.string(),
  distribution_id: z.string(),
  status: z.string(),
  tier: z.number().nullable(),
  match_rank: z.number().nullable(),
  message: z.string().nullable(),
  // True when `message` is only a teaser because the row is not unlocked yet.
  message_truncated: z.boolean(),
  preferred_intake: z.string().nullable(),
  preferred_year: z.number().nullable(),
  course_name: z.string().nullable(),
  course_short_name: z.string().nullable(),
  institution_name: z.string().nullable(),
  created_at: z.coerce.date(),

  accept_count: z.number(),
  max_accepts: z.number(),

  // The rollup is visible either way. Null on pre-check enquiries.
  eligibility_status: z.enum(["eligible", "not_eligible", "unknown"]).nullable(),

  // The criteria behind the rollup name the student's actual degree and scores — profile detail
  // a locked row has not paid for, so this is null until unlocked.
  eligibility_criteria: z.array(z.unknown()).nullable(),

  is_unlocked: z.boolean(),
  coin_cost: z.number(),
  unlocked_at: z.coerce.date().nullable(),
  closed_at: z.coerce.date().nullable(),
  close_reason: z.string().nullable(),

  /** Visible before unlock — enough to address someone without identifying them. */
  student_first_name: z.string().nullable(),
  /** Signed avatar URL, unlocked only — a face identifies someone as surely as a surname does. */
  student_photo_url: z.string().nullable(),
  /** Full name, unlocked only. The surname is withheld rather than sent-and-blurred: a CSS blur
   *  still ships the real value to the browser. */
  student_name: z.string().nullable(),

  // Populated only once unlocked.
  student_email: z.string().nullable(),

  // Unlocked AND the student opted in at submission. Paying does not override the refusal.
  student_phone: z.string().nullable(),
  /** True when unlocked but the student declined to share their number — so the UI can say so
   *  rather than showing a blank that reads as missing data. */
  student_phone_withheld: z.boolean(),
});

export const DistributionIdParamSchema = z.object({
  id: z.string().uuid(),
});

// enquiry_messages.id is a serial, not a uuid — the star/pin/thread/reaction routes
// all address a message.
export const MessageIdParamSchema = z.object({
  messageId: z.coerce.number().int().positive(),
});

// An edit cannot clear a message — deleting is the way to remove one, so unlike
// SendEnquiryMessageSchema there is no attachment escape hatch for an empty body.
export const EditEnquiryMessageSchema = z.object({
  body: z.string().trim().min(1, "A message can't be empty").max(4000),
});

// The DB also caps this (chk_enquiry_message_reactions_emoji) — 16 chars is generous
// enough for a ZWJ sequence like a family emoji, and short enough that nobody can use a
// reaction as a text field.
export const ToggleReactionSchema = z.object({
  emoji: z.string().trim().min(1, "Pick an emoji").max(16),
});

// A reason is mandatory: the whole point of per-distribution closure is knowing WHY
// this particular business dropped the lead.
export const CloseDistributionSchema = z.object({
  close_reason: z.string().trim().min(3, "Tell us why in at least 3 characters").max(1000),
});

// Shared by both sides of the enquiry chat. The DB also enforces "text or files"
// (enquiry_messages_body_chk), so a caller that skips this schema still cannot write an
// empty message.
export const SendEnquiryMessageSchema = z
  .object({
    // No min(1): a file with no caption is a message. The refine below is what rejects
    // a request that carries neither.
    body: z.string().trim().max(4000).default(""),
    attachments: z.array(z.string().min(1)).max(5).optional(),
  })
  .refine((v) => v.body.length > 0 || (v.attachments?.length ?? 0) > 0, {
    message: "Write a message or attach a file",
    path: ["body"],
  });

export const EnquiryMessageSchema = z.object({
  id: z.number(),
  body: z.string(),
  created_at: z.coerce.date(),
  sender_id: z.number(),
  sender_name: z.string(),
  sender_avatar: z.string().nullable(),
  is_mine: z.boolean(),
  sender_role: z.enum(["student", "business"]),
});
