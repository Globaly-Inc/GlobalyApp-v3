// Scholarships service — admin CRUD + public reads.

import { NotFoundError } from "../../../../../shared/errors.js";
import * as repo from "../repositories/scholarships.repository.js";
import type { ScholarshipInput } from "../schemas/scholarships.schema.js";

export const listAdmin = repo.listAdmin;
export const countAdmin = repo.countAdmin;

export async function findById(id: number) {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError("Scholarship not found");
  return row;
}

export function create(data: ScholarshipInput) {
  return repo.insert(data);
}

export async function update(id: number, data: Partial<ScholarshipInput>) {
  await findById(id);
  return repo.update(id, data);
}

export async function remove(id: number) {
  await findById(id);
  await repo.remove(id);
}

// ── Business-owned ──

export const listForBusiness = repo.listForBusiness;
export const countForBusiness = repo.countForBusiness;

export async function findByIdForBusiness(businessId: number, id: number) {
  const row = await repo.findByIdForBusiness(businessId, id);
  if (!row) throw new NotFoundError("Scholarship not found");
  return row;
}

export function createForBusiness(businessId: number, data: ScholarshipInput) {
  return repo.insert({ ...data, business_id: businessId, is_featured: false });
}

export async function updateForBusiness(businessId: number, id: number, data: Partial<ScholarshipInput>) {
  await findByIdForBusiness(businessId, id);
  return repo.updateForBusiness(businessId, id, data);
}

export async function removeForBusiness(businessId: number, id: number) {
  await findByIdForBusiness(businessId, id);
  await repo.removeForBusiness(businessId, id);
}

// ── Public ──

export const listPublished = repo.listPublished;
export const countPublished = repo.countPublished;

export async function findPublishedBySlug(slug: string) {
  const row = await repo.findPublishedBySlug(slug);
  if (!row) throw new NotFoundError("Scholarship not found");
  // Best-effort — a view-count miss should never break the detail page.
  repo.incrementViewCount(row.id).catch(() => {});
  return row;
}
