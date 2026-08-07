// Supporting repository — site profiles, lessons, save-and-learn.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

// ── Site profiles ──

export async function listSiteProfiles(opts: { search?: string; limit: number }) {
  const query = masterKnex(`${S}.extraction_site_profiles`).orderBy("domain", "asc").limit(opts.limit);
  if (opts.search) query.where("domain", "ilike", `%${opts.search}%`);
  return query;
}

export async function findSiteProfileByDomain(domain: string) {
  return masterKnex(`${S}.extraction_site_profiles`).where({ domain }).first();
}

export async function upsertSiteProfile(data: Record<string, unknown>) {
  const domain = data.domain as string;
  const existing = await findSiteProfileByDomain(domain);
  if (existing) {
    await masterKnex(`${S}.extraction_site_profiles`)
      .where({ domain })
      .update({ ...data, updated_at: masterKnex.fn.now() });
  } else {
    await masterKnex(`${S}.extraction_site_profiles`).insert(data);
  }
}

// ── Lessons ──

export async function listLessons(opts: {
  domain?: string;
  step?: string;
  scope?: string;
  activeOnly?: boolean;
  limit: number;
}) {
  const query = masterKnex(`${S}.extraction_lessons`).orderBy("created_at", "desc").limit(opts.limit);
  if (opts.domain) query.where("domain", opts.domain);
  if (opts.step) query.where("step", opts.step);
  if (opts.scope) query.where("scope", opts.scope);
  if (opts.activeOnly) query.where("is_active", true);
  return query;
}

export async function updateLesson(id: string, data: Record<string, unknown>) {
  const count = await masterKnex(`${S}.extraction_lessons`)
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() });
  return count > 0;
}

export async function deleteLesson(id: string) {
  const count = await masterKnex(`${S}.extraction_lessons`).where({ id }).delete();
  return count > 0;
}

// ── Save and learn ──

export async function findEntityRow(table: string, id: string) {
  return masterKnex(`${S}.${table}`).where({ id }).first();
}

export async function patchEntityRow(table: string, id: string, patch: Record<string, unknown>) {
  // Tables with updated_at get it stamped; some don't have it
  const hasUpdatedAt = !["extraction_accreditations"].includes(table);
  const data = hasUpdatedAt ? { ...patch, updated_at: masterKnex.fn.now() } : patch;
  await masterKnex(`${S}.${table}`).where({ id }).update(data);
}

export async function insertMemory(data: Record<string, unknown>) {
  const [row] = await masterKnex(`${S}.extraction_memory`).insert(data).returning("id");
  return row;
}

// ── Job URL lookup (for save-and-learn domain derivation) ──

export async function getJobUrl(jobId: string) {
  const row = await masterKnex(`${S}.extraction_jobs`).select("institution_url").where({ id: jobId }).first();
  return row?.institution_url as string | undefined;
}
