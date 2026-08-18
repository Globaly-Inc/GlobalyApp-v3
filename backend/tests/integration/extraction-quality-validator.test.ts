// Wave G8 — the final-batch quality validator against real Postgres.
//
// The spec is V1 process-extraction-queue's POST-EXTRACTION QUALITY VALIDATOR.
//
// The two properties that matter most, and the reason this suite exists:
//   1. It FAILS CLOSED. No Gemini key → 503, never a fabricated clean verdict. The
//      suite proves this without a key of its own: testEnv() pins GEMINI_API_KEY
//      empty on purpose, and the configured case injects a provider rather than
//      reading the environment.
//   2. It CAN ACTUALLY FAIL. A validator that only proves it runs is worthless, so
//      every rule is shown flagging a genuinely bad batch and leaving a good one alone.
//
// Plus the ordering guarantee: the database work is committed BEFORE the provider is
// touched, so a keyless run still persists every deterministic flag.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Knex } from "knex";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";
import type { QualityProvider } from "../../src/modules/superadmin/data-extraction/lib/quality-provider.js";

const describeDb = describe.skipIf(!dbAvailable);

const TAG = `g8q${process.pid}`;

describeDb("extraction quality validator", () => {
  let db: Knex;
  let quality: typeof import("../../src/modules/superadmin/data-extraction/services/quality.service.js");
  let provider: typeof import("../../src/modules/superadmin/data-extraction/lib/quality-provider.js");
  let ADMIN_ID: number;
  let platformUserId: number;
  let jobId: string;
  const jobIds: string[] = [];

  beforeAll(async () => {
    ({ masterKnex: db } = await import("../../src/core/db/master-pool.js"));
    quality = await import("../../src/modules/superadmin/data-extraction/services/quality.service.js");
    provider = await import("../../src/modules/superadmin/data-extraction/lib/quality-provider.js");

    const [user] = await db("platform_users")
      .insert({ first_name: "G8", last_name: "Auditor", email: uniqueEmail("g8.quality") })
      .returning("id");
    platformUserId = user.id;
    const [admin] = await db("superadmin.admin_users")
      .insert({ platform_user_id: user.id, role: "data_admin" })
      .returning("id");
    ADMIN_ID = admin.id;
  });

  afterAll(async () => {
    for (const id of jobIds) await db("superadmin.extraction_jobs").where({ id }).del();
    if (ADMIN_ID) await db("superadmin.admin_audit_logs").where({ admin_id: ADMIN_ID }).del();
    if (ADMIN_ID) await db("superadmin.admin_users").where({ id: ADMIN_ID }).del();
    if (platformUserId) await db("platform_users").where({ id: platformUserId }).del();
  });

  // ── fixtures ──────────────────────────────────────────────────────────────

  async function makeJob(): Promise<string> {
    const [job] = await db("superadmin.extraction_jobs")
      .insert({
        institution_name: `Quality College ${TAG}`,
        institution_url: `https://quality-${TAG}.edu.au`,
        status: "extracting",
      })
      .returning("id");
    jobIds.push(job.id);
    return job.id;
  }

  async function addCourse(values: Record<string, unknown>): Promise<string> {
    const [row] = await db("superadmin.extraction_courses")
      .insert({
        job_id: jobId,
        name: "Bachelor of Nursing",
        degree_level: "Bachelor",
        international_fee_total: 31000,
        duration_weeks: 156,
        description: "A three year undergraduate degree in nursing practice and theory.",
        verification_status: "unverified",
        ...values,
      })
      .returning("id");
    return row.id;
  }

  const flags = () => quality.listQualityFlags(jobId).then((r) => r.flags);
  const flagsFor = async (courseId: string) =>
    (await flags()).filter((f) => (f as { course_id?: string }).course_id === courseId);

  /** A provider that reports exactly what the test tells it to. Never reads the env. */
  const fakeProvider = (
    issues: { course_id: string; issue_type: "contradiction" | "nonsensical_name" }[] = [],
    summary = "judged",
  ): QualityProvider => ({
    model: "test-model",
    judge: async () => ({
      issues: issues.map((i) => ({ ...i, severity: "high" as const, suggestion: "not a course" })),
      summary,
    }),
  });

  beforeEach(async () => {
    jobId = await makeJob();
    await db("superadmin.admin_audit_logs").where({ admin_id: ADMIN_ID }).del();
  });

  // ── fails closed ──────────────────────────────────────────────────────────

  it("has no key in this environment — the precondition every fail-closed test rests on", () => {
    expect(provider.isQualityProviderConfigured()).toBe(false);
  });

  it("throws a 503, not a clean verdict, when no provider is configured", async () => {
    await addCourse({});
    await expect(quality.validateJobQuality(jobId, ADMIN_ID)).rejects.toThrow(
      provider.QualityProviderUnavailableError,
    );
    const err = await quality.validateJobQuality(jobId, ADMIN_ID).catch((e) => e);
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe("QUALITY_PROVIDER_UNAVAILABLE");
  });

  it("still persists the deterministic flags before it 503s — the work is never lost", async () => {
    const bad = await addCourse({ name: "Diploma of Cookery", international_fee_total: 12 });
    await expect(quality.validateJobQuality(jobId, ADMIN_ID)).rejects.toThrow(/not configured/);

    const written = await flagsFor(bad);
    expect(written.map((f) => (f as { issue_type: string }).issue_type)).toContain("fee_anomaly");
  });

  it("reports the judgement half as pending rather than implying the batch is clean", async () => {
    await addCourse({});
    const report = await quality.listQualityFlags(jobId);
    expect(report.judgement_pending).toBe(true);
  });

  it("writes no audit row for a run that 503d", async () => {
    await addCourse({});
    await quality.validateJobQuality(jobId, ADMIN_ID).catch(() => {});
    expect(await db("superadmin.admin_audit_logs").where({ admin_id: ADMIN_ID }).pluck("id")).toEqual([]);
  });

  it("needs no provider at all for an empty batch", async () => {
    const report = await quality.validateJobQuality(jobId, ADMIN_ID);
    expect(report).toMatchObject({ courses: 0, awaiting: 0, passed: true, deterministic: 0 });
  });

  // ── it can actually fail ──────────────────────────────────────────────────

  it("passes a genuinely good batch with zero flags", async () => {
    await addCourse({ name: "Bachelor of Nursing" });
    await addCourse({ name: "Master of Public Health", degree_level: "Master" });

    const report = await quality.validateJobQuality(jobId, ADMIN_ID, fakeProvider());
    expect(report).toMatchObject({ courses: 2, deterministic: 0, judged: 0, passed: true, awaiting: 0 });
    expect(await flags()).toEqual([]);
  });

  it("flags a genuinely bad batch — every rule firing at once", async () => {
    const keep = await addCourse({ name: "Bachelor of Nursing" });
    const dup = await addCourse({
      name: "Bachelor of Nursing 2027 (Semester 2)",
      international_fee_total: null,
      duration_weeks: null,
      description: null,
      degree_level: null,
    });
    const cheap = await addCourse({ name: "Diploma of Cookery", international_fee_total: 40 });
    const junk = await addCourse({ name: "Top 5 reasons to study abroad" });

    const report = await quality.validateJobQuality(
      jobId,
      ADMIN_ID,
      fakeProvider([{ course_id: junk, issue_type: "nonsensical_name" }], "1 nonsensical name"),
    );

    expect(report.passed).toBe(false);
    const kinds = (await flags()).map((f) => `${(f as { course_id: string }).course_id}:${(f as { issue_type: string }).issue_type}`);
    expect(kinds).toContain(`${dup}:duplicate`);
    expect(kinds).toContain(`${dup}:missing_required_fields`);
    expect(kinds).toContain(`${cheap}:fee_anomaly`);
    expect(kinds).toContain(`${junk}:nonsensical_name`);
    expect(kinds.filter((k) => k.startsWith(keep))).toEqual([]);
    expect(report.summary).toBe("1 nonsensical name");
  });

  it("narrows the fee window from the job's site intelligence", async () => {
    const course = await addCourse({ name: "Bachelor of Nursing", international_fee_total: 9000 });
    // Default bounds are 5,000–100,000, so 9,000 is fine until the range narrows.
    const loose = await quality.validateJobQuality(jobId, ADMIN_ID, fakeProvider());
    expect(loose.deterministic).toBe(0);

    await db("superadmin.extraction_site_intelligence").insert({
      job_id: jobId,
      currency: "AUD",
      fee_structure: JSON.stringify({ typical_intl_fee_range: [30000, 40000] }),
    });

    const tight = await quality.validateJobQuality(jobId, ADMIN_ID, fakeProvider());
    expect(tight.deterministic).toBe(1);
    expect((await flagsFor(course))[0]).toMatchObject({ issue_type: "fee_anomaly", severity: "medium" });
  });

  // ── auto-flagging ─────────────────────────────────────────────────────────

  it("auto-flags an unverified course a high-severity issue names", async () => {
    await addCourse({ name: "Bachelor of Nursing" });
    const dup = await addCourse({ name: "Bachelor of Nursing 2027" });

    const report = await quality.validateJobQuality(jobId, ADMIN_ID, fakeProvider());
    expect(report.auto_flagged).toBe(1);
    expect((await db("superadmin.extraction_courses").where({ id: dup }).first("verification_status"))
      .verification_status).toBe("flagged");
  });

  it("never downgrades a course a human already verified", async () => {
    await addCourse({ name: "Bachelor of Nursing" });
    const dup = await addCourse({ name: "Bachelor of Nursing 2027", verification_status: "verified" });

    const report = await quality.validateJobQuality(jobId, ADMIN_ID, fakeProvider());
    expect(report.auto_flagged).toBe(0);
    expect((await db("superadmin.extraction_courses").where({ id: dup }).first("verification_status"))
      .verification_status).toBe("verified");
  });

  it("does not auto-flag for a medium or low severity issue", async () => {
    await addCourse({ name: "Diploma of Cookery", international_fee_total: 40 });
    const report = await quality.validateJobQuality(jobId, ADMIN_ID, fakeProvider());
    expect(report.deterministic).toBe(1);
    expect(report.auto_flagged).toBe(0);
  });

  // ── the model is not trusted ───────────────────────────────────────────────

  it("drops a course_id the model invented", async () => {
    await addCourse({ name: "Bachelor of Nursing" });
    const report = await quality.validateJobQuality(
      jobId,
      ADMIN_ID,
      fakeProvider([{ course_id: "00000000-0000-0000-0000-000000000000", issue_type: "nonsensical_name" }]),
    );
    expect(report.judged).toBe(0);
    expect(await flags()).toEqual([]);
  });

  // ── idempotency and audit ─────────────────────────────────────────────────

  it("replaces flags on a re-run instead of doubling them", async () => {
    await addCourse({ name: "Bachelor of Nursing" });
    const dup = await addCourse({ name: "Bachelor of Nursing 2027" });

    const first = await quality.validateJobQuality(jobId, ADMIN_ID, fakeProvider());
    const again = await quality.validateJobQuality(jobId, ADMIN_ID, fakeProvider());
    expect(again.deterministic).toBe(first.deterministic);
    expect(await flagsFor(dup)).toHaveLength(first.deterministic);
  });

  // V1 skips the entire check when any quality_flag row exists, so a job can never be
  // re-validated after an operator fixes the data. Replacing means the flags follow reality.
  it("clears a stale flag once the data behind it is fixed", async () => {
    const cheap = await addCourse({ name: "Diploma of Cookery", international_fee_total: 40 });
    await quality.validateJobQuality(jobId, ADMIN_ID, fakeProvider());
    expect(await flagsFor(cheap)).toHaveLength(1);

    await db("superadmin.extraction_courses").where({ id: cheap }).update({ international_fee_total: 31000 });
    const fixed = await quality.validateJobQuality(jobId, ADMIN_ID, fakeProvider());
    expect(fixed.passed).toBe(true);
    expect(await flagsFor(cheap)).toEqual([]);
  });

  it("records the audit run against the admin who asked for it", async () => {
    await addCourse({ name: "Bachelor of Nursing" });
    await quality.validateJobQuality(jobId, ADMIN_ID, fakeProvider());

    const entry = await db("superadmin.admin_audit_logs")
      .where({ admin_id: ADMIN_ID, action: "EXTRACTION_QUALITY_AUDIT" })
      .first("entity_type", "entity_id", "details");
    expect(entry).toMatchObject({ entity_type: "extraction_jobs", entity_id: jobId });
    const details = typeof entry.details === "string" ? JSON.parse(entry.details) : entry.details;
    expect(details.model).toBe("test-model");
  });

  // The pipeline has no admin, and admin_audit_logs.admin_id is a NOT NULL FK.
  it("writes no audit row when the pipeline runs the audit, and never throws", async () => {
    await addCourse({ name: "Bachelor of Nursing" });
    await expect(quality.auditQualityBestEffort(jobId)).resolves.toBeNull();
    expect(await db("superadmin.admin_audit_logs").where({ admin_id: ADMIN_ID }).pluck("id")).toEqual([]);
    // Best-effort still means the deterministic half ran.
    expect(await flags()).toEqual([]);
  });

  it("404s for a job that does not exist", async () => {
    await expect(
      quality.validateJobQuality("00000000-0000-0000-0000-000000000000", ADMIN_ID),
    ).rejects.toThrow(/not found/i);
  });
});
