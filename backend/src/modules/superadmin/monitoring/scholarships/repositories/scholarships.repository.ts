// Scholarships repository — admin-managed content (see categories/countries for the same pattern).

import { masterKnex } from "../../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S, approvedCourseSql, publicJobSql } from "../../../consts.js";

const TABLE = "scholarships";
const now = () => masterKnex.fn.now();

type AdminFilters = {
  search?: string; is_published?: boolean; is_featured?: boolean; country?: string;
  coverage_min?: number; coverage_max?: number; deadline_from?: string; deadline_to?: string;
};
type PublicFilters = {
  q?: string; country?: string; basis?: string; coverage_type?: string;
  degree_level?: string; coverage_min?: number;
};

function applyAdminFilters(q: ReturnType<typeof masterKnex>, filters: AdminFilters) {
  if (filters.search) {
    q.where((b) => b.whereILike("title", `%${filters.search}%`).orWhereILike("provider_name", `%${filters.search}%`));
  }
  if (filters.is_published !== undefined) q.where({ is_published: filters.is_published });
  if (filters.is_featured !== undefined) q.where({ is_featured: filters.is_featured });
  if (filters.country) q.where({ country: filters.country });
  if (filters.coverage_min !== undefined) q.where("coverage_amount", ">=", filters.coverage_min);
  if (filters.coverage_max !== undefined) q.where("coverage_amount", "<=", filters.coverage_max);
  if (filters.deadline_from) q.where("deadline", ">=", filters.deadline_from);
  if (filters.deadline_to) q.where("deadline", "<=", filters.deadline_to);
  return q;
}

export async function listAdmin(limit: number, offset: number, filters: AdminFilters) {
  const q = masterKnex(TABLE).orderBy("created_at", "desc").limit(limit).offset(offset);
  return applyAdminFilters(q, filters);
}

export async function countAdmin(filters: AdminFilters) {
  const q = masterKnex(TABLE).count("* as count");
  applyAdminFilters(q, filters);
  const [row] = await q;
  return Number(row.count);
}

export async function findById(id: number) {
  return masterKnex(TABLE).where({ id }).first();
}

export async function insert(data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE).insert(data).returning("*");
  return row;
}

export async function update(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE).where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

export async function remove(id: number) {
  return masterKnex(TABLE).where({ id }).delete();
}

// ── Business-owned reads/writes (scoped to one business_id) ──

type BusinessFilters = { search?: string };

function applyBusinessFilters(q: ReturnType<typeof masterKnex>, businessId: number, filters: BusinessFilters) {
  q.where({ business_id: businessId });
  if (filters.search) q.whereILike("title", `%${filters.search}%`);
  return q;
}

export async function listForBusiness(businessId: number, limit: number, offset: number, filters: BusinessFilters) {
  const q = masterKnex(TABLE).orderBy("created_at", "desc").limit(limit).offset(offset);
  return applyBusinessFilters(q, businessId, filters);
}

export async function countForBusiness(businessId: number, filters: BusinessFilters) {
  const q = masterKnex(TABLE).count("* as count");
  applyBusinessFilters(q, businessId, filters);
  const [row] = await q;
  return Number(row.count);
}

export async function findByIdForBusiness(businessId: number, id: number) {
  return masterKnex(TABLE).where({ id, business_id: businessId }).first();
}

