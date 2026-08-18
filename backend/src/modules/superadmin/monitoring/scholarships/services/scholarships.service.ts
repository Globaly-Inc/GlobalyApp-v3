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

/** V2's detail shape: the row plus its eligibility criteria. */
export async function findPublishedBySlug(slug: string) {
  const row = await repo.findPublishedBySlug(slug);
  if (!row) throw new NotFoundError("Scholarship not found");
  return { ...row, criteria: await repo.listCriteria(row.id) };
}

export async function facets(q: string | undefined) {
  const row = await repo.facets(q ?? "");
  return {
    countries: row.countries ?? [],
    bases: row.bases ?? [],
    degree_levels: row.degree_levels ?? [],
    total: Number(row.total ?? 0),
  };
}

/**
 * A miss is not an error — the row may have been unpublished between the read and
 * the beacon — so this always answers ok.
 */
export async function recordView(slug: string) {
  await repo.incrementViewCountBySlug(slug);
  return { ok: true as const };
}
