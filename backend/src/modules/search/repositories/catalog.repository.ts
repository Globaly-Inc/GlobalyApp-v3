// Public catalog reads.
//
// Everything reads public.catalog_services — the master projection of every
// tenant service (see globalyapp/20260817_003_catalog_services.ts for why a
// projection and not a per-request fan-out across tenant schemas). The owning org
// and the reference vocabularies are joined live from the same schema, so a
// renamed degree level or a moved business never needs a reprojection.
//
// THE PUBLISH FILTER
// The projection deliberately mirrors unpublished and soft-deleted rows too. Every
// read below therefore goes through liveScope(), which is the single place the
// `is_published AND deleted_at IS NULL` predicate lives. Dropping it is what the
// leak tests assert against.
//
// pgvector/embeddings are out of scope (Wave E1) — this is plain SQL and
// tsvector text search only.

import type { Knex } from "knex";

import { masterKnex } from "../../../core/db/master-pool.js";
import type { ListServicesQuery } from "../schemas/catalog.schema.js";

const T = "catalog_services";

/** The only rows an unauthenticated visitor may ever see. */
function liveScope(query: Knex.QueryBuilder): Knex.QueryBuilder {
  return query
    .where(`${T}.is_published`, true)
    .whereNull(`${T}.deleted_at`)
    // A hard-deleted org would otherwise leave orphan projection rows readable.
    .whereRaw("(b.id is not null or i.id is not null)")
    .whereNull("b.deleted_at")
    .whereNull("i.deleted_at");
}

/**
 * The owning org is polymorphic (business | institution) because a service may
 * belong to an unclaimed institution. Note the org's OWN is_published flag is not
 * consulted: an unclaimed directory listing is unpublished by definition, and its
 * services are exactly what the public catalog exists to show.
 */
function baseQuery(db: Knex = masterKnex): Knex.QueryBuilder {
  return db(T)
    .leftJoin("businesses as b", function () {
      this.on(`${T}.owner_org_id`, "b.id").andOnVal(`${T}.owner_org_type`, "business");
    })
    .leftJoin("institutions as i", function () {
      this.on(`${T}.owner_org_id`, "i.id").andOnVal(`${T}.owner_org_type`, "institution");
    })
    .leftJoin("countries as c", "c.id", db.raw("coalesce(b.country_id, i.country_id)"))
    .leftJoin("service_categories as sc", "sc.id", `${T}.service_category_id`)
    .leftJoin("degree_levels as dl", "dl.id", `${T}.degree_level_id`)
    .leftJoin("areas_of_study as ao", "ao.id", `${T}.area_of_study_id`);
}

const LIST_COLUMNS = [
  `${T}.service_id`,
  `${T}.name`,
  `${T}.slug`,
  `${T}.description`,
  `${T}.image_url`,
  `${T}.tags`,
  `${T}.study_mode`,
  `${T}.price`,
  `${T}.price_currency`,
  `${T}.price_type`,
  `${T}.duration_value`,
  `${T}.duration_unit`,
  `${T}.is_featured`,
  `${T}.min_fee`,
  `${T}.max_fee`,
  `${T}.fee_currency`,
  `${T}.intake_months`,
  `${T}.next_intake_date`,
  `${T}.created_at`,
  `${T}.owner_org_type`,
  `${T}.owner_org_id`,
  "sc.id as category_id",
  "sc.name as category_name",
  "sc.slug as category_slug",
  "dl.id as degree_level_id",
  "dl.name as degree_level_name",
  "dl.slug as degree_level_slug",
  "ao.id as area_of_study_id",
  "ao.name as area_of_study_name",
  "ao.slug as area_of_study_slug",
] as const;

const OWNER_COLUMNS = [
  "coalesce(b.business_name, i.institution_name) as owner_name",
  "coalesce(b.city, i.city) as owner_city",
  "coalesce(b.logo_url, i.logo_url) as owner_logo_url",
  "coalesce(b.website, i.website) as owner_website",
  "i.claim_status as owner_claim_status",
  "c.id as country_id",
  "c.name as country_name",
  "c.iso2 as country_iso2",
] as const;

function applyFilters(query: Knex.QueryBuilder, input: ListServicesQuery): Knex.QueryBuilder {
  if (input.country) {
    const country = input.country;
    query.where((w) => {
      if (/^\d+$/.test(country)) w.where("c.id", Number(country));
      else
        w.whereRaw("lower(c.iso2) = lower(?)", [country])
          .orWhereRaw("lower(c.iso3) = lower(?)", [country])
          .orWhereRaw("lower(c.name) = lower(?)", [country]);
    });
  }
  if (input.city) query.whereRaw("lower(coalesce(b.city, i.city)) = lower(?)", [input.city]);

  for (const [filter, table] of [
    [input.category, "sc"],
    [input.degree_level, "dl"],
    [input.area_of_study, "ao"],
  ] as const) {
    if (!filter) continue;
    if ("id" in filter) query.where(`${table}.id`, filter.id);
    else query.whereRaw(`lower(${table}.slug) = ?`, [filter.slug]);
  }

  // A service matches a fee window when its own range overlaps it. min_fee is
  // null for services with no priced fee row — those only show when unfiltered.
  if (input.fee_min !== undefined) query.where(`${T}.max_fee`, ">=", input.fee_min);
  if (input.fee_max !== undefined) query.where(`${T}.min_fee`, "<=", input.fee_max);

  if (input.intake_month !== undefined) query.whereRaw(`${T}.intake_months @> ?::integer[]`, [[input.intake_month]]);
  if (input.intake_from) query.where(`${T}.next_intake_date`, ">=", input.intake_from);

  if (input.study_mode) query.whereRaw(`${T}.study_mode @> ?::text[]`, [[input.study_mode]]);
  if (input.featured !== undefined) query.where(`${T}.is_featured`, input.featured);
  if (input.org_type) query.where(`${T}.owner_org_type`, input.org_type);
  if (input.org_id !== undefined) query.where(`${T}.owner_org_id`, input.org_id);

  if (input.q) {
    // websearch_to_tsquery never throws on visitor input; the ILIKE arm keeps
    // partial words ("bach") findable, which a lexeme match alone would miss.
    query.where((w) =>
      w
        .whereRaw(`${T}.search @@ websearch_to_tsquery('english', ?)`, [input.q!])
        .orWhereRaw(`${T}.name ilike ?`, [`%${input.q!}%`]),
    );
  }

  return query;
}

