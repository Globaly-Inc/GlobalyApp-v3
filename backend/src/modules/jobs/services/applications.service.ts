import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import * as jobsRepo from "../repositories/jobs.repository.js";
import * as repo from "../repositories/applications.repository.js";
import type { ApplyToJobInput, ReviewApplicationInput } from "../schemas/jobs.schema.js";

const PG_UNIQUE_VIOLATION = "23505";

export async function apply(jobId: number, applicantUserId: number, input: ApplyToJobInput) {
  const job = await jobsRepo.findPublished(jobId);
  if (!job) throw new NotFoundError("Job posting not found");

  try {
    return await repo.insert({
      job_id: jobId,
      applicant_user_id: applicantUserId,
      cover_note: input.cover_note,
      resume_url: input.resume_url,
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === PG_UNIQUE_VIOLATION) throw new ConflictError("You have already applied to this job");
    throw err;
  }
}

export async function listForBusiness(jobId: number, businessId: number) {
  const job = await jobsRepo.findForBusiness(jobId, businessId);
  if (!job) throw new NotFoundError("Job posting not found");
  return repo.listForJob(jobId);
}

export async function review(jobId: number, applicationId: number, businessId: number, input: ReviewApplicationInput) {
  const job = await jobsRepo.findForBusiness(jobId, businessId);
  if (!job) throw new NotFoundError("Job posting not found");

  const application = await repo.findById(applicationId);
  if (!application || application.job_id !== jobId) throw new NotFoundError("Application not found");

  return repo.updateStatus(applicationId, input.status);
}
