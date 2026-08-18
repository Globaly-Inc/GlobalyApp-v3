import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("enquiry_match_directory", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("business_id").unsigned().notNullable().references("id").inTable("businesses").onDelete("CASCADE");
    t.text("subject_area").nullable();
    t.text("country_code").nullable();
    t.text("verification_status").notNullable().defaultTo("unverified"); // 'verified' | 'unverified'
    t.decimal("latitude", 10, 6).nullable();
    t.decimal("longitude", 10, 6).nullable();
    t.boolean("is_suspended").notNullable().defaultTo(false);
    t.boolean("is_institution_contact").notNullable().defaultTo(false);
    t.timestamp("synced_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);
  });

  await knex.raw("CREATE INDEX idx_enquiry_match_directory_business ON enquiry_match_directory (business_id)");
  await knex.raw("CREATE INDEX idx_enquiry_match_directory_subject ON enquiry_match_directory (subject_area)");
  await knex.raw("CREATE INDEX idx_enquiry_match_directory_country ON enquiry_match_directory (country_code)");
  await knex.raw("CREATE INDEX idx_enquiry_match_directory_geo ON enquiry_match_directory (latitude, longitude)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiry_match_directory");
}
