// Master-schema projection of every tenant service, plus the two trigger
// functions that keep it current.
//
// WHY A PROJECTION AT ALL
// Services live in per-tenant schemas (business_services, one schema per
// business/institution). A public catalog search is inherently cross-tenant, so
// the alternatives were:
//
//   1. Fan out per request — 16 schemas today, one query each, unioned in the
//      app. O(tenants) round trips per page view; at 1000 tenants it is dead.
//   2. A UNION ALL view over every tenant schema — same fan-out, just pushed
//      into the planner, and the view has to be rebuilt on every provision.
//   3. This: one master table holding one row per service, maintained inside the
//      writing transaction. Reads are a single indexed table scan regardless of
//      tenant count.
//
// WHY TRIGGERS AND NOT AN APP-LEVEL SYNC CALL
// Three different writers touch business_services (promote, the tenant CRUD API,
// the V1 loader) and more will. An app-level "remember to call syncProjection()"
// is a coordination contract that fails silently the first time somebody forgets
// — and the failure mode is a service that is published but invisible. A row
// trigger cannot be forgotten, and it commits with the write, so promote's
// atomicity covers the projection for free.
//
// WHY IT MIRRORS UNPUBLISHED ROWS TOO
// The table carries is_published and deleted_at verbatim and public reads filter
// on them. Storing only published rows would make the filter unnecessary and
// therefore untestable; mirroring everything keeps one explicit, asserted filter
// in the read path.
//
// country/city are deliberately NOT denormalised here: the owning org row lives
// in this same schema (businesses / institutions), so the read path joins it and
// can never serve a stale address.
//
// ponytail: row-level triggers doing one DELETE + one INSERT..SELECT per changed
// service. Fine at a few hundred rows per promote; if a bulk promote of 17k
// courses gets slow, make promote defer projection and call
// catalog_project_service() once per service at the end, or move to a queued
// reprojection worker.

import type { Knex } from "knex";

/** Projection columns, in INSERT order. Source expressions live in PROJECTION_SELECT. */
const COLUMNS = [
  "service_id",
  "schema_name",
  "owner_org_type",
  "owner_org_id",
  "name",
  "slug",
  "description",
  "overview",
  "image_url",
  "brochure_url",
  "tags",
  "service_category_id",
  "degree_level_id",
  "area_of_study_id",
  "study_mode",
  "price",
  "price_currency",
  "price_type",
  "duration_value",
  "duration_unit",
  "is_published",
  "is_featured",
  "awarded_by_org_type",
  "awarded_by_org_id",
  "deleted_at",
  "created_at",
  "updated_at",
  "min_fee",
  "max_fee",
  "fee_currency",
  "intake_months",
  "next_intake_date",
  "search",
] as const;

