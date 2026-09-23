/**
 * Clean up courses already staged before the writer learnt to tell units from courses and one
 * spelling from another. Uses the SAME parser/classifier as the writer (data-extraction/lib), no
 * schema, no model call. Dry run by default.
 *
 *   node --import tsx scripts/merge-duplicate-courses.ts                dry run — counts + samples
 *   node --import tsx scripts/merge-duplicate-courses.ts --apply        writes
 *   node --import tsx scripts/merge-duplicate-courses.ts --job <uuid>   one job
 *   node --import tsx scripts/merge-duplicate-courses.ts --pass units|merge
 *
 * units  A "course" whose name or code is already a study unit of the same job, or that carries a
 *        unit code and states no award, becomes a unit row (upsertStudyUnit) and the course row is
 *        deleted. Institution crawls only — AgentCIS feeds have no units.
 * merge  Two rows of one job with the same identity key (or the same own-page URL and award) are one
 *        course. The row with its own page, else the oldest, survives; the other's fees, intakes,
 *        options, units, requirements, campuses and every reference (enquiries, saved items, page
 *        views) move to it, blanks on the survivor are filled, and the loser is deleted.
 *
 * Deletes are real, so every merge writes a course_merged job event naming both rows and the loser's
 * name and URL first.
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { parseCourseName, UNIT_CODE_RE, canonicalCourseUrl } from "../src/modules/superadmin/data-extraction/lib/course-name.js";
import { upsertStudyUnit } from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";

const apply = process.argv.includes("--apply");
const jobIdx = process.argv.indexOf("--job");
const onlyJob = jobIdx > -1 ? process.argv[jobIdx + 1] : null;
const passIdx = process.argv.indexOf("--pass");
const onlyPass = passIdx > -1 ? process.argv[passIdx + 1] : null;
const S = "superadmin";
const K = (t: string) => masterKnex(`${S}.${t}`);

interface CourseRow { id: string; job_id: string; name: string; source_url: string | null; created_at: Date; [k: string]: unknown }

const ASSIGNMENTS: Array<[string, string]> = [
  ["extraction_course_fee_assignments", "course_fee_id"],
  ["extraction_course_intake_assignments", "intake_id"],
  ["extraction_course_study_option_assignments", "study_option_id"],
  ["extraction_course_study_unit_assignments", "study_unit_id"],
  ["extraction_course_eligibility_assignments", "eligibility_requirement_id"],
  ["extraction_course_accreditation_assignments", "extraction_accreditation_id"],
];
const FILL_FIELDS = ["short_name", "course_category", "subject_area", "duration_weeks", "study_mode", "description",
  "awarding_institution", "country_code", "degree_level", "degree_level_code", "subject_area_code", "career_paths"];

async function passUnits(job: { id: string; source_type: string }) {
  if (job.source_type === "agentcis") return { reclassified: 0, sample: [] as string[] };
  const units: Array<{ unit_code: string | null; unit_name: string }> = await K("extraction_study_units").where({ job_id: job.id }).select("unit_code", "unit_name");
  const codes = new Set(units.map((u) => u.unit_code?.replace(/[\s-]/g, "").toUpperCase()).filter(Boolean));
  const names = new Set(units.map((u) => u.unit_name.trim().toLowerCase().replace(/\s+/g, " ")));
  const courses: CourseRow[] = await K("extraction_courses").where({ job_id: job.id }).select("*");
  const sample: string[] = [];
  let reclassified = 0;
  for (const c of courses) {
    if (parseCourseName(c.name).qualifier) continue; // a stated award is never a unit
    const m = c.name.toUpperCase().match(UNIT_CODE_RE);
    const code = m?.[1] ? `${m[1]}${m[2]}${m[3] ?? ""}` : null;
    const knownUnit = (!!code && codes.has(code)) || names.has(c.name.trim().toLowerCase().replace(/\s+/g, " "));
    if (!knownUnit && !code) continue;
    const blocked = await masterKnex("enquiries").where({ course_id: c.id }).first("id");
    reclassified++;
    if (sample.length < 15) sample.push(`${c.name}  [${knownUnit ? "already a unit" : "unit code"}${blocked ? ", has enquiries: kept" : ""}]`);
    if (!apply || blocked) continue;
    const unitId = await upsertStudyUnit(job.id, {
      unit_code: code, unit_name: c.name.replace(/^[A-Z]{2,4}[ -]?\d{3,4}[A-Z]?\s*[-–:]\s*/, "").trim() || c.name, description: (c.description as string) ?? null,
    });
    await masterKnex.transaction(async (trx) => {
      await trx(`${S}.extraction_job_events`).insert({
        job_id: job.id, kind: "entity_reclassified", level: "info", phase: "courses",
        message: `"${c.name}" moved from courses to study units (cleanup)`,
        data: JSON.stringify({ course_id: c.id, unit_id: unitId, name: c.name, url: c.source_url, source: "merge-duplicate-courses" }),
      });
      await trx(`${S}.extraction_courses`).where({ id: c.id }).delete(); // child rows cascade
    });
  }
  return { reclassified, sample };
}

