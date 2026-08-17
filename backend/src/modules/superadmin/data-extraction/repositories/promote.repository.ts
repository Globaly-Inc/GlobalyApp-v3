// Promote repository — staging reads, reference reads, target-org resolution and
// the tenant-schema writes.
//
// Every write takes an explicit `trx`. masterKnex has no searchPath (it resolves
// to public), and tenant schemas live in the SAME database, so one transaction on
// one connection covers staging (superadmin.*), the tenant catalog
// ("<uuid>".business_services) and the master projection at once — which is what
// makes "a partially promoted job is never visible" true rather than aspirational.

import type { Knex } from "knex";

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { websiteHost } from "../lib/promote-mappers.js";

const CHUNK = 500;

// ── Staging reads ───────────────────────────────────────────────────────────

export interface StagingBundle {
  overview: Record<string, any> | undefined;
  courses: Record<string, any>[];
  fees: Record<string, any>[];
  feeAssignments: Record<string, any>[];
  intakes: Record<string, any>[];
  intakeAssignments: Record<string, any>[];
  eligibility: Record<string, any>[];
  eligibilityAssignments: Record<string, any>[];
  studyOptions: Record<string, any>[];
  studyOptionAssignments: Record<string, any>[];
  studyUnits: Record<string, any>[];
  studyUnitAssignments: Record<string, any>[];
  accreditationAssignments: Record<string, any>[];
  campusCount: number;
}

// Sequential on purpose: a knex transaction owns a single connection, so
// Promise.all here would just queue on it while tripping pg's
// "client is already executing a query" deprecation.
export async function loadStaging(trx: Knex, jobId: string): Promise<StagingBundle> {
  const byJob = (table: string) => trx(`${S}.${table}`).where({ job_id: jobId });

  const overview = await byJob("extraction_institution_overview").first();
  const courses = await byJob("extraction_courses").orderBy("created_at", "asc");
  const fees = await byJob("extraction_course_fees");
  const feeAssignments = await byJob("extraction_course_fee_assignments");
  const intakes = await byJob("extraction_intakes");
  const intakeAssignments = await byJob("extraction_course_intake_assignments");
  const eligibility = await byJob("extraction_eligibility_requirements");
  const eligibilityAssignments = await byJob("extraction_course_eligibility_assignments");
  const studyOptions = await byJob("extraction_study_options");
  const studyOptionAssignments = await byJob("extraction_course_study_option_assignments");
  const studyUnits = await byJob("extraction_study_units");
  const studyUnitAssignments = await byJob("extraction_course_study_unit_assignments");
  const accreditationAssignments = await trx(`${S}.extraction_course_accreditation_assignments as a`)
    .where("a.job_id", jobId)
    .leftJoin(`${S}.extraction_accreditations as e`, "a.extraction_accreditation_id", "e.id")
    .select("a.*", "e.name as extraction_accreditation_name");
  const campuses = await byJob("extraction_campuses").count({ n: "*" }).first();

  return {
    overview,
    courses,
    fees,
    feeAssignments,
    intakes,
    intakeAssignments,
    eligibility,
    eligibilityAssignments,
    studyOptions,
    studyOptionAssignments,
    studyUnits,
    studyUnitAssignments,
    accreditationAssignments,
    campusCount: Number((campuses as { n?: string } | undefined)?.n ?? 0),
  };
}

export interface References {
  degreeLevels: { id: number; name: string; slug: string | null }[];
  areasOfStudy: { id: number; name: string; slug: string | null }[];
  accreditations: { id: number; name: string }[];
}

export async function loadReferences(trx: Knex): Promise<References> {
  const degreeLevels = await trx("public.degree_levels").whereNull("deleted_at").select("id", "name", "slug");
  const areasOfStudy = await trx("public.areas_of_study").whereNull("deleted_at").select("id", "name", "slug");
  const accreditations = await trx("public.accreditations").whereNull("deleted_at").select("id", "name");
  return { degreeLevels, areasOfStudy, accreditations };
}

// ── Target org resolution ───────────────────────────────────────────────────

export type OrgType = "business" | "institution";

export interface TargetOrg {
  org_type: OrgType;
  org_id: number;
  schema_name: string | null;
  name: string;
}

const ORG_TABLE: Record<OrgType, { table: string; nameColumn: string }> = {
  business: { table: "businesses", nameColumn: "business_name" },
  institution: { table: "institutions", nameColumn: "institution_name" },
};

export async function findOrgById(orgType: OrgType, orgId: number): Promise<TargetOrg | null> {
  const { table, nameColumn } = ORG_TABLE[orgType];
  const row = await masterKnex(table).where({ id: orgId }).first("id", "schema_name", `${nameColumn} as name`);
  return row ? { org_type: orgType, org_id: row.id, schema_name: row.schema_name, name: row.name } : null;
}

/**
 * Match a job's institution against an existing org. Host match first (a domain
 * is the one identifier a scrape definitely got right), then exact name.
 * Institutions before businesses: an extraction job describes a school, and the
 * unclaimed directory is where those live.
 */
export async function findOrgForJob(job: {
  institution_name: string | null;
  institution_url: string;
}, overviewName?: string | null, overviewWebsite?: string | null): Promise<TargetOrg | null> {
  const host = websiteHost(overviewWebsite) ?? websiteHost(job.institution_url);
  const name = (overviewName ?? job.institution_name ?? "").trim();

  for (const orgType of ["institution", "business"] as const) {
    const { table, nameColumn } = ORG_TABLE[orgType];
    const query = masterKnex(table).whereNull("deleted_at").first("id", "schema_name", `${nameColumn} as name`);

    if (host) {
      // Scheme, www. and any path stripped, so https://www.x.edu/courses == x.edu.
      // {0,1} rather than ? because knex reads a literal ? in raw SQL as a binding.
      const byHost = await query
        .clone()
        .whereRaw(
          `split_part(regexp_replace(lower(coalesce(website, '')), '^[a-z]+://(www[.]){0,1}', ''), '/', 1) = ?`,
          [host],
        );
      if (byHost) return { org_type: orgType, org_id: byHost.id, schema_name: byHost.schema_name, name: byHost.name };
    }

    if (name) {
      const byName = await query.clone().whereRaw(`lower(${nameColumn}) = lower(?)`, [name]);
      if (byName) return { org_type: orgType, org_id: byName.id, schema_name: byName.schema_name, name: byName.name };
    }
  }

  return null;
}

