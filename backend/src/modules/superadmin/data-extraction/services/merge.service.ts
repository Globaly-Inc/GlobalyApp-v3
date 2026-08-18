// Merge service — collapses duplicate fee and eligibility rows in the live tenant
// catalog an extraction job promoted into.
//
// PORTED FROM (read, not copied): V1's merge_extraction_job_duplicates(job, dry_run)
// → merge_business_duplicate_fees_and_eligibility(business, dry_run). §3.4 lists
// this as "STUB returns empty; RPC lives only in the V1 database".
//
// GUARANTEES
//
// Transactional. One masterKnex transaction covers the tenant catalog, the
// trigger-maintained master projection and the promotion ledger. `dry_run` runs the
// IDENTICAL code path and rolls back at the end, so a preview can never disagree
// with the apply it previews.
//
// Idempotent. Rows are grouped by content hash and only groups of two or more are
// touched. A second run finds no group, changes nothing, and writes no audit row —
// a completed merge re-run is a no-op, not a second merge.
//
// Auditable. superadmin.admin_audit_logs gets what was merged into what, by whom
// and when: every group as { keep_id, dup_ids } plus the resolved target schema.
//
// Nothing is orphaned. Before deleting anything, every service that could reach ANY
// row in a group — through its own service_id or through a junction — is given a
// junction row to the survivor. Afterwards the access set is read BACK from the
// database and compared to the set from before; a single service that lost access
// aborts the whole transaction. That assertion is load-bearing, not decorative: the
// re-point insert has to tolerate an already-existing pair, which is
// indistinguishable at the statement level from a re-point that silently did
// nothing (defect D8).
//
// Loud on constraint violations. Only the re-point insert tolerates a conflict, and
// only on the pair that means "already has access". Every other constraint error
// propagates out of the transaction, so a merge that cannot be applied cleanly is
// not applied at all.

import type { Knex } from "knex";

import { masterKnex } from "../../../../core/db/master-pool.js";
import { BadRequestError, NotFoundError } from "../../../../shared/errors.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { logAudit } from "../shared/audit.js";
import {
  EMPTY_PLAN,
  eligibilityMatchHash,
  feeMatchHash,
  findOrphans,
  planMerge,
  type MergePlan,
  type MergeableRow,
} from "../lib/merge-duplicates.js";
import * as jobsRepo from "../repositories/jobs.repository.js";
import * as repo from "../repositories/merge.repository.js";
import * as promoteRepo from "../repositories/promote.repository.js";

const logger = createChildLogger("extraction-merge-service");

/** Thrown to unwind a dry run once the plan and the guard have both been proved. */
class DryRunComplete extends Error {
  constructor(public readonly report: MergeReport) {
    super("dry run");
  }
}

export class MergeOrphanError extends BadRequestError {
  constructor(lost: { keep_id: string; lost: string[] }[]) {
    super(
      `Merge aborted — ${lost.length} surviving row(s) would leave a service without the value it had: ` +
        lost.map((row) => `${row.keep_id} lost [${row.lost.join(", ")}]`).join("; "),
    );
  }
}

export interface MergeReport {
  job_id: string;
  /** V1's key, kept so the existing console can read the response unchanged. */
  dry_run: boolean;
  target: repo.PromotionTarget & { name: string };
  fees_merged: number;
  fee_groups: number;
  eligibility_merged: number;
  eligibility_groups: number;
  /** Junction rows created so nothing lost access. */
  repointed: number;
  /** Every group, for the audit record: what was merged into what. */
  merges: { kind: repo.MergeKind; keep_id: string; dup_ids: string[] }[];
}

const HASHERS: Record<repo.MergeKind, (row: Record<string, unknown>) => string> = {
  fees: feeMatchHash,
  eligibility: eligibilityMatchHash,
};

export async function mergeJobDuplicates(
  jobId: string,
  dryRun: boolean,
  adminId: number,
): Promise<MergeReport> {
  const job = await jobsRepo.findJobById(jobId);
  if (!job) throw new NotFoundError("Extraction job not found");

  const target = await resolveTarget(jobId, job as JobRow);

  let report: MergeReport;
  try {
    report = await masterKnex.transaction(async (trx) => {
      const built = await mergeInTransaction(trx, jobId, target, dryRun);
      if (dryRun) throw new DryRunComplete(built);
      return built;
    });
  } catch (err) {
    // A dry run reaching here means the plan and the guard both held and the
    // transaction was rolled back on purpose.
    if (err instanceof DryRunComplete) return err.report;
    throw err;
  }

  // Only a merge that actually changed something is an auditable action; a no-op
  // re-run must not add a second entry claiming a second merge happened.
  if (report.fees_merged + report.eligibility_merged > 0) {
    await logAudit(adminId, "EXTRACTION_MERGE_DUPLICATES", {
      entityType: "extraction_jobs",
      entityId: jobId,
      details: {
        target: report.target,
        fees_merged: report.fees_merged,
        fee_groups: report.fee_groups,
        eligibility_merged: report.eligibility_merged,
        eligibility_groups: report.eligibility_groups,
        repointed: report.repointed,
        merges: report.merges,
      },
    });
    logger.info("Merged duplicates", {
      jobId,
      schema: target.schema_name,
      fees: report.fees_merged,
      eligibility: report.eligibility_merged,
    });
  }

  return report;
}

