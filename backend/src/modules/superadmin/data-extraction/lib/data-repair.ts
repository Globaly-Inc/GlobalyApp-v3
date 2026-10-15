// Post-extraction repair: fix what a machine can PROVE, flag the rest. Runs per job right before
// verifyDataShape, so the shape report describes the residue a human actually needs — not the
// backlog a deterministic pass could have cleared.
//
// Every repair holds one safety contract:
//   - FILL only NULLs, and only from the row's OWN text (deriveIntakeMonthYear — the writers' own
//     derivation; "September 2026" stored with a NULL year is a skipped derivation, not a guess).
//   - MERGE a thin twin into a full one only when EXACTLY ONE candidate exists AND nothing the two
//     rows both state disagrees. Identity is judged by the module's own authorities, never a
//     convenient proxy: partialDatesAgree/morePrecise for dates (null is unknown, the sharper
//     value wins), sameTest for English test names ("IELTS" is "IELTS Academic"; "Cambridge C1"
//     is NOT "Cambridge C2" — a first-word grouping merged those), and a fee's student_type /
//     period_type / fee_type_id must agree or the row is simply not a candidate (an international
//     fee must never collapse into the same-priced domestic one).
//   - CARRY, never drop: the deleted twin's deadlines, descriptions and instalments move to the
//     survivor when the survivor lacks them; if both state different ones, the merge is refused.
//   - NEVER touch a row an admin has edited (updated_by_platform_user_id non-null, where the
//     table has it — extraction_english_requirements does not, so score agreement is its guard).
//
// Scope is deliberately NARROWER than scripts/eligibility-backfill.ts, not a copy of it: the
// backfill is the operator's all-jobs batch tool with date-cluster merging and rescue passes;
// this is the per-job, post-run pass that only takes the merges no clustering judgement can get
// wrong. Anything this skips, the backfill (or a reviewer) still owns.
//
// Each merge runs in ONE transaction, and each PASS catches its own errors — a fee-pass crash
// must neither abort the English pass nor erase the intake merges already counted (a report that
// forgets committed deletes is worse than the crash).

import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { deriveIntakeMonthYear, writeJobEvent } from "./staging-writer.js";
import { isSkippableAssetUrl } from "./html-utils.js";
import { morePrecise, partialDatesAgree } from "./partial-date.js";
import { sameTest } from "../../../enquiries/shared/eligibility.js";

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
const isEmpty = (v: unknown) => v == null || (typeof v === "object" && Object.keys(v as object).length === 0)
  || (typeof v === "string" && v.trim() === "");

const INTAKE_DATE_COLS = ["start_date", "end_date", "orientation_date", "admission_deadline"] as const;
const INTAKE_COLS = ["id", "intake_name", "intake_month", "custom_dates", "updated_by_platform_user_id", ...INTAKE_DATE_COLS];

/** Merge undated intakes into their single dated same-name twin. Returns [merged, skipped]. */
async function mergeThinIntakeTwins(jobId: string, dryRun: boolean): Promise<[number, number]> {
  const thins = await masterKnex(`${S}.extraction_intakes`)
    .where({ job_id: jobId }).whereNull("intake_year").select(INTAKE_COLS);
  let merged = 0;
  let skipped = 0;
  for (const thin of thins) {
    if (thin.updated_by_platform_user_id != null) { skipped++; continue; }
    const candidates = await masterKnex(`${S}.extraction_intakes`)
      .where({ job_id: jobId }).whereNotNull("intake_year")
      .whereRaw("lower(trim(intake_name)) = lower(trim(:name))", { name: thin.intake_name ?? "" })
      .select(INTAKE_COLS);
    if (candidates.length !== 1) { if (candidates.length > 1) skipped++; continue; }
    const full = candidates[0];
    // Everything BOTH rows state must agree, or this is two sittings sharing a label, not one row
    // stored twice. A month conflict, any date conflict (partialDatesAgree: null is unknown, two
    // precisions of one date agree), or two different milestone sets all refuse the merge — the
    // deleted twin's deadline is a date a student can miss.
    const monthConflict = thin.intake_month != null && full.intake_month != null && thin.intake_month !== full.intake_month;
    const dateConflict = INTAKE_DATE_COLS.some((c) => !partialDatesAgree(full[c], thin[c]));
    const milestoneConflict = !isEmpty(thin.custom_dates) && !isEmpty(full.custom_dates) && !sameJson(thin.custom_dates, full.custom_dates);
    if (monthConflict || dateConflict || milestoneConflict) { skipped++; continue; }
    if (dryRun) { merged++; continue; }
    const patch: Record<string, unknown> = {};
    for (const c of INTAKE_DATE_COLS) {
      const winner = morePrecise(thin[c], full[c]);
      if (winner != null && winner !== full[c]) patch[c] = winner;
    }
    if (full.intake_month == null && thin.intake_month != null) patch.intake_month = thin.intake_month;
    if (!isEmpty(thin.custom_dates) && isEmpty(full.custom_dates)) patch.custom_dates = JSON.stringify(thin.custom_dates);
    await masterKnex.transaction(async (trx) => {
      const links = await trx(`${S}.extraction_course_intake_assignments`).where({ intake_id: thin.id }).select("job_id", "course_id");
      for (const l of links) {
        await trx(`${S}.extraction_course_intake_assignments`)
          .insert({ job_id: l.job_id, course_id: l.course_id, intake_id: full.id })
          .onConflict(["course_id", "intake_id"]).ignore();
      }
      await trx(`${S}.extraction_course_intake_assignments`).where({ intake_id: thin.id }).delete();
      if (Object.keys(patch).length) await trx(`${S}.extraction_intakes`).where({ id: full.id }).update(patch);
      await trx(`${S}.extraction_intakes`).where({ id: thin.id }).delete();
    });
    merged++;
  }
  return [merged, skipped];
}

