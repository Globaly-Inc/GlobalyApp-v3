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
