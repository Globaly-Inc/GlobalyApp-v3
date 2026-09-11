/**
 * Correct extraction_jobs.total_pages_found/pages_total (the admin UI's "Pages Found" stat)
 * against the REAL row count in extraction_queue for that job.
 *
 * Root cause: 3 of the 4 code paths that queue new pages mid-run (secondary curriculum/fees
 * fetch overflow in extraction-page.worker.ts, and two guided-URL re-run paths in
 * extraction-step.worker.ts) never updated this counter — only the pagination-siblings path did.
 * Fixed going forward (see staging-writer.ts / those two worker files), but that fix only stops
 * FUTURE undercounting — it does nothing for a job whose counter already fell behind before the
 * fix landed and the process restarted. This corrects the existing gap.
 *
 *   node --import tsx scripts/backfill-pages-found.ts --job <id> [--apply]
 *   node --import tsx scripts/backfill-pages-found.ts --all [--apply]
 *
 * No model call, no scrape — pure DB reconciliation, safe to re-run.
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";

const S = "superadmin";
const JOBS = `${S}.extraction_jobs`;
const QUEUE = `${S}.extraction_queue`;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const all = args.includes("--all");
const jobIdx = args.indexOf("--job");
const jobId = jobIdx > -1 ? args[jobIdx + 1] : null;

if (!all && (!jobId || jobId.startsWith("--"))) {
  console.error("usage: backfill-pages-found.ts (--job <id> | --all) [--apply]");
  process.exit(2);
}

async function main() {
  const q = masterKnex(`${JOBS} as j`)
    .join(
      masterKnex(QUEUE).groupBy("job_id").select("job_id", masterKnex.raw("count(*) as real_count")).as("q"),
      "q.job_id", "j.id",
    )
    .whereRaw("q.real_count > COALESCE(j.total_pages_found, 0)")
    .select("j.id", "j.institution_name", "j.total_pages_found", "j.pages_total", "q.real_count");
  if (!all) q.where("j.id", jobId);

  const rows: Array<{ id: string; institution_name: string | null; total_pages_found: number | null; pages_total: number | null; real_count: string }> = await q;

  if (!rows.length) {
    console.log("Nothing to fix — every checked job's Pages Found already matches its real queue count.");
    await masterKnex.destroy();
    return;
  }

  for (const r of rows) {
    const real = Number(r.real_count);
    console.log(
      `  ${apply ? "FIX" : "would fix"} ${r.institution_name ?? r.id}: ` +
      `${r.total_pages_found ?? 0} -> ${real} (queue has ${real} rows)`,
    );
    if (apply) {
      await masterKnex(JOBS).where({ id: r.id }).update({
        total_pages_found: real,
        pages_total: real,
        updated_at: masterKnex.fn.now(),
      });
    }
  }

  console.log(`\n${rows.length} job(s) ${apply ? "corrected" : "would be corrected"}.`);
  if (!apply) console.log("\nDRY RUN — pass --apply to write.");
  await masterKnex.destroy();
}

main().catch((err) => { console.error(err); process.exit(1); });
