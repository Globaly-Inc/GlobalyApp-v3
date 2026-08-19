import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("scholarship_import_jobs", (t) => {
    t.increments("id").primary();
    t.integer("created_by").unsigned().notNullable();
    t.text("status").notNullable().defaultTo("pending"); // pending | processing | completed | failed
    t.integer("total_rows").notNullable();
    t.integer("processed_rows").notNullable().defaultTo(0);
    t.integer("created_count").notNullable().defaultTo(0);
    t.integer("error_count").notNullable().defaultTo(0);
    t.jsonb("results").notNullable().defaultTo("[]"); // [{ title, status: "ok"|"error", detail? }]
    t.text("failure_reason").nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("scholarship_import_jobs");
}