// One transaction per merge: every re-point and the delete commit together or not at all.
// saved_items is unique on (user, type, item) and page_views on (type, entity), so a user who saved
// both duplicates, or two rows that were both viewed, are folded rather than re-pointed blindly.
async function mergeInto(winner: CourseRow, loser: CourseRow, reason: string) {
  await masterKnex.transaction(async (trx) => {
    const T = (t: string) => trx(`${S}.${t}`);
    const fill: Record<string, unknown> = {};
    for (const f of FILL_FIELDS) if ((winner[f] == null || winner[f] === "") && loser[f] != null && loser[f] !== "") fill[f] = loser[f];
    if (Object.keys(fill).length) await T("extraction_courses").where({ id: winner.id }).update({ ...fill, updated_at: trx.fn.now() });
    for (const [table, col] of ASSIGNMENTS) {
      await trx.raw(
        `insert into ${S}.${table} (job_id, course_id, ${col}) select job_id, ?, ${col} from ${S}.${table} where course_id = ?
         on conflict (course_id, ${col}) do nothing`, [winner.id, loser.id]);
    }
    await trx.raw(
      `insert into ${S}.extraction_course_campuses (job_id, course_id, campus_id, campus_name, campus_email)
         select l.job_id, ?, l.campus_id, l.campus_name, l.campus_email from ${S}.extraction_course_campuses l
          where l.course_id = ? and not exists (select 1 from ${S}.extraction_course_campuses w where w.course_id = ? and w.campus_id = l.campus_id)`,
      [winner.id, loser.id, winner.id]);
    for (const table of ["extraction_english_requirements", "extraction_verification_results", "extraction_intakes"]) {
      await T(table).where({ course_id: loser.id }).update({ course_id: winner.id });
    }
    await trx("enquiries").where({ course_id: loser.id }).update({ course_id: winner.id });
    // A user who saved both keeps one; only rows with no counterpart on the winner move.
    await trx.raw(
      `delete from saved_items l using saved_items w
        where l.item_type = 'course' and l.item_id = ? and w.item_type = 'course' and w.item_id = ? and w.platform_user_id = l.platform_user_id`,
      [loser.id, winner.id]);
    await trx("saved_items").where({ item_type: "course", item_id: loser.id }).update({ item_id: winner.id });
    // Views add up; the loser's counter row is folded into the winner's, or renamed if there is none.
    await trx.raw(
      `update page_views w set views = w.views + l.views, updated_at = now() from page_views l
        where w.entity_type = 'course' and w.entity_id = ? and l.entity_type = 'course' and l.entity_id = ?`,
      [winner.id, loser.id]);
    await trx.raw(
      `delete from page_views l using page_views w
        where l.entity_type = 'course' and l.entity_id = ? and w.entity_type = 'course' and w.entity_id = ?`,
      [loser.id, winner.id]);
    await trx("page_views").where({ entity_type: "course", entity_id: loser.id }).update({ entity_id: winner.id });
    await T("extraction_job_events").insert({
      job_id: winner.job_id, kind: "course_merged", level: "info", phase: "courses",
      message: `"${loser.name}" merged into "${winner.name}" (${reason})`,
      data: JSON.stringify({ winner_id: winner.id, loser_id: loser.id, loser_name: loser.name, loser_url: loser.source_url, reason, source: "merge-duplicate-courses" }),
    });
    await T("extraction_courses").where({ id: loser.id }).delete();
  });
}

