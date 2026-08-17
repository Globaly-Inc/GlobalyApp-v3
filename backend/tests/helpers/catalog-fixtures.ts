// Fixtures for the promote pipeline and the public catalog.
//
// Everything is built from scratch per suite (including the reference rows the
// filters need) so a sibling suite wiping the test database cannot leave these
// tests depending on stale data. Tenant schemas are provisioned the same way
// production does it — CREATE SCHEMA + the business migration set.

import type { Knex } from "knex";

export interface Reference {
  countryId: number;
  countryIso2: string;
  countryName: string;
  /** A second country, so "filter by country" can be shown to exclude something. */
  otherCountryId: number;
  categoryId: number;
  degreeLevelId: number;
  areaOfStudyId: number;
  accreditationId: number;
  feeTypeId: number;
}

/** Idempotent: every one of these tables has a unique on name or slug. */
export async function seedReferences(db: Knex, tag: string): Promise<Reference> {
  const upsert = async (table: string, values: Record<string, unknown>, conflict: string) => {
    const [row] = await db(table).insert(values).onConflict(conflict).merge().returning("id");
    return row.id as number;
  };

  // Countries come from the global seeder. They are reused rather than created
  // because both `name` and `iso2`/`iso3` are unique, so a per-run synthetic
  // country collides with itself across runs.
  const countries = await db("countries").orderBy("id").limit(2).select("id", "name", "iso2");
  if (countries.length < 2) {
    for (const suffix of ["A", "B"]) {
      const code = `Q${suffix}`;
      const [row] = await db("countries")
        .insert({ name: `Testland ${code}`, iso2: code, iso3: `Q${suffix}X` })
        .onConflict("name")
        .merge()
        .returning(["id", "name", "iso2"]);
      countries.push(row);
    }
  }

  const categoryId = await upsert(
    "service_categories",
    { name: `Courses ${tag}`, slug: `courses-${tag}` },
    "slug",
  );
  const degreeLevelId = await upsert(
    "degree_levels",
    { name: `Bachelor ${tag}`, slug: `bachelor-${tag}` },
    "slug",
  );
  const areaOfStudyId = await upsert(
    "areas_of_study",
    { name: `Computer Science ${tag}`, slug: `computer-science-${tag}` },
    "slug",
  );
  const [accreditation] = await db("accreditations").insert({ name: `TEQSA ${tag}` }).returning("id");
  const [feeType] = await db("fee_types").insert({ name: `Tuition ${tag}`, slug: `tuition-${tag}` }).returning("id");

  return {
    countryId: countries[0].id,
    countryIso2: countries[0].iso2,
    countryName: countries[0].name,
    otherCountryId: countries[1].id,
    categoryId,
    degreeLevelId,
    areaOfStudyId,
    accreditationId: accreditation.id,
    feeTypeId: feeType.id,
  };
}

export interface Tenant {
  schema: string;
  orgId: number;
  db: Knex;
}

/** An unclaimed institution with a provisioned tenant schema — promote's default target. */
export async function createInstitutionTenant(
  db: Knex,
  createSchemaKnex: (schema: string, pool?: Knex.PoolConfig) => Knex,
  opts: { name: string; website?: string; countryId?: number; city?: string },
): Promise<Tenant> {
  const [{ uuid }] = (await db.raw("select gen_random_uuid() as uuid")).rows;
  const [org] = await db("institutions")
    .insert({
      institution_name: opts.name,
      website: opts.website ?? null,
      country_id: opts.countryId ?? null,
      city: opts.city ?? null,
      schema_name: uuid,
      claim_status: "unclaimed",
    })
    .returning("id");

  await db.raw(`CREATE SCHEMA "${uuid}"`);
  const tenantDb = createSchemaKnex(uuid, { min: 0, max: 2 });
  await tenantDb.migrate.latest({ directory: "./database/migrations/business", schemaName: uuid });

  return { schema: uuid, orgId: org.id, db: tenantDb };
}

