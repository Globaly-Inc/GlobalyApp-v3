// Enquiries service — creation + lookup only (Phase 4). Matching/distribution are later phases.

import { masterKnex } from "../../../core/db/master-pool.js";
import * as repo from "../repositories/enquiries.repository.js";
import * as platformUsersRepo from "../../platform-users/repositories/platform-users.repository.js";
import { logEnquiryAudit } from "../shared/audit.js";
import { ENQUIRY_QUEUES } from "../shared/queues.js";
import { queueService } from "../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../shared/logger.js";
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
 * "Profile complete" reuses `platform_user_profiles.onboarding_completed` —
 * the only existing completeness signal in the codebase (set by the
 * onboarding flow, exposed on ProfilePatchSchema/BusinessSchema elsewhere).
 * No dedicated `isProfileComplete()` util exists yet.
 */
export async function createEnquiry(studentId: number, input: CreateEnquiryInput) {
  const profile = await platformUsersRepo.findProfileByUserId(studentId);
  if (!profile || !profile.onboarding_completed) {
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
    if (!business.enquiry_enabled || business.is_suspended) {
      throw new BadRequestError("This business is not currently accepting enquiries");
    }
  }

  // Institution the enquiry is about, resolved from the course's job. Derived
  // server-side rather than accepted from the client so it can never disagree
  // with course_id. Null when the job has no overview row.
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
  // Recipients are intentionally NOT returned: the student may only see
  // businesses that have unlocked their enquiry. Returning every matched business
  // here would leak that list to anyone reading the API, regardless of what the
  // UI renders. Add an "unlocked by" list here when unlocking exists.
  return enquiry;
}
