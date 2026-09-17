/**
 * Backfill study units onto already-staged courses, from the catalogue's own markup.
 *
 *   node --import tsx scripts/backfill-study-units.ts --job <id> [--apply] [--concurrency 4]
 *   node --import tsx scripts/backfill-study-units.ts --all [--apply]
 *
 * NO model call. The curriculum comes from `table.sc_courselist` — the CourseLeaf shape used by
 * Johns Hopkins, Georgia Tech and much of the US sector — via lib/courselist-parser.ts, so this
 * is free to re-run and its output is exact rather than inferred. Same family as
 * scripts/backfill-lookup-links.ts: it re-derives what the pipeline should have written without
 * re-running the pipeline.
 *
 * Why it exists: a course staged from a catalogue INDEX page has no curriculum on its source
 * page, and the pipeline reached the course's own page only when the model happened to flag a
 * `curriculum_page_url`. On the Johns Hopkins job it flagged none, so 18 of 19 courses were
 * staged with the index as their source_url and no units at all — while the index carried an
 * exact-name link to every one of them. This resolves that link from the markup and parses the
 * page it points at.
 *
 * Writes go through upsertStudyUnit and filterStudyUnits, the same functions writeCourse uses,
 * so dedupe, the plausibility gate, unit_type and description behave identically.
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { scrapeRenderedHtml } from "../src/modules/superadmin/data-extraction/lib/scraper.js";
import {
  courseLinksByName, looksLikeCourseList, parseCourseList,
} from "../src/modules/superadmin/data-extraction/lib/courselist-parser.js";
import {
  filterStudyUnits, normaliseCourseName, upsertStudyUnit,
} from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";

const S = "superadmin";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const all = args.includes("--all");
const jobId = args[args.indexOf("--job") + 1];
const concurrency = Math.max(1, Number(args[args.indexOf("--concurrency") + 1]) || 4);

if (!all && (args.indexOf("--job") < 0 || !jobId || jobId.startsWith("--"))) {
  console.error("usage: backfill-study-units.ts (--job <id> | --all) [--apply] [--concurrency 4]");
  process.exit(2);
}

interface Row { id: string; job_id: string; name: string; source_url: string | null }

/** Fetched HTML per URL — a catalogue index is the source_url of every course staged from it. */
const htmlCache = new Map<string, string | null>();
async function html(url: string): Promise<string | null> {
  if (htmlCache.has(url)) return htmlCache.get(url)!;
  let out: string | null = null;
  try {
    const r = await scrapeRenderedHtml(url);
    out = r.html || null;
  } catch (err) {
    console.error(`  fetch failed ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  htmlCache.set(url, out);
  return out;
}

/** Run `work` over `items` with a fixed number of workers — 9s a fetch adds up over a catalogue. */
async function pool<T>(items: T[], n: number, work: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await work(items[i++]);
  }));
}

async function main() {
  const q = masterKnex(`${S}.extraction_courses as c`)
    .whereNotExists(
      masterKnex(`${S}.extraction_course_study_unit_assignments as a`)
        .whereRaw("a.course_id = c.id").select(masterKnex.raw("1")),
    )
    .whereNotNull("c.source_url")
    .select("c.id", "c.job_id", "c.name", "c.source_url");
  if (!all) q.where("c.job_id", jobId);
  const courses: Row[] = await q;

  console.log(`courses with no study units: ${courses.length}${all ? " (all jobs)" : ` (job ${jobId})`}`);
  if (!courses.length) { await masterKnex.destroy(); return; }

  // A page that is ABOUT one course carries that course's curriculum; a page that is the source
  // of several is an index, and each course's own page has to be resolved from its anchors.
  const perSource = new Map<string, Row[]>();
  for (const c of courses) {
    const key = c.source_url!;
    perSource.set(key, [...(perSource.get(key) ?? []), c]);
  }

  let resolved = 0, parsed = 0, written = 0, unitRows = 0, gated = 0;
  const misses: string[] = [];

  for (const [sourceUrl, group] of perSource) {
    const indexHtml = await html(sourceUrl);
    if (!indexHtml) { misses.push(...group.map((c) => `${c.name} (source unreachable)`)); continue; }
    const links = courseLinksByName(indexHtml, sourceUrl);
    // The source page's own table, usable only when this page is about exactly one course.
    const ownTable = group.length === 1 && looksLikeCourseList(indexHtml)
      ? parseCourseList(indexHtml).units
      : [];

    await pool(group, concurrency, async (course) => {
      let units = ownTable;
      if (!units.length) {
        const own = links.get(normaliseCourseName(course.name));
        if (!own || own === sourceUrl) { misses.push(`${course.name} (no own-page link)`); return; }
        resolved++;
        const page = await html(own);
        if (!page || !looksLikeCourseList(page)) { misses.push(`${course.name} (no course list on its page)`); return; }
        units = parseCourseList(page).units;
      }
      if (!units.length) { misses.push(`${course.name} (course list empty)`); return; }
      parsed++;

      // The same gate writeCourse applies. Course names of this job come from the database so a
      // programme index parsed as a curriculum is caught here too.
      const clash: Array<{ k: string }> = await masterKnex(`${S}.extraction_courses`)
        .where({ job_id: course.job_id })
        .whereRaw(
          "regexp_replace(regexp_replace(lower(trim(name)), '\\s+', ' ', 'g'), '[^a-z0-9]+$', '') = ANY(?)",
          [[...new Set(units.map((u) => normaliseCourseName(u.unit_name ?? "")).filter(Boolean))]],
        )
        .select(masterKnex.raw(
          "regexp_replace(regexp_replace(lower(trim(name)), '\\s+', ' ', 'g'), '[^a-z0-9]+$', '') as k",
        ));
      const programmeNames = new Set(clash.map((r) => r.k));
      const { kept, dropped } = filterStudyUnits(units, course.name, (k) => programmeNames.has(k));
      gated += dropped.length;
      if (!kept.length) { misses.push(`${course.name} (all ${dropped.length} rejected by the gate)`); return; }

      console.log(`  ${apply ? "WRITE" : "would write"} ${String(kept.length).padStart(3)} units → ${course.name}`);
      if (!apply) { written++; unitRows += kept.length; return; }

      for (const unit of kept) {
        const unitId = await upsertStudyUnit(course.job_id, unit);
        await masterKnex(`${S}.extraction_course_study_unit_assignments`)
          .insert({ job_id: course.job_id, course_id: course.id, study_unit_id: unitId })
          .onConflict(["course_id", "study_unit_id"]).ignore();
        unitRows++;
      }
      written++;
      await masterKnex(`${S}.extraction_courses`)
        .where({ id: course.id })
        .update({ updated_at: masterKnex.fn.now() });
    });
  }

  console.log(`\nsource pages fetched   ${htmlCache.size}`);
  console.log(`own-page links used    ${resolved}`);
  console.log(`curricula parsed       ${parsed}`);
  console.log(`courses ${apply ? "written" : "that would be written"}  ${written}`);
  console.log(`unit links             ${unitRows}`);
  console.log(`rejected by the gate   ${gated}`);
  if (misses.length) {
    console.log(`\nnot filled (${misses.length}):`);
    for (const m of misses) console.log(`  · ${m}`);
  }
  if (!apply) console.log("\nDRY RUN — pass --apply to write.");
  await masterKnex.destroy();
}

main().catch((err) => { console.error(err); process.exit(1); });
