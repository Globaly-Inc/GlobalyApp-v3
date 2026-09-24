// Admin oversight reads against globalyapp.enquiries + enquiry_distributions.
// Course/institution names live in the superadmin schema — same cross-schema join the
// student-facing repository uses (modules/enquiries/repositories/enquiries.repository.ts).

import { masterKnex } from "../../../../../core/db/master-pool.js";
import { getKnex } from "../../../../../core/db/pool-manager.js";
import { schemaName } from "../../../../../core/db/knex.js";
import { createChildLogger } from "../../../../../shared/logger.js";

const logger = createChildLogger("admin-enquiries");

export interface EnquiryFilters {
  search?: string;
  /** Several statuses at once — the screen filters by lifecycle bucket, not by one status. */
  status?: string[];
}

const studentName = (alias: string) => `trim(concat(${alias}.first_name, ' ', coalesce(${alias}.last_name, '')))`;

/** Per-enquiry rollup: who received it, how many paid, what they paid. */
function distributionRollup() {
  return masterKnex("enquiry_distributions")
    .whereNull("deleted_at")
    .groupBy("enquiry_id")
    .select("enquiry_id")
    .select(
      masterKnex.raw("count(*)::int as recipients"),
      masterKnex.raw("count(*) FILTER (WHERE unlocked_at IS NOT NULL)::int as unlocked_count"),
      masterKnex.raw("coalesce(sum(coin_cost) FILTER (WHERE unlocked_at IS NOT NULL), 0)::int as coins_spent"),
    );
}

function listBase(filters: EnquiryFilters) {
  const q = masterKnex("enquiries as e")
    .join("superadmin.extraction_courses as c", "c.id", "e.course_id")
    .leftJoin("superadmin.extraction_institution_overview as o", "o.job_id", "e.extraction_job_id")
    .join("platform_users as s", "s.id", "e.student_id")
    .whereNull("e.deleted_at");

  if (filters.status?.length) q.whereIn("e.status", filters.status);
  if (filters.search) {
    const term = `%${filters.search}%`;
    q.where((w) =>
      w
        .whereILike("s.email", term)
        .orWhereILike("c.name", term)
        .orWhereILike("o.name", term)
        .orWhereRaw(`${studentName("s")} ILIKE ?`, [term]),
    );
  }
  return q;
}

export function list(filters: EnquiryFilters, limit: number, offset: number) {
  return listBase(filters)
    .leftJoin(distributionRollup().as("d"), "d.enquiry_id", "e.id")
    .select(
      "e.id",
      "e.status",
      "e.created_at",
      "e.preferred_intake",
      "e.preferred_year",
      "e.accept_count",
      "e.max_accepts",
      "e.last_distributed_at",
      "c.name as course_name",
      "o.name as institution_name",
      "s.id as student_id",
      "s.email as student_email",
      masterKnex.raw(`${studentName("s")} as student_name`),
      masterKnex.raw("coalesce(d.recipients, 0) as recipients"),
      masterKnex.raw("coalesce(d.unlocked_count, 0) as unlocked_count"),
      masterKnex.raw("coalesce(d.coins_spent, 0) as coins_spent"),
    )
    .orderBy("e.created_at", "desc")
    .limit(limit)
    .offset(offset);
}

export async function count(filters: EnquiryFilters): Promise<number> {
  const row = await listBase(filters).count<{ count: string }>("e.id as count").first();
  return Number(row?.count ?? 0);
}

export function findById(id: string) {
  return listBase({})
    .leftJoin("businesses as tb", "tb.id", "e.business_id")
    .where("e.id", id)
    .select(
      "e.id",
      "e.status",
      "e.message",
      "e.created_at",
      "e.preferred_intake",
      "e.preferred_year",
      "e.student_country_code",
      "e.accept_count",
      "e.max_accepts",
      "e.distribution_count",
      "e.last_distributed_at",
      "e.closed_at",
      "e.close_reason",
      "c.name as course_name",
      "c.short_name as course_short_name",
      "o.name as institution_name",
      "s.id as student_id",
      "s.email as student_email",
      masterKnex.raw(`${studentName("s")} as student_name`),
      // The enquiry was aimed at one business directly, rather than matched out. Usually null.
      "tb.business_name as target_business_name",
    )
    .first();
}

