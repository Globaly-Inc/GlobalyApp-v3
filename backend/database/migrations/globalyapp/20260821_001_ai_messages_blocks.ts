import type { Knex } from "knex";

/** Generic structured UI blocks (comparison, timeline, quick_replies, …) emitted
 * alongside the legacy cards/chips columns. See ai-counsellor/lib/card-parser.ts. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_counselor_messages", (t) => {
    t.jsonb("blocks").notNullable().defaultTo("[]");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_counselor_messages", (t) => {
    t.dropColumn("blocks");
  });
}
