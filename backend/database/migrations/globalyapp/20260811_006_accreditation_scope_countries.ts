import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("accreditation_scope_countries", (t) => {
    t.integer("accreditation_id").unsigned().notNullable()
      .references("id").inTable("accreditations").onDelete("CASCADE");
    t.integer("country_id").unsigned().notNullable()
      .references("id").inTable("countries").onDelete("CASCADE");
    t.primary(["accreditation_id", "country_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("accreditation_scope_countries");
}
