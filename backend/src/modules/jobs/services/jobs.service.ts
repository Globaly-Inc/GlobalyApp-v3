import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/jobs.repository.js";
import * as applicationsRepo from "../repositories/applications.repository.js";
import type { CreateJobInput, UpdateJobInput } from "../schemas/jobs.schema.js";

export async function list(businessId: number) {
  const jobs = await repo.listForBusiness(businessId);
  const counts = await Promise.all(jobs.map((j) => applicationsRepo.countForJob(j.id)));
  return jobs.map((job, i) => ({ ...job, applicant_count: counts[i] }));
}

export async function create(businessId: number, input: CreateJobInput) {
  return repo.insert({ business_id: businessId, ...input });
}

export async function getOne(jobId: number, businessId: number) {
  const job = await repo.findForBusiness(jobId, businessId);
  if (!job) throw new NotFoundError("Job posting not found");
  return job;
}

export async function update(jobId: number, businessId: number, input: UpdateJobInput) {
  await getOne(jobId, businessId);
  return repo.update(jobId, input);
}

export async function remove(jobId: number, businessId: number) {
  await getOne(jobId, businessId);
  await repo.softDelete(jobId);
}
