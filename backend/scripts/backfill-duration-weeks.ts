/**
 * One-off: fill extraction_courses.duration_weeks and country_code from data already staged —
 * no scraping, no model calls. Audit 2026-09-04: 221 of 1,918 courses had a duration while 126 of the rest had
 * a study option stating it, and more carry it in their description.
 *
 * Sources, in order (same resolver the writers use — staging-writer.ts resolveDurationWeeks):
 *   1. the course's study options: shortest full-time option, else shortest of any;
 *   2. a duration cue in the description ("delivered over three years", "two-year MSc").
 * Also repairs the years-as-weeks slip: a course stored with duration_weeks < 12 whose own
 * study option states the SAME number in years or months (3 weeks vs "3 years") takes the
 * option's value. Nothing else already filled is touched.
 *
 * Run:  node --import tsx scripts/backfill-duration-weeks.ts            (dry run)
 *       node --import tsx scripts/backfill-duration-weeks.ts --apply    (writes)
 *       add --job <uuid> to restrict to one job
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import {
  weeksFromStudyOptions, durationFromProse, durationToWeeks, coerceMoney, normaliseDurationUnit,
  type ExtractedStudyOption,
} from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";
import { resolveCountryCode } from "../src/modules/superadmin/data-extraction/lib/lookup-catalog.js";

const apply = process.argv.includes("--apply");
const jobIdx = process.argv.indexOf("--job");
const jobId = jobIdx > -1 ? process.argv[jobIdx + 1] : null;

interface CourseRow { id: string; name: string; description: string | null; duration_weeks: number | null }
interface OptionRow { course_id: string; name: string | null; study_load: string | null; duration_value: number | string | null; duration_unit: string | null }

async function main() {
  const courses = masterKnex("superadmin.extraction_courses").select("id", "name", "description", "duration_weeks");
  if (jobId) courses.where({ job_id: jobId });
  const rows: CourseRow[] = await courses;

  // All options for these courses in one query, grouped in memory.
  const options: OptionRow[] = await masterKnex("superadmin.extraction_course_study_option_assignments as a")
    .join("superadmin.extraction_study_options as o", "o.id", "a.study_option_id")
    .whereIn("a.course_id", rows.map((r) => r.id))
    .whereNotNull("o.duration_value")
    .select("a.course_id", "o.name", "o.study_load", "o.duration_value", "o.duration_unit");
  const byCourse = new Map<string, ExtractedStudyOption[]>();
  for (const o of options) {
    const list = byCourse.get(o.course_id) ?? [];
    list.push({ name: o.name, study_load: o.study_load, duration_value: o.duration_value, duration_unit: o.duration_unit });
    byCourse.set(o.course_id, list);
  }

  const changes: Array<{ id: string; name: string; from: number | null; to: number; source: string }> = [];
  for (const c of rows) {
    const opts = byCourse.get(c.id);
    if (c.duration_weeks == null) {
      const fromOptions = weeksFromStudyOptions(opts);
      if (fromOptions) { changes.push({ id: c.id, name: c.name, from: null, to: fromOptions, source: "study_options" }); continue; }
      const prose = durationFromProse(c.description);
      const fromProse = prose ? durationToWeeks(prose.value, prose.unit) : null;
      if (fromProse) changes.push({ id: c.id, name: c.name, from: null, to: fromProse, source: "description" });
      continue;
    }
    // Repair: "3" stored as weeks while the option says 3 years / 3 months.
    if (c.duration_weeks < 12 && opts?.length) {
      const sameNumber = opts.find((o) => coerceMoney(o.duration_value) === c.duration_weeks
        && ["years", "months", "semesters"].includes(normaliseDurationUnit(o.duration_unit) ?? ""));
      if (sameNumber) {
        const fixed = durationToWeeks(coerceMoney(sameNumber.duration_value), normaliseDurationUnit(sameNumber.duration_unit));
        if (fixed && fixed !== c.duration_weeks) changes.push({ id: c.id, name: c.name, from: c.duration_weeks, to: fixed, source: "unit_repair" });
      }
    }
  }

  const bySource = new Map<string, number>();
  for (const ch of changes) bySource.set(ch.source, (bySource.get(ch.source) ?? 0) + 1);
  const empty = rows.filter((r) => r.duration_weeks == null).length;
  console.log(`${rows.length} courses scanned, ${empty} without a duration, ${changes.length} would change${apply ? "" : " (dry run — pass --apply to write)"}`);
  for (const [k, v] of bySource) console.log(`  ${String(v).padStart(5)}  ${k}`);
  for (const ch of changes.slice(0, 12)) console.log(`  e.g. ${ch.name.slice(0, 60)}  [${ch.from ?? "null"} → ${ch.to} weeks, ${ch.source}]`);
  console.log(`  ${empty - changes.filter((c) => c.from == null).length} still empty — a rerun with duration_text in the prompt fills those from the page`);

  if (apply && changes.length) {
    await masterKnex.transaction(async (trx) => {
      for (const ch of changes) {
        await trx("superadmin.extraction_courses").where({ id: ch.id }).update({ duration_weeks: ch.to, updated_at: trx.fn.now() });
      }
    });
    console.log(`Updated ${changes.length} rows.`);
  }
  await backfillCountry();
  await masterKnex.destroy();
}

/**
 * country_code comes from the job's site intelligence, so it is one value per job rather than per
 * course. Resolved through the same function the writer uses, so "UK" lands as GB — the public
 * search joins on upper(countries.iso2), and an unresolvable country stays null.
 */
async function backfillCountry() {
  const jobs = masterKnex("superadmin.extraction_site_intelligence as si")
    .join("superadmin.extraction_jobs as j", "j.id", "si.job_id")
    .whereNotNull("si.country")
    .orderBy("si.created_at", "desc")
    .select("si.job_id", "si.country");
  if (jobId) jobs.where("si.job_id", jobId);

  let filled = 0;
  const unresolved = new Set<string>();
  const perJob = new Map<string, string>();
  for (const { job_id, country } of await jobs) if (!perJob.has(job_id)) perJob.set(job_id, country);
  for (const [job_id, country] of perJob) {
    const iso2 = await resolveCountryCode(country);
    if (!iso2) { unresolved.add(country); continue; }
    const q = masterKnex("superadmin.extraction_courses").where({ job_id }).whereNull("country_code");
    if (!apply) { filled += Number((await q.count({ n: "*" }))[0].n); continue; }
    filled += await q.update({ country_code: iso2, updated_at: masterKnex.fn.now() });
  }
  console.log(`\ncountry_code: ${filled} courses ${apply ? "updated" : "would be filled"}`);
  if (unresolved.size) console.log(`  unresolved site countries (left null): ${[...unresolved].join(", ")}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
