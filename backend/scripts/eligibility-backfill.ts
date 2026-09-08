/**
 * Repair eligibility + intake data already in the database, without re-crawling.
 *
 *   npm run eligibility:backfill                  # dry run — reports, changes nothing
 *   npm run eligibility:backfill -- --apply       # write the changes
 *   npm run eligibility:backfill -- --apply --job <uuid>   # one job only
 *   npm run eligibility:backfill -- --refresh-tests        # re-derive academic_tests even where
 *                                                          # this script already wrote some
 *
 * Why a script and not a migration: it rewrites live public data (course pages read the
 * extraction tables directly — there is no separate courses catalogue), so it must be run
 * deliberately and read before it is applied, not fire silently on `npm run migrate:superadmin`.
 *
 * That is a deliberate choice, and it puts pass 5's rescue step on an operator rather than on the
 * deploy. RUN THIS BEFORE OR WITH THE DEPLOY, NEVER AFTER: the public intake reads are already on
 * the junction, so between deploying and applying this, every legacy intake is invisible and
 * courses render with no intakes at all. Nothing else repairs that.
 *
 * Why it exists at all: the pipeline persists no scraped markdown, so fixing a prompt only helps
 * pages crawled after the fix. Everything already stored can only be repaired from what is in
 * the database — which is enough for these, because the information was captured, just written
 * to the wrong column (or to one row per course instead of one shared row).
 *
 * Six passes, each independently useful:
 *
 *   1. UNFABRICATE. deriveScoreFromDescription used to read any percentage-shaped number out of
 *      the free-text description, including percentiles and cohort averages, and store it as a
 *      minimum grade. "Average quantitative GMAT scores are 49.5 (95th percentile)." became
 *      min_score_percent = 95 — rendered as "Minimum score: 95%" on the public course page and
 *      compared against real students' GPAs. This nulls the numeric fields on rows whose
 *      description the new NOT_A_MINIMUM guard rejects. The description is untouched, so nothing
 *      is lost: the sentence stays, only the invented threshold goes.
 *
 *   2. RECOVER TESTS. Standardised admission tests (GRE, GMAT, SAT, …) had nowhere to go, so
 *      they landed in a requirement's name or description. This lifts them into academic_tests,
 *      which is what the public card's "Academic Test Score" section and the eligibility engine's
 *      academic_test criterion actually read. Rows land in the admin Eligibility tab for review,
 *      and every correction there already feeds the save-and-learn lesson loop.
 *
 *   3. DERIVE INTAKE MONTH/YEAR. intake_month and intake_year are the only intake columns any
 *      feature reads (year filter, "next intake" badge, year facet, institution search), and the
 *      LLM routinely left both null while naming the intake "Semester 1 2027". Same helper the
 *      writers now use, applied to stored rows.
 *
 *   4. SHARE ONE REQUIREMENT ACROSS COURSES. A requirement row is attached to courses through a
 *      junction, so one "Bachelor degree or equivalent" is meant to serve every course asking for
 *      it (the admin UI's "Shared by N courses" badge). Before upsertEligibility existed,
 *      writeCourse inserted a fresh row per course per page. This repoints the assignments onto
 *      one row and deletes the copies — but only where the copies genuinely agree; same name with
 *      different thresholds is reported, not guessed at.
 *
 *   5. SHARE ONE INTAKE ACROSS COURSES. Same story as pass 4, for intakes — plus a rescue step
 *      that must run alongside the deploy switching the public intake reads onto the junction:
 *      any legacy row reachable only via extraction_intakes.course_id gets its assignment row,
 *      or it would vanish from course pages.
 *
 *   6. ONE ENGLISH ROW PER TEST PER COURSE. extraction_english_requirements was the last child
 *      table written with a bare insert (pass 4's story, one table later), so the same course
 *      accumulated an IELTS row per page that mentioned it — several tiles on the public card, and
 *      English weighted several times over in the eligibility percentage. Merging also RECOVERS the
 *      per-component minimums: the first row is usually the thinnest (a listing page states "IELTS
 *      6.5", only the detail page carries the bands), and it was the one being displayed. Only
 *      rows that AGREE are collapsed — copies stating different bars are reported and left alone,
 *      same rule and same clustering as pass 4, because this pass deletes.
 *
 * Rerunnable: every pass is a no-op once applied.
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import {
  deriveScoreFromDescription,
  deriveIntakeMonthYear,
} from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";
import { findTests } from "../src/modules/superadmin/data-extraction/lib/requirement-text.js";

const S = "superadmin";
const REQUIREMENTS = `${S}.extraction_eligibility_requirements`;
const INTAKES = `${S}.extraction_intakes`;
const ENGLISH = `${S}.extraction_english_requirements`;

const apply = process.argv.includes("--apply");
const refreshTests = process.argv.includes("--refresh-tests");
const jobFlag = process.argv.indexOf("--job");
const jobId = jobFlag > -1 ? process.argv[jobFlag + 1] : null;

/**
 * The academic-test catalogue, longest name first.
 *
 * Read from `public.tests` rather than hardcoded so an admin adding a test in
 * Superadmin ▸ Platform ▸ Categories ▸ Tests is picked up here too. Longest-first matters for
 * the same reason it does in the frontend's testImage(): with both "GRE" and "GRE Subject" on
 * file, "GRE Subject Test" must not be claimed by the shorter row.
 */
