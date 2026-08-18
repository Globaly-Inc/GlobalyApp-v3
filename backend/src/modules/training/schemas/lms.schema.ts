// Zod for the LMS delivery layer (Wave E4). Same conventions as
// training.schema.ts: `.strict()` bodies, ids from the path or req.auth, never
// from the body.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";
import { webUrl } from "../../../shared/url.js";
import {
  APPLICATION_STATUSES,
  GRADE_STATUSES,
  INVITATION_STATUSES,
  MAX_INVITE_EMAILS,
  MIN_FEEDBACK_CHARS_FOR_NEGATIVE_GRADE,
  SUBMISSION_STATUSES,
} from "../consts.js";

export const SubmissionIdParamSchema = z.object({
  programId: z.coerce.number().int().positive(),
  submissionId: z.coerce.number().int().positive(),
});

export const ApplicationIdParamSchema = z.object({
  programId: z.coerce.number().int().positive(),
  applicationId: z.coerce.number().int().positive(),
});

export const InvitationIdParamSchema = z.object({
  programId: z.coerce.number().int().positive(),
  invitationId: z.coerce.number().int().positive(),
});

// ── Chapter attachments: the assignment / quiz definition ───────────────────
//
// V1 kept this blob client-side only; V2 dropped it from both its chapter
// projection and its chapter body, so V2 cannot author an assignment or a quiz at
// all. Typed here so the server can validate against it.

const AssignmentDefinitionSchema = z
  .object({
    instruction: z.string().min(1).max(20_000),
    accepted_types: z.array(z.string().max(40)).max(20).optional(),
    due_date: z.string().datetime().nullable().optional(),
  })
  .strict();

const QuizQuestionSchema = z
  .object({
    question: z.string().min(1).max(4000),
    options: z.array(z.string().max(2000)).min(2).max(10),
    correct_index: z.number().int().min(0),
    explanation: z.string().max(4000).optional(),
  })
  .strict();

const QuizDefinitionSchema = z
  .object({
    passing_score: z.number().int().min(1).max(100).optional(),
    questions: z.array(QuizQuestionSchema).min(1).max(100),
  })
  .strict()
  .refine((v) => v.questions.every((q) => q.correct_index < q.options.length), {
    message: "correct_index must point at one of the options",
  });

export const ChapterAttachmentsSchema = z
  .object({
    assignment: AssignmentDefinitionSchema.optional(),
    quiz: QuizDefinitionSchema.optional(),
  })
  .strict();

export type ChapterAttachments = z.infer<typeof ChapterAttachmentsSchema>;

/** PUT one chapter's attachments. Separate from the chapter list PUT so that
 *  replacing the ordered list can never blank a lesson's brief. */
export const PutChapterAttachmentsSchema = z
  .object({ attachments: ChapterAttachmentsSchema })
  .strict();

export const ChapterIdParamSchema = z.object({
  programId: z.coerce.number().int().positive(),
  chapterId: z.coerce.number().int().positive(),
});

// ── Assignment submissions ─────────────────────────────────────────────────

export const SubmitAssignmentSchema = z
  .object({
    program_id: z.number().int().positive(),
    chapter_id: z.number().int().positive(),
    submission_text: z.string().min(1).max(100_000).nullable().optional(),
    // A stored URL is rendered into an anchor href, so `webUrl()`, never
    // `z.string().url()` — which accepts javascript: and data:text/html.
    file_url: webUrl({ max: 2000 }).nullable().optional(),
    file_name: z.string().min(1).max(300).nullable().optional(),
  })
  .strict()
  .refine((v) => Boolean(v.submission_text) || Boolean(v.file_url), {
    message: "Either submission_text or file_url is required",
  });

export const GradeSubmissionSchema = z
  .object({
    status: z.enum(GRADE_STATUSES),
    feedback: z.string().max(20_000).nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.status === "passed" ||
      (v.feedback ?? "").trim().length >= MIN_FEEDBACK_CHARS_FOR_NEGATIVE_GRADE,
    {
      message: `Failing or returning work needs at least ${MIN_FEEDBACK_CHARS_FOR_NEGATIVE_GRADE} characters of feedback`,
      path: ["feedback"],
    },
  );

export const ListSubmissionsQuerySchema = PaginationSchema.extend({
  status: z.enum(SUBMISSION_STATUSES).optional(),
  chapter_id: z.coerce.number().int().positive().optional(),
});

// ── Quiz ───────────────────────────────────────────────────────────────────
//
// NO `score`, NO `passed`. V2 accepted both from the body and wrote them
// verbatim; the server grades from the chapter's own answer key here, the same
// way G4's final assessment does.

export const SubmitQuizSchema = z
  .object({
    program_id: z.number().int().positive(),
    chapter_id: z.number().int().positive(),
    answers: z.record(z.string().max(6), z.number().int().min(0)),
  })
  .strict();

// ── Enrolment ──────────────────────────────────────────────────────────────

export const EnrolSchema = z.object({ program_id: z.number().int().positive() }).strict();

export const ApplyForEnrolmentSchema = z
  .object({
    program_id: z.number().int().positive(),
    answers_json: z.record(z.string().max(200), z.unknown()).optional(),
  })
  .strict();

export const RejectApplicationSchema = z
  .object({ rejection_reason: z.string().min(1).max(4000) })
  .strict();

export const ListApplicationsQuerySchema = PaginationSchema.extend({
  status: z.enum(APPLICATION_STATUSES).optional(),
});

// ── Invitations ────────────────────────────────────────────────────────────

export const ListInvitationsQuerySchema = PaginationSchema.extend({
  status: z.enum(INVITATION_STATUSES).optional(),
});

export const InviteSchema = z
  .object({
    // V1 took `emails[]` capped at 100; V2 narrowed to one per request and lost
    // the bulk path the business UI actually used. Both shapes are served by
    // accepting an array with V1's cap.
    emails: z.array(z.string().email().max(320)).min(1).max(MAX_INVITE_EMAILS),
  })
  .strict();
