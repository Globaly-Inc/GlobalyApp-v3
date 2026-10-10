/**
 * Flag already-staged courses for review under resolver tier 2c (course-resolver.ts: same subject +
 * specialisation, qualifier stated on only one side — the "Data Science" vs "Data Science Graduate
 * Certificate" shape). Never merges or deletes anything. The actual pass lives in
 * src/modules/superadmin/data-extraction/lib/course-dedup.ts, which rerunJob also calls. Dry run by
 * default.
 *
 *   node --import tsx scripts/backfill-course-review-flags.ts                dry run
 *   node --import tsx scripts/backfill-course-review-flags.ts --apply        writes events
 *   node --import tsx scripts/backfill-course-review-flags.ts --job <uuid>   one job
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { flagQualifierGapDuplicates } from "../src/modules/superadmin/data-extraction/lib/course-dedup.js";

const apply = process.argv.includes("--apply");
const jobIdx = process.argv.indexOf("--job");
const onlyJob = jobIdx > -1 ? process.argv[jobIdx + 1] : null;
const S = "superadmin";

async function main() {
  const jobs: Array<{ id: string; institution_url: string | null }> = await masterKnex(`${S}.extraction_jobs`)
    .select("id", "institution_url")
    .modify((q) => { if (onlyJob) q.where({ id: onlyJob }); });

  let flagged = 0;
  const sample: string[] = [];
  for (const job of jobs) {
    const r = await flagQualifierGapDuplicates(job, { apply });
    flagged += r.flagged;
    sample.push(...r.sample.slice(0, 25 - sample.length));
  }

  console.log(`${jobs.length} jobs scanned.`);
  console.log(`${flagged} course pairs ${apply ? "" : "would be "}flagged for review (qualifier_missing_one_side).`);
  for (const s of sample) console.log(" - " + s);
  if (!apply) console.log("\nDry run — pass --apply to write.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => masterKnex.destroy());
