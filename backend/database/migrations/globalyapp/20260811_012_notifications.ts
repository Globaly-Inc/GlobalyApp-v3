import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("notifications", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("type").notNullable();
    t.text("title").notNullable();
    t.text("body").nullable();
    t.text("link").nullable();
    t.timestamp("read_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["platform_user_id", "read_at", "created_at"], "notifications_owner_unread_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notifications");
}