export async function updateForBusiness(businessId: number, id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE).where({ id, business_id: businessId }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

export async function removeForBusiness(businessId: number, id: number) {
  return masterKnex(TABLE).where({ id, business_id: businessId }).delete();
}

// ── Public reads (published only) ──

function applyPublicFilters(q: ReturnType<typeof masterKnex>, filters: PublicFilters) {
  if (filters.q) {
    q.where((b) => b.whereILike("title", `%${filters.q}%`).orWhereILike("provider_name", `%${filters.q}%`));
  }
  if (filters.country) q.where({ country: filters.country });
  if (filters.basis) q.where({ basis: filters.basis });
  if (filters.coverage_type) q.where({ coverage_type: filters.coverage_type });
  if (filters.degree_level) q.whereRaw("? = ANY(degree_levels)", [filters.degree_level]);
  if (filters.coverage_min !== undefined) q.where("coverage_amount", ">=", filters.coverage_min);
  return q;
}

/** An institution scholarship's public slug — they have no slug of their own. */
const EXTRACTED_SLUG_PREFIX = "inst-";
const raw = (sql: string) => masterKnex.raw(sql);

/**
 * Public scholarships come from two places: the platform's own curated `scholarships`, and each
 * institution's own (superadmin.extraction_scholarships — what the portal's Scholarships tab
 * edits), shaped to the same columns. An institution scholarship is public on the same terms as
 * its courses: published institution, public job (publicJobSql), and at least one approved,
 * published course behind it — a linked one, or for an institution-wide (unlinked) scholarship any
 * of the job's. Institution scholarships have no review of their own, so that course gate is it.
 * degree_levels come from those same courses, so the degree-level filter finds them.
 */
function publicScholarships() {
  const platform = masterKnex(TABLE).where({ is_published: true }).select(
    raw("id::text as id"), "title", "slug", "description", "provider_name", "source_type", "country", "city", "region",
    "basis", "degree_levels", "requirements_summary", "coverage_type", "coverage_amount", "coverage_currency",
    "coverage_description", "deadline", "deadline_notes", "application_url", "source_url", "is_featured", "view_count",
    raw("null::int as institution_id"),
  );
  const A = `${S}.extraction_course_scholarship_assignments`;
  // The approved, published courses that make an institution scholarship public: its linked ones,
  // or — when it links none (institution-wide) — every one on its job.
  const backingCourses = `from ${S}.extraction_courses ec
    where ${approvedCourseSql("ec")} and ec.is_published and (
      ec.id in (select a.course_id from ${A} a where a.scholarship_id = es.id)
      or (ec.job_id = es.job_id and not exists (select 1 from ${A} a where a.scholarship_id = es.id)))`;
  const institution = masterKnex(`${S}.extraction_scholarships as es`)
    .join("institutions as i", (j) => j.on("i.source_job_id", "es.job_id").andOnVal("i.is_published", true).andOnNull("i.deleted_at"))
    .join(`${S}.extraction_jobs as ej`, "ej.id", "es.job_id")
    .leftJoin("countries as c", "c.id", "i.country_id")
    .whereRaw(publicJobSql("ej"))
    .whereRaw(`exists (select 1 ${backingCourses})`)
    .select(
      raw("es.id::text as id"), "es.name as title", raw(`'${EXTRACTED_SLUG_PREFIX}' || es.id as slug`), "es.description",
      "i.institution_name as provider_name", raw("'university' as source_type"), "c.name as country", "i.city",
      raw("null::text as region"), raw("null::text as basis"), raw(`coalesce((select array_agg(distinct ec.degree_level_code) ${backingCourses} and ec.degree_level_code is not null), '{}'::text[]) as degree_levels`),
      raw("null::text as requirements_summary"), raw("coalesce(es.coverage_type, 'various') as coverage_type"),
      "es.amount as coverage_amount", raw("coalesce(es.currency, 'USD') as coverage_currency"),
      raw("null::text as coverage_description"), "es.deadline", raw("null::text as deadline_notes"),
      "es.application_url", "es.source_url", raw("false as is_featured"), raw("0 as view_count"), "i.id as institution_id",
    );
  return masterKnex.from(masterKnex.raw("(? union all ?) as s", [platform, institution]));
}

export async function listPublished(limit: number, offset: number, filters: PublicFilters) {
  const q = publicScholarships().select("*")
    .orderBy("is_featured", "desc").orderByRaw("deadline asc nulls last").limit(limit).offset(offset);
  return applyPublicFilters(q, filters);
}

export async function countPublished(filters: PublicFilters) {
  const q = publicScholarships().count("* as count");
  applyPublicFilters(q, filters);
  const [row] = (await q) as unknown as { count: string | number }[];
  return Number(row.count);
}

export async function findPublishedBySlug(slug: string) {
  return publicScholarships().select("*").where({ slug }).first();
}

export async function incrementViewCount(id: number) {
  return masterKnex(TABLE).where({ id }).increment("view_count", 1);
}
