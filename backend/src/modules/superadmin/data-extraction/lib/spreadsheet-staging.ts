// Stages one spreadsheet institution into an already-created extraction job — the worker's body.
// Same shape as agentcis-staging.ts: overview, then every row through stageProduct, then the job
// marked done. A bad row is recorded and skipped rather than failing the whole institution.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { writeInstitutionOverview, writeJobEvent } from "./staging-writer.js";
import { mergeProgress } from "./agentcis-staging.js";
import { stageProduct, newStagingCounters } from "./agentcis-product-staging.js";
import { DEFAULT_CURRENCY, rowToProduct } from "./spreadsheet-mappers.js";
import { stageBranches, stageSpreadsheetExtras } from "./spreadsheet-extras-staging.js";
import { splitList } from "./spreadsheet-mappers.js";
import type { SpreadsheetImportInput } from "../schemas/spreadsheet-import.schema.js";

const logger = createChildLogger("spreadsheet-staging");

/** Enough to show the admin what to fix, without bloating pipeline_progress on a bad file. */
const MAX_RECORDED_ERRORS = 50;
const MAX_RECORDED_MERGES = 500;
/** course-resolver's "identical" reasons, in the admin's words. */
const MERGE_REASON: Record<string, string> = {
  name_key: "Merged — another spelling of an earlier row's course",
  course_code: "Merged — same course code as an earlier row",
};

export async function stageSpreadsheetInstitution(jobId: string, input: SpreadsheetImportInput, website: string) {
  const { institution, rows } = input;
  const counters = newStagingCounters();
  const errors: { row: number; course: string | null; error: string }[] = [];
  // Rows folded into a course an earlier row created (another spelling of it) — listed for the admin.
  const merged: { row: number; course: string; error: string; kind: "duplicate" }[] = [];
  let failed = 0;

  try {
    await writeInstitutionOverview(jobId, { ...institution, website, source_url: website });
    const campusMap = await stageBranches(jobId, input.extras?.branches ?? [], rows.flatMap((r) => splitList(r.branch_names)));

    for (const [i, row] of rows.entries()) {
      const line = input.row_lines?.[i] ?? i + 1;
      const name = row.course_name?.trim();
      if (!name) {
        failed++;
        if (errors.length < MAX_RECORDED_ERRORS) errors.push({ row: line, course: null, error: "Missing course name" });
        continue;
      }
      // The DB's own clock, so a course this row inserts is exactly one created at or after it —
      // a per-row snapshot of every course id was O(rows²) on a 10k-course sheet.
      const { rows: [{ started }] } = await masterKnex.raw("select clock_timestamp() as started");
      try {
        // A course links to the branches its row names; one naming none links none.
        const mergedBy = await stageProduct(jobId, rowToProduct(row, DEFAULT_CURRENCY), name, institution.name, website, campusMap, [], counters, false);
        if (mergedBy && merged.length < MAX_RECORDED_MERGES) merged.push({ row: line, course: name, error: MERGE_REASON[mergedBy] ?? "Merged into an earlier row's course", kind: "duplicate" });
      } catch (e) {
        // The admin is told this row was skipped, so remove the course it half-wrote; its fee,
        // intake and requirement links cascade. ponytail: not a transaction — stageProduct and the
        // shared staging-writer upserts all write through masterKnex.
        await masterKnex(`${S}.extraction_courses`).where({ job_id: jobId }).where("created_at", ">=", started).delete();
        failed++;
        if (errors.length < MAX_RECORDED_ERRORS) errors.push({ row: line, course: name, error: (e as Error).message });
      }
      if ((i + 1) % 25 === 0) {
        await mergeProgress(jobId, { phase: "courses", current: i + 1, total: rows.length, failed, ...counters });
      }
    }

    // The multi-tab template's other tabs link to the courses just staged, so they go after.
    const extras = input.extras ? await stageSpreadsheetExtras(jobId, input.extras) : null;

    await mergeProgress(jobId, { phase: "done", current: rows.length, total: rows.length, failed, errors, merged, ...counters, ...(extras ? { extras } : {}) });
    // "review", like a finished AI crawl: the staged courses are still "pending" and need an admin's approval.
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "review",
      courses_extracted: counters.courses_extracted,
      updated_at: masterKnex.fn.now(),
    });
    await writeJobEvent(jobId, "spreadsheet_import_complete", {
      message: `Imported ${counters.courses_extracted} courses (${counters.skipped_products} duplicates merged, ${failed} failed)`,
    });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    logger.error("Spreadsheet staging failed", { jobId, error: msg });
    await mergeProgress(jobId, { phase: "failed", error: msg, failed, errors, merged, ...counters });
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "failed", error_message: msg, updated_at: masterKnex.fn.now(),
    });
  }
}
