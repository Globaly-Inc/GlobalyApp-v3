import type { Knex } from "knex";

// Where a custom field's VALUES live: one row per visitor per field, keyed by the `key` of a
// `collection.custom` entry on the institution's Rack profile.
//
// A table rather than a column on ai_widget_visitors, and rather than a key in `meta`. The
// `meta` half is settled by 20261001_002: that bag holds what the SERVER observed, and "if a
// future change wants the extractor to write here, that is a new typed column with a cleaner,
// not a key in this object". This is that change, taken one step further — the vocabulary is
// defined by the institution at runtime, so the rows are the shape that matches it:
//
//   - one value per (visitor, field) is a UNIQUE constraint the database enforces, where a
//     jsonb bag can only promise it in the writer;
//   - a field the institution deletes can be cleaned up with a DELETE on one key, instead of
//     rewriting every visitor's bag;
//   - `updated_at` is per value, so "when did they tell us this" survives the next answer.
//
// The cleaner is still the boundary: profile-extract.cleanCustom keeps only the keys this
// institution configured, trimmed and capped, so an invented subject has no row to land in.
//
// Twin of business/20261002_001 — same table, different schema.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ai_widget_visitor_custom_values", (t) => {
    t.increments("id").primary();
    // A real FK, not the app-level kind the cross-schema columns use: this table and
    // ai_widget_visitors live in the SAME schema, so the database can hold the reference —
    // and CASCADE means deleting a visitor takes their answers with them, which is what
    // anyone deleting a visitor means.
    t.integer("visitor_id").unsigned().notNullable()
      .references("id").inTable("ai_widget_visitors").onDelete("CASCADE");
    // The storage key from collection.custom[].key. Deliberately NOT a FK to anything: the
    // field definitions live in institution_ai_profile's jsonb, and a row whose definition was
    // deleted is still a true record of what the visitor said.
    t.text("field_key").notNullable();
    t.text("value").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // One answer per field, which is also the writer's upsert target.
    t.unique(["visitor_id", "field_key"], { indexName: "ai_widget_visitor_custom_values_key_idx" });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ai_widget_visitor_custom_values");
}