async function passMerge(job: { id: string; institution_url: string }) {
  const courses: CourseRow[] = await K("extraction_courses").where({ job_id: job.id }).orderBy("created_at").select("*");
  const perUrl = new Map<string, number>();
  for (const c of courses) if (c.source_url) perUrl.set(c.source_url, (perUrl.get(c.source_url) ?? 0) + 1);
  const own = (c: CourseRow) => c.source_url && perUrl.get(c.source_url) === 1 ? canonicalCourseUrl(c.source_url, job.institution_url) : null;
  const byKey = new Map<string, CourseRow[]>();
  const byUrl = new Map<string, CourseRow[]>();
  for (const c of courses) {
    const p = parseCourseName(c.name);
    byKey.set(p.key, [...(byKey.get(p.key) ?? []), c]);
    const u = own(c);
    if (u) byUrl.set(`${u}|${p.qualifier ?? ""}`, [...(byUrl.get(`${u}|${p.qualifier ?? ""}`) ?? []), c]);
  }
  const gone = new Set<string>();
  const sample: string[] = [];
  let groups = 0, losers = 0;
  const run = async (buckets: Map<string, CourseRow[]>, reason: string) => {
    for (const rows of buckets.values()) {
      const live = rows.filter((r) => !gone.has(r.id));
      if (live.length < 2) continue;
      if (new Set(live.map((r) => parseCourseName(r.name).code).filter(Boolean)).size > 1) continue; // two codes, two courses
      const winner = live.slice().sort((a, b) => Number(!!own(b)) - Number(!!own(a)) || a.created_at.getTime() - b.created_at.getTime())[0];
      groups++;
      for (const loser of live) {
        if (loser.id === winner.id) continue;
        losers++; gone.add(loser.id);
        if (sample.length < 20) sample.push(`${loser.name}  ->  ${winner.name}  [${reason}]`);
        if (apply) await mergeInto(winner, loser, reason);
      }
    }
  };
  await run(byKey, "same identity");
  await run(byUrl, "same own page");
  return { groups, losers, sample };
}

async function main() {
  const jobs: Array<{ id: string; institution_url: string; source_type: string }> = await K("extraction_jobs")
    .select("id", "institution_url", "source_type").modify((q) => { if (onlyJob) q.where({ id: onlyJob }); });
  const want = (p: string) => !onlyPass || onlyPass === p;
  let units = 0, mergeGroups = 0, mergeLosers = 0;
  const samples: Record<string, string[]> = { units: [], merge: [] };
  for (const job of jobs) {
    if (want("units")) { const r = await passUnits(job); units += r.reclassified; samples.units.push(...r.sample.slice(0, 25 - samples.units.length)); }
    if (want("merge")) { const r = await passMerge(job); mergeGroups += r.groups; mergeLosers += r.losers; samples.merge.push(...r.sample.slice(0, 25 - samples.merge.length)); }
  }
  const verb = apply ? "" : "would be ";
  console.log(`\n${jobs.length} jobs scanned.`);
  console.log(`units: ${units} courses ${verb}moved to study units`);
  console.log(`merge: ${mergeLosers} rows ${verb}merged into ${mergeGroups} survivors`);
  for (const [k, s] of Object.entries(samples)) if (s.length) { console.log(`\n-- ${k} sample --`); for (const x of s) console.log("  " + x); }
  if (!apply) console.log("\nDry run — pass --apply to write.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => masterKnex.destroy());
