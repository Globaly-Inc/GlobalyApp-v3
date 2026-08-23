import type { Knex } from "knex";

// V1-parity business profile fields: 6 more social platforms (V3 already has linkedin/facebook/
// instagram/twitter/youtube/whatsapp), cover pan/zoom position, and per-section public/private
// visibility. `currency` already exists (unused, reserved for billing) and is reused as the
// business's default currency rather than adding a near-duplicate column.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("businesses", (t) => {
    t.text("tiktok_url").nullable();
    t.text("threads_url").nullable();
    t.text("messenger_url").nullable();
    t.text("telegram_url").nullable();
    t.text("line_url").nullable();
    t.text("viber_url").nullable();
    t.jsonb("cover_position").nullable();
    t.boolean("show_team_public").notNullable().defaultTo(true);
    t.jsonb("public_visibility").notNullable().defaultTo("{}");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("businesses", (t) => {
    t.dropColumn("tiktok_url");
    t.dropColumn("threads_url");
    t.dropColumn("messenger_url");
    t.dropColumn("telegram_url");
    t.dropColumn("line_url");
    t.dropColumn("viber_url");
    t.dropColumn("cover_position");
    t.dropColumn("show_team_public");
    t.dropColumn("public_visibility");
  });
}