export async function dropTenant(db: Knex, tenant: Tenant | undefined): Promise<void> {
  if (!tenant) return;
  await tenant.db.destroy().catch(() => {});
  await db("institutions").where({ id: tenant.orgId }).del().catch(() => {});
  await db.raw(`DROP SCHEMA IF EXISTS "${tenant.schema}" CASCADE`);
}

export interface StagedJobSpec {
  institutionName: string;
  institutionUrl: string;
  serviceCategoryId: number | null;
  status?: string;
  courses: {
    key: string;
    name: string;
    degree_level?: string | null;
    subject_area?: string | null;
    international_fee_total?: number | null;
    international_currency?: string | null;
    duration_weeks?: number | null;
    study_mode?: string | null;
    description?: string | null;
  }[];
}

export interface StagedJob {
  jobId: string;
  courseIdByKey: Map<string, string>;
}

/** A minimal but complete job: overview + courses + one of every child kind. */
export async function stageJob(db: Knex, spec: StagedJobSpec): Promise<StagedJob> {
  const [job] = await db("superadmin.extraction_jobs")
    .insert({
      institution_name: spec.institutionName,
      institution_url: spec.institutionUrl,
      status: spec.status ?? "approved",
      service_category_id: spec.serviceCategoryId,
    })
    .returning("id");

  await db("superadmin.extraction_institution_overview").insert({
    job_id: job.id,
    name: spec.institutionName,
    website: spec.institutionUrl,
    city: "Sydney",
    country: "Australia",
  });

  const courseIdByKey = new Map<string, string>();
  for (const course of spec.courses) {
    const [row] = await db("superadmin.extraction_courses")
      .insert({
        job_id: job.id,
        name: course.name,
        degree_level: course.degree_level ?? null,
        subject_area: course.subject_area ?? null,
        international_fee_total: course.international_fee_total ?? null,
        international_currency: course.international_currency ?? null,
        duration_weeks: course.duration_weeks ?? null,
        study_mode: course.study_mode ?? null,
        description: course.description ?? null,
      })
      .returning("id");
    courseIdByKey.set(course.key, row.id);
  }

  return { jobId: job.id, courseIdByKey };
}

export async function stageFee(
  db: Knex,
  jobId: string,
  courseId: string | null,
  values: Record<string, unknown>,
): Promise<string> {
  const [fee] = await db("superadmin.extraction_course_fees")
    .insert({ job_id: jobId, ...values })
    .returning("id");
  if (courseId) {
    await db("superadmin.extraction_course_fee_assignments").insert({
      job_id: jobId,
      course_id: courseId,
      course_fee_id: fee.id,
    });
  }
  return fee.id;
}

export async function stageIntake(
  db: Knex,
  jobId: string,
  courseId: string | null,
  values: Record<string, unknown>,
): Promise<string> {
  const [intake] = await db("superadmin.extraction_intakes")
    .insert({ job_id: jobId, course_id: courseId, ...values })
    .returning("id");
  return intake.id;
}

export async function stageEligibility(
  db: Knex,
  jobId: string,
  courseId: string | null,
  values: Record<string, unknown>,
): Promise<string> {
  const [req] = await db("superadmin.extraction_eligibility_requirements")
    .insert({ job_id: jobId, ...values })
    .returning("id");
  if (courseId) {
    await db("superadmin.extraction_course_eligibility_assignments").insert({
      job_id: jobId,
      course_id: courseId,
      eligibility_requirement_id: req.id,
    });
  }
  return req.id;
}

export async function stageStudyOption(
  db: Knex,
  jobId: string,
  courseId: string | null,
  values: Record<string, unknown>,
): Promise<string> {
  const [option] = await db("superadmin.extraction_study_options")
    .insert({ job_id: jobId, ...values })
    .returning("id");
  if (courseId) {
    await db("superadmin.extraction_course_study_option_assignments").insert({
      job_id: jobId,
      course_id: courseId,
      study_option_id: option.id,
    });
  }
  return option.id;
}

