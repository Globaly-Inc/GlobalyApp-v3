import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("institutions", (t) => {
    t.increments("id").primary();

    // Owner (platform_user who registered it)
    t.integer("platform_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("first_name").notNullable();
    t.text("last_name").notNullable();
    t.text("email").unique().notNullable();
    t.text("phone").nullable();

    // Identity
    t.text("subdomain").unique().notNullable();
    t.text("institution_name").notNullable();
    t.text("institution_type").nullable();
    t.text("company_size").nullable();

    // Registration
    t.text("legal_name").nullable();
    t.text("registration_number").nullable();
    t.jsonb("registration_licenses").nullable();

    // Profile
    t.text("description").nullable();
    t.text("logo_url").nullable();
    t.text("cover_url").nullable();
    t.text("website").nullable();
    t.integer("country_id").unsigned().nullable().references("id").inTable("countries");
    t.text("state").nullable();
    t.text("city").nullable();
    t.text("address").nullable();
    t.text("postcode").nullable();

    // Social
    t.text("linkedin_url").nullable();
    t.text("facebook_url").nullable();
    t.text("instagram_url").nullable();
    t.text("twitter_url").nullable();
    t.text("youtube_url").nullable();
    t.text("whatsapp_url").nullable();

    // Media
    t.specificType("gallery_images", "text[]").nullable();
    t.specificType("video_urls", "text[]").nullable();

    // Status
    t.text("status").notNullable().defaultTo("pending");
    t.timestamp("verified_at").nullable();
    t.boolean("is_published").defaultTo(false);
    t.boolean("onboarding_completed").defaultTo(false);
    t.boolean("agreed_to_t_and_c").notNullable().defaultTo(false);

    // Meta
    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("institutions");
}
