// Migration: extraction_transport table
// Airport pickup, shuttle, local transport services

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const s = "superadmin";
  const jobsRef = `${s}.extraction_jobs`;

  await knex.schema.withSchema(s).createTable("extraction_transport", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("job_id").notNullable().references("id").inTable(jobsRef).onDelete("CASCADE");
    t.text("status").notNullable().defaultTo("pending");
    t.uuid("promoted_service_id").nullable();

    // Identity
    t.text("name").notNullable();
    t.text("provider_name").nullable();
    t.text("type").nullable(); // airport_pickup, airport_dropoff, shuttle, local_transport, car_rental, public_transport_pass, rideshare, charter, intercity
    t.text("description").nullable();

    // Coverage
    t.text("coverage_area").nullable(); // e.g. "Sydney Metro", "Melbourne CBD"
    t.specificType("airports_serviced", "text[]").nullable();
    t.specificType("cities_serviced", "text[]").nullable();
    t.jsonb("routes").nullable().defaultTo("[]"); // specific routes offered
    t.specificType("pickup_points", "text[]").nullable();
    t.specificType("dropoff_points", "text[]").nullable();

    // Vehicle
    t.specificType("vehicle_types", "text[]").nullable(); // sedan, suv, van, minibus, bus, shared
    t.integer("max_passengers").nullable();
    t.boolean("wheelchair_accessible").nullable();
    t.boolean("child_seat_available").nullable();
    t.text("luggage_capacity").nullable(); // e.g. "2 large + 2 carry-on"
    t.boolean("luggage_included").nullable();

    // Pricing
    t.decimal("fee_amount", null).nullable();
    t.text("fee_currency").nullable();
    t.text("fee_type").nullable(); // per_trip, per_person, per_km, per_hour, per_day, per_week, per_month, flat, zone_based
    t.decimal("fee_from", null).nullable();
    t.decimal("fee_to", null).nullable();
    t.boolean("surge_pricing").nullable();
    t.boolean("group_discount").nullable();
    t.text("group_discount_details").nullable();
    t.boolean("student_discount").nullable();
    t.text("student_discount_details").nullable();
    t.boolean("return_trip_discount").nullable();
    t.text("payment_methods").nullable(); // cash, card, online, app

    // Booking
    t.text("booking_method").nullable(); // online, phone, app, walk_in, email
    t.boolean("advance_booking_required").nullable();
    t.integer("min_notice_hours").nullable();
    t.text("booking_url").nullable();
    t.text("app_name").nullable();
    t.text("app_download_url").nullable();
    t.boolean("instant_booking").nullable();

    // Schedule
    t.text("operating_hours").nullable();
    t.boolean("twenty_four_hour_service").nullable();
    t.text("frequency").nullable(); // e.g. "every 30 min", "hourly", "on demand"
    t.specificType("days_of_operation", "text[]").nullable();

    // Service features
    t.boolean("meet_and_greet").nullable();
    t.boolean("flight_monitoring").nullable();
    t.boolean("door_to_door").nullable();
    t.boolean("shared_ride_available").nullable();
    t.boolean("private_hire").nullable();
    t.boolean("waiting_time_included").nullable();
    t.integer("free_waiting_minutes").nullable();
    t.boolean("gps_tracking").nullable();
    t.boolean("wifi_onboard").nullable();
    t.boolean("multilingual_drivers").nullable();
    t.specificType("languages_spoken", "text[]").nullable();

    // Location
    t.text("address").nullable();
    t.text("city").nullable();
    t.text("state").nullable();
    t.text("country").nullable();
    t.text("country_code").nullable();
    t.text("postcode").nullable();

    // Contact
    t.text("contact_name").nullable();
    t.text("contact_email").nullable();
    t.text("contact_phone").nullable();
    t.text("contact_whatsapp").nullable();
    t.text("website").nullable();

    // Reviews
    t.decimal("average_rating", null).nullable();
    t.integer("review_count").nullable();
    t.decimal("google_rating", null).nullable();
    t.text("rating_source").nullable();

    // Compliance
    t.text("license_number").nullable();
    t.text("insurance_details").nullable();
    t.boolean("accredited").nullable();
    t.text("accreditation_body").nullable();

    // Meta
    t.text("logo_url").nullable();
    t.text("source_url").nullable();
    t.decimal("confidence_score", null).nullable();
    t.jsonb("raw_payload").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX extraction_transport_job_idx ON ${s}.extraction_transport (job_id)`);
  await knex.raw(`CREATE INDEX extraction_transport_status_idx ON ${s}.extraction_transport (status)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema("superadmin").dropTableIfExists("extraction_transport");
}
