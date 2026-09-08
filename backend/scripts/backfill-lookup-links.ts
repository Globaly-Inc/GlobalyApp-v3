/**
 * Re-bind already-staged courses onto the platform's closed lists, using the same code the writers
 * use (data-extraction/lib/lookup-catalog.ts) against the live seeded lists. No scrape, no model
 * call — safe to repeat, costs nothing.
 *
 * One-off, run directly (not an npm script — routine link checking is the verify worker's job):
 *   node --import tsx scripts/backfill-lookup-links.ts               dry run — prints what would change
 *   node --import tsx scripts/backfill-lookup-links.ts --apply       writes
 *   node --import tsx scripts/backfill-lookup-links.ts --job <uuid>  restrict to one job
 *
 * Both sides re-bind fully without the model: the qualification is in the course's own name plus
 * the platform's Course Level folds, and the area comes from the subject wording (then the name)
 * through the platform's subject taxonomy. What stays unlinked here is what SHOULD stay unlinked —
 * "Various", "Graduate Studies", a department index page staged as a course — and the verify
 * worker reports it on the job timeline.
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { loadLookupLists } from "../src/modules/superadmin/data-extraction/lib/lookup-catalog.js";
import { resolveCourseLookups } from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";

const apply = process.argv.includes("--apply");
const jobIdx = process.argv.indexOf("--job");
const jobId = jobIdx > -1 ? process.argv[jobIdx + 1] : null;

interface Row {
  id: string; name: string;
  degree_level: string | null; degree_level_code: string | null;
  subject_area: string | null; subject_area_code: string | null;
}

async function main() {
  const lists = await loadLookupLists();
  if (!lists.areas.length || !lists.levels.length) {
    console.error("Lookup lists are empty — run the areas_of_study and degree_levels seeders first.");
    process.exit(1);
  }

  const q = masterKnex("superadmin.extraction_courses")
    .select("id", "name", "degree_level", "degree_level_code", "subject_area", "subject_area_code");
  if (jobId) q.where({ job_id: jobId });
  const rows: Row[] = await q;

  const changes: Array<{ id: string; patch: Record<string, string | null> }> = [];
  const tally = new Map<string, number>();
  const unlinked = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const r of rows) {
    const link = await resolveCourseLookups(r);
    const patch: Record<string, string | null> = {};
    if (link.degree_level !== r.degree_level || link.degree_level_code !== r.degree_level_code) {
      patch.degree_level = link.degree_level;
      patch.degree_level_code = link.degree_level_code;
      bump(tally, `degree level: ${r.degree_level ?? "<null>"} → ${link.degree_level ?? "<null>"}`);
    }
    if (link.subject_area_code !== r.subject_area_code) {
      patch.subject_area_code = link.subject_area_code;
      bump(tally, `area link: ${r.subject_area_code ?? "<null>"} → ${link.subject_area_code ?? "<null>"}`);
    }
    if (!link.degree_level_code && r.degree_level) bump(unlinked, `degree level: ${r.degree_level}`);
    if (!link.subject_area_code && r.subject_area) bump(unlinked, `subject area: ${r.subject_area}`);
    if (Object.keys(patch).length) changes.push({ id: r.id, patch });
  }

  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  console.log(`${rows.length} courses scanned, ${changes.length} would change${apply ? "" : " (dry run — pass --apply to write)"}\n`);
  for (const [k, v] of top(tally, 30)) console.log(`  ${String(v).padStart(5)}  ${k}`);
  console.log(`\nStill unlinked (re-extract the job to link these):`);
  for (const [k, v] of top(unlinked, 20)) console.log(`  ${String(v).padStart(5)}  ${k}`);

  if (apply && changes.length) {
    await masterKnex.transaction(async (trx) => {
      for (const c of changes) {
        await trx("superadmin.extraction_courses").where({ id: c.id }).update({ ...c.patch, updated_at: trx.fn.now() });
      }
    });
    console.log(`\nUpdated ${changes.length} rows.`);
  }
  await masterKnex.destroy();
}

main().catch((err) => { console.error(err); process.exit(1); });
