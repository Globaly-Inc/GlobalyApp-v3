// Worker — consumes "extraction_verify" queue.
// Re-scrapes source URLs and uses Gemini to compare extracted data against live content.
//
// Run with: npm run job:extraction-verify

import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { scrapeMarkdown } from "../lib/scraper.js";
import { truncateMarkdown } from "../lib/html-utils.js";
import { extractJson } from "../lib/llm-client.js";
import { verificationPrompt, VERIFICATION_SYSTEM } from "../lib/extraction-prompts.js";
import { loadLookupLists, lookupListsHealth } from "../lib/lookup-catalog.js";
import { writeJobEvent } from "../lib/staging-writer.js";

import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("extraction-verify-worker");

const MAX_COURSES_TO_VERIFY = 20;
const FIELDS_TO_VERIFY = ["name", "degree_level", "duration_weeks", "domestic_fee_total", "international_fee_total"];

interface VerifyResult {
  results: Array<{
    field_name: string;
    extracted_value: string;
    live_value: string | null;
    status: "match" | "mismatch" | "not_found";
  }>;
}

/**
 * Is every course in this job bound to a subject area and a degree level?
 *
 * Runs as part of verification rather than as a script someone has to remember: this is the same
 * question verification already answers for the other fields, and the job timeline is where an
 * admin looks. Counts come from the link columns — `subject_area_code` = areas_of_study.slug,
 * `degree_level_code` = degree_levels.slug — so "linked" means a real seeded row, not just text.
 * Pure counting: no scrape, no model call. The per-course detail is in staging-writer's
 * `lookup-link` log lines, written when the course was extracted.
 */
