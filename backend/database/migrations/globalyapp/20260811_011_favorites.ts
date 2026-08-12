import type { Knex } from "knex";

// Typed targets, not a generic item_type + item_id: a generic pair has no referential integrity and V3
// has no courses/agents/scholarships tables to point at yet. Course/agent/scholarship favourites become
// further nullable typed columns when those tables land.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("user_favorites", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("institution_id").unsigned().nullable().references("id").inTable("institutions").onDelete("CASCADE");
    t.integer("country_id").unsigned().nullable().references("id").inTable("countries").onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("deleted_at").nullable();
  });

  // Exactly one target must be set.
  await knex.raw(`
    ALTER TABLE user_favorites ADD CONSTRAINT user_favorites_one_target_chk CHECK (
      (CASE WHEN institution_id IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN country_id     IS NULL THEN 0 ELSE 1 END) = 1
    )
  `);

  // WHERE deleted_at IS NULL — without it a soft-deleted favourite would permanently block re-favouriting.
  await knex.raw(`
    CREATE UNIQUE INDEX user_favorites_institution_uniq
      ON user_favorites (platform_user_id, institution_id)
      WHERE deleted_at IS NULL AND institution_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX user_favorites_country_uniq
      ON user_favorites (platform_user_id, country_id)
      WHERE deleted_at IS NULL AND country_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("user_favorites");
}
