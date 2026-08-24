import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("platform_user_academic_tests", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("test_status").nullable();
    t.text("test_type").nullable();
    t.text("overall_score").nullable();
    t.date("test_date").nullable();
    t.jsonb("sub_scores").nullable();
    t.integer("sort_order").defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("platform_user_academic_tests");
}
