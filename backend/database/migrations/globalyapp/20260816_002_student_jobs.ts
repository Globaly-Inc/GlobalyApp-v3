import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("student_jobs", (t) => {
    t.increments("id").primary();
    t.integer("business_id").unsigned().nullable().references("id").inTable("businesses").onDelete("SET NULL");
    t.text("title").notNullable();
    t.text("company_name").nullable(); // fallback display name when not linked to a business
    t.text("description").nullable();
    t.text("job_type").nullable(); // full_time | part_time | casual | contract | internship
    t.text("location_city").nullable();
    t.integer("location_country_id").unsigned().nullable().references("id").inTable("countries");
    t.boolean("is_remote").notNullable().defaultTo(false);
    t.decimal("pay_min", 12, 2).nullable();
    t.decimal("pay_max", 12, 2).nullable();
    t.text("pay_currency").nullable();
    t.text("pay_unit").nullable(); // hour | year
    t.boolean("is_published").notNullable().defaultTo(false);
    t.date("closing_date").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("student_jobs");
}
