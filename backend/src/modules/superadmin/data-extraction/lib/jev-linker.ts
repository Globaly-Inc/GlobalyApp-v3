// Links a job's campuses, intakes, study units, fees, entry requirements, scholarships and
// accreditations to the courses they belong to — find candidates in code, confirm each with Jev.
//
// Measured 2026-09-30 across all jobs: 140 of 303 campuses, 207 of 1,678 fees, 121 of 3,390
// intakes, 77 of 4,378 requirements and 974 of 25,288 units were linked to NO course, and 53% of
// courses had no fee at all. Writers link only what one page's extraction named at write time, so
// an entity another page (a campus list, a fee table, a calendar) introduced never reaches the
// courses it applies to.
//
// Evidence kinds (campus, intake, study unit, fee, requirement) are candidates for a course only
// when their name / code / amount literally appears on that course's own page, and Jev then
// confirms the page states the relationship ("offered at", "starts in", "studied in"…). Scope kinds
// (scholarship, accreditation) rarely name courses, so every one is a candidate and Jev judges its
// terms against the course. One Jev request per course; a link is written only at or above
// JEV_LINK_MIN. AgentCIS jobs only gain a KIND a course has none of (CLAUDE.md: never overwrite
// AgentCIS data). Agents are institution-level and have no course junction, so they are not here.
//
// ON whenever TYPESAFE_API_KEY is set (JEV_LINK_MIN overrides the default, "0" = off). Idempotent: already-linked pairs are never
// asked again, so re-running only spends on what is still unlinked.

import { noul } from "@typesafe-ai/sdk";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { _jevDeps, jevThreshold } from "./jev-client.js";
import { readSnapshot } from "./page-store.js";

const logger = createChildLogger("jev-linker");

const PAGE_CHARS = 40_000;
const MAX_CANDIDATES = 60;

export type LinkKind = "campus" | "intake" | "study_unit" | "fee" | "eligibility" | "scholarship" | "accreditation";

export interface Entity { kind: LinkKind; id: string; label: string; needles: string[]; scope?: string | null }
export interface CourseRow { id: string; name: string; degree_level: string | null; source_url: string | null }

const JUNCTION: Record<LinkKind, { table: string; col: string }> = {
  campus: { table: "extraction_course_campuses", col: "campus_id" },
  intake: { table: "extraction_course_intake_assignments", col: "intake_id" },
  study_unit: { table: "extraction_course_study_unit_assignments", col: "study_unit_id" },
  fee: { table: "extraction_course_fee_assignments", col: "course_fee_id" },
  eligibility: { table: "extraction_course_eligibility_assignments", col: "eligibility_requirement_id" },
  scholarship: { table: "extraction_course_scholarship_assignments", col: "scholarship_id" },
  accreditation: { table: "extraction_course_accreditation_assignments", col: "extraction_accreditation_id" },
};

/** TRUE = link. Each names the relationship the page must state, not mere mention. */
const QUESTION: Record<LinkKind, string> = {
  campus: "Does the page state that `course.name` is taught or offered at the campus `candidates.KEY`?",
  intake: "Does the page state that a student can START `course.name` in the intake `candidates.KEY`?",
  study_unit: "Does the page list `candidates.KEY` as a unit, subject or module studied within `course.name`?",
  fee: "Is `candidates.KEY` a tuition or application fee that a student of `course.name` pays, as this page states?",
  eligibility: "Is `candidates.KEY` an admission requirement for `course.name`, as this page states?",
  scholarship: "Given its terms, can a student enrolled in `course.name` hold the scholarship `candidates.KEY`?",
  accreditation: "Does the accreditation or professional recognition `candidates.KEY` apply to `course.name`?",
};

const SCOPE_KINDS = new Set<LinkKind>(["scholarship", "accreditation"]);

