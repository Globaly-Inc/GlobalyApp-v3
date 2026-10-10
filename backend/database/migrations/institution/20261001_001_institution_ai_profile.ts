import type { Knex } from "knex";

// This institution's AI Knowledge Rack configuration — how its counsellor speaks, how it
// behaves, and what it is allowed to collect from visitors.
//
// Lives in the tenant schema beside institution_ai_memories (20260925_001) for the same reason:
// it is the institution's own record, and the schema is what makes it theirs. No owner column,
// no filter to forget.
//
// ONE ROW, enforced structurally: `id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1)`. The
// alternative — a table the app promises to keep at one row — is a promise, and the day a
// second row appears every read silently picks one at random.
//
// Four jsonb blocks rather than thirty columns, for the same reason institution_ai_memories.metadata
// is jsonb: they are read as a unit on every chat turn, written whole by one form, and will grow.
// Each is parsed with its zod schema on read AND on write (schemas/profile.schema.ts) — the same
// deliberate exception to "JSONB is trusted on read" the memory module already makes, and for the
// same reason: this is written by a form, and a stored shape nobody validates becomes a prompt.
//
// Why it is NOT ai_embed_configs columns: a widget is per embed key, and an institution with a
// site-wide widget and a landing-page widget would get two personalities over one shared memory.
// Voice belongs to the institution, not to one script tag.
//
// Nothing is seeded here. An institution with no row reads as defaults (profile.service), and the
// first PATCH inserts it — so a tenant provisioned before this migration behaves exactly like one
// provisioned after it, and provisioning needs no new step.
//
// Twin in business/20261001_001 — a business works its widget identically.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("institution_ai_profile", (t) => {
    t.smallint("id").primary().defaultTo(1);
    t.jsonb("voice").notNullable().defaultTo("{}");
    t.jsonb("behaviour").notNullable().defaultTo("{}");
    t.jsonb("collection").notNullable().defaultTo("{}");
    t.jsonb("learning").notNullable().defaultTo("{}");
    // Bumped on every write. The chat path caches this row for 60s; the version is what a
    // future "why did the counsellor change" question is answered from.
    t.integer("version").notNullable().defaultTo(1);
    t.integer("updated_by").nullable(); // app-level: globalyapp.platform_users.id
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`
    ALTER TABLE institution_ai_profile
      ADD CONSTRAINT institution_ai_profile_singleton CHECK (id = 1)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("institution_ai_profile");
}
