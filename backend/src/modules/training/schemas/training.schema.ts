// Zod schemas for the training module. Bodies are `.strict()` for the same
// reason as the ambassadors module: the owning ids (business_id, user_id,
// created_by) always come from the asserted path or from req.auth, and a
// strict body is what makes a spoofed one a 400 instead of a silent override.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";
import { webUrl } from "../../../shared/url.js";
import { TARGET_AUDIENCES } from "../consts.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const ProgramIdParamSchema = z.object({
  programId: z.coerce.number().int().positive(),
});
export const VerificationCodeParamSchema = z.object({
  code: z.string().min(4).max(64),
});

// ── Programs (business) ─────────────────────────────────────────────────────

const programWritable = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(20000).nullable().optional(),
  category: z.string().max(120).nullable().optional(),
  target_audience: z.enum(TARGET_AUDIENCES).optional(),
  thumbnail_url: webUrl({ max: 1000 }).nullable().optional(),
  is_mandatory: z.boolean().optional(),
  due_date: z.string().datetime().nullable().optional(),
  auto_close: z.boolean().optional(),
  certificate_expiry_months: z.number().int().min(1).max(120).nullable().optional(),
  certificate_level_thresholds: z
    .object({
      gold: z.number().int().min(1).max(100),
      silver: z.number().int().min(1).max(100),
      bronze: z.number().int().min(1).max(100),
    })
    .optional(),
  passing_score: z.number().int().min(1).max(100).optional(),
  retake_allowed: z.boolean().optional(),
  max_attempts: z.number().int().min(1).max(100).nullable().optional(),
  is_published: z.boolean().optional(),
});

export const CreateTrainingProgramSchema = programWritable.strict();
export const UpdateTrainingProgramSchema = programWritable.partial().strict();

export const ListProgramsQuerySchema = PaginationSchema.extend({
  target_audience: z.enum(TARGET_AUDIENCES).optional(),
  is_published: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

// ── Chapters: V2 replaces the whole ordered list in one PUT ─────────────────

export const PutChaptersSchema = z
  .object({
    chapters: z
      .array(
        z
          .object({
            id: z.number().int().positive().optional(),
            title: z.string().min(1).max(300),
            content_text: z.string().max(200000).nullable().optional(),
            video_url: webUrl({ max: 1000 }).nullable().optional(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

// ── Assessment: one per program, replaced wholesale ─────────────────────────

export const PutAssessmentSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    questions: z
      .array(
        z
          .object({
            question: z.string().min(1).max(4000),
            options: z.array(z.string().max(2000)).min(2).max(10),
            correct_index: z.number().int().min(0),
            explanation: z.string().max(4000).optional(),
          })
          .strict(),
      )
      .max(200),
    passing_score: z.number().int().min(1).max(100),
  })
  .strict()
  .refine((v) => v.questions.every((q) => q.correct_index < q.options.length), {
    message: "correct_index must point at one of the options",
  });

// ── Assignments ─────────────────────────────────────────────────────────────

export const AssignSchema = z
  .object({
    user_ids: z.array(z.number().int().positive()).min(1).max(500),
    due_date: z.string().datetime().nullable().optional(),
  })
  .strict();

// ── Learner ─────────────────────────────────────────────────────────────────

export const MarkProgressSchema = z
  .object({
    program_id: z.number().int().positive(),
    chapter_id: z.number().int().positive(),
  })
  .strict();

/** The learner sends only their own choices — never a correct answer. */
export const SubmitAssessmentSchema = z
  .object({
    program_id: z.number().int().positive(),
    answers: z.record(z.string().max(6), z.number().int().min(0)),
  })
  .strict();

// ── Admin ───────────────────────────────────────────────────────────────────

export const AdminListQuerySchema = PaginationSchema.extend({
  business_id: z.coerce.number().int().positive().optional(),
  target_audience: z.enum(TARGET_AUDIENCES).optional(),
});