async function loadAcademicTests(): Promise<string[]> {
  const rows = await masterKnex("tests")
    .where({ category: "academic", is_active: true })
    .whereNull("deleted_at")
    .pluck("name");
  return rows.sort((a: string, b: string) => b.length - a.length);
}

async function unfabricateScores() {
  const rows = await masterKnex(REQUIREMENTS)
    .modify((q) => { if (jobId) q.where({ job_id: jobId }); })
    .whereNotNull("description")
    .where((q) => q.whereNotNull("min_score_percent").orWhereNotNull("min_score"))
    .select("id", "name", "description", "min_score_percent", "min_score", "score_type");

  // A row is fabricated when the new guard rejects its description AND the stored number is one
  // the old derivation would have produced from that description. A figure an admin typed in, or
  // one the LLM reported in min_score directly, is left alone — this pass removes inventions, not
  // anything a human or a clean extraction put there.
  const doomed = rows.filter((r: Record<string, unknown>) => {
    if (deriveScoreFromDescription(r.description as string) != null) return false;
    const stored = Number(r.min_score_percent ?? r.min_score);
    if (!Number.isFinite(stored)) return false;
    const numbers = String(r.description).match(/\d+(?:\.\d+)?/g) ?? [];
    return numbers.some((n) => Number(n) === stored);
  });

  console.log(`\n[1/6] Fabricated minimum scores: ${doomed.length} of ${rows.length} scored requirements`);
  for (const r of doomed.slice(0, 15)) {
    console.log(`  - ${r.name ?? "(unnamed)"} · ${r.min_score_percent ?? r.min_score} ← "${String(r.description).slice(0, 90)}"`);
  }
  if (doomed.length > 15) console.log(`  … and ${doomed.length - 15} more`);

  if (apply && doomed.length > 0) {
    await masterKnex(REQUIREMENTS)
      .whereIn("id", doomed.map((r: { id: string }) => r.id))
      .update({ min_score_percent: null, min_score: null, score_type: null, updated_at: masterKnex.fn.now() });
    console.log(`  ✓ cleared ${doomed.length} invented thresholds (descriptions untouched)`);
  }
  return doomed.length;
}

