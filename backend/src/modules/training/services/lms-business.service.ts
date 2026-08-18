// The business's side of LMS delivery: author the lesson task, work the grading
// queue, decide enrolment applications, invite people by email. Wave E4.
//
// Spec: V2 routes/business-training.ts (submissions + grade),
// routes/lms-enrollment.ts, routes/lms-invitations.ts, and V1's
// lms-course-invite edge function.
//
// Every function takes `businessId` first and resolves the programme through
// repo.findProgramInBusiness, so another business's programme is absent → 404,
// never 403. That is G4's established shape and this file does not deviate.
//
// PEER REVIEW: there is none, and that is a finding rather than an omission.
// Neither V1 nor V2 has any peer-review mechanism — no reviewer-assignment table,
// no allocation, no anonymity flag, no rubric, no multi-reviewer aggregation, and
// no numeric score column on a submission. "Review" means a member of the owning
// business opens the queue and grades a row. Built as it exists; see the wave
// report for the recommendation.

import { randomBytes } from "node:crypto";
import { masterKnex } from "../../../core/db/master-pool.js";
import { config } from "../../../config.js";
import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import { mailerService } from "../../../shared/mail/mailerService.js";
import { emailLayout, esc } from "../../../shared/mail/templates.js";
import { buildPaginatedResponse, type PaginationInput } from "../../../shared/pagination.js";
import {
  INVITE_TOKEN_BYTES,
  INVITE_TTL_DAYS,
  type ApplicationStatus,
  type GradeStatus,
  type InvitationStatus,
  type SubmissionStatus,
} from "../consts.js";
import * as lms from "../repositories/lms.repository.js";
import * as repo from "../repositories/training.repository.js";
import type { ChapterAttachments } from "../schemas/lms.schema.js";

const logger = createChildLogger("lms-business");

async function requireProgram(businessId: number, programId: number, trx?: lms.Db) {
  const program = await repo.findProgramInBusiness(programId, businessId, trx);
  if (!program) throw new NotFoundError("Program not found");
  return program;
}

// ── Lesson definition (chapter attachments) ─────────────────────────────────

/**
 * Author the assignment brief and/or the quiz for one chapter.
 *
 * This route exists because V2 has no way to create an assignment or a quiz at
 * all: `attachments` is absent from both its chapter GET projection and its
 * chapter PUT body, so the field V1's client parsed is unreachable from V2's
 * editor (defect D-E4-1). It is deliberately SEPARATE from the chapter-list PUT
 * so that reordering chapters can never blank a brief.
 */
export async function putChapterAttachments(
  businessId: number,
  programId: number,
  chapterId: number,
  attachments: ChapterAttachments,
) {
  await requireProgram(businessId, programId);
  const chapter = await lms.updateChapterAttachments(chapterId, programId, attachments);
  if (!chapter) throw new NotFoundError("Chapter not found in this program");
  return { chapter };
}

export async function getChapterAttachments(
  businessId: number,
  programId: number,
  chapterId: number,
) {
  await requireProgram(businessId, programId);
  const chapter = await lms.findChapterInProgram(chapterId, programId);
  if (!chapter) throw new NotFoundError("Chapter not found in this program");
  return { chapter };
}

// ── Grading queue ───────────────────────────────────────────────────────────

export async function listSubmissions(
  businessId: number,
  programId: number,
  query: PaginationInput & { status?: SubmissionStatus; chapter_id?: number },
) {
  await requireProgram(businessId, programId);
  const { rows, total } = await lms.listSubmissionsForProgram(programId, query);
  return buildPaginatedResponse(rows, total, query);
}

/**
 * Grade one submission.
 *
 * `passed` completes the lesson; `failed` and `needs_revision` UNDO a previous
 * completion. V2 only ever completed on a pass and never reverted, which — on top
 * of V1 completing the lesson at submission time — left a failed assignment
 * showing green and counting toward completion (defect D-E4-9).
 *
 * `reviewer_id` is the caller, never the body. Both writes are one transaction:
 * V1 issued the grade and the progress update as two independent PostgREST calls
 * with no rollback.
 */
export async function gradeSubmission(
  businessId: number,
  programId: number,
  submissionId: number,
  reviewerId: number,
  input: { status: GradeStatus; feedback?: string | null },
) {
  return masterKnex.transaction(async (trx) => {
    await requireProgram(businessId, programId, trx);

    const existing = await lms.findSubmissionInProgram(submissionId, programId, trx);
    if (!existing) throw new NotFoundError("Submission not found");

    const submission = await lms.gradeSubmission(
      submissionId,
      programId,
      { status: input.status, feedback: input.feedback ?? null, reviewer_id: reviewerId },
      trx,
    );
    if (!submission) throw new NotFoundError("Submission not found");

    if (input.status === "passed") {
      await repo.markChapterComplete(existing.user_id, programId, existing.chapter_id, trx);
    } else {
      await lms.markChapterIncomplete(existing.user_id, existing.chapter_id, trx);
    }

    return { submission };
  });
}

// ── Enrolment applications ──────────────────────────────────────────────────

export async function listApplications(
  businessId: number,
  programId: number,
  query: PaginationInput & { status?: ApplicationStatus },
) {
  await requireProgram(businessId, programId);
  const { rows, total } = await lms.listApplicationsForProgram(programId, query);
  return buildPaginatedResponse(rows, total, query);
}

export async function applicationCounts(businessId: number, programId: number) {
  await requireProgram(businessId, programId);
  return { counts: await lms.applicationCounts(programId) };
}

