// Final-batch quality audit.
//
// PORTED FROM (read, not copied): V1 process-extraction-queue's POST-EXTRACTION
// QUALITY VALIDATOR. §3.4 lists this as "MISSING — no equivalent anywhere in V3".
//
// ORDER OF OPERATIONS IS THE WHOLE DESIGN, the same as ai-knowledge's
// embedding.service.ts. Everything that can be computed and written without the
// provider is computed and written FIRST:
//
//   1. read the batch and its fee-range context
//   2. run the three deterministic rules (lib/quality-rules.ts)
//   3. persist those flags and auto-flag the high-severity courses  ← committed
//   4. only now ask for a provider — 503 if there is no key         ← fails closed
//   5. persist the judgement flags on top                            ← committed
//
// A deployment with no Gemini key therefore still gets every duplicate, every fee
// anomaly and every hollow row recorded; what it does not get is the verdict on the
// two judgement rules, and `awaiting` says exactly how many courses are waiting for
// it. Nothing writes a "looks fine" it did not earn.
//
// `provider` is injectable so the whole pipeline is testable offline. Tests pass
// their own; they never read the environment.

import type { Knex } from "knex";

import { masterKnex } from "../../../../core/db/master-pool.js";
import { NotFoundError } from "../../../../shared/errors.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { logAudit } from "../shared/audit.js";
import {
  QualityProviderUnavailableError,
  currentQualityModel,
  getQualityProvider,
  isQualityProviderConfigured,
  type QualityProvider,
} from "../lib/quality-provider.js";
import {
  DEFAULT_FEE_BOUNDS,
  feeBoundsFrom,
  findDeterministicIssues,
  keepKnownCourses,
  summarise,
  type CourseUnderAudit,
  type QualityIssue,
} from "../lib/quality-rules.js";
import * as jobsRepo from "../repositories/jobs.repository.js";
import * as repo from "../repositories/quality.repository.js";

const logger = createChildLogger("extraction-quality-service");

export interface QualityReport {
  job_id: string;
  /** Courses audited. */
  courses: number;
  /** Flags written by the three deterministic rules. */
  deterministic: number;
  /** Flags written by the two judgement rules. */
  judged: number;
  /** Courses still awaiting a judgement call — non-zero only with no provider. */
  awaiting: number;
  /** Courses moved to verification_status 'flagged' by a high-severity issue. */
  auto_flagged: number;
  /** The model that produced (or is awaited for) the judgement half. */
  model: string;
  summary: string;
  /** True when the batch is clean by every rule that actually ran. */
  passed: boolean;
}

/**
 * Audit every course in a job. Throws QualityProviderUnavailableError (503) when
 * there is no key — AFTER the deterministic flags are committed, so the work is
 * never lost and `awaiting` on the follow-up read is real.
 */
export async function validateJobQuality(
  jobId: string,
  /** Null when the pipeline ran this rather than a person — see auditQualityBestEffort. */
  adminId: number | null,
  provider?: QualityProvider,
): Promise<QualityReport> {
  const job = await jobsRepo.findJobById(jobId);
  if (!job) throw new NotFoundError("Extraction job not found");

  // ── 1–2. Everything that needs no provider ──
  const courses = await repo.loadCourses(jobId);
  const context = await repo.loadFeeContext(jobId);
  const bounds = context ? feeBoundsFrom(context.fee_structure, context.currency) : DEFAULT_FEE_BOUNDS;
  const deterministic = keepKnownCourses(findDeterministicIssues(courses, bounds), courses);

  // ── 3. Persist them. Committed before the provider is touched. ──
  const written = await persist(jobId, deterministic, courses, "replace");

  const base: QualityReport = {
    job_id: jobId,
    courses: courses.length,
    deterministic: written.flags,
    judged: 0,
    awaiting: courses.length,
    auto_flagged: written.autoFlagged,
    model: currentQualityModel(),
    summary: summarise(deterministic),
    passed: deterministic.length === 0,
  };

  if (!courses.length) {
    // Nothing to judge; an empty batch needs no provider and no 503.
    return { ...base, awaiting: 0 };
  }

  // ── 4. Fail closed. ──
  const llm = provider ?? getQualityProvider();

  // ── 5. Judgement flags, appended to the deterministic ones. ──
  const institutionName =
    context?.institution_name ?? (job as { institution_name?: string | null }).institution_name ?? jobId;
  const judgement = await llm.judge(courses, institutionName);
  const judged = keepKnownCourses(judgement.issues, courses);
  // Appended, not replaced: the deterministic flags are already committed and
  // re-writing them would reset the auto-flag count they earned.
  const appended = await persist(jobId, judged, courses, "append");
  const autoFlagged = written.autoFlagged + appended.autoFlagged;
  const all = [...deterministic, ...judged];

  // admin_audit_logs.admin_id is a NOT NULL FK to superadmin.admin_users, and the
  // log is a record of what an *admin* did. A pipeline-initiated audit has no admin,
  // so it leaves its trail in extraction_job_events instead — the worker writes it.
  if (adminId !== null) {
    await logAudit(adminId, "EXTRACTION_QUALITY_AUDIT", {
      entityType: "extraction_jobs",
      entityId: jobId,
      details: {
        courses: courses.length,
        deterministic: deterministic.length,
        judged: judged.length,
        auto_flagged: autoFlagged,
        model: llm.model,
      },
    });
  }

  logger.info("Quality audit complete", { jobId, courses: courses.length, issues: all.length });

  return {
    ...base,
    deterministic: deterministic.length,
    judged: judged.length,
    awaiting: 0,
    auto_flagged: autoFlagged,
    model: llm.model,
    summary: judgement.summary || summarise(all),
    passed: all.length === 0,
  };
}

/**
 * One transaction per phase: the flag rows and the verification_status downgrades
 * they cause commit together, or neither does.
 */
async function persist(
  jobId: string,
  issues: readonly QualityIssue[],
  courses: readonly CourseUnderAudit[],
  mode: "replace" | "append",
): Promise<{ flags: number; autoFlagged: number }> {
  return masterKnex.transaction(async (trx: Knex) => {
    const flags = await repo.writeFlags(trx, jobId, issues, courses, mode);
    const autoFlagged = await repo.flagHighSeverity(trx, issues);
    return { flags, autoFlagged };
  });
}

export async function listQualityFlags(jobId: string) {
  const job = await jobsRepo.findJobById(jobId);
  if (!job) throw new NotFoundError("Extraction job not found");
  const flags = await repo.listFlags(jobId);
  return {
    flags,
    /** So a console can say "3 rules ran, 2 are waiting on a key" rather than "clean". */
    judgement_pending: !isQualityProviderConfigured(),
    model: currentQualityModel(),
  };
}

/**
 * Pipeline entry point. The audit is best-effort, exactly as it is in V1: a missing
 * key or a provider error must never fail an extraction job that is otherwise done.
 * The deterministic flags are already committed by the time either can happen.
 */
export async function auditQualityBestEffort(jobId: string): Promise<QualityReport | null> {
  try {
    return await validateJobQuality(jobId, null);
  } catch (err) {
    if (err instanceof QualityProviderUnavailableError) {
      logger.warn("No quality provider — deterministic flags written, judgement pending", { jobId });
      return null;
    }
    logger.warn("Quality audit failed (non-fatal)", {
      jobId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