async function recoverAcademicTests(catalogue: string[]) {
  const rows = await masterKnex(REQUIREMENTS)
    .modify((q) => { if (jobId) q.where({ job_id: jobId }); })
    .select("id", "name", "description", "academic_tests");

  const updates: { id: string; name: string | null; tests: ReturnType<typeof findTests> }[] = [];
  for (const r of rows) {
    // Never overwrite tests already recorded — an admin's entry wins. --refresh-tests lifts that
    // for re-deriving rows an earlier run of THIS script wrote (it hardcoded is_optional false
    // and, before the clause-scanning fix above, could not see a score at all).
    const existing = Array.isArray(r.academic_tests) ? r.academic_tests : [];
    if (existing.length > 0 && !refreshTests) continue;
    const tests = findTests(`${r.name ?? ""}. ${r.description ?? ""}`, catalogue);
    if (tests.length === 0) continue;
    if (existing.length > 0 && JSON.stringify(existing) === JSON.stringify(tests)) continue;
    updates.push({ id: r.id, name: r.name, tests });
  }

  const verb = refreshTests ? "re-derived" : "recoverable";
  console.log(`\n[2/6] Academic tests ${verb} from name/notes: ${updates.length} of ${rows.length} requirements`);
  for (const u of updates.slice(0, 15)) {
    const summary = u.tests
      .map((t) => `${t.test_name} ${t.score ? `≥ ${t.score}` : "(no minimum stated)"}${t.is_optional ? " · optional" : ""}`)
      .join(", ");
    console.log(`  - ${summary}   ← ${u.name ?? "(unnamed)"}`);
  }
  if (updates.length > 15) console.log(`  … and ${updates.length - 15} more`);

  if (apply) {
    for (const u of updates) {
      await masterKnex(REQUIREMENTS).where({ id: u.id }).update({
        academic_tests: JSON.stringify(u.tests),
        updated_at: masterKnex.fn.now(),
      });
    }
    if (updates.length > 0) console.log(`  ✓ wrote academic_tests on ${updates.length} requirements — review in the Eligibility tab`);
  }
  return updates.length;
}

async function deriveIntakes() {
  const rows = await masterKnex(INTAKES)
    .modify((q) => { if (jobId) q.where({ job_id: jobId }); })
    .where((q) => q.whereNull("intake_month").orWhereNull("intake_year"))
    .select("id", "intake_name", "start_date", "intake_month", "intake_year");

  const updates: { id: string; intake_month: number | null; intake_year: number | null }[] = [];
  for (const r of rows) {
    // start_date arrives from pg as a Date; the helper wants the ISO prefix.
    const start = r.start_date ? new Date(r.start_date).toISOString().slice(0, 10) : null;
    const derived = deriveIntakeMonthYear(r.intake_name, start, r.intake_month, r.intake_year);
    if (derived.intake_month !== r.intake_month || derived.intake_year !== r.intake_year) {
      updates.push({ id: r.id, ...derived });
    }
  }

  console.log(`\n[3/6] Intakes with a derivable month/year: ${updates.length} of ${rows.length} incomplete intakes`);
  // When nothing derives, the names are the diagnosis — show what is actually stored rather than
  // leaving a bare 0. US catalogues commonly name intakes by season with no year at all ("Fall",
  // "Spring Semester"), which carries no month and no year to recover.
  if (updates.length < rows.length) {
    const stuck = rows.filter((r: Record<string, unknown>) =>
      !updates.some((u) => u.id === r.id));
    const names = [...new Set(stuck.map((r: Record<string, unknown>) => String(r.intake_name ?? "(no name)")))];
    const dated = stuck.filter((r: Record<string, unknown>) => r.start_date != null).length;
    console.log(`      ${stuck.length} not derivable · ${dated} of them have a start_date · ${names.length} distinct names:`);
    for (const n of names.slice(0, 20)) console.log(`        · ${n}`);
    if (names.length > 20) console.log(`        … and ${names.length - 20} more`);
  }
  if (apply) {
    for (const u of updates) {
      await masterKnex(INTAKES).where({ id: u.id }).update({
        intake_month: u.intake_month,
        intake_year: u.intake_year,
        updated_at: masterKnex.fn.now(),
      });
    }
    if (updates.length > 0) console.log(`  ✓ filled month/year on ${updates.length} intakes — now visible to search`);
  }
  return updates.length;
}

/**
 * Fields that identify a requirement's substance. Two rows sharing a name and audience but
 * disagreeing on any of these are not the same requirement, whatever they are called — merging
 * them would silently drop one institution's actual threshold.
 *
 * `description` and `source_url` are deliberately absent: two pages routinely word the same
 * requirement differently, and that is not a reason to keep duplicate rows. The longest
 * description and the first source_url survive.
 */
