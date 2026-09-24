import type { Knex } from "knex";

// The institution's own mirror of the enquiries distributed to it — the twin of
// business/20260811_001_business_enquiries.ts.
//
// Deliberately the SAME table name as the business template. The institution works its leads in
// the same portal screens a business does, and those read `req.db("business_enquiries")`; naming
// it anything else would mean branching the table name in every query for no gain. The schema it
// lives in is what makes it the institution's.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_enquiries", (t) => {
    t.increments("id").primary();
    t.uuid("enquiry_id").notNullable(); // app-level FK to globalyapp.enquiries.id (cross-schema, no real FK)
    t.uuid("distribution_id").notNullable(); // app-level FK to globalyapp.enquiry_distributions.id
    t.text("status").notNullable().defaultTo("distributed");
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();
    t.unique(["enquiry_id"]);
  });

  await knex.raw(`
    ALTER TABLE business_enquiries
      ADD CONSTRAINT chk_business_enquiries_status
      CHECK (status IN ('pending','distributed','unlocked','in_conversation','converted','closed','no_match','expired'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_enquiries");
}