/**
 * Every recipient, unlocked or not — the admin view is the only one allowed the full list.
 *
 * Each row's status comes from the business's OWN tenant row, falling back to the central
 * distribution when that can't be read. Same rule the business inbox applies
 * (modules/enquiries/repositories/distributions.repository.ts): the tenant row is the
 * business's workflow state (unlocked → in_conversation → converted → closed), the central
 * one only tracks the platform's side, so this screen shows what the business sees.
 */
export async function listDistributions(enquiryId: string) {
  const rows = await masterKnex("enquiry_distributions as d")
    // A recipient is a business or — when nobody represented the course — the institution it
    // belongs to, so both are LEFT joined and coalesced. An inner join to businesses would
    // hide exactly the fallback rows this screen exists to explain.
    .leftJoin("businesses as b", "b.id", "d.business_id")
    .leftJoin("institutions as i", "i.id", "d.institution_id")
    .where("d.enquiry_id", enquiryId)
    .whereNull("d.deleted_at")
    .orderBy([{ column: "d.tier" }, { column: "d.match_rank" }])
    .select(
      "d.id",
      masterKnex.raw("coalesce(b.id, i.id) as business_id"),
      masterKnex.raw("coalesce(b.business_name, i.institution_name) as business_name"),
      masterKnex.raw("coalesce(b.city, i.city) as city"),
      masterKnex.raw("case when d.institution_id is null then 'business' else 'institution' end as recipient_kind"),
      // Never returned to the client — only used to open that recipient's schema below.
      masterKnex.raw("coalesce(b.schema_name, i.schema_name) as schema_name"),
      "d.tier",
      "d.match_rank",
      "d.match_distance_km",
      "d.status",
      "d.coin_cost",
      "d.unlocked_at",
      "d.closed_at",
      "d.close_reason",
      "d.created_at",
    );

  // One connection per recipient (at most MAX_DISTRIBUTIONS of them), in parallel; the
  // pool manager caches and evicts them.
  return Promise.all(
    rows.map(async ({ schema_name, ...row }) => ({
      ...row,
      status: (await tenantStatus(row.recipient_kind === "institution" ? schema_name : row.business_id, schema_name, enquiryId)) ?? row.status,
    })),
  );
}

/**
 * `poolKey` is the businesses.id for a business and the schema uuid for an institution — the
 * pool map is keyed by one string, and the two id spaces collide (see tenant.plugin).
 */
async function tenantStatus(poolKey: string | number, schema: string, enquiryId: string): Promise<string | null> {
  try {
    const tenantDb = await getKnex(poolKey, schemaName(schema));
    const row = await tenantDb("business_enquiries").where({ enquiry_id: enquiryId }).first("status");
    return row?.status ?? null;
  } catch (err) {
    // A tenant schema that won't open must not take the whole detail view down — the
    // central status is stale but not wrong, so fall back to it.
    logger.error("Failed to read tenant enquiry status", { poolKey, enquiryId, error: err });
    return null;
  }
}

export function statusCounts() {
  return masterKnex("enquiries")
    .whereNull("deleted_at")
    .select("status")
    .select(masterKnex.raw("count(*)::int as count"))
    .groupBy("status");
}

export function distributionTotals() {
  return masterKnex("enquiry_distributions")
    .whereNull("deleted_at")
    .first(
      masterKnex.raw("count(*)::int as total"),
      masterKnex.raw("count(*) FILTER (WHERE unlocked_at IS NOT NULL)::int as unlocked"),
      masterKnex.raw("coalesce(sum(coin_cost) FILTER (WHERE unlocked_at IS NOT NULL), 0)::int as coins_spent"),
    );
}
