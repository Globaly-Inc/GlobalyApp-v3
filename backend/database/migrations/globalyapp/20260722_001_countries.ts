import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("countries", (t) => {
    t.increments("id").primary();
    t.text("name").unique().notNullable();
    t.text("iso2").unique().notNullable();     // e.g. "AU"
    t.text("iso3").unique().notNullable();     // e.g. "AUS"
    t.text("phone_code").nullable();           // e.g. "+61"
    t.text("currency").nullable();             // e.g. "AUD"
    t.text("currency_symbol").nullable();      // e.g. "$"
    t.text("region").nullable();               // e.g. "Oceania"
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable("cities", (t) => {
    t.increments("id").primary();
    t.integer("country_id").unsigned().notNullable().references("id").inTable("countries").onDelete("CASCADE");
    t.text("name").notNullable();
    t.text("state_name").nullable();
    t.index(["country_id", "name"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("cities");
  await knex.schema.dropTableIfExists("countries");
}
