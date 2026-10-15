// Post-extraction repair: fix what a machine can PROVE, flag the rest. Runs per job right before
// verifyDataShape, so the shape report describes the residue a human actually needs — not the
// backlog a deterministic pass could have cleared.
//
// Three repairs, each with the same safety contract:
//   - FILL only NULLs, and only from the row's OWN text (deriveIntakeMonthYear — the writers' own
//     derivation; "September 2026" stored with a NULL year is a skipped derivation, not a guess).
//   - MERGE a thin twin into a full one only when EXACTLY ONE candidate exists. Two candidates
//     ("Fall" beside "Fall 2026" and "Fall 2027") means skip and count — never silently choose
//     between two stated values, the same rule the intake writers already follow for dates.
//   - NEVER touch a row an admin has edited (updated_by_platform_user_id non-null — the closest
//     provenance signal this schema has, same reasoning as the duration_weeks rerun guard).
//
// Scope is deliberately NARROWER than scripts/eligibility-backfill.ts, not a copy of it: the
// backfill is the operator's all-jobs batch tool with date-cluster merging and rescue passes;
// this is the per-job, post-run pass that only takes the merges no clustering judgement can get
// wrong. Anything this skips, the backfill (or a reviewer) still owns.
//
// Each merge runs in ONE transaction: repoint assignments, carry custom_dates, delete the thin
// row — a crash must never leave a course pointing at a deleted twin.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { deriveIntakeMonthYear, writeJobEvent } from "./staging-writer.js";
import { isSkippableAssetUrl } from "./html-utils.js";

const logger = createChildLogger("data-repair");

export interface RepairReport {
  intake_fields_filled: number;
  intake_twins_merged: number;
  fee_twins_merged: number;
  english_twins_merged: number;
  /** Active site-list rows with a non-PDF asset extension, excluded so no run fetches them again. */
  assets_excluded: number;
  /** Thin twins left alone: several candidates, contradictions, or admin-touched. */
  skipped_ambiguous: number;
}