/**
 * Approve and enrol, atomically.
 *
 * V1 updated the application to `approved` and THEN inserted the enrolment with a
 * `business_id` column that does not exist on `training_assignments` — so the
 * insert 400'd, the caller saw "Failed to approve", and the status update had
 * already committed. The application read approved and the learner was never
 * enrolled, with no transaction and no compensating write (defect D-E4-10).
 */
export async function approveApplication(
  businessId: number,
  programId: number,
  applicationId: number,
  reviewerId: number,
) {
  return masterKnex.transaction(async (trx) => {
    const program = await requireProgram(businessId, programId, trx);

    const existing = await lms.findApplicationInProgram(applicationId, programId, trx);
    if (!existing) throw new NotFoundError("Application not found");
    if (existing.status !== "pending") {
      throw new ConflictError(`Application is already ${existing.status}`);
    }

    const application = await lms.decideApplication(
      applicationId,
      programId,
      { status: "approved", reviewed_by: reviewerId },
      trx,
    );
    if (!application) throw new NotFoundError("Application not found");

    await repo.assignUsers(
      programId,
      [existing.user_id],
      reviewerId,
      program.due_date ? new Date(program.due_date).toISOString() : null,
      trx,
    );

    return { application, enrolled: true };
  });
}

export async function rejectApplication(
  businessId: number,
  programId: number,
  applicationId: number,
  reviewerId: number,
  reason: string,
) {
  return masterKnex.transaction(async (trx) => {
    await requireProgram(businessId, programId, trx);

    const existing = await lms.findApplicationInProgram(applicationId, programId, trx);
    if (!existing) throw new NotFoundError("Application not found");
    if (existing.status !== "pending") {
      throw new ConflictError(`Application is already ${existing.status}`);
    }

    const application = await lms.decideApplication(
      applicationId,
      programId,
      { status: "rejected", rejection_reason: reason, reviewed_by: reviewerId },
      trx,
    );
    if (!application) throw new NotFoundError("Application not found");
    return { application };
  });
}

// ── Invitations ─────────────────────────────────────────────────────────────

function inviteLink(programId: number): string {
  return `${config.WEB_APP_URL}/personal/learning/${programId}`;
}

function invitationEmail(options: {
  inviterName: string;
  programTitle: string;
  link: string;
}): { subject: string; html: string; text: string } {
  const inviter = esc(options.inviterName);
  const title = esc(options.programTitle);
  return {
    subject: `${options.inviterName} invited you to "${options.programTitle}" on GlobalyApp`,
    text: `${options.inviterName} invited you to the course "${options.programTitle}" on GlobalyApp. Start here: ${options.link} (invitation expires in ${INVITE_TTL_DAYS} days).`,
    html: emailLayout({
      heading: "You have been invited to a course",
      body: `<p style="margin:0 0 12px"><strong>${inviter}</strong> invited you to the course
             <strong>${title}</strong> on <strong>GlobalyApp</strong>.</p>
             <p style="margin:0">Open it below to enrol and start the first lesson.</p>`,
      cta: { label: "Open the course", href: options.link },
      footnote: `This invitation expires in ${INVITE_TTL_DAYS} days.`,
    }),
  };
}

/**
 * Invite by email, in bulk. V1's lms-course-invite took `emails[]` capped at 100;
 * V2 narrowed it to one per request and lost the bulk path the UI used.
 *
 * The invitation row is committed FIRST and the mail is attempted after, per
 * address, with the outcome reported honestly as `email_sent`. A mail failure
 * does not lose the invitation — and does not claim to have sent anything.
 *
 * V1 additionally auto-enrolled an invitee who already had an account. Not
 * carried: it enrols a person into a course without their consent on the strength
 * of an email address the inviter typed. The invitation is the offer; enrolment
 * happens when they accept it (learner `POST /me/training/enroll`).
 */
export async function invite(
  businessId: number,
  programId: number,
  inviterId: number,
  emails: string[],
) {
  const program = await requireProgram(businessId, programId);
  const inviter = await masterKnex("platform_users")
    .where({ id: inviterId })
    .first(["first_name", "last_name"]);
  const inviterName = `${inviter?.first_name ?? ""} ${inviter?.last_name ?? ""}`.trim() || "A colleague";

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const link = inviteLink(programId);
  const mail = invitationEmail({ inviterName, programTitle: program.title, link });

  const results: { email: string; invitation_id: number; email_sent: boolean }[] = [];

  // Deduplicated, because the same address twice in one request is one invitation.
  for (const email of [...new Set(emails.map((e) => e.trim().toLowerCase()))]) {
    const existingUser = await lms.findUserByEmail(email);
    const invitation = await lms.upsertInvitation({
      program_id: programId,
      email,
      invited_by: inviterId,
      invitee_user_id: existingUser?.id ?? null,
      invite_token: randomBytes(INVITE_TOKEN_BYTES).toString("hex"),
      expires_at: expiresAt,
    });

    let emailSent = false;
    try {
      await mailerService.sendMail({ to: email, ...mail });
      emailSent = true;
    } catch (err) {
      logger.warn("course invitation email failed", {
        programId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    results.push({ email, invitation_id: invitation.id, email_sent: emailSent });
  }

  return { invited: results.length, results };
}

export async function listInvitations(
  businessId: number,
  programId: number,
  query: PaginationInput & { status?: InvitationStatus },
) {
  await requireProgram(businessId, programId);
  const { rows, total } = await lms.listInvitations(programId, query);
  return buildPaginatedResponse(rows, total, query);
}

/** Only a pending invitation can be revoked, as in V2. */
export async function revokeInvitation(
  businessId: number,
  programId: number,
  invitationId: number,
) {
  await requireProgram(businessId, programId);
  const affected = await lms.deleteInvitation(invitationId, programId);
  if (affected === 0) throw new NotFoundError("Pending invitation not found");
  return { deleted: true };
}
