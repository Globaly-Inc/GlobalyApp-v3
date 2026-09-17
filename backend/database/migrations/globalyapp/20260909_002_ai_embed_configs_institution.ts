import type { Knex } from "knex";

// An AI embed widget can now belong to a business OR an institution.
//
// Institutions share the /business/* portal and reach the same widget page, so the config had
// to become polymorphic — an institution has no `businesses` row (promote routes a job to one
// table or the other, never both) and must not be given a shadow business identity to own a
// widget through.
//
// Same shape as enquiry_distributions (20260827_005): two nullable ids with a CHECK that
// exactly one is set. Every read branches on which one it is, so a row with both — or
// neither — has no meaning.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_embed_configs", (t) => {
    t.integer("institution_id").unsigned().nullable().references("id").inTable("institutions").onDelete("CASCADE");
  });

  await knex.raw(`ALTER TABLE ai_embed_configs ALTER COLUMN business_id DROP NOT NULL`);

  await knex.raw(`
    ALTER TABLE ai_embed_configs
      ADD CONSTRAINT chk_ai_embed_configs_owner
      CHECK (num_nonnulls(business_id, institution_id) = 1)
  `);

  await knex.raw(
    "CREATE INDEX ai_embed_configs_institution_idx ON ai_embed_configs (institution_id)",
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS ai_embed_configs_institution_idx");
  await knex.raw("ALTER TABLE ai_embed_configs DROP CONSTRAINT IF EXISTS chk_ai_embed_configs_owner");
  // Institution-owned widgets have no business to fall back to, so they go rather than block
  // the NOT NULL going back on.
  await knex("ai_embed_configs").whereNotNull("institution_id").del();
  await knex.raw(`ALTER TABLE ai_embed_configs ALTER COLUMN business_id SET NOT NULL`);
  await knex.schema.alterTable("ai_embed_configs", (t) => {
    t.dropColumn("institution_id");
  });
}
