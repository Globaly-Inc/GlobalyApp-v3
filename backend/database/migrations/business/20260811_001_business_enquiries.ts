import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_enquiries", (t) => {
    t.increments("id").primary();
    t.uuid("enquiry_id").notNullable(); // app-level FK to globalyapp.enquiries.id (cross-schema, no real FK)
    t.uuid("distribution_id").notNullable(); // app-level FK to globalyapp.enquiry_distributions.id (cross-schema, no real FK)
    // Defaults to 'distributed', not 'pending': a row only exists here because the
    // enquiry was already distributed to this business.
    t.text("status").notNullable().defaultTo("distributed");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["enquiry_id"]);
  });

  // Same vocabulary as globalyapp.enquiries.chk_enquiries_status — keep the two in
  // lockstep, since this table mirrors those rows into the tenant schema.
  await knex.raw(`
    ALTER TABLE business_enquiries
      ADD CONSTRAINT chk_business_enquiries_status
      CHECK (status IN ('pending','distributed','unlocked','in_conversation','converted','closed','no_match','expired'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_enquiries");
}
