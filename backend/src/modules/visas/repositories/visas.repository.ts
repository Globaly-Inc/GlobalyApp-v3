// Public visa + MARA directory reads.
//
// WHAT THIS REPLACES
// V1 served these four shapes through SECURITY DEFINER RPCs (search_visas,
// get_visa_detail, search_mara_agents, get_mara_agent_detail) because anon had no
// SELECT grant on `businesses`. V2 restated them as service-role queries with the
// RPC predicates hard-coded. V3 has no RLS at all — auth is app-layer — so the
// predicates are ordinary WHERE clauses, and the only thing that matters is that
// there is exactly ONE place they live.
//
// THE VISA READ REUSES THE CATALOG SCOPE
// A visa is a published service in some tenant schema. `search`'s catalog
// repository already owns "which services may an anonymous visitor see" —
// liveScope() — and the polymorphic owner join — baseQuery(). Restating either
// here would mean two definitions of public visibility that can drift apart, so
// this joins visa_service_details onto that query instead.
//
// DELIBERATE DIVERGENCE FROM V2
// V2 additionally required `businesses_public.status = 'verified'`. V3's public
// catalog deliberately does not consult the owning org's own publish/verify flag
// (see catalog.repository.baseQuery): an unclaimed institution is unpublished by
// definition, and its listings are exactly what the public directory exists to
// show. Immigration departments arrive through extraction as unclaimed
// institutions, so applying V2's predicate would render the visa directory empty.
//
// DATES ARE CAST TO text
// node-pg turns a `date` column into a JS Date at local midnight, which serialises
// as a UTC timestamp and can slide a day either way. V1 returned 'YYYY-MM-DD'
// strings, so the casts keep the wire shape stable regardless of server timezone.

import type { Knex } from "knex";

import { masterKnex } from "../../../core/db/master-pool.js";
import { baseQuery, liveScope } from "../../search/repositories/catalog.repository.js";
import type { MaraListQuery, VisaListQuery } from "../schemas/visas.schema.js";

const V = "visa_service_details";
const M = "agent_mara_details";
const C = "catalog_services";

export type Row = Record<string, unknown>;

/**
 * The owning org's public display name and slug. V1 called every org a
 * "business", and the wire keys (`department_business_id`, `business_id`) keep
 * that name for parity even though a V3 immigration department is normally an
 * unclaimed `institutions` row.
 */
const ORG_NAME = "coalesce(b.business_name, i.institution_name)";
const ORG_SLUG = "coalesce(b.slug, i.slug)";

const VISA_SUMMARY_COLUMNS = (db: Knex) => [
  `${C}.service_id`,
  `${C}.name`,
  `${C}.slug`,
  `${C}.description`,
  db.raw(`${C}.owner_org_id as department_business_id`),
  db.raw(`${ORG_NAME} as department_name`),
  `${V}.subclass_code`,
  `${V}.country_code`,
  `${V}.category`,
  `${V}.visa_stream`,
  `${V}.duration_months`,
  `${V}.is_permanent`,
  `${V}.points_test_required`,
  `${V}.min_points`,
  `${V}.application_fee_amount`,
  `${V}.application_fee_currency`,
  `${V}.processing_time_min_days`,
  `${V}.processing_time_max_days`,
];

/** V2's `visaDetail` = summary minus `slug`, plus these. */
const VISA_DETAIL_COLUMNS = (db: Knex) => [
  ...VISA_SUMMARY_COLUMNS(db).filter((c) => c !== `${C}.slug`),
  `${C}.overview`,
  db.raw(`${ORG_SLUG} as department_slug`),
  `${V}.work_rights`,
  `${V}.study_rights`,
  `${V}.english_requirements`,
  `${V}.eligible_nationalities`,
  `${V}.excluded_nationalities`,
  `${V}.age_min`,
  `${V}.age_max`,
  `${V}.official_url`,
  `${V}.source_url`,
];

function visaBase(db: Knex): Knex.QueryBuilder {
  return liveScope(baseQuery(db)).innerJoin(V, `${V}.service_id`, `${C}.service_id`);
}

