// Review and repair EVERYTHING already extracted: the same detect→repair→report pass that now runs
// after each extraction, swept over every job in the database.
//
//   npm run repair:extracted-data                 # dry run — prices the repair, writes nothing
//   npm run repair:extracted-data -- --apply      # repair every job (per-job data_repaired events)
//   npm run repair:extracted-data -- --job <uuid> # one job
//
// Division of labour, so this never grows a second copy of the backfill's judgement:
//   - THIS sweep: repairDataShape per job (fill derivable intake dates, merge unambiguous thin
//     twins) and the 14 SHAPE_RULES counted per job into one ranked report.
//   - scripts/eligibility-backfill.ts: everything needing CLUSTERING judgement — English dupes,
//     requirement dupes, intake date-cluster merging. Run it alongside; this report says when.

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../src/modules/superadmin/consts.js";
import { repairDataShape, type RepairReport } from "../src/modules/superadmin/data-extraction/lib/data-repair.js";
import { SHAPE_RULES, countRule } from "../src/modules/superadmin/data-extraction/lib/verification-rules.js";

const apply = process.argv.includes("--apply");
const jobFlag = process.argv.indexOf("--job");
const onlyJob = jobFlag > -1 ? process.argv[jobFlag + 1] : null;

async function main() {
  console.log(apply ? "APPLYING repairs" : "DRY RUN — nothing will be written (pass --apply to repair)");
  const jobs: { id: string; institution_url: string }[] = await masterKnex(`${S}.extraction_jobs`)
    .modify((qb) => { if (onlyJob) qb.where({ id: onlyJob }); })
    .orderBy("created_at").select("id", "institution_url");

  const repairTotals: RepairReport = { intake_fields_filled: 0, intake_twins_merged: 0, fee_twins_merged: 0, english_twins_merged: 0, assets_excluded: 0, skipped_ambiguous: 0 };
  const ruleTotals: Record<string, number> = Object.fromEntries(SHAPE_RULES.map((r) => [r.id, 0]));
  const worst: { url: string; blocking: number }[] = [];

  for (const job of jobs) {
    const r = await repairDataShape(job.id, { dryRun: !apply });
    repairTotals.intake_fields_filled += r.intake_fields_filled;
    repairTotals.intake_twins_merged += r.intake_twins_merged;
    repairTotals.fee_twins_merged += r.fee_twins_merged;
    repairTotals.english_twins_merged += r.english_twins_merged;
    repairTotals.assets_excluded += r.assets_excluded;
    repairTotals.skipped_ambiguous += r.skipped_ambiguous;
    let blocking = 0;
    for (const rule of SHAPE_RULES) {
      const n = await countRule(rule, job.id);
      ruleTotals[rule.id] += n;
      if (rule.severity === "blocking") blocking += n;
    }
    if (blocking > 0) worst.push({ url: job.institution_url, blocking });
  }

  console.log(`\n${jobs.length} job(s) swept.`);
  console.log(`\nREPAIR ${apply ? "(written)" : "(what --apply would do)"}:`);
  console.log(`  ${repairTotals.intake_fields_filled} intake dates filled from their own text`);
  console.log(`  ${repairTotals.intake_twins_merged} undated intake twins merged into their dated row`);
  console.log(`  ${repairTotals.fee_twins_merged} currencyless fee twins merged into their priced row`);
  console.log(`  ${repairTotals.english_twins_merged} same-test English spellings merged (scores complementary, never contradicting)`);
  console.log(`  ${repairTotals.assets_excluded} binary document URLs excluded from crawl lists (.pptx/.docx/… stored active)`);
  console.log(`  ${repairTotals.skipped_ambiguous} left for review — several candidates, contradicting milestones, or admin-edited`);
  console.log(`\nRESIDUE ${apply ? "(after repair)" : "(current state — repair above would reduce it)"}:`);
  for (const rule of SHAPE_RULES) {
    if (ruleTotals[rule.id] === 0) continue;
    console.log(`  ${String(ruleTotals[rule.id]).padStart(6)}  [${rule.severity.padEnd(8)}] ${rule.id} — ${rule.description}`);
  }
  worst.sort((a, b) => b.blocking - a.blocking);
  if (worst.length) {
    console.log(`\nWorst jobs by blocking issues:`);
    for (const w of worst.slice(0, 8)) console.log(`  ${String(w.blocking).padStart(5)}  ${w.url}`);
  }
  console.log(`\nAlso run: npm run eligibility:backfill${apply ? " -- --apply" : ""}  (English/requirement duplicates + intake clustering — judgement this sweep refuses to make)`);
  await masterKnex.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
