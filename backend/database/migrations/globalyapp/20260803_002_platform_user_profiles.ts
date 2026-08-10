import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("platform_user_profiles", (t) => {
    t.increments("id").primary();
    t.integer("user_id").unsigned().notNullable().unique().references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("nationality_id").unsigned().nullable().references("id").inTable("countries");
    t.integer("country_of_residence_id").unsigned().nullable().references("id").inTable("countries");
    t.date("date_of_birth").nullable();
    t.text("gender").nullable();
    t.text("highest_degree_level").nullable();
    t.text("institution_attended").nullable();
    t.decimal("gpa", 4, 2).nullable();
    t.integer("graduation_year").nullable();
    t.text("english_test_type").nullable();
    t.decimal("english_test_score", 5, 2).nullable();
    t.date("english_test_date").nullable();
    t.integer("budget_min").nullable();
    t.integer("budget_max").nullable();
    t.text("budget_currency").nullable();
    t.boolean("include_living_expenses").defaultTo(false);
    t.text("degree_level").nullable();                        // e.g. "Bachelor", "Master"
    t.jsonb("preferred_destinations").nullable().defaultTo("[]"); // array of up to 5 country IDs: [1,4,12,20,31]
    t.jsonb("fields_of_study").nullable().defaultTo("[]");       // [{name:"Law"},{name:"Medicine"}]
    t.specificType("preferred_degree_levels", "text[]").nullable();
    t.text("expected_start_date").nullable();
    t.text("city_of_residence").nullable();                      // city name from country lookup
    t.decimal("latitude", 10, 7).nullable();
    t.decimal("longitude", 10, 7).nullable();
    t.integer("completion_percentage").defaultTo(0);
    t.boolean("onboarding_completed").defaultTo(false);
    t.text("individual_category").nullable();
    t.integer("personal_address_country_id").unsigned().nullable().references("id").inTable("countries");
    t.text("personal_address_city").nullable();
    t.text("personal_address_state").nullable();
    t.text("personal_address_street").nullable();
    t.text("personal_address_postcode").nullable();
    t.text("linkedin_url").nullable();
    t.text("website_url").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.schema.createTable("platform_user_qualifications", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("qualification_type").nullable();
    t.text("degree_title").nullable();
    t.text("subject_area").nullable();
    t.text("institution_name").nullable();
    t.text("grading_system").nullable();
    t.text("grade_value").nullable();
    t.boolean("is_current").defaultTo(false);
    t.text("start_date").nullable();
    t.text("end_date").nullable();
    t.integer("sort_order").defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.schema.createTable("platform_user_language_tests", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("test_status").nullable();
    t.text("test_type").nullable();
    t.text("overall_score").nullable();
    t.date("test_date").nullable();
    t.jsonb("sub_scores").nullable();
    t.integer("sort_order").defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });

  await knex.schema.createTable("platform_user_work_experiences", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("job_title").notNullable();
    t.text("organization_name").nullable();
    t.boolean("is_current").defaultTo(false);
    t.text("start_date").nullable();
    t.text("end_date").nullable();
    t.integer("sort_order").defaultTo(0);
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("platform_user_work_experiences");
  await knex.schema.dropTableIfExists("platform_user_language_tests");
  await knex.schema.dropTableIfExists("platform_user_qualifications");
  await knex.schema.dropTableIfExists("platform_user_profiles");
}