const SELECT_EXPRESSIONS = [
  "s.id",
  "%1$L::uuid",
  "o.org_type",
  "o.org_id",
  "s.name",
  "s.slug",
  "s.description",
  "s.overview",
  "s.image_url",
  "s.brochure_url",
  "s.tags",
  "s.service_category_id",
  "s.degree_level_id",
  "s.area_of_study_id",
  "s.study_mode",
  "s.price",
  "s.price_currency",
  "s.price_type",
  "s.duration_value",
  "s.duration_unit",
  "s.is_published",
  "s.is_featured",
  "s.awarded_by_org_type",
  "s.awarded_by_org_id",
  "s.deleted_at",
  "s.created_at",
  "s.updated_at",
  "f.min_fee",
  "f.max_fee",
  "f.fee_currency",
  "i.intake_months",
  "i.next_intake_date",
  `setweight(to_tsvector('english', coalesce(s.name, '')), 'A')
    || setweight(to_tsvector('english', coalesce(array_to_string(s.tags, ' '), '')), 'B')
    || setweight(to_tsvector('english', coalesce(s.description, '') || ' ' || coalesce(s.overview, '')), 'C')`,
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("catalog_services", (t) => {
    // The tenant uuid is globally unique, so it is the natural key here.
    t.uuid("service_id").primary();
    t.uuid("schema_name").notNullable();
    t.text("owner_org_type").notNullable().checkIn(["business", "institution"], "catalog_services_owner_org_type_check");
    t.integer("owner_org_id").unsigned().notNullable();

    t.text("name").notNullable();
    t.text("slug").nullable();
    t.text("description").nullable();
    t.text("overview").nullable();
    t.text("image_url").nullable();
    t.text("brochure_url").nullable();
    t.specificType("tags", "text[]").nullable();

    t.integer("service_category_id").nullable();
    t.integer("degree_level_id").nullable();
    t.integer("area_of_study_id").nullable();
    t.specificType("study_mode", "text[]").nullable();

    t.decimal("price", null).nullable();
    t.text("price_currency").nullable();
    t.text("price_type").nullable();
    t.integer("duration_value").nullable();
    t.text("duration_unit").nullable();

    t.boolean("is_published").notNullable();
    t.boolean("is_featured").notNullable();
    t.text("awarded_by_org_type").nullable();
    t.integer("awarded_by_org_id").nullable();

    t.timestamp("deleted_at").nullable();
    t.timestamp("created_at").notNullable();
    t.timestamp("updated_at").notNullable();

    t.decimal("min_fee", null).nullable();
    t.decimal("max_fee", null).nullable();
    t.text("fee_currency").nullable();
    t.specificType("intake_months", "integer[]").nullable();
    t.date("next_intake_date").nullable();

    t.specificType("search", "tsvector").nullable();
  });

  // Every public read starts from (is_published, deleted_at), so the hot indexes
  // are partial on exactly that.
  await knex.raw(`
    CREATE INDEX catalog_services_live_category_idx
      ON catalog_services (service_category_id, degree_level_id, area_of_study_id)
      WHERE is_published AND deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX catalog_services_live_created_idx
      ON catalog_services (created_at DESC)
      WHERE is_published AND deleted_at IS NULL
  `);
  await knex.raw(`CREATE INDEX catalog_services_search_idx ON catalog_services USING gin (search)`);
  await knex.raw(`CREATE INDEX catalog_services_intake_months_idx ON catalog_services USING gin (intake_months)`);
  await knex.raw(`CREATE INDEX catalog_services_owner_idx ON catalog_services (owner_org_type, owner_org_id)`);
  await knex.raw(`CREATE INDEX catalog_services_schema_idx ON catalog_services (schema_name)`);
  await knex.raw(`CREATE INDEX catalog_services_fee_idx ON catalog_services (min_fee)`);

  // ── catalog_project_service(schema, service_id) ────────────────────────────
  // Rebuilds exactly one projection row from the tenant schema. Delete + insert
  // rather than upsert so the column list appears once.
  //
  // The JOIN against the owning org is what makes a throwaway tenant schema (no
  // businesses/institutions row pointing at it) a silent no-op instead of an
  // error — schema-level tests provision bare schemas.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.catalog_project_service(p_schema text, p_service_id uuid)
    RETURNS void
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      DELETE FROM public.catalog_services WHERE service_id = p_service_id;

      EXECUTE format($q$
        INSERT INTO public.catalog_services (${COLUMNS.join(", ")})
        SELECT ${SELECT_EXPRESSIONS.join(",\n               ")}
          FROM %1$I.business_services s
          JOIN (
            SELECT 'business'::text AS org_type, id AS org_id
              FROM public.businesses WHERE schema_name = %1$L::uuid
            UNION ALL
            SELECT 'institution'::text, id
              FROM public.institutions WHERE schema_name = %1$L::uuid AND deleted_at IS NULL
          ) o ON true
          LEFT JOIN LATERAL (
            SELECT min(total_amount) AS min_fee,
                   max(total_amount) AS max_fee,
                   min(currency)     AS fee_currency
              FROM %1$I.service_fees
             WHERE service_id = s.id AND deleted_at IS NULL AND total_amount > 0
          ) f ON true
          LEFT JOIN LATERAL (
            SELECT array_remove(array_agg(DISTINCT intake_month), NULL) AS intake_months,
                   min(start_date) FILTER (WHERE start_date >= current_date) AS next_intake_date
              FROM %1$I.service_intakes
             WHERE service_id = s.id AND deleted_at IS NULL
          ) i ON true
         WHERE s.id = %2$L::uuid
      $q$, p_schema, p_service_id);
    END;
    $fn$
  `);

  // Two trigger wrappers, not one: a generic function referencing both NEW.id
  // and NEW.service_id would fail on whichever table lacks the column.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.catalog_project_from_service()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        DELETE FROM public.catalog_services WHERE service_id = OLD.id;
        RETURN OLD;
      END IF;
      PERFORM public.catalog_project_service(TG_TABLE_SCHEMA, NEW.id);
      RETURN NEW;
    END;
    $fn$
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.catalog_project_from_child()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        PERFORM public.catalog_project_service(TG_TABLE_SCHEMA, OLD.service_id);
        RETURN OLD;
      END IF;
      -- A moved child has to refresh both sides.
      IF TG_OP = 'UPDATE' AND OLD.service_id <> NEW.service_id THEN
        PERFORM public.catalog_project_service(TG_TABLE_SCHEMA, OLD.service_id);
      END IF;
      PERFORM public.catalog_project_service(TG_TABLE_SCHEMA, NEW.service_id);
      RETURN NEW;
    END;
    $fn$
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS public.catalog_project_from_child()`);
  await knex.raw(`DROP FUNCTION IF EXISTS public.catalog_project_from_service()`);
  await knex.raw(`DROP FUNCTION IF EXISTS public.catalog_project_service(text, uuid)`);
  await knex.schema.dropTableIfExists("catalog_services");
}