/** An intake's dates — if two rows contradict on any, they are different sittings. */
const DATE_FIELDS = ["start_date", "end_date", "orientation_date", "admission_deadline"] as const;

/**
 * Split rows that share an identity key into clusters that are MUTUALLY compatible.
 *
 * Comparing every row against one representative is not enough, and gets the real data wrong.
 * Five "Fall 2027" rows on job 3e4a6521 had deadlines 2025-12-14, 2026-12-14, and 2025-11-30
 * three times over. Checking each against the oldest (2025-12-14) marked all four others as
 * conflicting and merged nothing — the three identical ones were never compared to each other,
 * which is exactly the case that needed collapsing.
 *
 * Compatibility is not transitive when nulls mean "unknown": a row with no deadline matches both
 * 11-30 and 12-14, which do not match each other. So a row joins a cluster only if it agrees with
 * EVERY member, and the most-specific rows are placed first — otherwise a vague row would claim
 * the first cluster and block the concrete ones from forming.
 */
function clusterCompatible<T extends Record<string, unknown>>(
  rows: T[],
  agree: (a: T, b: T) => boolean,
  specificity: (row: T) => number,
): T[][] {
  const ordered = [...rows].sort((a, b) => specificity(b) - specificity(a));
  const clusters: T[][] = [];
  for (const row of ordered) {
    const home = clusters.find((c) => c.every((member) => agree(member, row)));
    if (home) home.push(row);
    else clusters.push([row]);
  }
  // Oldest first inside each cluster, so the survivor keeps the earliest created_at.
  for (const c of clusters) {
    c.sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  }
  return clusters;
}

// Deliberately stricter than the writer's `eligibilityRowsAgree`, which governs the same
// name-is-not-an-identity rule at write time. This pass DELETES rows, so it demands whole-value
// equality (including min_score_grade and language_tests, which no writer populates) and reports
// anything it can't prove identical instead of merging it. The writer allows enrichment — a page
// naming a test the stored row doesn't is additive, not a conflict — because it only ever links
// and fills blanks. Two rules, two blast radii; keep them that way.
const IDENTITY_FIELDS = [
  "min_degree_level", "score_type", "min_score", "min_score_percent", "min_score_grade",
  "academic_tests", "language_tests",
] as const;

function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => {
    if (v == null || v === "") return null;
    if (typeof v === "object") {
      const j = JSON.stringify(v);
      return j === "[]" ? null : j;
    }
    return String(v);
  };
  return norm(a) === norm(b);
}

/**
 * Collapse duplicate eligibility requirements so courses SHARE one row.
 *
 * A requirement row is attached to courses through extraction_course_eligibility_assignments, so
 * one "Bachelor degree or equivalent" is meant to serve every course that asks for it — that is
 * what the admin UI's "Shared by N courses" badge counts. Before `upsertEligibility` existed,
 * writeCourse inserted a fresh row per course per page, so the same requirement exists many times
 * over with one course each.
 *
 * This only merges rows that genuinely agree (see IDENTITY_FIELDS). Rows sharing a name but
 * stating different thresholds are reported and left alone — they need a human, not a guess.
 */