async function verifyLookupLinks(jobId: string) {
  // The list configuration travels with the counts: an unseeded list, or a fold pointing at a
  // level that is no longer seeded, is WHY a job comes out unlinked — the counts can't say that.
  const health = lookupListsHealth(await loadLookupLists());

  const { rows } = await masterKnex.raw(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE degree_level_code IS NOT NULL)::int AS level_linked,
            count(*) FILTER (WHERE subject_area_code IS NOT NULL)::int AS area_linked
       FROM ${S}.extraction_courses WHERE job_id = :jobId`,
    { jobId },
  );
  const { total, level_linked: levelLinked, area_linked: areaLinked } = rows[0] as
    { total: number; level_linked: number; area_linked: number };
  if (total === 0) return;

  // The wording that failed to link, so the event says WHY, not just how many.
  const unlinked = await masterKnex(`${S}.extraction_courses`)
    .where({ job_id: jobId })
    .where((qb) => qb.whereNull("degree_level_code").orWhereNull("subject_area_code"))
    .select("name", "degree_level", "subject_area", "degree_level_code", "subject_area_code")
    .limit(25);
  const unlinkedLevels = [...new Set(unlinked.filter((c) => !c.degree_level_code).map((c) => c.degree_level ?? "(none extracted)"))];
  const unlinkedAreas = [...new Set(unlinked.filter((c) => !c.subject_area_code).map((c) => c.subject_area ?? "(none extracted)"))];

  const pct = (n: number) => Math.round((n / total) * 100);
  const complete = levelLinked === total && areaLinked === total && health.ok;
  const message = complete
    ? `Lookup links: all ${total} courses linked to a degree level and a subject area`
    : `Lookup links: degree level ${levelLinked}/${total} (${pct(levelLinked)}%), subject area ${areaLinked}/${total} (${pct(areaLinked)}%)`
      + (health.ok ? "" : ` — lookup lists need seeding (${health.areas_seeded} areas, ${health.levels_seeded} levels; unseeded levels: ${health.missing_fold_targets.join(", ") || "none"})`);

  await writeJobEvent(jobId, "lookup_links_verified", {
    level: complete ? "info" : "warn",
    phase: "verification",
    message,
    data: {
      total, degree_level_linked: levelLinked, subject_area_linked: areaLinked,
      unlinked_degree_levels: unlinkedLevels.slice(0, 10),
      unlinked_subject_areas: unlinkedAreas.slice(0, 10),
      lists: health,
    },
  });
  logger[complete ? "info" : "warn"]("Lookup links verified", {
    jobId, total, degree_level_linked: levelLinked, subject_area_linked: areaLinked,
    unlinked_degree_levels: unlinkedLevels.slice(0, 10),
    unlinked_subject_areas: unlinkedAreas.slice(0, 10),
  });
  await verifyRequestedLevels(jobId, total);
}

async function verifyRequestedLevels(jobId: string, total: number) {
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first("degree_level_codes");
  const wanted: string[] = job?.degree_level_codes ?? [];
  if (!wanted.length || total === 0) return;

  const { rows } = await masterKnex.raw(
    `SELECT count(*) FILTER (WHERE degree_level_code = ANY(:wanted))::int      AS in_scope,
            count(*) FILTER (WHERE degree_level_code IS NOT NULL
                               AND NOT (degree_level_code = ANY(:wanted)))::int AS out_of_scope,
            count(*) FILTER (WHERE degree_level_code IS NULL)::int             AS no_level
       FROM ${S}.extraction_courses WHERE job_id = :jobId`,
    { jobId, wanted },
  );
  const { in_scope: inScope, out_of_scope: outOfScope, no_level: noLevel } = rows[0] as
    { in_scope: number; out_of_scope: number; no_level: number };

  const found = outOfScope
    ? await masterKnex(`${S}.extraction_courses`).where({ job_id: jobId })
        .whereNotNull("degree_level_code").whereNotIn("degree_level_code", wanted)
        .select("degree_level_code").count("id as count").groupBy("degree_level_code")
    : [];

  await writeJobEvent(jobId, "requested_levels_verified", {
    level: outOfScope ? "warn" : "info",
    phase: "verification",
    message: outOfScope
      ? `Degree levels: ${inScope}/${total} courses are one this job asked for, ${outOfScope} are another level`
      : `Degree levels: all ${inScope} courses are one this job asked for`,
    data: { requested: wanted, in_scope: inScope, out_of_scope: outOfScope, no_level: noLevel, other_levels: found },
  });
  logger[outOfScope ? "warn" : "info"]("Requested levels verified", {
    jobId, requested: wanted, in_scope: inScope, out_of_scope: outOfScope, no_level: noLevel,
  });
}

await queueService.consume(EXTRACTION_QUEUES.VERIFY, async (msg) => {
  let jobId: string, force: boolean | undefined;
  try {
    ({ jobId, force } = JSON.parse(msg!.content.toString()));
  } catch {
    logger.error("Malformed queue message, discarding", { raw: msg?.content.toString().slice(0, 200) });
    return;
  }
  logger.info("Starting verification", { jobId });

  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first();
  if (!job) { logger.warn("Job not found", { jobId }); return; }
  if (["paused", "declined", "failed", "review", "done", "exported"].includes(job.status)) {
    logger.info("Job not actionable", { jobId, status: job.status });
    return;
  }

  await writeJobEvent(jobId, "verification_start", { phase: "verification", message: "Starting verification" });

  try {
    // Incremental by default: only verify courses new or re-extracted since their last
    // verification — the automatic post-run dispatch used to re-scrape and re-bill Gemini
    // for the same first-20 courses on EVERY rerun cycle, even when nothing changed.
    // The Context tab's manual verification step passes force to re-check everything.
    const courses = await masterKnex(`${S}.extraction_courses`)
      .where({ job_id: jobId })
      .whereNotNull("source_url")
      .modify((qb) => {
        if (!force) qb.where((w) => w.whereNull("last_verified_at").orWhereRaw("updated_at > last_verified_at"));
      })
      .limit(MAX_COURSES_TO_VERIFY);

    let verifiedCount = 0;
    let totalChecks = 0;
    let matchCount = 0;

    for (const course of courses) {
      // Check still active
      const current = await masterKnex(`${S}.extraction_jobs`).select("status", "stop_requested").where({ id: jobId }).first();
      if (!current || current.stop_requested || current.status === "paused") return;

      try {
        const page = await scrapeMarkdown(course.source_url, { onlyMainContent: true });

        if (page.blocked || page.markdown.length < 50) {
          for (const field of FIELDS_TO_VERIFY) {
            if (course[field] == null) continue;
            await masterKnex(`${S}.extraction_verification_results`).insert({
              job_id: jobId, course_id: course.id, field_name: field,
              extracted_value: String(course[field]), live_value: null, status: "not_found",
            });
            totalChecks++;
          }
          continue;
        }

        const liveText = truncateMarkdown(page.markdown, 40_000);

        const fieldsMap: Record<string, string> = {};
        for (const field of FIELDS_TO_VERIFY) {
          if (course[field] != null) fieldsMap[field] = String(course[field]);
        }
        if (Object.keys(fieldsMap).length === 0) continue;

        const result = await extractJson<VerifyResult>({
          system: VERIFICATION_SYSTEM,
          prompt: verificationPrompt({ name: course.name, fields: fieldsMap }, liveText),
          tier: "lite",
        });

        for (const r of result.results) {
          await masterKnex(`${S}.extraction_verification_results`).insert({
            job_id: jobId, course_id: course.id, field_name: r.field_name,
            extracted_value: r.extracted_value, live_value: r.live_value ?? null, status: r.status,
          });
          totalChecks++;
          if (r.status === "match") matchCount++;
        }

        // Stamp the course itself — the review UI reads this, not the per-field results table.
        await masterKnex(`${S}.extraction_courses`).where({ id: course.id }).update({
          verification_status: result.results.every((r) => r.status === "match") ? "verified" : "mismatch",
          last_verified_at: masterKnex.fn.now(),
        });

        verifiedCount++;
        await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({ processing_heartbeat_at: masterKnex.fn.now() });

      } catch (err) {
        logger.warn("Failed to verify course", { courseId: course.id, error: (err as Error).message });
        await writeJobEvent(jobId, "verification_error", {
          level: "warn", phase: "verification",
          message: `Failed to verify "${course.name}": ${(err as Error).message}`,
          data: { course_id: course.id },
        });
      }
    }

    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "review",
      // An incremental pass covered only the changed courses — add to the standing score
      // instead of clobbering it with this pass's partial count. A forced full pass owns it.
      verification_score: force ? matchCount : masterKnex.raw("COALESCE(verification_score, 0) + ?", [matchCount]),
      verification_total: force ? totalChecks : masterKnex.raw("COALESCE(verification_total, 0) + ?", [totalChecks]),
      pipeline_progress: JSON.stringify({ site_mapping: "done", course_discovery: "done", data_extraction: "done", verification: "done" }),
      updated_at: masterKnex.fn.now(),
    });

    await verifyLookupLinks(jobId);

    await writeJobEvent(jobId, "verification_complete", {
      phase: "verification",
      message: `Verification complete: ${matchCount}/${totalChecks} matched across ${verifiedCount} courses`,
      data: { verified: verifiedCount, total_checks: totalChecks, matches: matchCount },
    });

    logger.info("Verification complete", { jobId, verifiedCount, totalChecks, matchCount });

  } catch (err) {
    logger.error("Verification failed", { jobId, error: err });
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "failed",
      error_message: `Verification failed: ${err instanceof Error ? err.message : String(err)}`,
      updated_at: masterKnex.fn.now(),
    });
    await writeJobEvent(jobId, "pipeline_error", {
      level: "error", phase: "verification", message: err instanceof Error ? err.message : String(err),
    });
  }
});

logger.info(`Extraction verify worker started — consuming "${EXTRACTION_QUEUES.VERIFY}" queue`);
