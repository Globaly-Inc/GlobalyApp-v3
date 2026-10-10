// Reclassifies courses staged before the writer learnt to tell units from courses and one spelling
// from another, and merges duplicate course rows — the same parser/classifier the writer uses
// (course-name.ts), no schema, no model call. Extracted from scripts/merge-duplicate-courses.ts so
// rerunJob (queue.service.ts) can bring a job's EXISTING courses into line with the current
// pipeline, not just newly-scraped pages: `writeCourse`'s parse/classify/resolve path only guards
// what it writes going forward, it never revisits rows a pre-fix crawl already staged.
//
// units  A "course" whose name or code is already a study unit of the same job, or that carries a
//        unit code and states no award, becomes a unit row (upsertStudyUnit) and the course row is
//        deleted. Institution crawls only — AgentCIS feeds have no units.
// merge  Two rows of one job with the same identity key (or the same own-page URL and award) are one
//        course. The row with its own page, else the oldest, survives; the other's fees, intakes,
//        options, units, requirements, campuses and every reference (enquiries, saved items, page
//        views) move to it, blanks on the survivor are filled, and the loser is deleted.
// flag   A course whose name states no qualification at all sits beside one that does, same subject
//        and specialisation (course-resolver.ts tier 2c — "Data Science" vs "Data Science Graduate
//        Certificate", typically a subject/department hub page beside the programme's real detail
//        page). Never merged — a bare mention can duplicate an undergrad AND a grad programme for
//        the same subject at once, so it is flagged (course_needs_review job event) for a human to
//        resolve, and both rows are kept.
//
// Deletes are real, so every merge writes a course_merged job event naming both rows and the loser's
// name and URL first.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { parseCourseName, UNIT_CODE_RE, canonicalCourseUrl, type ParsedCourseName } from "./course-name.js";
import { upsertStudyUnit, jobCourseIndex, writeJobEvent } from "./staging-writer.js";
import { resolveCourse, type CandidateRow } from "./course-resolver.js";

const K = (t: string) => masterKnex(`${S}.${t}`);

interface CourseRow { id: string; job_id: string; name: string; source_url: string | null; created_at: Date; [k: string]: unknown }

const ASSIGNMENTS: Array<[string, string]> = [
  ["extraction_course_fee_assignments", "course_fee_id"],
  ["extraction_course_intake_assignments", "intake_id"],
  ["extraction_course_study_option_assignments", "study_option_id"],
  ["extraction_course_study_unit_assignments", "study_unit_id"],
  ["extraction_course_eligibility_assignments", "eligibility_requirement_id"],
  ["extraction_course_accreditation_assignments", "extraction_accreditation_id"],
  // Missing when scholarships (migration 20260924_001) shipped after this list was written — the
  // loser's extraction_course_scholarship_assignments rows have course_id ON DELETE CASCADE, so
  // without re-pointing them first, a scholarship linked only to the row being deleted was silently
  // dropped rather than carried over to the survivor (Greptile).
  ["extraction_course_scholarship_assignments", "scholarship_id"],
];
const FILL_FIELDS = ["short_name", "course_category", "subject_area", "duration_weeks", "study_mode", "description",
  "awarding_institution", "country_code", "degree_level", "degree_level_code", "subject_area_code", "career_paths"];

export async function reclassifyUnits(
  job: { id: string; source_type: string },
  opts: { apply: boolean },
): Promise<{ reclassified: number; sample: string[] }> {
  if (job.source_type === "agentcis") return { reclassified: 0, sample: [] };
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
    // A reclassify has nowhere to re-point a reference to (unlike mergeInto's winner/loser
    // pair) — it deletes the course row outright, so anything still referencing it must block
    // the delete, not just enquiries. saved_items was missing here: the row would go on
    // pointing at a deleted course_id, silently dropping it from that user's Saved list
    // instead of erroring (Greptile).
    const [hasEnquiry, hasSave] = await Promise.all([
      masterKnex("enquiries").where({ course_id: c.id }).first("id"),
      masterKnex("saved_items").where({ item_type: "course", item_id: c.id }).first("id"),
    ]);
    const blocked = hasEnquiry || hasSave;
    reclassified++;
    if (sample.length < 15) {
      const why = hasEnquiry && hasSave ? "has enquiries and is saved" : hasEnquiry ? "has enquiries" : hasSave ? "is saved by a user" : null;
      sample.push(`${c.name}  [${knownUnit ? "already a unit" : "unit code"}${why ? `, ${why}: kept` : ""}]`);
    }
    if (!opts.apply || blocked) continue;
    const unitId = await upsertStudyUnit(job.id, {
      unit_code: code, unit_name: c.name.replace(/^[A-Z]{2,4}[ -]?\d{3,4}[A-Z]?\s*[-–:]\s*/, "").trim() || c.name, description: (c.description as string) ?? null,
    });
    await masterKnex.transaction(async (trx) => {
      await trx(`${S}.extraction_job_events`).insert({
        job_id: job.id, kind: "entity_reclassified", level: "info", phase: "courses",
        message: `"${c.name}" moved from courses to study units (cleanup)`,
        data: JSON.stringify({ course_id: c.id, unit_id: unitId, name: c.name, url: c.source_url, source: "course-dedup" }),
      });
      // page_views is a polymorphic (entity_type, entity_id) table with no FK to
      // extraction_courses, so it does NOT cascade with the delete below — unlike mergeInto,
      // there's no surviving course to fold this view count onto (reclassifying to a study unit
      // isn't a merge), so the row is just cleaned up here rather than left orphaned pointing at
      // an id that no longer exists (Greptile).
      await trx("page_views").where({ entity_type: "course", entity_id: c.id }).delete();
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
      data: JSON.stringify({ winner_id: winner.id, loser_id: loser.id, loser_name: loser.name, loser_url: loser.source_url, reason, source: "course-dedup" }),
    });
    await T("extraction_courses").where({ id: loser.id }).delete();
  });
}

