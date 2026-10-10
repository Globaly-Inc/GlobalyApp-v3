// An institution's scholarships live on its extraction job (superadmin.extraction_scholarships),
// the same way its services are the job's extraction_courses — never copied into `scholarships`.
// Every read and write is scoped by job_id, so a listing only ever touches its own job's rows.

import { masterKnex } from "../../../core/db/master-pool.js";
import type { Knex } from "knex";
import { SUPERADMIN_SCHEMA as S } from "../../superadmin/consts.js";
import type { SharedCourses } from "../../superadmin/data-extraction/repositories/courses.repository.js";

const T = `${S}.extraction_scholarships`;
const A = `${S}.extraction_course_scholarship_assignments`;
const COLS = [
  "id", "name", "applicable_to", "coverage_type", "amount", "currency", "deadline", "application_url", "description", "created_at", "updated_at",
  // created_by is null only on rows the extraction wrote — the portal's Extracted / Manual chip.
  masterKnex.raw("case when created_by_platform_user_id is null then 'extracted' else 'manual' end as origin"),
];

export type ScholarshipFilters = {
  search?: string;
  applicable_to?: string;
  coverage_type?: string;
  /** extracted = written by the pipeline (created_by null), manual = added by someone. */
  origin?: "extracted" | "manual";
};

function searched(jobId: string, { search, applicable_to, coverage_type, origin }: ScholarshipFilters = {}) {
  const q = masterKnex(T).where({ job_id: jobId });
  if (search) q.whereILike("name", `%${search}%`);
  // A "both" scholarship is open to domestic AND international students, so it matches either.
  if (applicable_to) q.whereIn("applicable_to", applicable_to === "both" ? ["both"] : [applicable_to, "both"]);
  if (coverage_type) q.where({ coverage_type });
  if (origin) q[origin === "extracted" ? "whereNull" : "whereNotNull"]("created_by_platform_user_id");
  return q;
}

/** Courses (aliased `c`) this org may see: its own job's, plus those shared down to it. */
function visibleTo(w: Knex.QueryBuilder, jobId: string | null, shared: SharedCourses | null) {
  if (jobId) w.where("c.job_id", jobId);
  else w.whereRaw("false"); // no own job — only shared levels (if any) below can match
  for (let level = shared; level; level = level.shared ?? null) {
    const { jobId: levelJob, ids: levelIds } = level;
    w.orWhere((o) => {
      o.where("c.job_id", levelJob);
      if (levelIds !== "all") o.whereIn("c.id", levelIds);
    });
  }
}

/** Adds `courses` (id + name) to each row — empty means linked to no course, i.e. institution-wide.
 * Only courses visible to this org: a head-office scholarship shared to a branch may also link
 * courses not shared with it, and those must not leak their names/ids. */
export async function withCourses<R extends Record<string, unknown>>(rows: R[], jobId: string | null, shared: SharedCourses | null) {
  if (rows.length === 0) return rows.map((r) => ({ ...r, courses: [] as { id: string; name: string }[] }));
  const links = await masterKnex(`${A} as a`)
    .join(`${S}.extraction_courses as c`, "c.id", "a.course_id")
    .whereIn("a.scholarship_id", rows.map((r) => r.id as string))
    .where((w) => visibleTo(w, jobId, shared))
    .orderBy("c.name")
    .select("a.scholarship_id", "c.id", "c.name");
  const byScholarship = new Map<string, { id: string; name: string }[]>();
  for (const l of links) {
    const list = byScholarship.get(l.scholarship_id) ?? [];
    list.push({ id: l.id, name: l.name });
    byScholarship.set(l.scholarship_id, list);
  }
  return rows.map((r) => ({ ...r, courses: byScholarship.get(r.id as string) ?? [] }));
}

export async function list(jobId: string, limit: number, offset: number, filters: ScholarshipFilters = {}) {
  const [rows, [{ count }]] = await Promise.all([
    searched(jobId, filters).select(COLS).orderBy("created_at", "desc").limit(limit).offset(offset),
    searched(jobId, filters).count("* as count"),
  ]);
  return { rows: rows.map((r) => ({ ...r, amount: r.amount == null ? null : Number(r.amount) })), total: Number(count) };
}

/**
 * A branch's view of its head office's scholarships: on each level of the shared-course chain
 * (see resolveSharedCourses), the scholarships linked to a course shared with it, plus those
 * linked to no course at all (institution-wide). "all" = every scholarship on that job.
 * ponytail: unpaged — a job holds dozens of scholarships; page in SQL if that grows.
 */
export async function listShared(shared: SharedCourses | null, filters: ScholarshipFilters = {}) {
  const out: Record<string, unknown>[] = [];
  for (let level = shared; level; level = level.shared ?? null) {
    const { ids } = level;
    const q = searched(level.jobId, filters).select(COLS).orderBy("created_at", "desc");
    if (ids !== "all") {
      const assigned = (sub: Knex.QueryBuilder) => sub.select(1).from(A).whereRaw(`${A}.scholarship_id = ${T}.id`);
      q.where((w) => w.whereNotExists(assigned).orWhereExists((sub) => assigned(sub).whereIn(`${A}.course_id`, ids)));
    }
    out.push(...(await q).map((r) => ({ ...r, amount: r.amount == null ? null : Number(r.amount), shared: true })));
  }
  return out;
}

/** Which of `ids` this org may link: its own job's courses, plus courses shared down to it. */
export async function visibleCourseIds(jobId: string, shared: SharedCourses | null, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await masterKnex(`${S}.extraction_courses as c`).whereIn("c.id", ids)
    .where((w) => visibleTo(w, jobId, shared)).select("c.id");
  return rows.map((r) => String(r.id));
}

/** Replaces a scholarship's course links. No links = it applies to every course. */
export async function setCourses(jobId: string, scholarshipId: string, courseIds: string[]) {
  await masterKnex.transaction(async (trx) => {
    await trx(A).where({ scholarship_id: scholarshipId }).delete();
    if (courseIds.length > 0) {
      await trx(A).insert(courseIds.map((course_id) => ({ job_id: jobId, course_id, scholarship_id: scholarshipId })));
    }
  });
}

export async function insert(jobId: string, data: Record<string, unknown>, actorId: number) {
  const [row] = await masterKnex(T).insert({ ...data, job_id: jobId, created_by_platform_user_id: actorId }).returning("id");
  return row as { id: string };
}

export async function update(jobId: string, id: string, data: Record<string, unknown>, actorId: number) {
  const count = await masterKnex(T).where({ id, job_id: jobId })
    .update({ ...data, updated_by_platform_user_id: actorId, updated_at: masterKnex.fn.now() });
  return count > 0;
}

export async function remove(jobId: string, id: string) {
  return (await masterKnex(T).where({ id, job_id: jobId }).delete()) > 0;
}
