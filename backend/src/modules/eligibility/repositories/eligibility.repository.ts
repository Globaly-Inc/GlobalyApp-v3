// Knex-only data access for eligibility checks. MASTER schema — §1.2 puts the table
// in `public` (see globalyapp/20260818_350), so every master query here runs on
// masterKnex, never req.db.
//
// NO `select *` ANYWHERE. Each read below names its columns, and the two that read
// rows other modules own (platform_user_profiles, the tenant business_services row)
// name the SMALLEST set the rule engine actually consumes. That is not tidiness:
// platform_user_profiles carries deleted_at and 30 other fields, and the tenant
// service row carries `meta`, `public_visibility` and internal pricing — none of
// which any eligibility response should be able to leak.

import type { Knex } from "knex";

import { masterKnex } from "../../../core/db/master-pool.js";
import { baseQuery, liveScope } from "../../search/repositories/catalog.repository.js";
import type { EligibilityResult } from "../consts.js";

export type Db = Knex | Knex.Transaction;

export const db = (): Knex => masterKnex;

export interface CheckRow {
  id: number;
  service_id: string;
  result: EligibilityResult;
  met_requirements: string[];
  unmet_requirements: string[];
  notes: string | null;
  created_at: Date;
}

/** Exactly the seven profile fields the rule engine reads. Nothing else. */
const PROFILE_COLUMNS = [
  "highest_degree_level",
  "gpa",
  "english_test_score",
  "english_test_type",
  "budget_max",
  "preferred_destinations",
  "completion_percentage",
] as const;

export interface ProfileRow {
  highest_degree_level: string | null;
  gpa: string | number | null;
  english_test_score: string | number | null;
  english_test_type: string | null;
  budget_max: number | null;
  preferred_destinations: unknown;
  completion_percentage: number | null;
}

export async function findProfile(userId: number, conn: Db = db()): Promise<ProfileRow | undefined> {
  return conn("platform_user_profiles")
    .where({ user_id: userId })
    .whereNull("deleted_at")
    .select(PROFILE_COLUMNS as unknown as string[])
    .first();
}

export interface CheckableServiceRow {
  service_id: string;
  name: string;
  price: string | number | null;
  price_currency: string | null;
  schema_name: string;
  country_id: number | null;
  country_name: string | null;
}

/**
 * The service a check may be run against, or undefined.
 *
 * Goes through the public catalog's own `baseQuery`/`liveScope` rather than
 * restating the publish predicate: liveScope is the single place
 * `is_published AND deleted_at IS NULL AND the owning org is live` lives, and the
 * catalog leak tests already point at it. An unpublished or soft-deleted service is
 * therefore not checkable, which is also V1's contract — its course picker queried
 * `is_published = true`.
 *
 * `schema_name` is selected because the requirements live in the owning tenant's
 * schema and nothing else can find them. It never leaves this module.
 */
export async function findCheckableService(serviceId: string): Promise<CheckableServiceRow | undefined> {
  return liveScope(baseQuery())
    .where("catalog_services.service_id", serviceId)
    .select(
      "catalog_services.service_id",
      "catalog_services.name",
      "catalog_services.price",
      "catalog_services.price_currency",
      "catalog_services.schema_name",
      "c.id as country_id",
      "c.name as country_name",
    )
    .first();
}

/**
 * The service's requirement blob, from the row inside the owning tenant's schema.
 *
 * `category_specific_data` is the only column read, and it is the only column V1's
 * rules consume. The schema name comes from the projection row this module just
 * read — never from request input — and knex quotes it as an identifier. Named
 * schema-first rather than via withSchema() for the reason
 * search/catalog.repository.ts records: withSchema also rewrites already-qualified
 * join targets.
 */
export async function findServiceRequirements(
  schema: string,
  serviceId: string,
): Promise<Record<string, unknown> | undefined> {
  const row = await masterKnex(`${schema}.business_services`)
    .where({ id: serviceId })
    .whereNull("deleted_at")
    .select("category_specific_data")
    .first();
  return row?.category_specific_data as Record<string, unknown> | undefined;
}

// ── the check history ───────────────────────────────────────────────────────

/** THE owner predicate. Nothing in this module reads a check without going through it. */
function ownQuery(userId: number, conn: Db = db()) {
  return conn("student_eligibility_checks").where({ platform_user_id: userId });
}

const CHECK_COLUMNS = [
  "id",
  "service_id",
  "result",
  "met_requirements",
  "unmet_requirements",
  "notes",
  "created_at",
] as const;

export async function insert(
  userId: number,
  values: {
    service_id: string;
    result: EligibilityResult;
    met_requirements: string[];
    unmet_requirements: string[];
    notes: string;
  },
  conn: Db = db(),
): Promise<CheckRow> {
  const [row] = await conn("student_eligibility_checks")
    .insert({
      platform_user_id: userId,
      service_id: values.service_id,
      result: values.result,
      // Stringified explicitly: knex passes a JS array to pg as a Postgres array
      // literal, which a jsonb column rejects.
      met_requirements: JSON.stringify(values.met_requirements),
      unmet_requirements: JSON.stringify(values.unmet_requirements),
      notes: values.notes,
    })
    .returning(CHECK_COLUMNS as unknown as string[]);
  return row as CheckRow;
}

/** One student's checks, newest first. Owner-scoped by construction. */
export async function list(
  userId: number,
  opts: { limit: number; offset: number },
  conn: Db = db(),
): Promise<CheckRow[]> {
  return ownQuery(userId, conn)
    .select(CHECK_COLUMNS as unknown as string[])
    .orderBy("id", "desc")
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function count(userId: number, conn: Db = db()): Promise<number> {
  const row = await ownQuery(userId, conn).count({ count: "*" }).first();
  return Number(row?.count ?? 0);
}

/**
 * The service name + provider for each check on the page, resolved from the master
 * projection. V1 joined `business_services` + `businesses` for exactly this.
 *
 * One batched query for the whole page, not one per row. Soft-deleted and
 * unpublished services are included here on purpose: a check made months ago
 * against a course that has since been withdrawn must still say what it was
 * about, and the history page grants no access to the service itself. What it must
 * NOT do is expose `schema_name`, so that column is not selected.
 */
export async function resolveServices(
  serviceIds: readonly string[],
): Promise<Map<string, { name: string; provider_name: string | null }>> {
  if (serviceIds.length === 0) return new Map();
  const rows = await baseQuery()
    .whereIn("catalog_services.service_id", [...serviceIds])
    .select(
      "catalog_services.service_id",
      "catalog_services.name",
      masterKnex.raw("coalesce(b.business_name, i.institution_name) as provider_name"),
    );
  return new Map(
    (rows as Array<{ service_id: string; name: string; provider_name: string | null }>).map((r) => [
      r.service_id,
      { name: r.name, provider_name: r.provider_name },
    ]),
  );
}