export async function mergeDuplicateCourses(
  job: { id: string; institution_url: string },
  opts: { apply: boolean },
): Promise<{ groups: number; losers: number; sample: string[] }> {
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
        if (opts.apply) await mergeInto(winner, loser, reason);
      }
    }
  };
  await run(byKey, "same identity");
  await run(byUrl, "same own page");
  return { groups, losers, sample };
}

async function alreadyFlaggedForReview(jobId: string, name: string, candidateId: string): Promise<boolean> {
  const row = await K("extraction_job_events")
    .where({ job_id: jobId, kind: "course_needs_review" })
    .andWhereRaw(`data->>'name' = ?`, [name])
    .andWhereRaw(`data->>'candidate_id' = ?`, [candidateId])
    .first("id");
  return !!row;
}

function toParsedCourseName(c: CandidateRow): ParsedCourseName {
  return {
    qualifier: c.qualifier_norm, subject: c.subject_norm ?? "", specialisation: c.specialisation_norm,
    flags: c.variant_flags ?? [], code: c.course_code, dual: false, key: c.name_key ?? "",
  };
}

// Replays a job's courses through resolveCourse in `created_at` order, each one resolved only
// against courses already "seen" earlier in the replay — matching what would have happened had
// tier 2c existed at write time. Candidates come from jobCourseIndex, the SAME builder writeCourse
// itself uses, so a URL shared by several courses on one catalogue/list page is correctly excluded
// from "own page" identity here too. Idempotent: a (name, candidate) pair already flagged is skipped
// — checked against data.name + data.candidate_id, the only fields both this and the live writer's
// course_needs_review events actually carry.
export async function flagQualifierGapDuplicates(
  job: { id: string; institution_url: string | null },
  opts: { apply: boolean },
): Promise<{ flagged: number; sample: string[] }> {
  const index = await jobCourseIndex(job.id, job.institution_url);
  const raw: Array<{ id: string; name: string; source_url: string | null; created_at: Date }> =
    await K("extraction_courses").where({ job_id: job.id }).select("id", "name", "source_url", "created_at");
  const rawById = new Map(raw.map((r) => [r.id, r]));
  const ordered = index.slice().sort((a, b) =>
    (rawById.get(a.id)?.created_at.getTime() ?? 0) - (rawById.get(b.id)?.created_at.getTime() ?? 0));

  let flagged = 0;
  const sample: string[] = [];
  const seen: CandidateRow[] = [];
  for (const cand of ordered) {
    const self = rawById.get(cand.id)!;
    const res = resolveCourse({ jobId: job.id, parsed: toParsedCourseName(cand), canonicalUrl: cand.canonical_url }, seen);
    if (res.outcome === "possible_duplicate" && res.reason === "qualifier_missing_one_side") {
      const matches = res.matches?.length ? res.matches : (res.match ? [res.match] : []);
      for (const m of matches) {
        if (await alreadyFlaggedForReview(job.id, self.name, m.id)) continue;
        flagged++;
        if (sample.length < 25) sample.push(`${self.name}  <->  ${rawById.get(m.id)?.name ?? m.name_key}`);
        if (opts.apply) {
          await writeJobEvent(job.id, "course_needs_review", {
            phase: "courses", level: "warn",
            message: `"${self.name}" flagged against an earlier course (possible_duplicate:qualifier_missing_one_side) [backfill]`,
            data: {
              name: self.name, reason: "possible_duplicate:qualifier_missing_one_side",
              candidate_id: m.id, url: self.source_url ?? null, source: "course-dedup",
            },
          });
        }
      }
    }
    seen.push(cand);
  }
  return { flagged, sample };
}