const FEE_IDENTITY_COLS = ["student_type", "period_type", "fee_type_id"] as const;
const FEE_COLS = ["id", "name", "total_amount", "updated_by_platform_user_id", "installments", "description", ...FEE_IDENTITY_COLS];

/** Merge currencyless fees into their single priced twin — same name, amount, AND fee identity. */
async function mergeThinFeeTwins(jobId: string, dryRun: boolean): Promise<[number, number]> {
  const thins = await masterKnex(`${S}.extraction_course_fees`)
    .where({ job_id: jobId }).whereNotNull("total_amount")
    .where((qb) => { qb.whereNull("currency").orWhereRaw("trim(currency) = ''"); })
    .select(FEE_COLS);
  let merged = 0;
  let skipped = 0;
  for (const thin of thins) {
    if (thin.updated_by_platform_user_id != null) { skipped++; continue; }
    const named = await masterKnex(`${S}.extraction_course_fees`)
      .where({ job_id: jobId }).whereNotNull("currency").whereRaw("trim(currency) <> ''")
      .whereRaw("lower(trim(name)) = lower(trim(:name))", { name: thin.name ?? "" })
      .where({ total_amount: thin.total_amount })
      .select(FEE_COLS);
    // A row disagreeing on who pays it, per what period, or what KIND it is was never this fee —
    // an international fee must not collapse into the same-priced domestic one. Null agrees;
    // stated-and-different disqualifies the row as a candidate entirely.
    const candidates = named.filter((c) =>
      FEE_IDENTITY_COLS.every((col) => thin[col] == null || c[col] == null || String(thin[col]) === String(c[col])));
    if (candidates.length !== 1) { if (candidates.length > 1) skipped++; continue; }
    const full = candidates[0];
    // Details both rows state differently are a human's call, not a coin toss.
    const detailConflict =
      (!isEmpty(thin.installments) && !isEmpty(full.installments) && !sameJson(thin.installments, full.installments)) ||
      (!isEmpty(thin.description) && !isEmpty(full.description) && String(thin.description).trim() !== String(full.description).trim());
    if (detailConflict) { skipped++; continue; }
    if (dryRun) { merged++; continue; }
    const patch: Record<string, unknown> = {};
    for (const col of FEE_IDENTITY_COLS) if (full[col] == null && thin[col] != null) patch[col] = thin[col];
    if (isEmpty(full.description) && !isEmpty(thin.description)) patch.description = thin.description;
    if (isEmpty(full.installments) && !isEmpty(thin.installments)) patch.installments = JSON.stringify(thin.installments);
    await masterKnex.transaction(async (trx) => {
      const links = await trx(`${S}.extraction_course_fee_assignments`).where({ course_fee_id: thin.id }).select("job_id", "course_id");
      for (const l of links) {
        await trx(`${S}.extraction_course_fee_assignments`)
          .insert({ job_id: l.job_id, course_id: l.course_id, course_fee_id: full.id })
          .onConflict(["course_id", "course_fee_id"]).ignore();
      }
      await trx(`${S}.extraction_course_fee_assignments`).where({ course_fee_id: thin.id }).delete();
      if (Object.keys(patch).length) await trx(`${S}.extraction_course_fees`).where({ id: full.id }).update(patch);
      await trx(`${S}.extraction_course_fees`).where({ id: thin.id }).delete();
    });
    merged++;
  }
  return [merged, skipped];
}

