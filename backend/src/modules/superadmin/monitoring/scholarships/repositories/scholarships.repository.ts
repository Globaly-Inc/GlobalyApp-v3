// Scholarships repository — admin-managed content (see categories/countries for the same pattern).
//
// PUBLIC READS ARE EXPLICITLY PROJECTED (Wave G1).
// `select *` was safe while the table had no admin-only column. It stopped being
// safe the moment moderation landed: review_status, review_note and reviewed_by
// would have started shipping to anonymous visitors with no code change anywhere.
// PUBLIC_COLUMNS is the V2 wire shape, and the leak test points at it.
//
// Every public read also goes through the `is_published AND deleted_at IS NULL`
// pair, in one place — for the same reason search/repositories/catalog.repository.ts
// keeps one liveScope(). A predicate restated per query is a predicate that will
// eventually be forgotten, and the failure mode is a rejected listing on the
// public directory.

import { masterKnex } from "../../../../../core/db/master-pool.js";

const TABLE = "scholarships";
const CRITERIA = "scholarship_eligibility_criteria";
const now = () => masterKnex.fn.now();

/** V2's `summary` + `detail` shapes, minus everything moderation-only. */
export const PUBLIC_COLUMNS = [
  "id", "title", "slug", "provider_name", "country", "city", "region",
  "basis", "coverage_type", "coverage_amount", "coverage_currency",
  "coverage_description", "deadline", "deadline_notes", "degree_levels",
  "description", "source_type", "requirements_summary",
  "application_url", "source_url", "view_count", "is_featured",
  "owner_org_type", "owner_org_id", "is_platform_scholarship", "created_at",
] as const;

const CRITERIA_COLUMNS = [
  "id", "criteria_type", "label", "value", "operator", "is_mandatory", "notes", "sort_order",
] as const;

type AdminFilters = {
  search?: string;
  is_published?: boolean;
  country?: string;
  review_status?: string;
  /** Set for the business-facing list — ownership is a filter, not a post-hoc check. */
  owner?: { type: string; id: number };
};
type PublicFilters = { q?: string; country?: string };

function applyAdminFilters(q: ReturnType<typeof masterKnex>, filters: AdminFilters) {
  if (filters.search) {
    q.where((b) => b.whereILike("title", `%${filters.search}%`).orWhereILike("provider_name", `%${filters.search}%`));
  }
  if (filters.is_published !== undefined) q.where({ is_published: filters.is_published });
  if (filters.country) q.where({ country: filters.country });
  if (filters.review_status) q.where({ review_status: filters.review_status });
  if (filters.owner) q.where({ owner_org_type: filters.owner.type, owner_org_id: filters.owner.id });
  return q;
}

export async function listAdmin(limit: number, offset: number, filters: AdminFilters) {
  const q = masterKnex(TABLE)
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(limit)
    .offset(offset);
  return applyAdminFilters(q, filters);
}

export async function countAdmin(filters: AdminFilters) {
  const q = masterKnex(TABLE).whereNull("deleted_at").count("* as count");
  applyAdminFilters(q, filters);
  const [row] = await q;
  return Number(row.count);
}

export async function findById(id: number) {
  return masterKnex(TABLE).where({ id }).whereNull("deleted_at").first();
}

/** Moderation counters for the admin header. */
export async function stats() {
  const [row] = await masterKnex(TABLE)
    .whereNull("deleted_at")
    .select(
      masterKnex.raw("count(*)::int as total"),
      masterKnex.raw("count(*) filter (where is_published)::int as published"),
      masterKnex.raw("count(*) filter (where review_status = 'pending')::int as pending"),
      masterKnex.raw("count(*) filter (where review_status = 'approved')::int as approved"),
      masterKnex.raw("count(*) filter (where review_status = 'rejected')::int as rejected"),
      masterKnex.raw("count(*) filter (where is_featured)::int as featured"),
    );
  return row as unknown as Record<string, number>;
}

export async function insert(data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE).insert(data).returning("*");
  return row;
}

