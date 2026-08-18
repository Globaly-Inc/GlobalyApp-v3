import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("enquiry_email_queue", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("enquiry_id").nullable().references("id").inTable("enquiries").onDelete("SET NULL");
    t.uuid("distribution_id").nullable().references("id").inTable("enquiry_distributions").onDelete("SET NULL");
    t.integer("business_id").unsigned().nullable().references("id").inTable("businesses").onDelete("SET NULL");
    t.integer("recipient_user_id").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.text("recipient_email").notNullable();
    t.text("template").notNullable(); // enquiry_received | enquiry_accepted | ...
    t.jsonb("payload").notNullable().defaultTo("{}");
    t.text("status").notNullable().defaultTo("pending"); // pending | sending | sent | failed | cancelled
    t.integer("attempts").notNullable().defaultTo(0);
    t.text("dedup_key").notNullable().unique();
    t.timestamps(true, true);
    t.timestamp("sent_at", { useTz: true }).nullable();
  });

  await knex.raw(`
    ALTER TABLE enquiry_email_queue
      ADD CONSTRAINT chk_enquiry_email_queue_status
      CHECK (status IN ('pending','sending','sent','failed','cancelled'))
  `);

  await knex.raw("CREATE INDEX idx_enquiry_email_queue_status ON enquiry_email_queue (status)");
  await knex.raw("CREATE INDEX idx_enquiry_email_queue_enquiry ON enquiry_email_queue (enquiry_id)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiry_email_queue");
}
