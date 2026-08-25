// Enquiries service — creation + lookup only (Phase 4). Matching/distribution are later phases.

import { masterKnex } from "../../../core/db/master-pool.js";
import * as repo from "../repositories/enquiries.repository.js";
import * as platformUsersRepo from "../../platform-users/repositories/platform-users.repository.js";
import { loadCompletion } from "../../platform-users/services/completion.js";
import { logEnquiryAudit } from "../shared/audit.js";
import { ENQUIRY_QUEUES } from "../shared/queues.js";
import { queueService } from "../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as storage from "../../../shared/storage/storageService.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { paginationToOffset, buildPaginatedResponse } from "../../../shared/pagination.js";
import type { PaginationInput } from "../../../shared/pagination.js";

const logger = createChildLogger("enquiries-service");

export interface CreateEnquiryInput {
  course_id: string;
  extraction_job_id?: string | null;
  business_id?: number | null;
  message: string;
  preferred_intake?: string | null;
  preferred_year?: number | null;
}

/**
 * Creates an enquiry for a student. Order of checks matters:
 * profile completeness → course exists → business (if given) is a valid direct
 * target → message length (DB CHECK constraint is the backstop, this is the
 * fast-fail) → insert + audit row, in one transaction.
 *
 * "Profile complete" is the 100% completion percentage from
 * platform-users/completion.ts — the same freshly-computed figure the profile
 * gate renders, so the UI can never show 100% while this 403s. Deliberately
 * NOT also gated on `onboarding_completed`.
 */
export async function createEnquiry(studentId: number, input: CreateEnquiryInput) {
  const [profile, { percentage }] = await Promise.all([
    platformUsersRepo.findProfileByUserId(studentId),
    loadCompletion(studentId),
  ]);
  if (!profile || percentage < 100) {
    throw new ForbiddenError("Complete your profile before submitting an enquiry");
  }

  if (input.message.length < 10 || input.message.length > 5000) {
    throw new BadRequestError("Message must be between 10 and 5000 characters");
  }

  const course = await repo.findExtractionCourseById(input.course_id);
  if (!course) {
    throw new BadRequestError("Invalid course_id");
  }

  // extraction_job_id, if provided, must belong to the same course's job.
  if (input.extraction_job_id && input.extraction_job_id !== course.job_id) {
    throw new BadRequestError("extraction_job_id does not match course_id's job");
  }

  if (input.business_id != null) {
    const business = await repo.findBusinessById(input.business_id);
    if (!business) {
      throw new BadRequestError("Invalid business_id");
    }
    if (!business.enquiry_enabled || business.status === "suspended") {
      throw new BadRequestError("This business is not currently accepting enquiries");
    }
  }

  // Institution the enquiry is about: public.institutions, reached from the course's
  // job via institutions.source_job_id. Derived server-side rather than accepted from
  // the client so it can never disagree with course_id. Null when the job was never
  // promoted to an institution.
  const jobId = input.extraction_job_id ?? course.job_id ?? null;
  const institutionId = jobId ? await repo.findInstitutionIdByJobId(jobId) : null;

  const enquiry = await masterKnex.transaction(async (trx) => {
    const [row] = await trx("enquiries")
      .insert({
        student_id: studentId,
        course_id: input.course_id,
        extraction_job_id: jobId,
        institution_id: institutionId,
        business_id: input.business_id ?? null,
        message: input.message,
        preferred_intake: input.preferred_intake ?? null,
        preferred_year: input.preferred_year ?? null,
        // student_country_code needs a countries join (profile only stores country_of_residence_id);
        // ponytail: left null here, matching phase (Phase 5) resolves geography, not creation.
        student_country_code: null,
        student_latitude: profile.latitude ?? null,
        student_longitude: profile.longitude ?? null,
        status: "pending",
      })
      .returning("*");

    await logEnquiryAudit(studentId, "enquiry.created", {
      entityType: "enquiry",
      entityId: row.id,
      trx,
      details: { course_id: input.course_id, business_id: input.business_id ?? null },
    });

    return row;
  });

  // Queue publish happens strictly after commit — a worker crash after this
  // point just means a stuck 'pending' row, never a match on data that never
  // committed. Publish failure is logged, not thrown: the enquiry already
  // exists for the student either way, and is safe to re-trigger manually.
  try {
    await queueService.publish(ENQUIRY_QUEUES.CREATED, { enquiryId: enquiry.id });
  } catch (err) {
    logger.error("Failed to publish enquiry.created", { enquiryId: enquiry.id, error: err });
  }

  return enquiry;
}

export async function listEnquiriesForStudent(
  studentId: number,
  pagination: PaginationInput,
  status?: string,
) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listForStudent(studentId, { limit, offset, status }),
    repo.countForStudent(studentId, { status }),
  ]);
  return buildPaginatedResponse(rows, total, pagination);
}

export async function getEnquiryById(id: string) {
  const enquiry = await repo.findByIdWithNames(id);
  if (!enquiry) {
    throw new NotFoundError("Enquiry not found");
  }
  // Only UNLOCKED recipients are returned. Every matched business is deliberately
  // withheld: that list would reveal who merely received the enquiry, which is not
  // the student's to see and would leak regardless of what the UI renders.
  const unlocked = await repo.listUnlockedBusinessesForEnquiry(id);
  const unlocked_businesses = await Promise.all(
    unlocked.map(async (b) => ({
      distribution_id: b.distribution_id,
      business_id: b.business_id,
      business_name: b.business_name,
      // Signed here because businesses.logo_url is a storage path, not a URL.
      logo_url: await storage.resolvePreviewUrl(b.logo_url),
      city: b.city ?? null,
      unlocked_at: b.unlocked_at,
      // Whether the thread is read-only. The close REASON is deliberately not
      // exposed — it is the business's internal note about this lead.
      is_closed: b.status === "closed",
    })),
  );

  return { ...enquiry, unlocked_businesses };
}
