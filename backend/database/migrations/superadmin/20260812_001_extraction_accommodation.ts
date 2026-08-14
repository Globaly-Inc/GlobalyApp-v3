// Migration: extraction_accommodation table
// Student housing, homestay, shared rooms, purpose-built student accommodation

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  const jobsRef = `${s}.extraction_jobs`;

  await knex.schema.withSchema(s).createTable("extraction_accommodation", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("pending");
    t.uuid("promoted_service_id").nullable();

    // Identity
    t.text("name").notNullable();
    t.text("provider_name").nullable();
    t.text("type").nullable(); // student_housing, homestay, shared_room, studio, apartment, hostel, residence, boarding
    t.text("property_type").nullable(); // purpose_built, converted, house, unit, dormitory
    t.text("description").nullable();

    // Location
    t.text("address").nullable();
    t.text("street1").nullable();
    t.text("street2").nullable();
    t.text("city").nullable();
    t.text("state").nullable();
    t.text("country").nullable();
    t.text("country_code").nullable();
    t.text("postcode").nullable();
    t.decimal("latitude", null).nullable();
    t.decimal("longitude", null).nullable();
    t.text("distance_to_campus").nullable();
    t.text("nearest_public_transport").nullable();
    t.text("suburb").nullable();

    // Pricing
    t.decimal("price_amount", null).nullable();
    t.text("price_currency").nullable();
    t.text("price_period").nullable(); // per_week, per_month, per_semester, per_year
    t.decimal("price_from", null).nullable(); // range pricing
    t.decimal("price_to", null).nullable();
    t.decimal("deposit_amount", null).nullable();
    t.decimal("bond_amount", null).nullable();
    t.decimal("application_fee", null).nullable();
    t.boolean("bills_included").nullable();
    t.text("bills_included_details").nullable(); // e.g. "water, electricity, internet"

    // Room details
    t.text("room_type").nullable(); // single, twin, shared, private, ensuite, studio
    t.text("bed_type").nullable(); // single, double, queen, king, bunk
    t.text("bathroom_type").nullable(); // private, shared, ensuite
    t.boolean("furnished").nullable();
    t.text("furnishing_details").nullable();
    t.integer("bedrooms").nullable();
    t.integer("bathrooms").nullable();
    t.decimal("room_size_sqm", null).nullable();
    t.integer("floor_level").nullable();
    t.integer("max_occupants").nullable();

    // Stay
    t.integer("min_stay_weeks").nullable();
    t.integer("max_stay_weeks").nullable();
    t.text("availability").nullable(); // available, waitlist, full, limited
    t.date("available_from").nullable();
    t.date("available_to").nullable();
    t.text("check_in_time").nullable();
    t.text("check_out_time").nullable();
    t.text("lease_type").nullable(); // fixed, flexible, rolling

    // Amenities & facilities
    t.jsonb("amenities").nullable().defaultTo("[]"); // in-room: wifi, aircon, desk, wardrobe, fridge, etc.
    t.jsonb("facilities").nullable().defaultTo("[]"); // shared: gym, pool, study_room, laundry, kitchen, common_room, bbq, cinema, parking
    t.boolean("wifi_included").nullable();
    t.boolean("meals_included").nullable();
    t.text("meal_plan_details").nullable();
    t.integer("meals_per_day").nullable();

    // Property info
    t.integer("total_rooms").nullable();
    t.integer("total_floors").nullable();
    t.integer("year_built").nullable();
    t.text("building_name").nullable();

    // Policies
    t.text("cancellation_policy").nullable();
    t.text("pet_policy").nullable();
    t.text("guest_policy").nullable();
    t.text("smoking_policy").nullable();
    t.text("alcohol_policy").nullable();
    t.integer("age_restriction_min").nullable();
    t.integer("age_restriction_max").nullable();
    t.text("gender_policy").nullable(); // mixed, male_only, female_only

    // Security
    t.jsonb("security_features").nullable().defaultTo("[]"); // cctv, keycard, 24h_reception, intercom, security_guard
    t.boolean("wheelchair_accessible").nullable();

    // Media
    t.specificType("images", "text[]").nullable();
    t.text("virtual_tour_url").nullable();
    t.text("video_url").nullable();
    t.text("floorplan_url").nullable();

    // Reviews
    t.decimal("average_rating", null).nullable();
    t.integer("review_count").nullable();
    t.text("rating_source").nullable();

    // Contact
    t.text("contact_name").nullable();
    t.text("contact_email").nullable();
    t.text("contact_phone").nullable();
    t.text("contact_whatsapp").nullable();
    t.text("website").nullable();
    t.text("booking_url").nullable();

    // Associations
    t.specificType("nearby_institutions", "text[]").nullable();
    t.text("managed_by").nullable(); // property management company

    // Meta
    t.text("source_url").nullable();
    t.decimal("confidence_score", null).nullable();
    t.jsonb("raw_payload").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX extraction_accommodation_job_idx ON ${s}.extraction_accommodation (job_id)`);
  await knex.raw(`CREATE INDEX extraction_accommodation_status_idx ON ${s}.extraction_accommodation (status)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("extraction_accommodation");
}