export async function update(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex(TABLE)
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...data, updated_at: now() })
    .returning("*");
  return row;
}

/** Soft delete — every other V3 table family soft-deletes, and an admin misclick is otherwise unrecoverable. */
export async function remove(id: number) {
  return masterKnex(TABLE)
    .where({ id })
    .whereNull("deleted_at")
    .update({ deleted_at: now(), updated_at: now() });
}

// ── Public reads (published only) ──

function applyPublicFilters(q: ReturnType<typeof masterKnex>, filters: PublicFilters) {
  if (filters.q) {
    q.where((b) => b.whereILike("title", `%${filters.q}%`).orWhereILike("provider_name", `%${filters.q}%`));
  }
  if (filters.country) q.where({ country: filters.country });
  return q;
}

/** The only rows an unauthenticated visitor may ever see. */
function live() {
  return masterKnex(TABLE).where({ is_published: true }).whereNull("deleted_at");
}

export async function listPublished(limit: number, offset: number, filters: PublicFilters) {
  const q = live()
    .select([...PUBLIC_COLUMNS])
    // V2: featured first, then the soonest deadline. NULLS LAST because a
    // rolling-deadline scholarship must not crowd out the ones about to close.
    .orderByRaw("is_featured desc, deadline asc nulls last, id asc")
    .limit(limit)
    .offset(offset);
  return applyPublicFilters(q, filters);
}

export async function countPublished(filters: PublicFilters) {
  const q = live().count("* as count");
  applyPublicFilters(q, filters);
  const [row] = await q;
  return Number(row.count);
}

export async function findPublishedBySlug(slug: string) {
  return live().where({ slug }).select([...PUBLIC_COLUMNS]).first();
}

export async function listCriteria(scholarshipId: number) {
  return masterKnex(CRITERIA)
    .where({ scholarship_id: scholarshipId })
    .whereNull("deleted_at")
    .orderBy("sort_order", "asc")
    .orderBy("id", "asc")
    .select([...CRITERIA_COLUMNS]);
}

/**
 * V1's increment_scholarship_view RPC. Scoped to live rows so a draft cannot be
 * probed for existence through its counter — the same trust boundary V2 drew when
 * it ran this under the service role.
 */
export async function incrementViewCountBySlug(slug: string) {
  const updated = await live()
    .where({ slug })
    .update({ view_count: masterKnex.raw("coalesce(view_count, 0) + 1") });
  return updated > 0;
}

/**
 * The facet aggregate, one round trip, same keys the V1 facets_scholarships RPC
 * returned. Raw SQL for the reason V2 used it too: three GROUP BYs and an unnest
 * over one filtered base is a single CTE, not four queries.
 */
export async function facets(q: string) {
  const { rows } = await masterKnex.raw(
    `
    WITH base AS (
      SELECT country, basis, degree_levels FROM ${TABLE}
       WHERE is_published = true AND deleted_at IS NULL
         AND (? = '' OR title ILIKE '%' || ? || '%')
    )
    SELECT
      COALESCE((SELECT jsonb_agg(jsonb_build_object('value', country, 'count', c))
        FROM (SELECT country, count(*)::int c FROM base WHERE country IS NOT NULL
              GROUP BY country ORDER BY c DESC, country ASC LIMIT 30) x), '[]'::jsonb) AS countries,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('value', basis, 'count', c))
        FROM (SELECT basis, count(*)::int c FROM base WHERE basis IS NOT NULL
              GROUP BY basis ORDER BY c DESC, basis ASC) x), '[]'::jsonb) AS bases,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('value', lvl, 'count', c))
        FROM (SELECT unnest(degree_levels) lvl, count(*)::int c FROM base
              GROUP BY 1 ORDER BY c DESC, 1 ASC) x), '[]'::jsonb) AS degree_levels,
      (SELECT count(*)::int FROM base) AS total
    `,
    [q, q],
  );
  return rows[0] as Record<string, unknown>;
}