const norm = (s: string) => s.toLowerCase().replace(/[‘’']/g, "").replace(/[^a-z0-9$£€]+/g, " ").trim();

/** Needles for an amount: "16020" matches "16,020", "16 020" and "16020". The WHOLE part, never
 *  rounded: 1250.50 must find "1,250.50" on the page, and a rounded "1,251" never would. */
export function amountNeedles(amount: unknown): string[] {
  const n = Math.trunc(Number(amount));
  if (!Number.isFinite(n) || n < 100) return [];
  const s = String(n);
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return [...new Set([s, grouped, grouped.replace(/,/g, " ")])];
}

/**
 * Which entities to ask about for one course. Pure. Unlinked entities first (they reach no course at
 * all), then entities of kinds the course has none of, capped.
 */
/** Does `pageText` literally contain one of `needles`? Amounts ("16,020") as raw text; names and codes
 *  on whole normalised words, so "Stratford Campus" never matches inside "Stratford Campuses". Pure. */
export function mentions(pageText: string, needles: Array<string | null | undefined>): boolean {
  const text = ` ${norm(pageText)} `;
  const raw = pageText.toLowerCase();
  return needles.some((n) => {
    if (!n) return false;
    if (/^[\d ,]+$/.test(n)) return raw.includes(n);
    const k = norm(n);
    return k.length >= 3 && text.includes(` ${k} `);
  });
}

export function candidatesFor(
  course: CourseRow, pageText: string, entities: Entity[],
  linked: Set<string>, kindsHeld: Set<LinkKind>, opts: { agentcis: boolean; unlinkedIds: Set<string>; sharedPage?: boolean },
): Entity[] {
  const out = entities.filter((e) => {
    if (linked.has(`${course.id}|${e.kind}|${e.id}`)) return false;
    if (opts.agentcis && kindsHeld.has(e.kind)) return false;
    const orphan = opts.unlinkedIds.has(`${e.kind}|${e.id}`);
    // Requirement rows and units are course-specific ("Entry Requirements", "Research Methods" are on
    // every page): only orphans are offered, never another course's own row. On one job that rule was
    // the difference between 10,534 unit candidates and a handful.
    if ((e.kind === "eligibility" || e.kind === "study_unit") && !orphan) return false;
    // A page several courses came from is a listing — its campuses and fees belong to many courses,
    // so only orphans (reaching no course yet) are worth asking about there.
    if (opts.sharedPage && !orphan) return false;
    if (SCOPE_KINDS.has(e.kind)) return true;
    return mentions(pageText, e.needles);
  });
  const rank = (e: Entity) => (opts.unlinkedIds.has(`${e.kind}|${e.id}`) ? 0 : kindsHeld.has(e.kind) ? 2 : 1);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_CANDIDATES);
}

export const _linkerDeps = {
  minLink: (): number | null => jevThreshold("JEV_LINK_MIN"),
  readPage: async (url: string): Promise<string> => (await readSnapshot(url))?.markdown ?? "",
};

async function loadEntities(jobId: string, courseIds: string[]): Promise<Entity[]> {
  const q = (table: string) => masterKnex(`${S}.${table}`).where({ job_id: jobId });
  const [campuses, intakes, units, fees, reqs, scholarships, accreditations] = await Promise.all([
    q("extraction_campuses").select("id", "name"),
    q("extraction_intakes").select("id", "intake_name", "intake_month", "intake_year"),
    q("extraction_study_units").select("id", "unit_code", "unit_name"),
    q("extraction_course_fees").whereNotNull("total_amount").select("id", "name", "total_amount", "currency", "student_type", "period_type"),
    q("extraction_eligibility_requirements").select("id", "name", "description"),
    q("extraction_scholarships").select("id", "name", "description", "applicable_to"),
    courseIds.length
      ? masterKnex(`${S}.extraction_accreditations as a`)
        .join(`${S}.extraction_course_accreditation_assignments as ca`, "ca.extraction_accreditation_id", "a.id")
        .whereIn("ca.course_id", courseIds).distinct("a.id", "a.name", "a.issuing_organization", "a.description")
      : Promise.resolve([]),
  ]);
  const e: Entity[] = [];
  for (const r of campuses) e.push({ kind: "campus", id: r.id, label: r.name, needles: [r.name] });
  for (const r of intakes) e.push({ kind: "intake", id: r.id, label: [r.intake_name, r.intake_year].filter(Boolean).join(" "), needles: [r.intake_name] });
  for (const r of units) e.push({ kind: "study_unit", id: r.id, label: [r.unit_code, r.unit_name].filter(Boolean).join(" "), needles: [r.unit_code, r.unit_name] });
  for (const r of fees) e.push({ kind: "fee", id: r.id, label: `${r.name ?? "Fee"}: ${r.total_amount} ${r.currency ?? ""} ${r.period_type ?? ""} (${r.student_type ?? ""})`, needles: amountNeedles(r.total_amount) });
  for (const r of reqs) e.push({ kind: "eligibility", id: r.id, label: [r.name, r.description].filter(Boolean).join(" — ").slice(0, 400), needles: [r.name] });
  for (const r of scholarships) e.push({ kind: "scholarship", id: r.id, label: r.name, needles: [], scope: [r.description, r.applicable_to && `for ${r.applicable_to} students`].filter(Boolean).join(" ").slice(0, 600) });
  for (const r of accreditations) e.push({ kind: "accreditation", id: r.id, label: [r.name, r.issuing_organization].filter(Boolean).join(" — "), needles: [], scope: (r.description ?? "").slice(0, 400) });
  return e;
}

async function loadLinks(jobId: string): Promise<{ linked: Set<string>; kindsByCourse: Map<string, Set<LinkKind>>; everLinked: Set<string> }> {
  const linked = new Set<string>();
  const everLinked = new Set<string>();
  const kindsByCourse = new Map<string, Set<LinkKind>>();
  for (const [kind, { table, col }] of Object.entries(JUNCTION) as [LinkKind, { table: string; col: string }][]) {
    const rows = await masterKnex(`${S}.${table}`).where({ job_id: jobId }).whereNotNull("course_id").whereNotNull(col).select("course_id", `${col} as entity_id`);
    for (const r of rows) {
      linked.add(`${r.course_id}|${kind}|${r.entity_id}`);
      everLinked.add(`${kind}|${r.entity_id}`);
      if (!kindsByCourse.has(r.course_id)) kindsByCourse.set(r.course_id, new Set());
      kindsByCourse.get(r.course_id)!.add(kind);
    }
  }
  return { linked, kindsByCourse, everLinked };
}

async function writeLink(jobId: string, courseId: string, e: Entity): Promise<boolean> {
  const { table, col } = JUNCTION[e.kind];
  if (e.kind === "campus") {
    // extraction_course_campuses has no (course_id, campus_id) unique constraint in the migrations
    // (a local DB may carry one by hand), so ON CONFLICT cannot be used: insert only when absent.
    // ponytail: not race-proof against a concurrent link run of the same job; one run per job at a time.
    const { rows } = await masterKnex.raw(
      `INSERT INTO ${S}.${table} (job_id, course_id, campus_id, campus_name)
       SELECT :jobId, :courseId, :campusId, :name
       WHERE NOT EXISTS (SELECT 1 FROM ${S}.${table} WHERE course_id = :courseId AND campus_id = :campusId)
       RETURNING id`,
      { jobId, courseId, campusId: e.id, name: e.label },
    );
    return rows.length > 0;
  }
  const inserted = await masterKnex(`${S}.${table}`).insert({ job_id: jobId, course_id: courseId, [col]: e.id })
    .onConflict(["course_id", col]).ignore().returning("id");
  return inserted.length > 0;
}

export interface LinkSummary { courses: number; asked: number; linked: Record<LinkKind, number>; failed: number; candidates?: Record<LinkKind, number> }

/** `dryRun`: count what WOULD be asked (per kind) — no Jev call, no write — to size a job's cost. */
export async function linkJobEntities(jobId: string, opts: { heartbeat?: () => Promise<void>; dryRun?: boolean } = {}): Promise<LinkSummary | null> {
  const minLink = _linkerDeps.minLink();
  if (minLink == null && !opts.dryRun) return null;
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first("source_type");
  const agentcis = job?.source_type === "agentcis";
  const courses: CourseRow[] = await masterKnex(`${S}.extraction_courses`).where({ job_id: jobId }).select("id", "name", "degree_level", "source_url");
  const entities = await loadEntities(jobId, courses.map((c) => c.id));
  const { linked, kindsByCourse, everLinked } = await loadLinks(jobId);
  const unlinkedIds = new Set(entities.map((e) => `${e.kind}|${e.id}`).filter((k) => !everLinked.has(k)));

  const summary: LinkSummary = { courses: courses.length, asked: 0, linked: { campus: 0, intake: 0, study_unit: 0, fee: 0, eligibility: 0, scholarship: 0, accreditation: 0 }, failed: 0 };
  const pages = new Map<string, string>();
  const perUrl = new Map<string, number>();
  for (const c of courses) if (c.source_url) perUrl.set(c.source_url, (perUrl.get(c.source_url) ?? 0) + 1);
  for (const course of courses) {
    const url = course.source_url;
    if (url && !pages.has(url)) pages.set(url, await _linkerDeps.readPage(url).catch(() => ""));
    const pageText = url ? pages.get(url) ?? "" : "";
    const held = kindsByCourse.get(course.id) ?? new Set<LinkKind>();
    const candidates = candidatesFor(course, pageText, entities, linked, held, { agentcis, unlinkedIds, sharedPage: (perUrl.get(url ?? "") ?? 0) > 1 });
    if (!candidates.length) continue;
    if (opts.dryRun) {
      summary.candidates ??= { campus: 0, intake: 0, study_unit: 0, fee: 0, eligibility: 0, scholarship: 0, accreditation: 0 };
      for (const e of candidates) summary.candidates[e.kind]++;
      summary.asked += candidates.length;
      continue;
    }

    const keys = candidates.map((_, i) => `c${i}`);
    const questions = Object.fromEntries(candidates.map((e, i) => [keys[i], noul(QUESTION[e.kind].replace("KEY", keys[i]))]));
    try {
      const { answers } = await _jevDeps.systemOne({
        state: {
          course: { name: course.name, degree_level: course.degree_level },
          candidates: Object.fromEntries(candidates.map((e, i) => [keys[i], e.scope ? `${e.label} — ${e.scope}` : e.label])),
          page: pageText.slice(0, PAGE_CHARS),
        },
        questions,
      }) as unknown as { answers: Record<string, { noul: number }> };
      summary.asked += candidates.length;
      for (let i = 0; i < candidates.length; i++) {
        const p = answers[keys[i]]?.noul;
        if (p == null || p < (minLink ?? 1)) continue;
        const e = candidates[i];
        if (await writeLink(jobId, course.id, e)) {
          summary.linked[e.kind]++;
          linked.add(`${course.id}|${e.kind}|${e.id}`);
        }
      }
    } catch (err) {
      summary.failed++;
      logger.warn("Jev link check failed for a course; left as it was", { jobId, course: course.name, err: err instanceof Error ? err.message : String(err) });
    }
    await opts.heartbeat?.();
  }
  return summary;
}
