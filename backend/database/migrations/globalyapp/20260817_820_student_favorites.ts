// Favourites — V2's `favorites` (student-activity.ts), in V3 shape. MASTER schema.
//
// PLACEMENT (§1.2). A favourite links a `platform_users` row to a target that may
// live ANYWHERE: `institutions`/`businesses`/`scholarships`/`student_jobs`/`events`
// in master, or a `business_services` row inside one tenant's schema. A row whose
// FKs straddle two tenants can never live inside a tenant schema — §1.2 is explicit
// — so this lands in master, the same call `student_job_applications` (20260817_701)
// and the cross-tenant graph (20260816_003) already made.
//
// ONE POLYMORPHIC TABLE, NOT SEVEN
// Per-entity tables (`favorite_institutions`, `favorite_scholarships`, …) would put
// the "add the next favouritable type" cost at one migration + one repository + one
// route family per type, and would make "everything I saved, newest first" — which
// is the entire V1 page — a seven-way UNION that grows with the product. V2 chose
// (item_type, item_id) and V3's own precedents agree: notifications carries
// (reference_type, reference_id) and the cross-tenant graph carries (org_type, org_id).
// A third pattern here would be invention, so: one table, one discriminator.
//
// WHY item_type IS UNCONSTRAINED TEXT
// A CHECK IN (...) would mean a schema migration every time a wave makes a new
// entity favouritable — the exact cost the brief says must not exist. 20260817_013
// (notifications.type) already ruled on this and for the same reason. The closed
// vocabulary lives in modules/favorites/consts.ts and is enforced by zod at the
// route, which is the only boundary untrusted input crosses.
//
// WHY item_id IS TEXT
// V3 master rows have serial int PKs; tenant `business_services` rows have uuid PKs
// (see catalog_services.service_id, 20260817_003). One column has to hold both, and
// notifications.reference_id set the precedent — "text, not uuid: V1 references were
// uuids, V3 primary keys are integers". Per-type id SHAPE (int vs uuid) is validated
// at the route from the same consts table, so a malformed id never reaches storage.
//
// NO owner_org_type/owner_org_id. The cross-tenant graph carries those because a
// bare `service_id` there is unresolvable — nothing says which schema owns it. Here
// it is resolvable: `catalog_services` is the master projection of every tenant
// service, keyed on that uuid, and it already carries schema_name + owner_org_*.
// Duplicating them would be a second source of truth for the same fact.
//
// HARD DELETE, NOT SOFT. Un-saving is the user retracting a private preference, not
// an auditable event, and V2 hard-deleted too. A `deleted_at` would also break the
// unique constraint's job (re-saving after un-saving must succeed, not conflict).

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("student_favorites", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("platform_user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    // Vocabulary in modules/favorites/consts.ts — see WHY above. No CHECK, on purpose.
    t.text("item_type").notNullable();
    // int PK (master) or uuid PK (tenant service). Shape validated per type at the route.
    t.text("item_id").notNullable();
    t.timestamps(true, true);

    // V2's `favorites_user_id_item_type_item_id_key`: saving twice is a no-op, not a
    // duplicate row. The route relies on it for an idempotent POST.
    t.unique(["platform_user_id", "item_type", "item_id"], {
      indexName: "student_favorites_user_item_uniq",
    });
    // The V1 page's only query: one user's saves, newest first, grouped into tabs by
    // type. item_type leads so the per-tab count is an index-only range scan.
    t.index(["platform_user_id", "item_type", "id"], "student_favorites_user_type_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("student_favorites");
}
