import type { Knex } from "knex";

// Which bottom corner the launcher sits in on the customer's site. Until now the only control was
// a `data-position="left"` attribute on the script tag; this makes it a widget setting the loader
// reads with the rest of the branding. The tag attribute, when present, still wins.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ai_embed_configs
      ADD COLUMN IF NOT EXISTS position text NOT NULL DEFAULT 'right',
      ADD CONSTRAINT ai_embed_configs_position_check CHECK (position IN ('left', 'right'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ai_embed_configs
      DROP CONSTRAINT IF EXISTS ai_embed_configs_position_check,
      DROP COLUMN IF EXISTS position
  `);
}