async function mergeDuplicateRequirements() {
  const rows = await masterKnex(REQUIREMENTS)
    .modify((q) => { if (jobId) q.where({ job_id: jobId }); })
    .whereNotNull("name")
    .whereRaw("TRIM(name) <> ''")
    .orderBy("created_at", "asc")
    .select("*");

  // Group by what upsertEligibility now dedupes on, so this pass and the writer agree.
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const key = `${r.job_id}\u0000${String(r.name).trim().toLowerCase()}\u0000${r.applicable_to ?? "both"}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const merges: { keep: Record<string, unknown>; drop: Record<string, unknown>[] }[] = [];
  const conflicts: { name: string; count: number; clusters: number }[] = [];

  const agree = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    IDENTITY_FIELDS.every((f) => a[f] == null || b[f] == null || sameValue(a[f], b[f]));
  const specificity = (r: Record<string, unknown>) =>
    IDENTITY_FIELDS.filter((f) => r[f] != null && JSON.stringify(r[f]) !== "[]").length;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Clustered, not compared-to-the-first: rows that agree with each other but not with the
    // oldest row still deserve to be merged together.
    const clusters = clusterCompatible(group, agree, specificity);
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const [keep, ...drop] = cluster;
      merges.push({ keep, drop });
    }
    // More than one cluster under one name means the copies genuinely state different things.
    if (clusters.length > 1) {
      conflicts.push({ name: String(group[0].name), count: group.length, clusters: clusters.length });
    }
  }

  const dropCount = merges.reduce((n, m) => n + m.drop.length, 0);
  console.log(`\n[4/6] Duplicate requirements to collapse: ${dropCount} rows across ${merges.length} requirements`);
  for (const m of merges.slice(0, 15)) {
    console.log(`  - "${m.keep.name}" (${m.keep.applicable_to}) · ${m.drop.length + 1} copies → 1 shared row`);
  }
  if (merges.length > 15) console.log(`  … and ${merges.length - 15} more`);
  if (conflicts.length > 0) {
    console.log(`      ${conflicts.length} names split across several requirements (each group merged separately):`);
    for (const c of conflicts.slice(0, 10)) {
      console.log(`        · "${c.name}" — ${c.count} copies state ${c.clusters} genuinely different requirements`);
    }
  }

  if (apply) {
    for (const { keep, drop } of merges) {
      const dropIds = drop.map((d) => d.id as string);

      // Fill the survivor's blanks from its copies, so merging never loses a field.
      const updates: Record<string, unknown> = {};
      for (const f of [...IDENTITY_FIELDS, "source_url"] as const) {
        if (keep[f] != null && !(typeof keep[f] === "object" && JSON.stringify(keep[f]) === "[]")) continue;
        const donor = drop.find((d) => d[f] != null && JSON.stringify(d[f]) !== "[]");
        if (donor) updates[f] = typeof donor[f] === "object" ? JSON.stringify(donor[f]) : donor[f];
      }
      // Longest description wins — the fuller wording is the more useful one to keep.
      const best = [keep, ...drop]
        .map((r) => (r.description as string | null) ?? "")
        .reduce((a, b) => (b.length > a.length ? b : a), "");
      if (best && best !== keep.description) updates.description = best;
      if (Object.keys(updates).length > 0) {
        await masterKnex(REQUIREMENTS).where({ id: keep.id }).update({ ...updates, updated_at: masterKnex.fn.now() });
      }

      // Repoint every course to the survivor, then drop the copies. onConflict handles a course
      // that was already assigned to both — and the assignments of the deleted rows would cascade
      // away anyway, so repointing must happen first.
      for (const dropId of dropIds) {
        const courseIds = await masterKnex(`${S}.extraction_course_eligibility_assignments`)
          .where({ eligibility_requirement_id: dropId })
          .pluck("course_id");
        for (const courseId of courseIds) {
          await masterKnex(`${S}.extraction_course_eligibility_assignments`)
            .insert({ job_id: keep.job_id, course_id: courseId, eligibility_requirement_id: keep.id })
            .onConflict(["course_id", "eligibility_requirement_id"]).ignore();
        }
      }
      await masterKnex(REQUIREMENTS).whereIn("id", dropIds).delete();
    }
    if (dropCount > 0) console.log(`  ✓ collapsed ${dropCount} duplicate rows — courses now share one requirement each`);
  }
  return dropCount;
}

/**
 * Guarantee every stored intake is reachable through the junction, then share the duplicates.
 *
 * **Run this before or with the deploy that switched the public intake reads to the junction.**
 * Those reads used `extraction_intakes.course_id`; they now go through
 * `extraction_course_intake_assignments`, because a shared intake cannot name one course in a
 * scalar column. Any legacy row that has a `course_id` but no assignment row would silently
 * disappear from course pages and search until this has run.
 *
 * Then the sharing itself: one "Semester 1 2027" row linked to every course that offers it,
 * matching what `upsertIntake` now does on write and what the admin Intakes tab's course
 * link/unlink picker has always implied. Identity is name + month + year with the four dates
 * required not to contradict — a null on either side is unknown, not a difference — so two
 * genuinely different sittings under one name stay apart.
 */
async function shareIntakesAcrossCourses() {
  const ASSIGNMENTS = `${S}.extraction_course_intake_assignments`;

  // ── Step 1: rescue legacy rows that only the course_id column pointed at ──
  const orphans = await masterKnex(`${S}.extraction_intakes as ei`)
    .modify((q) => { if (jobId) q.where("ei.job_id", jobId); })
    .whereNotNull("ei.course_id")
    .whereNotExists(
      masterKnex(`${ASSIGNMENTS} as cia`).whereRaw("cia.intake_id = ei.id"),
    )
    .select("ei.id", "ei.job_id", "ei.course_id", "ei.intake_name");

  console.log(`\n[5/6] Intakes reachable only by the legacy course_id column: ${orphans.length}`);
  if (orphans.length > 0) {
    console.log("      these are INVISIBLE on public course pages until this runs with --apply — rescuing them");
    if (apply) {
      for (const o of orphans) {
        await masterKnex(ASSIGNMENTS)
          .insert({ job_id: o.job_id, course_id: o.course_id, intake_id: o.id })
          .onConflict(["course_id", "intake_id"]).ignore();
      }
      console.log(`      ✓ linked ${orphans.length} intakes through the junction`);
    }
  }

  // ── Step 2: collapse duplicates so courses share one intake ──
  const rows = await masterKnex(INTAKES)
    .modify((q) => { if (jobId) q.where({ job_id: jobId }); })
    .orderBy("created_at", "asc")
    .select("*");

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const key = [
      r.job_id,
      String(r.intake_name ?? "").trim().toLowerCase(),
      r.intake_month ?? 0,
      r.intake_year ?? 0,
    ].join(" ");
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const dateOf = (v: unknown) =>
    v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

  const merges: { keep: Record<string, unknown>; drop: Record<string, unknown>[] }[] = [];
  const split: { label: string; count: number; clusters: number }[] = [];

  const agree = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    DATE_FIELDS.every((f) => {
      const x = dateOf(a[f]);
      const y = dateOf(b[f]);
      return x == null || y == null || x === y;
    });
  const specificity = (r: Record<string, unknown>) => DATE_FIELDS.filter((f) => r[f] != null).length;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Clustered, not compared-to-the-first — see clusterCompatible. Job 3e4a6521's five
    // "Fall 2027" rows are the case: three share deadline 2025-11-30 and belong together, while
    // 2025-12-14 and 2026-12-14 are separate sittings. Comparing against the oldest merged none.
    const clusters = clusterCompatible(group, agree, specificity);
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const [keep, ...drop] = cluster;
      merges.push({ keep, drop });
    }
    if (clusters.length > 1) {
      const g = group[0];
      split.push({
        label: String(g.intake_name ?? `${g.intake_year ?? "?"}-${g.intake_month ?? "?"}`),
        count: group.length,
        clusters: clusters.length,
      });
    }
  }

  const dropCount = merges.reduce((n, m) => n + m.drop.length, 0);
  console.log(`      Duplicate intakes to collapse: ${dropCount} rows across ${merges.length} intakes`);
  for (const m of merges.slice(0, 10)) {
    const label = m.keep.intake_name ?? `${m.keep.intake_year ?? "?"}-${m.keep.intake_month ?? "?"}`;
    console.log(`        · "${label}" — ${m.drop.length + 1} copies → 1 row shared by their courses`);
  }
  if (merges.length > 10) console.log(`        … and ${merges.length - 10} more`);
  if (split.length > 0) {
    console.log(`        ${split.length} names cover several real sittings (each collapsed on its own):`);
    for (const s of split.slice(0, 10)) {
      console.log(`          · "${s.label}" — ${s.count} rows → ${s.clusters} distinct intakes (dates differ)`);
    }
  }

  if (apply) {
    for (const { keep, drop } of merges) {
      const dropIds = drop.map((d) => d.id as string);

      // Fill the survivor's blank dates from its copies before anything is deleted.
      const updates: Record<string, unknown> = {};
      for (const f of [...DATE_FIELDS, "source_url"] as const) {
        if (keep[f] != null) continue;
        const donor = drop.find((d) => d[f] != null);
        if (donor) updates[f] = donor[f];
      }
      if (Object.keys(updates).length > 0) {
        await masterKnex(INTAKES).where({ id: keep.id }).update({ ...updates, updated_at: masterKnex.fn.now() });
      }

      // Repoint every course onto the survivor FIRST — the copies' assignments cascade away
      // with them, so a delete before this would lose the course links entirely.
      for (const dropId of dropIds) {
        const courseIds = await masterKnex(ASSIGNMENTS)
          .where({ intake_id: dropId })
          .pluck("course_id");
        for (const courseId of courseIds) {
          await masterKnex(ASSIGNMENTS)
            .insert({ job_id: keep.job_id, course_id: courseId, intake_id: keep.id })
            .onConflict(["course_id", "intake_id"]).ignore();
        }
      }
      await masterKnex(INTAKES).whereIn("id", dropIds).delete();
    }
    if (dropCount > 0) console.log(`      ✓ collapsed ${dropCount} duplicate intakes — courses now share one row each`);
  }
  return orphans.length + dropCount;
}

/**
 * Pass 6 — ONE ENGLISH ROW PER TEST PER COURSE.
 *
 * extraction_english_requirements was the last child table written with a bare insert, so a course
 * found on a listing page, its detail page and a catalog entry ended up with three IELTS rows. The
 * public card renders one tile per row and evaluateEligibility's percentage is a share of the
 * criteria it emitted, so the duplicates both cluttered the card and weighted English several times
 * over in a student's verdict. Frequently the first row (the one a reader sees) was also the
 * thinnest — a listing page states "IELTS 6.5" and only the detail page carries the bands — so
 * collapsing these is what makes the per-component minimums visible at all.
 *
 * Merge rule is upsertEnglishRequirement's: fill the survivor's blanks from its copies, never
 * overwrite a value it already states. Rows are course-scoped with no junction, so unlike passes
 * 4 and 5 there are no assignments to repoint — the copies just go.
 *
 * ONLY ROWS THAT AGREE ARE MERGED, clustered exactly as pass 4 does and for the reason stated
 * there: this pass DELETES, so it may only collapse rows it can prove state the same bar. Two
 * rows saying IELTS 6.5 and IELTS 7.0 for one course are not a duplicate, they are a genuine
 * disagreement between two pages — and deleting either one destroys a stated threshold that a
 * real student is then evaluated against wrongly, with the discarded number surviving nowhere.
 * Conflicting clusters are reported and LEFT for an admin, never merged. A blank on either side
 * is unknown rather than a difference, so a row carrying only an overall score still merges into
 * the one that adds the bands, which is the case this pass mainly exists to fix.
 */
async function collapseDuplicateEnglishRequirements() {
  /** Filled from the copies when the survivor is blank. Provenance, not identity. */
  const MERGED = [
    "overall_score", "listening_score", "reading_score",
    "writing_score", "speaking_score", "source_url",
  ] as const;

  /** The stated bar. Any populated difference here means two different requirements. */
  const ENGLISH_IDENTITY_FIELDS = [
    "overall_score", "listening_score", "reading_score", "writing_score", "speaking_score",
  ] as const;

  const rows = await masterKnex(ENGLISH)
    .modify((q) => { if (jobId) q.where({ job_id: jobId }); })
    .whereNotNull("course_id")
    .whereNotNull("test_type_name")
    .whereRaw("TRIM(test_type_name) <> ''")
    .orderBy("created_at", "asc")
    .select("*");

  // Grouped by what upsertEnglishRequirement dedupes on, so this pass and the writer agree.
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const key = `${r.course_id} ${String(r.test_type_name).trim().toLowerCase()}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const agree = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    ENGLISH_IDENTITY_FIELDS.every((f) => a[f] == null || b[f] == null || sameValue(a[f], b[f]));
  const specificity = (r: Record<string, unknown>) =>
    ENGLISH_IDENTITY_FIELDS.filter((f) => r[f] != null && r[f] !== "").length;

  const merges: { keep: Record<string, unknown>; drop: Record<string, unknown>[] }[] = [];
  const conflicts: { test: string; courseId: string; scores: string[] }[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const clusters = clusterCompatible(group, agree, specificity);
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const [keep, ...drop] = cluster;
      merges.push({ keep, drop });
    }
    // More than one cluster means the copies state genuinely different bars. Each cluster is
    // still de-duplicated internally, but nothing is merged or deleted ACROSS them — every
    // distinct requirement survives for an admin to resolve.
    if (clusters.length > 1) {
      conflicts.push({
        test: String(group[0].test_type_name),
        courseId: String(group[0].course_id),
        scores: clusters.map((c) => String(c[0].overall_score ?? "—")),
      });
    }
  }

  const dropCount = merges.reduce((n, m) => n + m.drop.length, 0);
  console.log(`\n[6/6] Duplicate English requirement rows to collapse: ${dropCount} across ${merges.length} course/test pairs`);
  for (const m of merges.slice(0, 15)) {
    console.log(`  - ${m.keep.test_type_name} on course ${m.keep.course_id} · ${m.drop.length + 1} copies → 1 row`);
  }
  if (merges.length > 15) console.log(`  … and ${merges.length - 15} more`);
  if (conflicts.length > 0) {
    console.log(`      ${conflicts.length} course/test pairs state DIFFERENT bars — kept as separate rows for review, nothing deleted:`);
    for (const c of conflicts.slice(0, 10)) {
      console.log(`        · ${c.test} on course ${c.courseId} — overall scores: ${c.scores.join(" vs ")}`);
    }
  }

  if (apply) {
    for (const { keep, drop } of merges) {
      const updates: Record<string, unknown> = {};
      for (const f of MERGED) {
        if (keep[f] != null && keep[f] !== "") continue;
        const donor = drop.find((d) => d[f] != null && d[f] !== "");
        if (donor) updates[f] = donor[f];
      }
      if (Object.keys(updates).length > 0) {
        await masterKnex(ENGLISH).where({ id: keep.id }).update({ ...updates, updated_at: masterKnex.fn.now() });
      }
      await masterKnex(ENGLISH).whereIn("id", drop.map((d) => d.id as string)).delete();
    }
    if (dropCount > 0) console.log(`      ✓ collapsed ${dropCount} duplicate English rows`);
  }
  return dropCount;
}

