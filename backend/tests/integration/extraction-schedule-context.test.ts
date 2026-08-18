// Wave G8 — the scheduler trigger and the context-ingest bundle store.
//
// Scheduler: the properties that make a periodic trigger safe rather than merely
// present — overlapping ticks cannot both run, a crashed tick cannot wedge the
// schedule, a schedule that fails does not retry for ever, and V1's second pg_cron
// job (reap-stalled-jobs) actually reaps.
//
// Context bundle: the store is idempotent, so a re-delivered STEPS message overwrites
// rather than accumulating, and a downstream prompt reads back what was written.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Knex } from "knex";

import { dbAvailable } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

const TAG = `g8s${process.pid}`;

describeDb("extraction scheduler trigger", () => {
  let db: Knex;
  let schedule: typeof import("../../src/modules/superadmin/data-extraction/services/schedule.service.js");
  const jobIds: string[] = [];

  beforeAll(async () => {
    ({ masterKnex: db } = await import("../../src/core/db/master-pool.js"));
    schedule = await import("../../src/modules/superadmin/data-extraction/services/schedule.service.js");
  });

  afterAll(async () => {
    for (const id of jobIds) await db("superadmin.extraction_jobs").where({ id }).del();
  });

  async function makeJob(values: Record<string, unknown> = {}): Promise<string> {
    const [job] = await db("superadmin.extraction_jobs")
      .insert({
        institution_name: `Sched ${TAG}`,
        institution_url: `https://sched-${TAG}.edu.au`,
        status: "pending",
        ...values,
      })
      .returning("id");
    jobIds.push(job.id);
    return job.id;
  }

  beforeEach(async () => {
    for (const id of jobIds) await db("superadmin.extraction_jobs").where({ id }).del();
    jobIds.length = 0;
  });

  // ── anti-stampede ─────────────────────────────────────────────────────────

  // The whole point of the advisory lock. A second tick that arrives while the first
  // is still working must skip, not queue behind it and not run in parallel.
  it("a tick that cannot take the advisory lock skips instead of running", async () => {
    // Hold the lock on a separate connection for the duration, exactly as a
    // long-running tick in another container would.
    const holder = await db.client.acquireConnection();
    try {
      const held = await holder.query("SELECT pg_try_advisory_lock($1) AS locked", [
        schedule.SCHEDULE_TICK_LOCK,
      ]);
      expect(held.rows[0].locked).toBe(true);

      const report = await schedule.runScheduleTick();
      expect(report).toEqual(schedule.SKIPPED_TICK);
      expect(report.ran).toBe(false);
    } finally {
      await holder.query("SELECT pg_advisory_unlock($1)", [schedule.SCHEDULE_TICK_LOCK]);
      await db.client.releaseConnection(holder);
    }
  });

  it("runs once the lock is free again — a released lock does not wedge the schedule", async () => {
    expect((await schedule.runScheduleTick()).ran).toBe(true);
  });

  // A transaction-scoped lock is released by Postgres when the transaction ends for
  // ANY reason, so a crashed tick cannot leave it held. Proved by taking the same
  // xact lock in a transaction that then rolls back.
  it("a crashed tick cannot hold the lock — xact locks release on rollback", async () => {
    await db
      .transaction(async (trx) => {
        const { rows } = await trx.raw("SELECT pg_try_advisory_xact_lock(?) AS locked", [
          schedule.SCHEDULE_TICK_LOCK,
        ]);
        expect(rows[0].locked).toBe(true);
        throw new Error("simulated crash");
      })
      .catch(() => {});

    expect((await schedule.runScheduleTick()).ran).toBe(true);
  });

  it("two ticks in sequence both run — the lock is not sticky", async () => {
    expect((await schedule.runScheduleTick()).ran).toBe(true);
    expect((await schedule.runScheduleTick()).ran).toBe(true);
  });

  // ── cadence ───────────────────────────────────────────────────────────────

  it("advances next_run_at by the cadence", () => {
    const from = new Date(Date.UTC(2026, 0, 31, 12, 0, 0));
    expect(schedule.addCadence(from, "daily").toISOString()).toBe("2026-02-01T12:00:00.000Z");
    expect(schedule.addCadence(from, "weekly").toISOString()).toBe("2026-02-07T12:00:00.000Z");
    // Jan 31 + 1 month has no Feb 31, so it rolls into March — documented, not accidental.
    expect(schedule.addCadence(from, "monthly").getUTCMonth()).toBe(2);
  });

  it("picks up a due schedule and pushes next_run_at into the future", async () => {
    const jobId = await makeJob();
    const [row] = await db("superadmin.agent_extraction_schedule")
      .insert({
        job_id: jobId,
        cadence: "daily",
        enabled: true,
        next_run_at: new Date(Date.UTC(2026, 0, 1)),
      })
      .returning("id");

    const report = await schedule.runScheduleTick();
    expect(report.ran).toBe(true);
    expect(report.schedules.map((s) => s.schedule_id)).toContain(row.id);

    const after = await db("superadmin.agent_extraction_schedule")
      .where({ id: row.id })
      .first("next_run_at", "last_run_at", "last_status");
    expect(new Date(after.next_run_at).getTime()).toBeGreaterThan(Date.now());
    expect(after.last_run_at).not.toBeNull();
  });

  // LAVINMQ_URL points at a dead port during tests, so the publish fails — which is
  // exactly the case that must not spin: next_run_at advances anyway and last_error
  // records why, rather than the schedule being retried on every single tick.
  it("a schedule whose publish fails still advances, with the reason recorded", async () => {
    const jobId = await makeJob();
    const [row] = await db("superadmin.agent_extraction_schedule")
      .insert({
        job_id: jobId,
        cadence: "daily",
        enabled: true,
        next_run_at: new Date(Date.UTC(2026, 0, 1)),
      })
      .returning("id");

    const report = await schedule.runScheduleTick();
    const result = report.schedules.find((s) => s.schedule_id === row.id);
    expect(result).toBeDefined();

    const after = await db("superadmin.agent_extraction_schedule")
      .where({ id: row.id })
      .first("next_run_at", "last_status", "last_error");
    expect(new Date(after.next_run_at).getTime()).toBeGreaterThan(Date.now());
    if (!result!.ok) {
      expect(after.last_status).toBe("failed_exception");
      expect(after.last_error).toBeTruthy();
    }
  });

  it("ignores a disabled schedule and one that is not due yet", async () => {
    // Two jobs, not two schedules on one: agent_extraction_schedule.job_id is UNIQUE.
    const [disabled] = await db("superadmin.agent_extraction_schedule")
      .insert({ job_id: await makeJob(), cadence: "daily", enabled: false, next_run_at: new Date(Date.UTC(2026, 0, 1)) })
      .returning("id");
    const [future] = await db("superadmin.agent_extraction_schedule")
      .insert({ job_id: await makeJob(), cadence: "daily", enabled: true, next_run_at: new Date(Date.UTC(2099, 0, 1)) })
      .returning("id");

    const ids = (await schedule.runScheduleTick()).schedules.map((s) => s.schedule_id);
    expect(ids).not.toContain(disabled.id);
    expect(ids).not.toContain(future.id);
  });

  // ── stall reaper (V1's second pg_cron job) ────────────────────────────────

  it("marks a processing job with a stale heartbeat as stalled", async () => {
    const stale = await makeJob({
      status: "processing",
      processing_heartbeat_at: new Date(Date.now() - 60 * 60 * 1000),
    });
    expect(await schedule.reapStalledJobs()).toBeGreaterThanOrEqual(1);

    const row = await db("superadmin.extraction_jobs").where({ id: stale }).first("status", "error_message");
    expect(row.status).toBe("stalled");
    expect(row.error_message).toMatch(/heartbeat/i);
  });

  it("leaves a job whose worker is still beating alone", async () => {
    const alive = await makeJob({ status: "processing", processing_heartbeat_at: new Date() });
    await schedule.reapStalledJobs();
    expect((await db("superadmin.extraction_jobs").where({ id: alive }).first("status")).status).toBe(
      "processing",
    );
  });

  it("does not reap a pending job, which has no heartbeat yet by definition", async () => {
    const pending = await makeJob({ status: "pending", processing_heartbeat_at: null });
    await schedule.reapStalledJobs();
    expect((await db("superadmin.extraction_jobs").where({ id: pending }).first("status")).status).toBe(
      "pending",
    );
  });

  it("reaps as part of a tick, not only when called directly", async () => {
    await makeJob({ status: "processing", processing_heartbeat_at: new Date(Date.now() - 60 * 60 * 1000) });
    expect((await schedule.runScheduleTick()).reaped).toBeGreaterThanOrEqual(1);
  });
});

