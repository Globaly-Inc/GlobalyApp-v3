import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").createTable("seo_keyword_snapshots", (t) => {
    t.increments("id").primary();
    t.text("keyword").notNullable();
    t.date("date").notNullable();
    t.decimal("position", 6, 2).nullable();
    t.integer("impressions").notNullable().defaultTo(0);
    t.integer("clicks").notNullable().defaultTo(0);
    t.decimal("ctr", 6, 4).nullable();
    t.timestamps(true, true);
    t.unique(["keyword", "date"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("seo_keyword_snapshots");
}
