// Worker — promotes the V2/AgentCIS import to live institution listings, in bulk.
//
// One-shot backfill: those jobs were extracted and reviewed but never pushed to the public
// catalog, so nothing about them is visible on the platform.
//
// Scoped to source_type='agentcis' on purpose. Those jobs carry no business_category_id, so
// promoteJob cannot route them by category — it special-cases agentcis to institutions
// because the AgentCIS importer only ever stages education providers
// (stageAgentcisInstitution is its sole entity path). Every other source has a category set
// by the admin and is published one at a time from the extraction list, where the category is
// already right.
//
// Safe to re-run. promoteJob keys every write on provenance (source_job_id /
// source_agent_id), so a second pass reconciles the listing it already made instead of
// creating a duplicate. That is also why 'exported' is in the status filter: a job promoted
// by an earlier pass gets refreshed from the latest extraction data, not skipped.
//
// This creates NO tenant schemas — those are built when an owner accepts the claim email.
//
// Run with: npm run job:backfill-promote            (promote everything)
//           npm run job:backfill-promote -- --dry-run     (report only, no writes)
//           npm run job:backfill-promote -- --admin=42    (attribute the audit rows)

import "dotenv/config";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { PROMOTABLE_JOB_STATUSES } from "../schemas/jobs.schema.js";
import { promoteJobs } from "../services/promote.service.js";

const logger = createChildLogger("backfill-promote-worker");

// promoteJob runs a handful of queries per job and holds no transaction across jobs, so the
// only reason to chunk is progress reporting on a run that can span thousands of jobs.
const CHUNK = 100;

const dryRun = process.argv.includes("--dry-run");
const adminArg = process.argv.find((a) => a.startsWith("--admin="));

/**
 * Whose id the audit rows are attributed to.
 *
 * logAudit resolves platform_users.id -> admin_users and silently writes nothing when there
 * is no admin link, so a wrong id costs the audit trail rather than the backfill. Falls back
 * to any super_admin, since a scripted run has no session to take it from.
 */
async function resolveAdminId(): Promise<number> {
  if (adminArg) return Number(adminArg.split("=")[1]);

  const admin = await masterKnex("superadmin.admin_users")
    .where({ role: "super_admin" })
    .orderBy("id")
    .first("platform_user_id");

  if (!admin) throw new Error("No super_admin found — pass --admin=<platform_user_id>");
  return Number(admin.platform_user_id);
}

async function main() {
  const jobs = await masterKnex("superadmin.extraction_jobs")
    .where({ source_type: "agentcis" })
    .whereIn("status", [...PROMOTABLE_JOB_STATUSES])
    .orderBy("created_at")
    .select("id", "status");

  if (jobs.length === 0) {
    logger.info("Nothing to promote");
    await masterKnex.destroy();
    return;
  }

  // Counts up front: this run writes public listings for real institutions, so the operator
  // sees the scale before it happens rather than reading it back afterwards.
  const byStatus = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});

  logger.info("Promotable AgentCIS jobs found", { total: jobs.length, destination: "institutions", by_status: byStatus });

  if (dryRun) {
    console.table(
      Object.entries(byStatus).map(([status, count]) => ({ status, count, destination: "institutions" })),
    );
    logger.info("Dry run — no writes performed");
    await masterKnex.destroy();
    return;
  }

  const adminId = await resolveAdminId();
  let promoted = 0;
  let failed = 0;
  const errors: Array<{ job_id: string; error: string }> = [];

  for (let i = 0; i < jobs.length; i += CHUNK) {
    const chunk = jobs.slice(i, i + CHUNK).map((j) => j.id as string);
    // promoteJobs isolates per-job failures, so one unpromotable job cannot abort the run.
    const result = await promoteJobs(chunk, adminId);
    promoted += result.promoted;
    failed += result.failed;
    for (const r of result.results) {
      if (!r.ok) errors.push({ job_id: r.job_id, error: r.error ?? "unknown" });
    }

    logger.info("Batch complete", {
      processed: Math.min(i + CHUNK, jobs.length),
      total: jobs.length,
      promoted,
      failed,
    });
  }

  logger.info("Backfill complete", { promoted, failed });
  if (errors.length) console.table(errors.slice(0, 50));

  await masterKnex.destroy();
  // Non-zero when anything failed, so a scheduler surfaces it instead of swallowing it.
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  logger.error("Backfill failed", { err: (err as Error).message });
  await masterKnex.destroy();
  process.exit(1);
});