export async function searchVisas(filters: VisaListQuery, db: Knex = masterKnex): Promise<Row[]> {
  const query = visaBase(db);
  if (filters.country) query.where(`${V}.country_code`, filters.country.toUpperCase());
  if (filters.category) query.where(`${V}.category`, filters.category);
  if (filters.q) {
    // V1/V2 matched name, subclass code and category. Deliberately ILIKE and not
    // the tsvector column: a subclass code ("500", "482") is not a word.
    query.where(function () {
      void this.where(`${C}.name`, "ilike", `%${filters.q}%`)
        .orWhere(`${V}.subclass_code`, "ilike", `%${filters.q}%`)
        .orWhere(`${V}.category`, "ilike", `%${filters.q}%`);
    });
  }
  return query
    .select(VISA_SUMMARY_COLUMNS(db))
    .orderBy(`${V}.country_code`, "asc")
    .orderBy(`${V}.subclass_code`, "asc")
    .limit(filters.limit)
    .offset(filters.offset);
}

/** Mirror of get_visa_detail(_country_code, _subclass). */
export async function findVisa(
  countryCode: string,
  subclass: string,
  db: Knex = masterKnex,
): Promise<Row | undefined> {
  return visaBase(db)
    .where(`${V}.country_code`, countryCode.toUpperCase())
    .where(`${V}.subclass_code`, subclass)
    .select(VISA_DETAIL_COLUMNS(db))
    .first();
}

// ── MARA agents ─────────────────────────────────────────────────────────────

/**
 * The org join for a MARA record. Mirrors the "an org the public may open"
 * predicate in search/repositories/profiles.repository.ts: a business must be
 * published, an unclaimed institution is visible on its own (it is a directory
 * listing), and neither may be soft-deleted.
 *
 * NOTE the column list below: `agent_mara_details` deliberately carries no email,
 * phone or street address (see 20260817_621), and nothing here reaches across to
 * the org's own contact columns either. The directory publishes a registration
 * record, not a way to contact somebody.
 */
function maraBase(db: Knex): Knex.QueryBuilder {
  return db(M)
    .leftJoin("businesses as b", function () {
      this.on(`${M}.org_id`, "b.id").andOnVal(`${M}.org_type`, "business");
    })
    .leftJoin("institutions as i", function () {
      this.on(`${M}.org_id`, "i.id").andOnVal(`${M}.org_type`, "institution");
    })
    .whereRaw("(b.id is not null or i.id is not null)")
    .whereNull("b.deleted_at")
    .whereNull("i.deleted_at")
    .whereRaw("(b.id is null or b.is_published = true)");
}

const MARA_SUMMARY_COLUMNS = (db: Knex) => [
  db.raw(`${M}.org_id as business_id`),
  db.raw(`${ORG_NAME} as business_name`),
  db.raw(`${ORG_SLUG} as business_slug`),
  `${M}.marn`,
  `${M}.registration_status`,
  db.raw(`${M}.expiry_date::text as expiry_date`),
  `${M}.office_state`,
  `${M}.office_city`,
  `${M}.languages_spoken`,
  `${M}.practice_areas`,
];

const MARA_DETAIL_COLUMNS = (db: Knex) => [
  ...MARA_SUMMARY_COLUMNS(db),
  db.raw(`${M}.registration_date::text as registration_date`),
  `${M}.office_country`,
  `${M}.source_url`,
];

export async function searchMaraAgents(filters: MaraListQuery, db: Knex = masterKnex): Promise<Row[]> {
  const query = maraBase(db);
  if (filters.state) query.where(`${M}.office_state`, "ilike", filters.state);
  if (filters.q) {
    query.where(function () {
      void this.whereRaw(`${ORG_NAME} ilike ?`, [`%${filters.q}%`])
        .orWhere(`${M}.business_name`, "ilike", `%${filters.q}%`)
        .orWhere(`${M}.marn`, "ilike", `%${filters.q}%`);
    });
  }
  return query
    .select(MARA_SUMMARY_COLUMNS(db))
    .orderByRaw(`${ORG_NAME} asc nulls last`)
    .limit(filters.limit)
    .offset(filters.offset);
}

/** Mirror of get_mara_agent_detail(_marn). */
export async function findMaraAgent(marn: string, db: Knex = masterKnex): Promise<Row | undefined> {
  return maraBase(db).where(`${M}.marn`, marn).select(MARA_DETAIL_COLUMNS(db)).first();
}