/**
 * Create the unclaimed institution an extraction job describes.
 *
 * Deliberately minimal and unpublished: this is a directory listing nobody has
 * claimed, not an onboarded tenant. `email` is only set when free — the column is
 * UNIQUE and a scraped inbox address is not worth failing a promote over.
 */
export async function createInstitutionForJob(input: {
  name: string;
  website: string | null;
  overview: Record<string, any> | undefined;
  jobId: string;
}): Promise<TargetOrg> {
  const o = input.overview ?? {};
  const countryId = o.country
    ? (
        await masterKnex("countries")
          .whereRaw("lower(name) = lower(?)", [o.country])
          .orWhereRaw("lower(iso2) = lower(?)", [o.country])
          .orWhereRaw("lower(iso3) = lower(?)", [o.country])
          .first("id")
      )?.id ?? null
    : null;

  const email = o.email && !(await masterKnex("institutions").where({ email: o.email }).first("id")) ? o.email : null;

  const [row] = await masterKnex("institutions")
    .insert({
      institution_name: input.name,
      website: input.website,
      description: o.description ?? null,
      logo_url: o.logo_url ?? null,
      phone: o.phone ?? null,
      email,
      country_id: countryId,
      state: o.state ?? null,
      city: o.city ?? null,
      address: o.address ?? null,
      postcode: o.zip_code ?? null,
      claim_status: "unclaimed",
      status: "pending",
      is_published: false,
      schema_name: masterKnex.raw("gen_random_uuid()"),
      meta: JSON.stringify({ created_by_extraction_job: input.jobId }),
    })
    .returning(["id", "schema_name", "institution_name as name"]);

  return { org_type: "institution", org_id: row.id, schema_name: row.schema_name, name: row.name };
}

export async function assignSchemaName(orgType: OrgType, orgId: number): Promise<string> {
  const [row] = await masterKnex(ORG_TABLE[orgType].table)
    .where({ id: orgId })
    .update({ schema_name: masterKnex.raw("gen_random_uuid()") })
    .returning("schema_name");
  return row.schema_name;
}

// ── Tenant writes ───────────────────────────────────────────────────────────

/** extraction_source_id → live id, for rows already promoted by an earlier run. */
export async function existingSourceIds(
  trx: Knex,
  schema: string,
  table: string,
  sourceIds: readonly string[],
): Promise<Map<string, string>> {
  if (!sourceIds.length) return new Map();
  const found = new Map<string, string>();
  for (const chunk of chunks(sourceIds)) {
    const rows = await trx(table)
      .withSchema(schema)
      .whereIn("extraction_source_id", chunk as string[])
      .select("id", "extraction_source_id");
    for (const row of rows) found.set(row.extraction_source_id, row.id);
  }
  return found;
}

export interface UpsertedRow {
  id: string;
  extraction_source_id: string;
  service_id?: string;
}

/** Insert-or-update keyed on `conflict`; returns the live ids in insertion order. */
export async function upsertRows(
  trx: Knex,
  schema: string,
  table: string,
  rows: readonly Record<string, unknown>[],
  conflict: readonly string[],
): Promise<UpsertedRow[]> {
  const out: UpsertedRow[] = [];
  for (const chunk of chunks(rows)) {
    const stamped = (chunk as Record<string, unknown>[]).map((row) => ({ ...row, updated_at: new Date() }));
    const returned = await trx(table)
      .withSchema(schema)
      .insert(stamped)
      .onConflict(conflict as string[])
      .merge()
      .returning(["id", "extraction_source_id"]);
    out.push(...returned);
  }
  return out;
}

/** Junction rows dedupe on their (service_id, target) unique — re-promote is a no-op. */
export async function insertJunctions(
  trx: Knex,
  schema: string,
  table: string,
  rows: readonly Record<string, unknown>[],
  conflict: readonly string[],
): Promise<number> {
  let inserted = 0;
  for (const chunk of chunks(rows)) {
    const returned = await trx(table)
      .withSchema(schema)
      .insert(chunk as Record<string, unknown>[])
      .onConflict(conflict as string[])
      .ignore()
      .returning("id");
    inserted += returned.length;
  }
  return inserted;
}

export async function recordPromotion(
  trx: Knex,
  row: {
    job_id: string;
    target_org_type: OrgType;
    target_org_id: number;
    schema_name: string;
    org_created: boolean;
    schema_provisioned: boolean;
    promoted_by: number | null;
    dry_run: boolean;
    counts: Record<string, unknown>;
    unresolved: unknown[];
  },
): Promise<void> {
  await trx(`${S}.extraction_promotions`).insert({
    ...row,
    counts: JSON.stringify(row.counts),
    unresolved: JSON.stringify(row.unresolved),
  });
}

export async function listPromotions(jobId: string) {
  return masterKnex(`${S}.extraction_promotions`).where({ job_id: jobId }).orderBy("created_at", "desc");
}

function* chunks<T>(items: readonly T[]): Generator<readonly T[]> {
  for (let i = 0; i < items.length; i += CHUNK) yield items.slice(i, i + CHUNK);
}
