import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("scholarships", (t) => {
    t.increments("id").primary();
    t.text("title").notNullable();
    t.text("slug").notNullable().unique();
    t.text("description").nullable();
    t.text("provider_name").nullable();
    t.text("source_type").notNullable().defaultTo("university"); // university | independent | government | foundation | other
    t.text("country").nullable();
    t.text("city").nullable();
    t.text("region").nullable();
    t.text("basis").nullable(); // merit | need | sports | diversity | government | research | other
    t.specificType("degree_levels", "text[]").notNullable().defaultTo("{}");
    t.text("requirements_summary").nullable();
    t.text("coverage_type").notNullable().defaultTo("various"); // full_tuition | partial_tuition | stipend | living_allowance | various | other
    t.decimal("coverage_amount", 12, 2).nullable();
    t.text("coverage_currency").notNullable().defaultTo("USD");
    t.text("coverage_description").nullable();
    t.date("deadline").nullable();
    t.text("deadline_notes").nullable();
    t.text("application_url").nullable();
    t.text("source_url").nullable();
    t.boolean("is_published").notNullable().defaultTo(false);
    t.boolean("is_featured").notNullable().defaultTo(false);
    t.integer("view_count").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(["is_published", "deadline"]);
    t.index(["country"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("scholarships");
}
