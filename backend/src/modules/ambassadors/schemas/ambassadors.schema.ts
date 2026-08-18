// Zod schemas for the ambassadors module. Field names and the writable/
// non-writable split are taken from the V2 route contract.
//
// Every body is `.strict()`: V2 relies on strict bodies to reject a spoofed
// `business_id`, `student_id`, `status` or earnings field, and so does V3. The
// owning ids always come from the path (asserted) or from req.auth, never the
// body.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";
import {
  AMBASSADOR_SETTABLE_STATUSES,
  APPLICATION_STATUSES,
  INQUIRY_STATUSES,
  PROGRAM_STATUSES,
} from "../consts.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const ProgramIdParamSchema = z.object({
  programId: z.coerce.number().int().positive(),
});
export const ApplicationParamSchema = ProgramIdParamSchema.extend({
  applicationId: z.coerce.number().int().positive(),
});
export const ApplicationIdParamSchema = z.object({
  applicationId: z.coerce.number().int().positive(),
});
export const InquiryIdParamSchema = z.object({
  inquiryId: z.coerce.number().int().positive(),
});
export const ThreadIdParamSchema = z.object({
  threadId: z.coerce.number().int().positive(),
});
/** Public program lookup accepts either the serial id or the slug. */
export const ProgramRefParamSchema = z.object({ idOrSlug: z.string().min(1).max(200) });

// ── Programs (business) ─────────────────────────────────────────────────────

const programWritable = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase alphanumeric with dashes"),
  description: z.string().max(8000).nullable().optional(),
  welcome_video_url: z.string().url().max(1000).nullable().optional(),
  status: z.enum(PROGRAM_STATUSES).optional(),
  application_stages: z.array(z.record(z.string(), z.unknown())).optional(),
  compensation_model: z.record(z.string(), z.unknown()).optional(),
  requirements: z.record(z.string(), z.unknown()).optional(),
});

export const CreateProgramSchema = programWritable.strict();
export const UpdateProgramSchema = programWritable.partial().strict();

export const ListProgramsQuerySchema = PaginationSchema.extend({
  status: z.enum(PROGRAM_STATUSES).optional(),
});

// ── Applications ────────────────────────────────────────────────────────────

/** The apply form. No student_id: the applicant is always req.auth.sub. */
export const ApplySchema = z
  .object({
    program_id: z.number().int().positive(),
    application_data: z.record(z.string(), z.unknown()).default({}),
    video_url: z.string().url().max(1000).nullable().optional(),
  })
  .strict();

export const ReviewApplicationSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES).optional(),
    current_stage: z.string().max(120).optional(),
  })
  .strict()
  .refine((v) => v.status !== undefined || v.current_stage !== undefined, {
    message: "Provide status or current_stage",
  });

export const NoteSchema = z.object({ notes: z.string().max(20000).nullable() }).strict();

// ── Ambassador self-service ─────────────────────────────────────────────────

/** Mirrors V2's profilePatchBody: identity, status, ratings and money are absent
 *  on purpose — an ambassador may not repoint their row or grant themselves
 *  earnings. */
export const UpdateAmbassadorProfileSchema = z
  .object({
    bio: z.string().max(4000).nullable(),
    major: z.string().max(200).nullable(),
    year: z.number().int().min(1).max(6).nullable(),
    languages: z.array(z.string().max(80)).max(20),
    interests: z.array(z.string().max(80)).max(20),
    country_of_origin: z.string().max(200).nullable(),
    is_online: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No updatable fields provided" });

export const UpdateInquiryStatusSchema = z
  .object({ status: z.enum(AMBASSADOR_SETTABLE_STATUSES) })
  .strict();

export const SendMessageSchema = z
  .object({ message_text: z.string().min(1).max(10000) })
  .strict();

// ── Inquiries (prospect side) ───────────────────────────────────────────────

export const CreateInquirySchema = z
  .object({
    program_id: z.number().int().positive(),
    first_message: z.string().min(1).max(10000),
    inquiry_context: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const ListInquiriesQuerySchema = PaginationSchema.extend({
  program_id: z.coerce.number().int().positive().optional(),
  status: z.enum(INQUIRY_STATUSES).optional(),
});

export const AnalyticsQuerySchema = z.object({
  program_id: z.coerce.number().int().positive().optional(),
});

// ── Payouts ─────────────────────────────────────────────────────────────────

/**
 * `idempotency_key` is caller-supplied and REQUIRED. A payout is money leaving
 * the platform; a client that cannot name its request cannot safely retry it,
 * and a server-generated key would make every retry a fresh transfer.
 */
export const RequestPayoutSchema = z
  .object({
    amount_minor: z.number().int().positive(),
    idempotency_key: z.string().min(8).max(200),
  })
  .strict();

export const ConnectOnboardingSchema = z
  .object({ return_url: z.string().url().max(2000).optional() })
  .strict();

// ── Admin ───────────────────────────────────────────────────────────────────

export const AdminListQuerySchema = PaginationSchema.extend({
  status: z.enum(PROGRAM_STATUSES).optional(),
  business_id: z.coerce.number().int().positive().optional(),
});
