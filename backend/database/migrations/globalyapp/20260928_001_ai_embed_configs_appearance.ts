import type { Knex } from "knex";

// Widget appearance an owner can edit after creation: the greeting the panel opens with and
// the line under the widget's name. Both are copy, never instructions — custom_instructions
// stays the only text that reaches the model.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_embed_configs", (t) => {
    t.text("greeting").nullable();
    t.text("subtitle").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_embed_configs", (t) => {
    t.dropColumns("greeting", "subtitle");
  });
}
