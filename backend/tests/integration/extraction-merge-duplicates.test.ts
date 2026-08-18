// Wave G8 — merge-duplicates against real Postgres.
//
// The spec is V1's merge_extraction_job_duplicates RPC. The five properties the
// merge has to hold, each asserted against a real tenant schema:
//   - transactional: a dry run changes nothing; an aborted merge changes nothing
//   - idempotent: a second apply is a no-op, not a second merge
//   - auditable: admin_audit_logs records what was merged into what
//   - nothing orphaned: a service that reached a duplicate through a junction keeps
//     the value, and the parent-count guard aborts the merge if it would not
//   - dry run ⇔ apply: the preview reports exactly what the apply does

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Knex } from "knex";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";
import { createInstitutionTenant, dropTenant, seedReferences, type Reference, type Tenant } from "../helpers/catalog-fixtures.js";

const describeDb = describe.skipIf(!dbAvailable);

const TAG = `g8m${process.pid}`;

describeDb("extraction merge-duplicates", () => {
  let db: Knex;
  let merge: typeof import("../../src/modules/superadmin/data-extraction/services/merge.service.js");
  let ref: Reference;
  let tenant: Tenant;
  let ADMIN_ID: number;
  let platformUserId: number;
  const jobIds: string[] = [];

  beforeAll(async () => {
    ({ masterKnex: db } = await import("../../src/core/db/master-pool.js"));
    const { createSchemaKnex } = await import("../../src/core/db/knex.js");
    merge = await import("../../src/modules/superadmin/data-extraction/services/merge.service.js");

    const [user] = await db("platform_users")
      .insert({ first_name: "G8", last_name: "Merger", email: uniqueEmail("g8.merge") })
      .returning("id");
    platformUserId = user.id;
    const [admin] = await db("superadmin.admin_users")
      .insert({ platform_user_id: user.id, role: "data_admin" })
      .returning("id");
    ADMIN_ID = admin.id;

    ref = await seedReferences(db, TAG);
    tenant = await createInstitutionTenant(db, createSchemaKnex, {
      name: `Merge Target ${TAG}`,
      website: `https://merge-${TAG}.edu.au`,
      countryId: ref.countryId,
      city: "Sydney",
    });
  });

  afterAll(async () => {
    for (const jobId of jobIds) await db("superadmin.extraction_jobs").where({ id: jobId }).del();
    await dropTenant(db, tenant);
    if (ADMIN_ID) await db("superadmin.admin_audit_logs").where({ admin_id: ADMIN_ID }).del();
    if (ADMIN_ID) await db("superadmin.admin_users").where({ id: ADMIN_ID }).del();
    if (platformUserId) await db("platform_users").where({ id: platformUserId }).del();
    if (ref?.accreditationId) await db("accreditations").where({ id: ref.accreditationId }).del();
    if (ref?.feeTypeId) await db("fee_types").where({ id: ref.feeTypeId }).del();
  });

  // ── fixtures ──────────────────────────────────────────────────────────────

  /** A promoted job: the ledger row is what points the merge at the tenant schema. */
  async function promotedJob(): Promise<string> {
    const [job] = await db("superadmin.extraction_jobs")
      .insert({
        institution_name: `Merge Target ${TAG}`,
        institution_url: `https://merge-${TAG}.edu.au`,
        status: "exported",
      })
      .returning("id");
    jobIds.push(job.id);
    await db("superadmin.extraction_promotions").insert({
      job_id: job.id,
      target_org_type: "institution",
      target_org_id: tenant.orgId,
      schema_name: tenant.schema,
      promoted_by: ADMIN_ID,
      dry_run: false,
    });
    return job.id;
  }

  let serviceSeq = 0;

  async function makeService(name: string): Promise<string> {
    serviceSeq += 1;
    const [row] = await tenant.db("business_services")
      .insert({
        name,
        slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${serviceSeq}`,
        service_category_id: ref.categoryId,
      })
      .returning("id");
    return row.id;
  }

  /** created_at is set explicitly so "oldest survives" is deterministic, not timing. */
  async function makeFee(serviceId: string, values: Record<string, unknown>, day: number): Promise<string> {
    const [row] = await tenant.db("service_fees")
      .insert({
        service_id: serviceId,
        name: "Tuition",
        total_amount: 31000,
        currency: "AUD",
        created_at: new Date(Date.UTC(2026, 0, day)),
        ...values,
      })
      .returning("id");
    return row.id;
  }

  async function makeEligibility(serviceId: string | null, values: Record<string, unknown>, day: number) {
    const [row] = await tenant.db("service_eligibility_requirements")
      .insert({
        service_id: serviceId,
        min_degree_level: "Bachelor",
        min_score_percent: 65,
        created_at: new Date(Date.UTC(2026, 0, day)),
        ...values,
      })
      .returning("id");
    return row.id as string;
  }

  const feeIds = () => tenant.db("service_fees").whereNull("deleted_at").pluck("id");

  /** Every service that can reach this fee: its own service_id plus junctions. */
  async function servicesWithFee(feeId: string): Promise<string[]> {
    const owner = await tenant.db("service_fees").where({ id: feeId }).first("service_id");
    const shared = await tenant.db("service_fee_assignments").where({ service_fee_id: feeId }).pluck("service_id");
    return [...new Set([...(owner ? [owner.service_id] : []), ...shared])].sort();
  }

  beforeEach(async () => {
    await tenant.db("service_fee_assignments").del();
    await tenant.db("service_eligibility_assignments").del();
    await tenant.db("service_fees").del();
    await tenant.db("service_eligibility_requirements").del();
    await tenant.db("business_services").del();
    await db("superadmin.admin_audit_logs").where({ admin_id: ADMIN_ID }).del();
  });

  // ── target resolution ─────────────────────────────────────────────────────

  it("404s for a job that does not exist", async () => {
    await expect(
      merge.mergeJobDuplicates("00000000-0000-0000-0000-000000000000", true, ADMIN_ID),
    ).rejects.toThrow(/not found/i);
  });

  it("refuses a job with nothing in the live catalog instead of V1's HTTP-200 error body", async () => {
    const [job] = await db("superadmin.extraction_jobs")
      .insert({ institution_name: `Nowhere ${TAG}`, institution_url: `https://nowhere-${TAG}.test` })
      .returning("id");
    jobIds.push(job.id);
    await expect(merge.mergeJobDuplicates(job.id, true, ADMIN_ID)).rejects.toThrow(/promote it first/i);
  });

  it("resolves the tenant schema from the promotion ledger", async () => {
    const jobId = await promotedJob();
    const report = await merge.mergeJobDuplicates(jobId, true, ADMIN_ID);
    expect(report.target.schema_name).toBe(tenant.schema);
    expect(report.target.org_id).toBe(tenant.orgId);
  });

  // ── grouping and survivor choice ──────────────────────────────────────────

  it("changes nothing when there are no duplicates", async () => {
    const jobId = await promotedJob();
    const service = await makeService("Nursing");
    await makeFee(service, { name: "Tuition", total_amount: 31000 }, 1);
    await makeFee(service, { name: "Application", total_amount: 250 }, 2);

    const report = await merge.mergeJobDuplicates(jobId, false, ADMIN_ID);
    expect(report).toMatchObject({ fee_groups: 0, fees_merged: 0, eligibility_merged: 0 });
    expect(await feeIds()).toHaveLength(2);
  });

  it("keeps the oldest of two identical fees and deletes the newer one", async () => {
    const jobId = await promotedJob();
    const a = await makeService("Nursing");
    const b = await makeService("Midwifery");
    const oldest = await makeFee(a, {}, 1);
    await makeFee(b, {}, 5);

    const report = await merge.mergeJobDuplicates(jobId, false, ADMIN_ID);
    expect(report).toMatchObject({ fee_groups: 1, fees_merged: 1 });
    expect(await feeIds()).toEqual([oldest]);
  });

  it("does not merge fees that differ in amount or currency", async () => {
    const jobId = await promotedJob();
    const service = await makeService("Nursing");
    await makeFee(service, { total_amount: 31000, currency: "AUD" }, 1);
    await makeFee(service, { total_amount: 31001, currency: "AUD" }, 2);
    await makeFee(service, { total_amount: 31000, currency: "NZD" }, 3);

    const report = await merge.mergeJobDuplicates(jobId, false, ADMIN_ID);
    expect(report.fees_merged).toBe(0);
    expect(await feeIds()).toHaveLength(3);
  });

  it("merges fees whose names differ only in case and padding, as V1's hash does", async () => {
    const jobId = await promotedJob();
    const a = await makeService("Nursing");
    const b = await makeService("Midwifery");
    await makeFee(a, { name: "Tuition", currency: "AUD" }, 1);
    await makeFee(b, { name: "  tuition ", currency: "aud" }, 2);

    expect((await merge.mergeJobDuplicates(jobId, false, ADMIN_ID)).fees_merged).toBe(1);
  });

  it("merges duplicate eligibility requirements too, including ownerless shared rows", async () => {
    const jobId = await promotedJob();
    const a = await makeService("Nursing");
    const b = await makeService("Midwifery");
    const keep = await makeEligibility(a, {}, 1);
    const shared = await makeEligibility(null, {}, 2);
    await tenant.db("service_eligibility_assignments").insert({
      service_id: b,
      eligibility_requirement_id: shared,
    });

    const report = await merge.mergeJobDuplicates(jobId, false, ADMIN_ID);
    expect(report).toMatchObject({ eligibility_groups: 1, eligibility_merged: 1 });
    expect(await tenant.db("service_eligibility_requirements").pluck("id")).toEqual([keep]);
    // b reached the duplicate through the junction; it must still reach the survivor.
    const reachable = await tenant.db("service_eligibility_assignments")
      .where({ eligibility_requirement_id: keep })
      .pluck("service_id");
    expect(reachable).toEqual([b]);
  });

  // ── nothing orphaned ──────────────────────────────────────────────────────

  it("re-points the duplicate's owner service at the survivor", async () => {
    const jobId = await promotedJob();
    const a = await makeService("Nursing");
    const b = await makeService("Midwifery");
    const keep = await makeFee(a, {}, 1);
    await makeFee(b, {}, 2);

    await merge.mergeJobDuplicates(jobId, false, ADMIN_ID);
    expect(await servicesWithFee(keep)).toEqual([a, b].sort());
  });

  // The V1 defect. V1 re-points only dup_service_id, so service c — which reached
  // the duplicate through service_fee_assignments — silently loses the fee when the
  // DELETE cascades its junction row away.
  it("re-points a service that reached the duplicate through a junction, which V1 orphans", async () => {
    const jobId = await promotedJob();
    const a = await makeService("Nursing");
    const b = await makeService("Midwifery");
    const c = await makeService("Paramedicine");
    const keep = await makeFee(a, {}, 1);
    const dup = await makeFee(b, {}, 2);
    await tenant.db("service_fee_assignments").insert({ service_id: c, service_fee_id: dup });

    await merge.mergeJobDuplicates(jobId, false, ADMIN_ID);

    expect(await feeIds()).toEqual([keep]);
    expect(await servicesWithFee(keep)).toEqual([a, b, c].sort());
    // Nothing left pointing at a row that no longer exists.
    expect(await tenant.db("service_fee_assignments").where({ service_fee_id: dup }).pluck("id")).toEqual([]);
  });

  it("does not duplicate a junction row for a service that already reaches the survivor", async () => {
    const jobId = await promotedJob();
    const a = await makeService("Nursing");
    const b = await makeService("Midwifery");
    const c = await makeService("Paramedicine");
    const keep = await makeFee(a, {}, 1);
    const dup = await makeFee(b, {}, 2);
    await tenant.db("service_fee_assignments").insert([
      { service_id: c, service_fee_id: keep },
      { service_id: c, service_fee_id: dup },
    ]);

    await merge.mergeJobDuplicates(jobId, false, ADMIN_ID);
    expect(await tenant.db("service_fee_assignments").where({ service_fee_id: keep }).pluck("service_id"))
      .toEqual([c, b].sort());
  });

  it("collapses a group of three into one without losing any service", async () => {
    const jobId = await promotedJob();
    const services = [await makeService("One"), await makeService("Two"), await makeService("Three")];
    const keep = await makeFee(services[0], {}, 1);
    await makeFee(services[1], {}, 2);
    await makeFee(services[2], {}, 3);

    const report = await merge.mergeJobDuplicates(jobId, false, ADMIN_ID);
    expect(report.fees_merged).toBe(2);
    expect(await servicesWithFee(keep)).toEqual([...services].sort());
  });

  // ── the guard is load-bearing ─────────────────────────────────────────────

  it("aborts the whole transaction when the parent-count guard finds a lost service", async () => {
    const jobId = await promotedJob();
    const a = await makeService("Nursing");
    const b = await makeService("Midwifery");
    await makeFee(a, {}, 1);
    await makeFee(b, {}, 2);

    const lib = await import("../../src/modules/superadmin/data-extraction/lib/merge-duplicates.js");
    const real = lib.findOrphans;
    // Simulate the D8 failure: a re-point that silently did nothing.
    (lib as { findOrphans: unknown }).findOrphans = () => [{ keep_id: "x", lost: [b] }];
    try {
      await expect(merge.mergeJobDuplicates(jobId, false, ADMIN_ID)).rejects.toThrow(/Merge aborted/);
    } finally {
      (lib as { findOrphans: unknown }).findOrphans = real;
    }

    // Nothing was deleted and nothing was audited.
    expect(await feeIds()).toHaveLength(2);
    expect(await db("superadmin.admin_audit_logs").where({ admin_id: ADMIN_ID }).pluck("id")).toEqual([]);
  });

  // ── dry run, idempotency, audit ───────────────────────────────────────────

  it("dry run reports the merge without performing it", async () => {
    const jobId = await promotedJob();
    const a = await makeService("Nursing");
    const b = await makeService("Midwifery");
    await makeFee(a, {}, 1);
    await makeFee(b, {}, 2);

    const preview = await merge.mergeJobDuplicates(jobId, true, ADMIN_ID);
    expect(preview).toMatchObject({ dry_run: true, fee_groups: 1, fees_merged: 1, repointed: 1 });
    expect(await feeIds()).toHaveLength(2);
    expect(await tenant.db("service_fee_assignments").pluck("id")).toEqual([]);
    expect(await db("superadmin.admin_audit_logs").where({ admin_id: ADMIN_ID }).pluck("id")).toEqual([]);
  });

  it("dry run reports exactly what the apply then does", async () => {
    const jobId = await promotedJob();
    const a = await makeService("Nursing");
    const b = await makeService("Midwifery");
    const c = await makeService("Paramedicine");
    await makeFee(a, {}, 1);
    const dup = await makeFee(b, {}, 2);
    await tenant.db("service_fee_assignments").insert({ service_id: c, service_fee_id: dup });
    await makeEligibility(a, {}, 1);
    await makeEligibility(b, {}, 2);

    const preview = await merge.mergeJobDuplicates(jobId, true, ADMIN_ID);
    const applied = await merge.mergeJobDuplicates(jobId, false, ADMIN_ID);

    const comparable = ({ dry_run: _dry, ...rest }: typeof preview) => rest;
    expect(comparable(applied)).toEqual(comparable(preview));
  });

  it("is idempotent — a second apply is a no-op and writes no second audit row", async () => {
    const jobId = await promotedJob();
    const a = await makeService("Nursing");
    const b = await makeService("Midwifery");
    const keep = await makeFee(a, {}, 1);
    await makeFee(b, {}, 2);

    const first = await merge.mergeJobDuplicates(jobId, false, ADMIN_ID);
    const second = await merge.mergeJobDuplicates(jobId, false, ADMIN_ID);

    expect(first.fees_merged).toBe(1);
    expect(second).toMatchObject({ fees_merged: 0, fee_groups: 0, repointed: 0 });
    expect(await feeIds()).toEqual([keep]);
    expect(await servicesWithFee(keep)).toEqual([a, b].sort());
    expect(await db("superadmin.admin_audit_logs").where({ admin_id: ADMIN_ID }).pluck("id")).toHaveLength(1);
  });

  it("records what was merged into what, by whom", async () => {
    const jobId = await promotedJob();
    const a = await makeService("Nursing");
    const b = await makeService("Midwifery");
    const keep = await makeFee(a, {}, 1);
    const dup = await makeFee(b, {}, 2);

    await merge.mergeJobDuplicates(jobId, false, ADMIN_ID);

    const entry = await db("superadmin.admin_audit_logs")
      .where({ admin_id: ADMIN_ID, action: "EXTRACTION_MERGE_DUPLICATES" })
      .first("admin_id", "action", "entity_type", "entity_id", "details", "created_at");
    expect(entry).toMatchObject({ entity_type: "extraction_jobs", entity_id: jobId });
    expect(entry.created_at).toBeInstanceOf(Date);
    const details = typeof entry.details === "string" ? JSON.parse(entry.details) : entry.details;
    expect(details.merges).toEqual([{ kind: "fees", keep_id: keep, dup_ids: [dup] }]);
    expect(details.target.schema_name).toBe(tenant.schema);
  });
});
