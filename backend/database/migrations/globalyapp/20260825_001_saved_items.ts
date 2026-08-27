// Saved items — the heart toggle on the course and institution search cards.
//
// One polymorphic table rather than saved_courses + saved_institutions: the Saved tab reads every
// kind at once, and each new saveable type would otherwise mean another table and another union.
// V1 did the same thing (user_saves keyed by save_type).
//
// item_id is text because the two types don't share an id domain — a course is a UUID from
// superadmin.extraction_courses, an institution is the zero-padded id fragment the public API
// exposes. It carries no FK either way: courses live in another schema and are deleted and
// re-inserted by each extraction run, so a hard reference would either block re-extraction or
// cascade a user's shortlist away. A row whose item no longer resolves is skipped on read.

import type { Knex } from "knex";

export const SAVED_ITEM_TYPES = ["course", "institution"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("saved_items", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("item_type").notNullable();
    t.text("item_id").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("deleted_at", { useTz: true }).nullable();

    // Named so the save handler can treat a duplicate as an idempotent no-op (PG 23505).
    t.unique(["platform_user_id", "item_type", "item_id"], { indexName: "saved_items_user_item_uniq" });
  });

  // In the DB rather than a check-then-insert in the service, so a bad type can't be written at all.
  await knex.raw(
    `ALTER TABLE saved_items ADD CONSTRAINT saved_items_type_chk
       CHECK (item_type IN (${SAVED_ITEM_TYPES.map((t) => `'${t}'`).join(", ")}))`,
  );

  await knex.raw("CREATE INDEX idx_saved_items_user_type ON saved_items (platform_user_id, item_type)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("saved_items");
}
