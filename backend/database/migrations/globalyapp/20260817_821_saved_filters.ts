// Saved filters + per-user default filter — V2's `saved_filters` /
// `user_default_filters` (served by V2's user-prefs.ts, NOT student-activity.ts).
// MASTER schema.
//
// PLACEMENT (§1.2). A saved filter is created by a `platform_users` row and scoped
// to a `businesses` row, so its two FKs cross the tenant boundary by construction.
// §1.2: such a row goes to master. It is also platform-user-owned data, which §1.2
// lists as master outright.
//
// WHAT THIS IS. NOT a student favourite — §3.8 files "Favorites / saved filters" as
// one line pointing at student-activity.ts, but student-activity.ts contains no
// filter routes at all. `saved_filters` is the Universal Filter system behind the
// business/admin LIST VIEWS (module_key + filter_config + shared + use_count), and
// in V2 it is served by user-prefs.ts. See the wave report.
//
// business_id IS V2's organization_id, MADE REAL
// V2 carried a nullable `organization_id` that its own route "never sets ... every
// query pins it to IS NULL". So in V2 every saved filter sits in one global bucket,
// and `shared = true` therefore publishes a filter to EVERY authenticated caller on
// the platform — V2's own comment concedes the backing RLS policy "has no USING
// clause (permissive to any authenticated caller)". For a filter over an enquiries
// or applicants list, "shared" means "with my team", never "with all students".
// V3 stores the real scope and matches it exactly on read (NULL scope matches NULL
// scope), so a shared filter reaches that scope and no further. Defect, logged.
//
// NO NULLABLE COLUMN IN THE DEFAULT-FILTER KEY
// V2's `user_default_filters` was UNIQUE on (user_id, organization_id, module_key)
// with organization_id nullable — and Postgres treats each NULL as distinct, so
// ON CONFLICT could never match and V2 fell back to a read-then-write that races
// two concurrent PUTs into two rows. V3 drops the column: the default points at a
// saved filter which already carries the scope, so the key is (user, module) with no
// nullable part and the upsert is one atomic statement. Per-business defaults are a
// product decision, not a default.
//
// filter_config IS DATA, NEVER SQL. It is stored, returned, and applied by the
// caller against its own typed query params. Nothing here or in the routes ever
// interpolates a key or a value into a statement. Shape and size are bounded by zod
// at the route (schemas/saved-filters.schema.ts) — the only boundary it crosses.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("saved_filters", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("created_by").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    // NULL = the caller's personal scope (no business context). See above.
    t.integer("business_id").unsigned().nullable()
      .references("id").inTable("businesses").onDelete("CASCADE");
    /** Which list view this filter belongs to, e.g. "enquiries", "applicants". */
    t.text("module_key").notNullable();
    t.text("name").notNullable();
    t.text("description").nullable();
    /** Opaque, bounded key/value shape. Data only — never interpolated into SQL. */
    t.jsonb("filter_config").notNullable().defaultTo("{}");
    /** Visible to the rest of `business_id`'s scope, and nowhere else. */
    t.boolean("shared").notNullable().defaultTo(false);
    /** Bumped server-side by POST /:id/apply — never taken from the client. */
    t.integer("use_count").notNullable().defaultTo(0);
    t.timestamps(true, true);
    // V2 soft-deletes here (unlike favourites): a shared filter someone else's
    // saved view still points at must not vanish from under them.
    t.timestamp("deleted_at", { useTz: true }).nullable();

    // The list query: one module's filters within one scope, live rows only.
    t.index(["business_id", "module_key", "deleted_at"], "saved_filters_scope_module_idx");
    t.index(["created_by"], "saved_filters_owner_idx");
  });

  await knex.schema.createTable("user_default_filters", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("module_key").notNullable();
    t.integer("filter_id").unsigned().notNullable()
      .references("id").inTable("saved_filters").onDelete("CASCADE");
    t.timestamps(true, true);

    // No nullable column in the key — that is the whole point (see above), and it
    // makes the PUT a single ON CONFLICT ... MERGE with no read-then-write race.
    t.unique(["platform_user_id", "module_key"], {
      indexName: "user_default_filters_user_module_uniq",
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("user_default_filters");
  await knex.schema.dropTableIfExists("saved_filters");
}
