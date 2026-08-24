import type { Knex } from "knex";

// Agent ↔ institution B2B representation requests — an agent asks to represent an institution
// (or vice versa), the institution side accepts/declines. Distinct from `business_representations`,
// which links a business's own branches/subsidiaries and has no request/accept workflow.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("agent_institution_representations", (t) => {
    t.increments("id").primary();
    t.uuid("uuid").notNullable().unique().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("agent_id").unsigned().notNullable().references("businesses.id").onDelete("CASCADE");
    t.integer("institution_id").unsigned().notNullable().references("businesses.id").onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("pending");
    t.integer("initiated_by").unsigned().notNullable().references("platform_users.id");
    t.integer("responded_by").unsigned().nullable().references("platform_users.id");
    t.timestamp("responded_at").nullable();
    t.specificType("regions", "text[]").nullable();
    t.text("notes").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["agent_id", "institution_id"]);
    t.index(["agent_id"]);
    t.index(["institution_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("agent_institution_representations");
}