const SCORE_COLS = ["overall_score", "listening_score", "reading_score", "writing_score", "speaking_score"] as const;

/**
 * Merge two spellings of ONE English test on one course. Identity comes from sameTest — the same
 * predicate the eligibility engine matches students with — so "IELTS" pairs with "IELTS Academic"
 * while "Cambridge C1" never pairs with "Cambridge C2" (a first-word grouping merged those, which
 * is how an accepted test disappears). Exactly two rows of a cluster, no score contradicting;
 * this table has no updated_by column, so agreement is the only guard it can have.
 */
async function mergeEnglishTestTwins(jobId: string, dryRun: boolean): Promise<[number, number]> {
  const rows = await masterKnex(`${S}.extraction_english_requirements`)
    .where({ job_id: jobId }).whereNotNull("course_id")
    .whereNotNull("test_type_name").whereRaw("trim(test_type_name) <> ''")
    .orderBy("created_at")
    .select("id", "course_id", "test_type_name", ...SCORE_COLS);
  const byCourse = new Map<string, typeof rows>();
  for (const r of rows) { const a = byCourse.get(r.course_id) ?? []; a.push(r); byCourse.set(r.course_id, a); }
  let merged = 0;
  let skipped = 0;
  for (const courseRows of byCourse.values()) {
    const clusters: (typeof rows)[] = [];
    for (const r of courseRows) {
      const home = clusters.find((c) => c.some((m) => sameTest(m.test_type_name, r.test_type_name)));
      if (home) home.push(r); else clusters.push([r]);
    }
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      if (cluster.length > 2) { skipped++; continue; }
      const [a, b] = cluster;
      const contradicts = SCORE_COLS.some((c) => a[c] != null && b[c] != null && String(a[c]).trim() !== String(b[c]).trim());
      if (contradicts) { skipped++; continue; }
      if (dryRun) { merged++; continue; }
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
 * using the same candidate logic, writes nothing, and emits no event. Fill runs FIRST —
 * "September 2026" gains its year and thereby stops being an undated twin.
 *
 * Each pass guards itself: a crash in one must neither stop the next nor erase counts of merges
 * already committed — the report and the event must describe what actually changed, always.
 */
export async function repairDataShape(jobId: string, opts: { dryRun?: boolean } = {}): Promise<RepairReport> {
  const dryRun = opts.dryRun === true;
  const report: RepairReport = { intake_fields_filled: 0, intake_twins_merged: 0, fee_twins_merged: 0, english_twins_merged: 0, assets_excluded: 0, skipped_ambiguous: 0 };
  const guard = async (pass: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (err) { logger.warn(`Data repair pass failed — whole merges only, counts kept`, { jobId, pass, err: String(err) }); }
  };
  await guard("fill", async () => { report.intake_fields_filled = await fillIntakeMonthYear(jobId, dryRun); });
  await guard("intakes", async () => { const [m, s] = await mergeThinIntakeTwins(jobId, dryRun); report.intake_twins_merged = m; report.skipped_ambiguous += s; });
  await guard("fees", async () => { const [m, s] = await mergeThinFeeTwins(jobId, dryRun); report.fee_twins_merged = m; report.skipped_ambiguous += s; });
  await guard("english", async () => { const [m, s] = await mergeEnglishTestTwins(jobId, dryRun); report.english_twins_merged = m; report.skipped_ambiguous += s; });
  await guard("assets", async () => { report.assets_excluded = await excludeAssetSiteUrls(jobId, dryRun); });
  const acted = report.intake_fields_filled + report.intake_twins_merged + report.fee_twins_merged
    + report.english_twins_merged + report.assets_excluded;
  // A dry run must leave NO trace, and so must a run that only RE-COUNTED standing refusals:
  // refusals already live in the shape report; this event exists to record that rows CHANGED.
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