describeDb("extraction context bundle store", () => {
  let db: Knex;
  let repo: typeof import("../../src/modules/superadmin/data-extraction/repositories/context.repository.js");
  let lib: typeof import("../../src/modules/superadmin/data-extraction/lib/context-bundle.js");
  let jobId: string;
  const jobIds: string[] = [];

  beforeAll(async () => {
    ({ masterKnex: db } = await import("../../src/core/db/master-pool.js"));
    repo = await import("../../src/modules/superadmin/data-extraction/repositories/context.repository.js");
    lib = await import("../../src/modules/superadmin/data-extraction/lib/context-bundle.js");
  });

  afterAll(async () => {
    for (const id of jobIds) await db("superadmin.extraction_jobs").where({ id }).del();
  });

  beforeEach(async () => {
    const [job] = await db("superadmin.extraction_jobs")
      .insert({ institution_name: `Ctx ${TAG}`, institution_url: `https://ctx-${TAG}.edu.au` })
      .returning("id");
    jobId = job.id;
    jobIds.push(job.id);
  });

  const rowCount = () =>
    db("superadmin.extraction_additional_info")
      .where({ job_id: jobId, key: lib.CONTEXT_BUNDLE_KEY })
      .count("id as n")
      .first()
      .then((r) => Number(r!.n));

  it("returns null before anything is ingested", async () => {
    expect(await repo.loadContextBundle(jobId)).toBeNull();
  });

  it("round-trips a bundle", async () => {
    const bundle = lib.parseBundle({
      institution: { name: "Acme College" },
      courses: [{ name: "Bachelor of Nursing", degree_level: "Bachelor" }],
      fees: [{ fee_type: "Tuition", amount: 31000, currency: "AUD" }],
    })!;
    await repo.saveContextBundle(jobId, bundle);
    expect(await repo.loadContextBundle(jobId)).toEqual(bundle);
  });

  // A re-delivered STEPS message must overwrite, not accumulate — the same
  // idempotency every other step in this pipeline has.
  it("re-running the step replaces the bundle rather than adding a second row", async () => {
    await repo.saveContextBundle(jobId, lib.parseBundle({ courses: [{ name: "First" }] })!);
    await repo.saveContextBundle(jobId, lib.parseBundle({ courses: [{ name: "Second" }] })!);

    expect(await rowCount()).toBe(1);
    expect((await repo.loadContextBundle(jobId))!.courses![0].name).toBe("Second");
  });

  it("a job with no documents stores no bundle at all", async () => {
    await repo.saveContextBundle(jobId, lib.parseBundle({ courses: [{ name: "First" }] })!);
    await repo.saveContextBundle(jobId, null);
    expect(await rowCount()).toBe(0);
    expect(await repo.loadContextBundle(jobId)).toBeNull();
  });

  it("survives a corrupt row instead of failing the step that reads it", async () => {
    await db("superadmin.extraction_additional_info").insert({
      job_id: jobId,
      key: lib.CONTEXT_BUNDLE_KEY,
      value: "{not json",
    });
    expect(await repo.loadContextBundle(jobId)).toBeNull();
  });

  it("feeds the stored bundle into a downstream prompt", async () => {
    await repo.saveContextBundle(jobId, lib.parseBundle({ courses: [{ name: "Bachelor of Nursing" }] })!);
    const addendum = lib.contextAddendum(await repo.loadContextBundle(jobId));
    expect(addendum).toContain("VERIFIED CONTEXT");
    expect(addendum).toContain("Bachelor of Nursing");
  });

  it("context_ingest is a real pipeline step, dispatchable like any other", async () => {
    const { PIPELINE_STEPS, RunStepSchema } = await import(
      "../../src/modules/superadmin/data-extraction/schemas/step.schema.js"
    );
    expect(PIPELINE_STEPS).toContain("context_ingest");
    expect(RunStepSchema.parse({ step: "context_ingest" }).step).toBe("context_ingest");
  });
});
