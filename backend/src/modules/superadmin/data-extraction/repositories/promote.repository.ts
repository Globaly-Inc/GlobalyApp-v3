// Promote repository — reads staging, writes the public listing rows.
//
// Promote deliberately touches ONLY public tables (platform_users, institutions,
// businesses, representations). The tenant schema is not created here — see the header of
// promote.service.ts. No claim flow exists yet to provision it.
//
// Upserts are find-then-write rather than ON CONFLICT: the provenance indexes from
// 20260823_001_promote_provenance are partial, and Postgres can only infer a partial
// index when the predicate is restated in the statement, which Knex has no API for. The
// indexes stay as the backstop. Promote is admin-triggered and single-threaded per job,
// so the read-then-write gap is not a real race.

import { masterKnex } from "../../../../core/db/master-pool.js";

export interface OverviewRow {
  name: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
  logo_url: string | null;
  source_url: string | null;
  zip_code: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  youtube_url: string | null;
}

export interface AgentRow {
  id: string;
  name: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  address: string | null;
  logo_url: string | null;
  external_id: string | null;
}

export async function findOverviewByJobId(jobId: string): Promise<OverviewRow | undefined> {
  return masterKnex("superadmin.extraction_institution_overview")
    .where({ job_id: jobId })
    .orderBy("created_at", "asc")
    .first();
}

export async function listAgentsByJobId(jobId: string): Promise<AgentRow[]> {
  return masterKnex("superadmin.extraction_agents").where({ job_id: jobId }).orderBy("created_at", "asc");
}

/**
 * Is this business category the one that means "education provider"?
 *
 * Resolved by slug rather than hardcoding id 1, so a reseeded or renumbered categories table
 * can't silently start routing every listing into the wrong table.
 */
export async function isInstitutionCategory(categoryId: number): Promise<boolean> {
  const row = await masterKnex("business_categories").where({ id: categoryId }).first("slug");
  return row?.slug === "institutions";
}

/**
 * Category id for a slug, or null if it isn't seeded.
 *
 * Null rather than throwing: an uncategorised listing is a cosmetic gap (it shows as
 * "Uncategorised" and category filters miss it), not a reason to fail a publish.
 */
export async function findCategoryIdBySlug(slug: string): Promise<number | null> {
  const row = await masterKnex("business_categories").where({ slug }).first("id");
  return row ? Number(row.id) : null;
}

/** Free-text country from extraction → countries.id. Matches on name, then ISO code. */
export async function findCountryId(country: string | null | undefined): Promise<number | null> {
  const needle = country?.trim();
  if (!needle) return null;
  const row = await masterKnex("countries")
    .whereNull("deleted_at")
    .where((q) =>
      q
        .whereRaw("lower(name) = lower(?)", [needle])
        .orWhereRaw("lower(iso2) = lower(?)", [needle])
        .orWhereRaw("lower(iso3) = lower(?)", [needle]),
    )
    .first("id");
  return row ? Number(row.id) : null;
}

/**
 * A subdomain free across BOTH businesses and institutions — they share the namespace,
 * which is why onboardInstitution checks both tables too.
 */
export async function claimSubdomain(base: string, fallbackSeed: string): Promise<string> {
  const root = base.slice(0, 48) || `listing-${fallbackSeed}`;
  for (const candidate of [root, `${root}-${fallbackSeed}`]) {
    if (!(await subdomainTaken(candidate))) return candidate;
  }
  // Two collisions means the slug itself is contested; a counter is the only thing left.
  for (let n = 2; n < 100; n++) {
    const candidate = `${root}-${fallbackSeed}-${n}`;
    if (!(await subdomainTaken(candidate))) return candidate;
  }
  throw new Error(`Could not allocate a free subdomain for "${base}"`);
}

async function subdomainTaken(subdomain: string): Promise<boolean> {
  const [biz, inst] = await Promise.all([
    masterKnex("businesses").where({ subdomain }).first("id"),
    masterKnex("institutions").where({ subdomain }).first("id"),
  ]);
  return Boolean(biz || inst);
}

/** True when some OTHER institution already holds this email (partial unique index). */
export async function institutionEmailTaken(email: string, exceptId: number | null): Promise<boolean> {
  const row = await masterKnex("institutions")
    .where({ email })
    .modify((q) => {
      if (exceptId) q.whereNot("id", exceptId);
    })
    .first("id");
  return Boolean(row);
}

// ── Institutions ──

export async function findInstitutionByJobId(jobId: string) {
  return masterKnex("institutions").where({ source_job_id: jobId }).first();
}

export async function insertInstitution(data: Record<string, unknown>) {
  const [row] = await masterKnex("institutions").insert(data).returning("*");
  return row;
}

export async function updateInstitution(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("institutions")
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

// ── Businesses ──

/** The job's primary listing — the agent-derived ones are keyed by source_agent_id instead. */
export async function findPrimaryBusinessByJobId(jobId: string) {
  return masterKnex("businesses").where({ source_job_id: jobId }).whereNull("source_agent_id").first();
}

export async function findBusinessByAgentId(agentId: string) {
  return masterKnex("businesses").where({ source_agent_id: agentId }).first();
}

export async function insertBusiness(data: Record<string, unknown>) {
  const [row] = await masterKnex("businesses").insert(data).returning("*");
  return row;
}

export async function updateBusiness(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("businesses")
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

/**
 * Links an agent's business to the institution job it was scraped from.
 * Returns true only when a new link was actually written.
 *
 * The table's UNIQUE (business_id, extraction_job_id, extraction_course_id) cannot carry
 * this: promote links at job level, leaving extraction_course_id NULL, and Postgres treats
 * NULLs as distinct — so ON CONFLICT would never fire and every re-promote would duplicate.
 * Hence the explicit existence check.
 */
export async function linkRepresentation(businessId: number, jobId: string): Promise<boolean> {
  const existing = await masterKnex("representations")
    .where({ business_id: businessId, extraction_job_id: jobId })
    .whereNull("extraction_course_id")
    .whereNull("deleted_at")
    .first("id");
  if (existing) return false;

  await masterKnex("representations").insert({ business_id: businessId, extraction_job_id: jobId });
  return true;
}
