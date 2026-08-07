import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {

  await knex.schema.createTable("businesses", (t) => {
    t.increments("id").primary();

    // Owner — all user details live in platform_users
    t.integer("owner_id").unsigned().notNullable().references("id").inTable("platform_users");

    // Identity
    t.text("subdomain").unique().notNullable();

    // Tenant schema (biz_{id} — created on registration, lives in same database)
    t.uuid("schema_name").unique().notNullable().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("account_status").notNullable().defaultTo(0);

    t.text("business_name").notNullable();
    t.text("business_type").nullable();
    t.integer("business_category_id").unsigned().nullable().references("id").inTable("business_categories").onDelete("SET NULL");
    t.text("company_size").nullable();

    // Registration
    t.text("legal_business_name").nullable();
    t.text("business_registration_number").nullable();
    t.jsonb("registration_licenses").nullable();

    // Contact (business-level, distinct from owner's personal info)
    t.text("email").nullable();
    t.text("phone").nullable();

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

    // Status & verification
    t.text("status").notNullable().defaultTo("pending");
    t.timestamp("verified_at").nullable();
    t.boolean("is_published").defaultTo(false);
    t.boolean("onboarding_completed").defaultTo(false);
    t.boolean("agreed_to_t_and_c").notNullable().defaultTo(false);

    // Subscription
    t.text("subscription_id").nullable();
    t.text("customer_id").nullable();
    t.text("payment_currency").nullable();
    t.text("currency").nullable();
    t.text("plan_code").nullable();

    // Meta
    t.jsonb("meta").defaultTo("{}");
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS businesses CASCADE");
}