async function main() {
  console.log(apply ? "APPLYING changes" : "DRY RUN — nothing will be written (pass --apply to write)");
  if (jobId) console.log(`Scoped to job ${jobId}`);

  const catalogue = await loadAcademicTests();
  if (catalogue.length === 0) {
    throw new Error("No active academic tests in `tests` — run `npm run seed:globalyapp` first");
  }
  console.log(`Test catalogue: ${catalogue.length} academic tests`);

  const fabricated = await unfabricateScores();
  const recovered = await recoverAcademicTests(catalogue);
  const intakes = await deriveIntakes();
  // Last, so it collapses rows the earlier passes have already made consistent — two copies that
  // differed only by a fabricated score become mergeable once pass 1 has cleared it.
  const collapsed = await mergeDuplicateRequirements();
  const shared = await shareIntakesAcrossCourses();
  const english = await collapseDuplicateEnglishRequirements();

  console.log(
    `\n${apply ? "Applied" : "Would change"}: ${fabricated} invented scores cleared, ` +
    `${recovered} requirements gained academic tests, ${intakes} intakes gained a month/year, ` +
    `${collapsed} duplicate requirement rows collapsed, ${shared} intake rows linked or collapsed, ` +
    `${english} duplicate English rows collapsed.`,
  );
  if (!apply) console.log("Re-run with --apply to write.");
}

await main();
await masterKnex.destroy();