export async function stageStudyUnit(
  db: Knex,
  jobId: string,
  courseId: string | null,
  values: Record<string, unknown>,
): Promise<string> {
  const [unit] = await db("superadmin.extraction_study_units")
    .insert({ job_id: jobId, ...values })
    .returning("id");
  if (courseId) {
    await db("superadmin.extraction_course_study_unit_assignments").insert({
      job_id: jobId,
      course_id: courseId,
      study_unit_id: unit.id,
    });
  }
  return unit.id;
}

export async function stageAccreditation(
  db: Knex,
  jobId: string,
  courseId: string,
  name: string,
): Promise<string> {
  const [accreditation] = await db("superadmin.extraction_accreditations").insert({ name }).returning("id");
  const [assignment] = await db("superadmin.extraction_course_accreditation_assignments")
    .insert({ job_id: jobId, course_id: courseId, extraction_accreditation_id: accreditation.id })
    .returning("id");
  return assignment.id;
}

/**
 * Idempotent lookup/insert of a business_categories row. Only `education_agency`
 * ships in the migration set, so any suite that needs `institutions` or
 * `migration_agents` has to put them there itself.
 */
export async function ensureBusinessCategory(db: Knex, slug: string, name: string): Promise<number> {
  const [row] = await db("business_categories")
    .insert({ slug, name })
    .onConflict("slug")
    .merge({ name })
    .returning("id");
  return row.id as number;
}

/**
 * A claimed business with a provisioned tenant schema — the other half of the
 * polymorphic org model. `businesses.owner_id` is NOT NULL, so this creates a
 * throwaway platform user to own it.
 */
export async function createBusinessTenant(
  db: Knex,
  createSchemaKnex: (schema: string, pool?: Knex.PoolConfig) => Knex,
  opts: {
    name: string;
    categoryId?: number;
    website?: string;
    countryId?: number;
    city?: string;
    isPublished?: boolean;
  },
): Promise<Tenant> {
  const [{ uuid }] = (await db.raw("select gen_random_uuid() as uuid")).rows;
  const [owner] = await db("platform_users")
    .insert({ first_name: "Fixture", last_name: "Owner", email: `owner.${uuid}@vitest.local` })
    .returning("id");

  const [org] = await db("businesses")
    .insert({
      owner_id: owner.id,
      subdomain: `fx-${String(uuid).slice(0, 12)}`,
      schema_name: uuid,
      business_name: opts.name,
      business_category_id: opts.categoryId ?? null,
      website: opts.website ?? null,
      country_id: opts.countryId ?? null,
      city: opts.city ?? null,
      is_published: opts.isPublished ?? true,
      status: "verified",
    })
    .returning("id");

  await db.raw(`CREATE SCHEMA "${uuid}"`);
  const tenantDb = createSchemaKnex(uuid, { min: 0, max: 2 });
  await tenantDb.migrate.latest({ directory: "./database/migrations/business", schemaName: uuid });

  return { schema: uuid, orgId: org.id, db: tenantDb };
}

export async function dropBusinessTenant(db: Knex, tenant: Tenant | undefined): Promise<void> {
  if (!tenant) return;
  await tenant.db.destroy().catch(() => {});
  const owner = await db("businesses").where({ id: tenant.orgId }).first("owner_id");
  await db("businesses").where({ id: tenant.orgId }).del().catch(() => {});
  if (owner) await db("platform_users").where({ id: owner.owner_id }).del().catch(() => {});
  await db.raw(`DROP SCHEMA IF EXISTS "${tenant.schema}" CASCADE`);
}

export async function deleteJob(db: Knex, jobId: string | undefined): Promise<void> {
  if (!jobId) return;
  // extraction_* children all cascade from the job.
  await db("superadmin.extraction_jobs").where({ id: jobId }).del();
}