/** Fill NULL intake_month / intake_year that the row's own name or start_date states. */
async function fillIntakeMonthYear(jobId: string, dryRun: boolean): Promise<number> {
  const rows = await masterKnex(`${S}.extraction_intakes`)
    .where({ job_id: jobId })
    .where((qb) => { qb.whereNull("intake_month").orWhereNull("intake_year"); })
    .select("id", "intake_name", "start_date", "intake_month", "intake_year");
  let filled = 0;
  for (const r of rows) {
    const derived = deriveIntakeMonthYear(r.intake_name, r.start_date, r.intake_month, r.intake_year);
    const patch: Record<string, number> = {};
    if (r.intake_month == null && derived.intake_month != null) patch.intake_month = derived.intake_month;
    if (r.intake_year == null && derived.intake_year != null) patch.intake_year = derived.intake_year;
    if (!Object.keys(patch).length) continue;
    if (!dryRun) await masterKnex(`${S}.extraction_intakes`).where({ id: r.id }).update(patch);
    filled++;
  }
  return filled;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isEmpty = (v: unknown) => v == null || (typeof v === "object" && Object.keys(v as object).length === 0);

/** Merge undated intakes into their single dated same-name twin. Returns [merged, skipped]. */
async function mergeThinIntakeTwins(jobId: string, dryRun: boolean): Promise<[number, number]> {
  const thins = await masterKnex(`${S}.extraction_intakes`)
    .where({ job_id: jobId }).whereNull("intake_year")
    .select("id", "intake_name", "custom_dates", "updated_by_platform_user_id");
  let merged = 0;
  let skipped = 0;
  for (const thin of thins) {
    if (thin.updated_by_platform_user_id != null) { skipped++; continue; }
    const candidates = await masterKnex(`${S}.extraction_intakes`)
      .where({ job_id: jobId }).whereNotNull("intake_year")
      .whereRaw("lower(trim(intake_name)) = lower(trim(:name))", { name: thin.intake_name ?? "" })
      .select("id", "custom_dates");
    if (candidates.length !== 1) { if (candidates.length > 1) skipped++; continue; }
    const full = candidates[0];
    // custom_dates: carry the thin row's milestones when the survivor has none; both holding
    // DIFFERENT ones is a contradiction a human owns — a guessed deadline is one a student misses.
    if (!isEmpty(thin.custom_dates) && !isEmpty(full.custom_dates) && !sameJson(thin.custom_dates, full.custom_dates)) {
      skipped++;
      continue;
    }
    if (dryRun) { merged++; continue; }
    await masterKnex.transaction(async (trx) => {
      const links = await trx(`${S}.extraction_course_intake_assignments`).where({ intake_id: thin.id }).select("job_id", "course_id");
      for (const l of links) {
        await trx(`${S}.extraction_course_intake_assignments`)
          .insert({ job_id: l.job_id, course_id: l.course_id, intake_id: full.id })
          .onConflict(["course_id", "intake_id"]).ignore();
      }
      await trx(`${S}.extraction_course_intake_assignments`).where({ intake_id: thin.id }).delete();
      if (!isEmpty(thin.custom_dates) && isEmpty(full.custom_dates)) {
        await trx(`${S}.extraction_intakes`).where({ id: full.id }).update({ custom_dates: JSON.stringify(thin.custom_dates) });
      }
      await trx(`${S}.extraction_intakes`).where({ id: thin.id }).delete();
    });
    merged++;
  }
  return [merged, skipped];
}

/** Merge currencyless fees into their single priced same-name-same-amount twin. */
async function mergeThinFeeTwins(jobId: string, dryRun: boolean): Promise<[number, number]> {
  const thins = await masterKnex(`${S}.extraction_course_fees`)
    .where({ job_id: jobId }).whereNotNull("total_amount")
    .where((qb) => { qb.whereNull("currency").orWhereRaw("trim(currency) = ''"); })
    .select("id", "name", "total_amount", "updated_by_platform_user_id");
  let merged = 0;
  let skipped = 0;
  for (const thin of thins) {
    if (thin.updated_by_platform_user_id != null) { skipped++; continue; }
    const candidates = await masterKnex(`${S}.extraction_course_fees`)
      .where({ job_id: jobId }).whereNotNull("currency").whereRaw("trim(currency) <> ''")
      .whereRaw("lower(trim(name)) = lower(trim(:name))", { name: thin.name ?? "" })
      .where({ total_amount: thin.total_amount })
      .select("id");
    if (candidates.length !== 1) { if (candidates.length > 1) skipped++; continue; }
    const full = candidates[0];
    if (dryRun) { merged++; continue; }
    await masterKnex.transaction(async (trx) => {
      const links = await trx(`${S}.extraction_course_fee_assignments`).where({ course_fee_id: thin.id }).select("job_id", "course_id");
      for (const l of links) {
        await trx(`${S}.extraction_course_fee_assignments`)
          .insert({ job_id: l.job_id, course_id: l.course_id, course_fee_id: full.id })
          .onConflict(["course_id", "course_fee_id"]).ignore();
      }
      await trx(`${S}.extraction_course_fee_assignments`).where({ course_fee_id: thin.id }).delete();
      await trx(`${S}.extraction_course_fees`).where({ id: thin.id }).delete();
    });
    merged++;
  }
  return [merged, skipped];
}

const SCORE_COLS = ["overall_score", "listening_score", "reading_score", "writing_score", "speaking_score"] as const;

/**
 * Merge two spellings of ONE English test on one course ("IELTS" beside "IELTS Academic") —
 * exactly two rows of a family, and only when no score contradicts (null agrees, equal agrees,
 * different values is a human's call). The survivor keeps its own name and gains the other's
 * blanks; this table has no updated_by column, so score agreement is the only guard it can have.
 */
async function mergeEnglishFamilyTwins(jobId: string): Promise<[number, number]> {
  const { rows: groups } = await masterKnex.raw(`
    SELECT course_id, split_part(lower(trim(test_type_name)), ' ', 1) AS fam,
           array_agg(id ORDER BY created_at) AS ids
    FROM ${S}.extraction_english_requirements
    WHERE job_id = :job AND course_id IS NOT NULL AND test_type_name IS NOT NULL AND trim(test_type_name) <> ''
    GROUP BY 1, 2 HAVING count(*) > 1`, { job: jobId });
  let merged = 0;
  let skipped = 0;
  for (const g of groups as { ids: string[] }[]) {
    if (g.ids.length !== 2) { skipped++; continue; }
    const [a, b] = await masterKnex(`${S}.extraction_english_requirements`).whereIn("id", g.ids).orderBy("created_at");
    const contradicts = SCORE_COLS.some((c) => a[c] != null && b[c] != null && String(a[c]).trim() !== String(b[c]).trim());
    if (contradicts) { skipped++; continue; }
    const filled = (r: Record<string, unknown>) => SCORE_COLS.filter((c) => r[c] != null).length;
    const [survivor, donor] = filled(b) > filled(a) ? [b, a] : [a, b];
    const patch: Record<string, unknown> = {};
    for (const c of SCORE_COLS) if (survivor[c] == null && donor[c] != null) patch[c] = donor[c];
    await masterKnex.transaction(async (trx) => {
      if (Object.keys(patch).length) await trx(`${S}.extraction_english_requirements`).where({ id: survivor.id }).update(patch);
      await trx(`${S}.extraction_english_requirements`).where({ id: donor.id }).delete();
    });
    merged++;
  }
  return [merged, skipped];
}

/** Dry-run twin of mergeEnglishFamilyTwins: same verdicts, no writes. Small enough that a shared
 *  flag threaded through the transaction block would obscure more than it saves. */
async function countEnglishFamilyTwins(jobId: string): Promise<[number, number]> {
  const { rows: groups } = await masterKnex.raw(`
    SELECT split_part(lower(trim(test_type_name)), ' ', 1) AS fam, course_id,
           array_agg(id ORDER BY created_at) AS ids
    FROM ${S}.extraction_english_requirements
    WHERE job_id = :job AND course_id IS NOT NULL AND test_type_name IS NOT NULL AND trim(test_type_name) <> ''
    GROUP BY 1, 2 HAVING count(*) > 1`, { job: jobId });
  let merged = 0;
  let skipped = 0;
  for (const g of groups as { ids: string[] }[]) {
    if (g.ids.length !== 2) { skipped++; continue; }
    const [a, b] = await masterKnex(`${S}.extraction_english_requirements`).whereIn("id", g.ids);
    const contradicts = SCORE_COLS.some((c) => a[c] != null && b[c] != null && String(a[c]).trim() !== String(b[c]).trim());
    if (contradicts) skipped++; else merged++;
  }
  return [merged, skipped];
}

/**
 * Exclude active site-list rows that are binary documents an HTML scraper cannot read (.pptx,
 * .docx, … — never .pdf, which has its own reader). Stale code once stored 80 of these ACTIVE on
 * one job and every snapshot re-paid a browser-tier walk per row; dispatch now refuses them too,
 * but the LIST is the durable thing, so the rows themselves get fixed.
 */
async function excludeAssetSiteUrls(jobId: string, dryRun: boolean): Promise<number> {
  const rows = await masterKnex(`${S}.extraction_site_urls`)
    .where({ job_id: jobId, excluded: false }).select("id", "url");
  const bad = rows.filter((r: { url: string }) => isSkippableAssetUrl(r.url)).map((r: { id: string }) => r.id);
  if (bad.length && !dryRun) {
    await masterKnex(`${S}.extraction_site_urls`).whereIn("id", bad).update({ excluded: true });
  }
  return bad.length;
}

/**
 * Repair, then let verifyDataShape report what is left. `dryRun` counts what an apply WOULD do
 * using the same candidate logic, writes nothing, and emits no event — one caveat: the merge
 * counts assume the fill pass ran first, so on a dry run (where it did not write) an intake whose
 * name states its year is counted under fills and may ALSO appear as a thin twin; the applied run
 * resolves it as a fill, and the sweep's dry totals are therefore an upper bound on merges. Never throws: a repair pass must not fail
 * a verification run, and a repair that errors mid-job leaves only whole merges behind (each is
 * its own transaction). Fill runs FIRST — "September 2026" gains its year and thereby stops being
 * an undated twin, which shrinks the merge work to the genuinely nameless-date cases.
 */
export async function repairDataShape(jobId: string, opts: { dryRun?: boolean } = {}): Promise<RepairReport> {
  const dryRun = opts.dryRun === true;
  const report: RepairReport = { intake_fields_filled: 0, intake_twins_merged: 0, fee_twins_merged: 0, english_twins_merged: 0, assets_excluded: 0, skipped_ambiguous: 0 };
  try {
    report.intake_fields_filled = await fillIntakeMonthYear(jobId, dryRun);
    const [im, is] = await mergeThinIntakeTwins(jobId, dryRun);
    const [fm, fs] = await mergeThinFeeTwins(jobId, dryRun);
    const [em, es] = dryRun ? await countEnglishFamilyTwins(jobId) : await mergeEnglishFamilyTwins(jobId);
    report.intake_twins_merged = im;
    report.fee_twins_merged = fm;
    report.english_twins_merged = em;
    report.assets_excluded = await excludeAssetSiteUrls(jobId, dryRun);
    report.skipped_ambiguous = is + fs + es;
  } catch (err) {
    logger.warn("Data repair stopped early — whole merges only, nothing half-done", { jobId, err: String(err) });
  }
  const acted = report.intake_fields_filled + report.intake_twins_merged + report.fee_twins_merged
    + report.english_twins_merged + report.assets_excluded;
  // A dry run must leave NO trace, and so must a run that only RE-COUNTED standing refusals: the
  // pass runs from two verification tails, so an event keyed on skips alone would announce the
  // same unresolved twins twice per job, every run, forever. Refusals already live in the shape
  // report; this event exists to record that rows CHANGED.
  if (acted > 0 && !dryRun) {
    await writeJobEvent(jobId, "data_repaired", {
      phase: "verification",
      message: `Repaired after extraction: ${report.intake_fields_filled} intake date(s) filled from their own text, `
        + `${report.intake_twins_merged + report.fee_twins_merged + report.english_twins_merged} duplicate(s) merged`
        + (report.assets_excluded ? `, ${report.assets_excluded} binary document URL(s) excluded from the crawl list` : "")
        + (report.skipped_ambiguous ? `; ${report.skipped_ambiguous} left for review (ambiguous or admin-edited)` : ""),
      data: { ...report },
    }).catch((err) => logger.warn("Could not write data_repaired", { jobId, err: String(err) }));
  }
  return report;
}
