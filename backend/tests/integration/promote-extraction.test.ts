// Wave C2: promotion of staged extraction rows into the live per-tenant catalog.
//
// The four properties that matter, each asserted against real Postgres:
//   - transactional: a failure mid-promote leaves nothing visible anywhere
//   - idempotent: promoting twice leaves one set of rows
//   - honest: staged rows that cannot become valid live rows stay in staging and
//     are reported with a reason
//   - unclaimed-institution targets work, including creating one from scratch

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Knex } from "knex";

import { dbAvailable } from "../helpers/db.js";
import {
  createInstitutionTenant,
  deleteJob,
  dropTenant,
  seedReferences,
  stageAccreditation,
  stageEligibility,
  stageFee,
  stageIntake,
  stageJob,
  stageStudyOption,
  stageStudyUnit,
  type Reference,
  type StagedJob,
  type Tenant,
} from "../helpers/catalog-fixtures.js";

const describeDb = describe.skipIf(!dbAvailable);

const TAG = `c2p${process.pid}`;

describeDb("extraction promotion", () => {
  let db: Knex;
  let createSchemaKnex: (schema: string, pool?: Knex.PoolConfig) => Knex;
  let promote: typeof import("../../src/modules/superadmin/data-extraction/services/promote.service.js");
  let ref: Reference;
  let tenant: Tenant;
  /** Real admin row — admin_audit_logs.admin_id is a FK. */
  let ADMIN_ID: number;
  let platformUserId: number;
  const jobIds: string[] = [];
  const createdOrgIds: number[] = [];

  beforeAll(async () => {
    ({ masterKnex: db } = await import("../../src/core/db/master-pool.js"));
    ({ createSchemaKnex } = await import("../../src/core/db/knex.js"));
    promote = await import("../../src/modules/superadmin/data-extraction/services/promote.service.js");

    const { uniqueEmail } = await import("../helpers/db.js");
    const [user] = await db("platform_users")
      .insert({ first_name: "C2", last_name: "Promoter", email: uniqueEmail("c2.promote") })
      .returning("id");
    platformUserId = user.id;
    const [admin] = await db("superadmin.admin_users")
      .insert({ platform_user_id: user.id, role: "data_admin" })
      .returning("id");
    ADMIN_ID = admin.id;

    ref = await seedReferences(db, TAG);
    tenant = await createInstitutionTenant(db, createSchemaKnex, {
      name: `Promote Target ${TAG}`,
      website: `https://promote-${TAG}.edu.au`,
      countryId: ref.countryId,
      city: "Sydney",
    });
  });

  afterAll(async () => {
    for (const jobId of jobIds) await deleteJob(db, jobId);
    for (const orgId of createdOrgIds) {
      const org = await db("institutions").where({ id: orgId }).first("schema_name");
      if (org?.schema_name) await db.raw(`DROP SCHEMA IF EXISTS "${org.schema_name}" CASCADE`);
      await db("institutions").where({ id: orgId }).del();
    }
    await dropTenant(db, tenant);
    if (ADMIN_ID) await db("superadmin.admin_audit_logs").where({ admin_id: ADMIN_ID }).del();
    if (ADMIN_ID) await db("superadmin.admin_users").where({ id: ADMIN_ID }).del();
    if (platformUserId) await db("platform_users").where({ id: platformUserId }).del();
    if (ref?.accreditationId) await db("accreditations").where({ id: ref.accreditationId }).del();
    if (ref?.feeTypeId) await db("fee_types").where({ id: ref.feeTypeId }).del();
  });

  /** A job with one promotable course and one of every child kind hanging off it. */
  async function stageFullJob(): Promise<StagedJob> {
    const staged = await stageJob(db, {
      institutionName: `Promote Target ${TAG}`,
      institutionUrl: `https://promote-${TAG}.edu.au`,
      serviceCategoryId: ref.categoryId,
      courses: [
        {
          key: "cs",
          name: "Bachelor of Computer Science",
          degree_level: `bachelor-${TAG}`,
          subject_area: `Computer Science ${TAG}`,
          international_fee_total: 32000,
          international_currency: "AUD",
          duration_weeks: 156,
          study_mode: "on_campus",
          description: "Algorithms, databases and distributed systems.",
        },
      ],
    });
    jobIds.push(staged.jobId);
    const courseId = staged.courseIdByKey.get("cs")!;

    await stageFee(db, staged.jobId, courseId, {
      name: "Tuition",
      student_type: "international",
      currency: "AUD",
      total_amount: 32000,
      fee_type_id: ref.feeTypeId,
    });
    await stageIntake(db, staged.jobId, courseId, {
      intake_name: "February 2027",
      intake_month: 2,
      intake_year: 2027,
      start_date: "2027-02-01",
    });
    await stageEligibility(db, staged.jobId, courseId, {
      name: "Academic entry",
      applicable_to: "international",
      min_degree_level: `bachelor-${TAG}`,
      score_type: "percentage",
      min_score: 65,
    });
    await stageStudyOption(db, staged.jobId, courseId, {
      name: "Full time on campus",
      study_mode: "on_campus",
      study_load: "full_time",
      duration_value: 3,
      duration_unit: "years",
      applicable_to: "both",
    });
    await stageStudyUnit(db, staged.jobId, courseId, {
      unit_code: "COMP101",
      unit_name: "Programming Fundamentals",
      credit_points: 6,
      unit_type: "compulsory",
    });
    await stageAccreditation(db, staged.jobId, courseId, `TEQSA ${TAG}`);

    return staged;
  }

  const tenantCount = async (table: string, where: Record<string, unknown> = {}) =>
    Number((await tenant.db(table).where(where).count({ n: "*" }))[0].n);

  it("promotes a full job into the target tenant schema and the public projection", async () => {
    const staged = await stageFullJob();

    const report = await promote.promoteJob(staged.jobId, ADMIN_ID, {
      target_org_type: "institution",
      target_org_id: tenant.orgId,
    });

    expect(report.target).toMatchObject({
      org_type: "institution",
      org_id: tenant.orgId,
      schema_name: tenant.schema,
      business_id: null,
    });
    expect(report.counts.services_inserted).toBe(1);
    expect(report.unresolved).toEqual([]);

    const service = await tenant.db("business_services").first();
    expect(service).toMatchObject({
      name: "Bachelor of Computer Science",
      service_category_id: ref.categoryId,
      degree_level_id: ref.degreeLevelId,
      area_of_study_id: ref.areaOfStudyId,
      duration_value: 156,
      duration_unit: "weeks",
      study_mode: ["on_campus"],
      is_published: true,
    });
    expect(service.extraction_source_id).toBe(staged.courseIdByKey.get("cs"));

    expect(await tenantCount("service_fees")).toBe(1);
    expect(await tenantCount("service_intakes")).toBe(1);
    expect(await tenantCount("service_eligibility_requirements")).toBe(1);
    expect(await tenantCount("service_study_options")).toBe(1);
    expect(await tenantCount("service_study_option_assignments")).toBe(1);
    expect(await tenantCount("service_study_units")).toBe(1);
    expect(await tenantCount("service_study_unit_assignments")).toBe(1);
    expect(await tenantCount("service_accreditation_assignments")).toBe(1);

    // Reference ids are copied straight through as integers — no uuid translation.
    const fee = await tenant.db("service_fees").first();
    expect(fee.fee_type_id).toBe(ref.feeTypeId);
    const eligibility = await tenant.db("service_eligibility_requirements").first();
    expect(eligibility.degree_level_id).toBe(ref.degreeLevelId);
    // numeric comes back from pg as a string — the staged value is carried verbatim.
    expect(eligibility.min_scores).toEqual([{ score_type: "percentage", min_score: "65" }]);

    // The master projection is trigger-maintained, so it is already current — and
    // it carries the facets the public filters use.
    const projected = await db("catalog_services").where({ service_id: service.id }).first();
    expect(projected).toMatchObject({
      schema_name: tenant.schema,
      owner_org_type: "institution",
      owner_org_id: tenant.orgId,
      is_published: true,
    });
    expect(Number(projected.min_fee)).toBe(32000);
    expect(projected.intake_months).toEqual([2]);

    // The job is marked exported and the promotion is on the ledger.
    const job = await db("superadmin.extraction_jobs").where({ id: staged.jobId }).first();
    expect(job.status).toBe("exported");
    const ledger = await db("superadmin.extraction_promotions").where({ job_id: staged.jobId });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ target_org_id: tenant.orgId, dry_run: false, promoted_by: ADMIN_ID });

    const audit = await db("superadmin.admin_audit_logs")
      .where({ admin_id: ADMIN_ID, action: "EXTRACTION_PROMOTE", entity_id: staged.jobId })
      .first();
    expect(audit).toBeTruthy();
  });

  it("is idempotent — promoting the same job twice leaves one set of rows", async () => {
    const staged = await stageFullJob();
    const target = { target_org_type: "institution" as const, target_org_id: tenant.orgId };

    const first = await promote.promoteJob(staged.jobId, ADMIN_ID, target);
    const afterFirst = {
      services: await tenantCount("business_services"),
      fees: await tenantCount("service_fees"),
      intakes: await tenantCount("service_intakes"),
      eligibility: await tenantCount("service_eligibility_requirements"),
      options: await tenantCount("service_study_options"),
      optionLinks: await tenantCount("service_study_option_assignments"),
      units: await tenantCount("service_study_units"),
      unitLinks: await tenantCount("service_study_unit_assignments"),
      accreditations: await tenantCount("service_accreditation_assignments"),
      projection: Number((await db("catalog_services").where({ schema_name: tenant.schema }).count({ n: "*" }))[0].n),
    };
    expect(first.counts.services_inserted).toBe(1);
    expect(first.counts.services_reused).toBe(0);

    const second = await promote.promoteJob(staged.jobId, ADMIN_ID, target);
    expect(second.counts.services_inserted).toBe(0);
    expect(second.counts.services_reused).toBe(1);

    expect({
      services: await tenantCount("business_services"),
      fees: await tenantCount("service_fees"),
      intakes: await tenantCount("service_intakes"),
      eligibility: await tenantCount("service_eligibility_requirements"),
      options: await tenantCount("service_study_options"),
      optionLinks: await tenantCount("service_study_option_assignments"),
      units: await tenantCount("service_study_units"),
      unitLinks: await tenantCount("service_study_unit_assignments"),
      accreditations: await tenantCount("service_accreditation_assignments"),
      projection: Number((await db("catalog_services").where({ schema_name: tenant.schema }).count({ n: "*" }))[0].n),
    }).toEqual(afterFirst);

    // Two attempts, both on the ledger — a re-promote is visible, not silent.
    expect(await db("superadmin.extraction_promotions").where({ job_id: staged.jobId })).toHaveLength(2);
  });

  it("is atomic — a failure part way through leaves nothing visible", async () => {
    const staged = await stageFullJob();
    const projectedBefore = Number(
      (await db("catalog_services").where({ schema_name: tenant.schema }).count({ n: "*" }))[0].n,
    );

    // Services are written before intakes, so blowing up on the intake insert
    // proves the already-written services and their projection rows roll back.
    await db.raw(`
      CREATE OR REPLACE FUNCTION "${tenant.schema}".c2_boom() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'c2 forced mid-promotion failure'; END; $$
    `);
    await db.raw(`
      CREATE TRIGGER c2_boom BEFORE INSERT ON "${tenant.schema}".service_intakes
        FOR EACH ROW EXECUTE FUNCTION "${tenant.schema}".c2_boom()
    `);

    try {
      await expect(
        promote.promoteJob(staged.jobId, ADMIN_ID, {
          target_org_type: "institution",
          target_org_id: tenant.orgId,
        }),
      ).rejects.toThrow(/c2 forced mid-promotion failure/);
    } finally {
      await db.raw(`DROP TRIGGER c2_boom ON "${tenant.schema}".service_intakes`);
      await db.raw(`DROP FUNCTION "${tenant.schema}".c2_boom()`);
    }

    const courseId = staged.courseIdByKey.get("cs")!;
    expect(await tenantCount("business_services", { extraction_source_id: courseId })).toBe(0);
    // The projection is trigger-maintained inside the same transaction, so it
    // rolled back with the services rather than keeping a phantom row.
    expect(
      Number((await db("catalog_services").where({ schema_name: tenant.schema }).count({ n: "*" }))[0].n),
    ).toBe(projectedBefore);
    expect(await db("superadmin.extraction_promotions").where({ job_id: staged.jobId })).toHaveLength(0);

    // The job keeps its pre-promote status: nothing was exported.
    const job = await db("superadmin.extraction_jobs").where({ id: staged.jobId }).first();
    expect(job.status).toBe("approved");
  });

  it("reports unresolvable staged rows and leaves them in staging", async () => {
    const staged = await stageJob(db, {
      institutionName: `Promote Target ${TAG}`,
      institutionUrl: `https://promote-${TAG}.edu.au`,
      serviceCategoryId: ref.categoryId,
      courses: [
        { key: "ok", name: "Diploma of Testing" },
        { key: "nameless", name: "   " },
      ],
    });
    jobIds.push(staged.jobId);
    const okCourse = staged.courseIdByKey.get("ok")!;

    const orphanFee = await stageFee(db, staged.jobId, null, { name: "Unassigned fee", total_amount: 100 });
    const orphanIntake = await stageIntake(db, staged.jobId, null, { intake_name: "Nowhere" });
    const badOption = await stageStudyOption(db, staged.jobId, okCourse, {
      study_mode: "telepathy",
      study_load: "full_time",
      applicable_to: "both",
    });
    const unknownAccreditation = await stageAccreditation(db, staged.jobId, okCourse, `Definitely Not Real ${TAG}`);

    const report = await promote.promoteJob(staged.jobId, ADMIN_ID, {
      target_org_type: "institution",
      target_org_id: tenant.orgId,
    });

    const reasonFor = (id: string) => report.unresolved.find((u) => u.id === id);
    expect(reasonFor(staged.courseIdByKey.get("nameless")!)?.reason).toMatch(/no name/);
    expect(reasonFor(orphanFee)?.reason).toMatch(/no promoted course assigned/);
    expect(reasonFor(orphanIntake)?.reason).toMatch(/no promoted course assigned/);
    expect(reasonFor(badOption)?.reason).toMatch(/study_mode/);
    expect(reasonFor(unknownAccreditation)?.reason).toMatch(/does not match any public.accreditations/);

    // Reported, never dropped: every one of them is still in staging.
    expect(await db("superadmin.extraction_courses").where({ id: staged.courseIdByKey.get("nameless") }).first()).toBeTruthy();
    expect(await db("superadmin.extraction_course_fees").where({ id: orphanFee }).first()).toBeTruthy();
    expect(await db("superadmin.extraction_intakes").where({ id: orphanIntake }).first()).toBeTruthy();
    expect(await db("superadmin.extraction_study_options").where({ id: badOption }).first()).toBeTruthy();

    // ...and none of them produced a live row.
    expect(await tenantCount("business_services", { extraction_source_id: staged.courseIdByKey.get("nameless") })).toBe(0);
    expect(await tenantCount("service_fees", { extraction_source_id: orphanFee })).toBe(0);
    expect(await tenantCount("service_study_options", { extraction_source_id: badOption })).toBe(0);

    // The good course still promoted — one bad row does not sink the job.
    expect(await tenantCount("business_services", { extraction_source_id: okCourse })).toBe(1);

    // The ledger keeps the same list for a later re-run.
    const ledger = await db("superadmin.extraction_promotions").where({ job_id: staged.jobId }).first();
    expect(ledger.unresolved).toHaveLength(report.unresolved.length);
  });

  it("keeps an unmatched optional reference as a warning, not a dropped row", async () => {
    const staged = await stageJob(db, {
      institutionName: `Promote Target ${TAG}`,
      institutionUrl: `https://promote-${TAG}.edu.au`,
      serviceCategoryId: ref.categoryId,
      courses: [{ key: "mystery", name: "Master of Unknown Things", degree_level: "Sorcery" }],
    });
    jobIds.push(staged.jobId);

    const report = await promote.promoteJob(staged.jobId, ADMIN_ID, {
      target_org_type: "institution",
      target_org_id: tenant.orgId,
    });

    expect(report.warnings.some((w) => /unmatched degree_level "Sorcery"/.test(w))).toBe(true);
    expect(report.unresolved).toEqual([]);
    const service = await tenant.db("business_services")
      .where({ extraction_source_id: staged.courseIdByKey.get("mystery") })
      .first();
    expect(service.degree_level_id).toBeNull();
  });

  it("creates and provisions an unclaimed institution when the job matches no org", async () => {
    const staged = await stageJob(db, {
      institutionName: `Ghost College ${TAG}`,
      institutionUrl: `https://ghost-${TAG}.edu`,
      serviceCategoryId: ref.categoryId,
      courses: [{ key: "ghost", name: "Diploma of Apparitions", international_fee_total: 900 }],
    });
    jobIds.push(staged.jobId);
    await stageFee(db, staged.jobId, staged.courseIdByKey.get("ghost")!, { total_amount: 900, currency: "AUD" });

    const report = await promote.promoteJob(staged.jobId, ADMIN_ID, {});
    createdOrgIds.push(report.target.org_id);

    expect(report.target.org_type).toBe("institution");
    expect(report.target.org_created).toBe(true);

    const org = await db("institutions").where({ id: report.target.org_id }).first();
    expect(org.claim_status).toBe("unclaimed");
    expect(org.schema_name).toBe(report.target.schema_name);
    expect(org.is_published).toBe(false);

    // Its schema really was provisioned with the full catalog.
    const created = await db(`${report.target.schema_name}.business_services`).first();
    expect(created.name).toBe("Diploma of Apparitions");

    // And an unclaimed org's service is still publicly projected — that is the
    // whole point of the unclaimed directory.
    const projected = await db("catalog_services").where({ service_id: created.id }).first();
    expect(projected.owner_org_type).toBe("institution");
    expect(projected.is_published).toBe(true);
  });

  it("reuses the org a second job matches by website host", async () => {
    const staged = await stageJob(db, {
      institutionName: "Different Name Entirely",
      institutionUrl: `https://www.promote-${TAG}.edu.au/courses`,
      serviceCategoryId: ref.categoryId,
      courses: [{ key: "host", name: "Certificate of Host Matching" }],
    });
    jobIds.push(staged.jobId);

    const report = await promote.promoteJob(staged.jobId, ADMIN_ID, {});
    expect(report.target.org_id).toBe(tenant.orgId);
    expect(report.target.org_created).toBe(false);
  });

  it("rolls a dry run back but still reports what it would have done", async () => {
    const staged = await stageJob(db, {
      institutionName: `Promote Target ${TAG}`,
      institutionUrl: `https://promote-${TAG}.edu.au`,
      serviceCategoryId: ref.categoryId,
      courses: [{ key: "dry", name: "Dry Run Course" }],
    });
    jobIds.push(staged.jobId);

    const report = await promote.promoteJob(staged.jobId, ADMIN_ID, {
      target_org_type: "institution",
      target_org_id: tenant.orgId,
      dry_run: true,
    });

    expect(report.dry_run).toBe(true);
    expect(report.counts.services_inserted).toBe(1);
    expect(await tenantCount("business_services", { extraction_source_id: staged.courseIdByKey.get("dry") })).toBe(0);
    expect((await db("superadmin.extraction_jobs").where({ id: staged.jobId }).first()).status).toBe("approved");
  });

  it("refuses to promote a job in a non-promotable status", async () => {
    const staged = await stageJob(db, {
      institutionName: `Promote Target ${TAG}`,
      institutionUrl: `https://promote-${TAG}.edu.au`,
      serviceCategoryId: ref.categoryId,
      status: "processing",
      courses: [{ key: "nope", name: "Too Early" }],
    });
    jobIds.push(staged.jobId);

    await expect(promote.promoteJob(staged.jobId, ADMIN_ID, {})).rejects.toThrow(/not promotable/);
  });
});