interface JobRow {
  institution_name: string | null;
  institution_url: string;
}

/**
 * The promotion ledger first — it records the schema this job's rows are actually
 * in. Only if the job has never been promoted do we fall back to V1's
 * website-then-name match, and a job with no resolvable target is a 404 rather than
 * V1's `{"error": "business not found for job"}` returned with HTTP 200.
 */
async function resolveTarget(jobId: string, job: JobRow): Promise<repo.PromotionTarget & { name: string }> {
  const promoted = await repo.findPromotionTarget(jobId);
  if (promoted) {
    const org = await promoteRepo.findOrgById(promoted.org_type, promoted.org_id);
    if (!org?.schema_name) {
      throw new NotFoundError("The org this job promoted into no longer has a tenant schema");
    }
    return { ...promoted, schema_name: org.schema_name, name: org.name };
  }

  const overview = await masterKnex("superadmin.extraction_institution_overview")
    .where({ job_id: jobId })
    .first("name", "website");
  const org = await promoteRepo.findOrgForJob(job, overview?.name, overview?.website);
  if (!org) throw new NotFoundError("No live catalog found for this job — promote it first");
  if (!org.schema_name) throw new BadRequestError(`"${org.name}" has no tenant schema — promote the job first`);

  return { org_type: org.org_type, org_id: org.org_id, schema_name: org.schema_name, name: org.name };
}

async function mergeInTransaction(
  trx: Knex,
  jobId: string,
  target: repo.PromotionTarget & { name: string },
  dryRun: boolean,
): Promise<MergeReport> {
  const results = {
    fees: await mergeKind(trx, target.schema_name, "fees"),
    eligibility: await mergeKind(trx, target.schema_name, "eligibility"),
  };

  return {
    job_id: jobId,
    dry_run: dryRun,
    target,
    fees_merged: results.fees.plan.merged,
    fee_groups: results.fees.plan.groups,
    eligibility_merged: results.eligibility.plan.merged,
    eligibility_groups: results.eligibility.plan.groups,
    repointed: results.fees.repointed + results.eligibility.repointed,
    merges: [
      ...results.fees.plan.merges.map((g) => ({ kind: "fees" as const, keep_id: g.keep_id, dup_ids: g.dup_ids })),
      ...results.eligibility.plan.merges.map((g) => ({
        kind: "eligibility" as const,
        keep_id: g.keep_id,
        dup_ids: g.dup_ids,
      })),
    ],
  };
}

async function mergeKind(
  trx: Knex,
  schema: string,
  kind: repo.MergeKind,
): Promise<{ plan: MergePlan; repointed: number }> {
  const hash = HASHERS[kind];
  const rows = await repo.loadRows(trx, schema, kind);
  const junctions = await repo.loadJunctions(trx, schema, kind);

  const hashed: MergeableRow[] = rows.map((row) => ({
    id: row.id as string,
    service_id: (row.service_id as string | null) ?? null,
    created_at: row.created_at as Date,
    hash: hash(row),
  }));

  const plan = planMerge(hashed, junctions);
  if (plan.groups === 0) return { plan: EMPTY_PLAN, repointed: 0 };

  const repoints = plan.merges.flatMap((group) =>
    group.repoints.map((serviceId) => ({ service_id: serviceId, keep_id: group.keep_id })),
  );
  const repointed = await repo.repoint(trx, schema, kind, repoints);

  const dupIds = plan.merges.flatMap((group) => group.dup_ids);
  await repo.deleteRows(trx, schema, kind, dupIds);

  // The guard. Read the truth back rather than trusting the insert's row count.
  const after = await repo.accessAfter(
    trx,
    schema,
    kind,
    plan.merges.map((group) => group.keep_id),
  );
  const orphans = findOrphans(plan, after);
  if (orphans.length) throw new MergeOrphanError(orphans);

  return { plan, repointed };
}