function applySort(query: Knex.QueryBuilder, input: ListServicesQuery): Knex.QueryBuilder {
  switch (input.sort) {
    case "name":
      return query.orderBy(`${T}.name`, "asc");
    case "price_asc":
      return query.orderByRaw(`coalesce(${T}.min_fee, ${T}.price) asc nulls last, ${T}.name asc`);
    case "price_desc":
      return query.orderByRaw(`coalesce(${T}.min_fee, ${T}.price) desc nulls last, ${T}.name asc`);
    case "featured":
      return query.orderByRaw(`${T}.is_featured desc, ${T}.created_at desc`);
    case "newest":
      return query.orderBy(`${T}.created_at`, "desc");
    default:
      // "relevance" only means anything with a query term; without one it is
      // newest-first, which is what a browse page wants.
      return input.q
        ? query.orderByRaw(`ts_rank(${T}.search, websearch_to_tsquery('english', ?)) desc, ${T}.name asc`, [input.q])
        : query.orderBy(`${T}.created_at`, "desc");
  }
}

export async function listServices(input: ListServicesQuery, limit: number, offset: number) {
  const rows = await applySort(
    applyFilters(liveScope(baseQuery()), input)
      .select(LIST_COLUMNS as unknown as string[])
      .select(masterKnex.raw(OWNER_COLUMNS.join(", "))),
    input,
  )
    .limit(limit)
    .offset(offset);

  const [{ count }] = await applyFilters(liveScope(baseQuery()), input).count({ count: `${T}.service_id` });

  return { rows, total: Number(count) };
}

export async function findService(serviceId: string) {
  return liveScope(baseQuery())
    .where(`${T}.service_id`, serviceId)
    .select(LIST_COLUMNS as unknown as string[])
    .select(`${T}.overview`, `${T}.brochure_url`, `${T}.schema_name`, `${T}.updated_at`)
    .select(masterKnex.raw(OWNER_COLUMNS.join(", ")))
    .first();
}

/**
 * Children live in the owning tenant schema. masterKnex has no searchPath, so the
 * schema is applied explicitly per query — the uuid comes from the projection row,
 * never from request input, and knex quotes it as an identifier.
 */
export async function findServiceChildren(schema: string, serviceId: string) {
  // Tables are named schema-first rather than via withSchema(): withSchema also
  // rewrites already-qualified join targets, which turns public.fee_types into
  // "<schema>"."public"."fee_types". The schema comes from the projection row, and
  // knex quotes it as an identifier.
  const tenant = (table: string, alias: string) =>
    masterKnex(`${schema}.${table} as ${alias}`).whereNull(`${alias}.deleted_at`);

  const forService = (table: string, alias: string) =>
    tenant(table, alias).where(`${alias}.service_id`, serviceId);

  const [fees, intakes, eligibility, studyOptions, studyUnits, accreditations] = await Promise.all([
    forService("service_fees", "f")
      .leftJoin("public.fee_types as ft", "ft.id", "f.fee_type_id")
      .select("f.*", "ft.name as fee_type_name")
      .orderBy("f.total_amount", "asc"),
    forService("service_intakes", "i").select("i.*").orderBy("i.start_date", "asc"),
    forService("service_eligibility_requirements", "e").select("e.*"),
    forService("service_study_option_assignments", "a")
      .join(`${schema}.service_study_options as o`, "o.id", "a.study_option_id")
      .whereNull("o.deleted_at")
      .select("o.*"),
    forService("service_study_unit_assignments", "a")
      .join(`${schema}.service_study_units as u`, "u.id", "a.study_unit_id")
      .whereNull("u.deleted_at")
      .select("u.*", "a.unit_type"),
    forService("service_accreditation_assignments", "a")
      .join("public.accreditations as ac", "ac.id", "a.accreditation_id")
      .select("ac.id", "ac.name", "a.registration_number"),
  ]);

  return { fees, intakes, eligibility, study_options: studyOptions, study_units: studyUnits, accreditations };
}

/** Facet values for the browse UI — only ones that actually have live services. */
export async function listFacets() {
  const distinct = (table: string, column: string) =>
    liveScope(baseQuery())
      .join(`${table} as t`, "t.id", `${T}.${column}`)
      .whereNull("t.deleted_at")
      .groupBy("t.id", "t.name", "t.slug")
      .select("t.id", "t.name", "t.slug")
      .count({ services: `${T}.service_id` })
      .orderBy("t.name", "asc");

  const [categories, degreeLevels, areasOfStudy, countries] = await Promise.all([
    distinct("service_categories", "service_category_id"),
    distinct("degree_levels", "degree_level_id"),
    distinct("areas_of_study", "area_of_study_id"),
    liveScope(baseQuery())
      .whereNotNull("c.id")
      .groupBy("c.id", "c.name", "c.iso2")
      .select("c.id", "c.name", "c.iso2")
      .count({ services: `${T}.service_id` })
      .orderBy("c.name", "asc"),
  ]);

  return { categories, degree_levels: degreeLevels, areas_of_study: areasOfStudy, countries };
}
