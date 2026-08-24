// Ambassador applications — a student applies to a business's program; the business approves or
// rejects; approval mints the ambassadors row (with its own referral code) in the same transaction
// so a decision and its consequence can never disagree.

import { masterKnex } from "../../../core/db/master-pool.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import { generateReferralCode } from "../../referrals/utils/generate-referral-code.js";
import * as programsRepo from "../repositories/programs.repository.js";
import * as applicationsRepo from "../repositories/applications.repository.js";
import * as ambassadorsRepo from "../repositories/ambassadors.repository.js";
import type { ReviewApplicationInput } from "../schemas/ambassadors.schema.js";

const logger = createChildLogger("ambassador-applications");
const PG_UNIQUE_VIOLATION = "23505";
const MAX_CODE_ATTEMPTS = 3;

export async function apply(programId: number, applicantUserId: number, note: string | null | undefined) {
  const program = await programsRepo.findById(programId);
  if (!program) throw new NotFoundError("Ambassador program not found");
  if (program.status !== "active") throw new BadRequestError("This program is not accepting applications right now");

  try {
    return await applicationsRepo.insert({ program_id: programId, applicant_user_id: applicantUserId, note });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === PG_UNIQUE_VIOLATION) throw new ConflictError("You have already applied to this program");
    throw err;
  }
}

export async function listForProgram(programId: number, businessId: number) {
  const program = await programsRepo.findForBusiness(programId, businessId);
  if (!program) throw new NotFoundError("Ambassador program not found");
  return applicationsRepo.listForProgram(programId);
}

/** Mints a globally-unique ambassador code, retrying on the rare collision — mirrors issueCode. */
async function mintAmbassadorCode(
  trx: Parameters<typeof ambassadorsRepo.insert>[0],
  params: { program_id: number; user_id: number; application_id: number },
) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      return await ambassadorsRepo.insert(trx, { ...params, referral_code: generateReferralCode() });
    } catch (err: unknown) {
      const e = err as { code?: string; constraint?: string };
      if (e.code === PG_UNIQUE_VIOLATION && e.constraint === "idx_ambassadors_code_lower") continue;
      throw err;
    }
  }
  throw new Error(`Ambassador code issuance failed after ${MAX_CODE_ATTEMPTS} collisions`);
}

export async function review(
  programId: number,
  applicationId: number,
  businessId: number,
  reviewerId: number,
  input: ReviewApplicationInput,
) {
  const program = await programsRepo.findForBusiness(programId, businessId);
  if (!program) throw new NotFoundError("Ambassador program not found");

  return masterKnex.transaction(async (trx) => {
    const application = await applicationsRepo.findByIdForUpdate(trx, applicationId);
    if (!application || application.program_id !== programId) throw new NotFoundError("Application not found");
    if (application.status !== "pending") {
      throw new ConflictError(`This application is already ${application.status}`);
    }

    const updated = await applicationsRepo.markReviewed(trx, applicationId, {
      status: input.decision,
      reviewedBy: reviewerId,
      note: input.note,
    });

    if (input.decision === "approved") {
      const ambassador = await mintAmbassadorCode(trx, {
        program_id: programId,
        user_id: application.applicant_user_id,
        application_id: applicationId,
      });
      logger.info("Ambassador application approved", { programId, applicationId, ambassadorId: ambassador.id });
      return { application: updated, ambassador };
    }

    logger.info("Ambassador application rejected", { programId, applicationId });
    return { application: updated, ambassador: null };
  });
}
