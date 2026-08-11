import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("enquiry_distributions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("enquiry_id").notNullable().references("id").inTable("enquiries").onDelete("CASCADE");
    t.integer("business_id").unsigned().notNullable().references("id").inTable("businesses").onDelete("CASCADE");
    t.uuid("representation_id").nullable().references("id").inTable("representations").onDelete("SET NULL");
    t.smallint("tier").notNullable();
    t.integer("match_rank").notNullable();
    t.decimal("match_distance_km", 10, 3).nullable();
    t.text("status").notNullable().defaultTo("distributed"); // distributed | unlocked | closed | withdrawn | expired
    // Paywall state. `coin_cost` records what was actually charged rather than
    // recomputing it later, so repricing never rewrites history.
    t.integer("coin_cost").notNullable().defaultTo(0);
    t.timestamp("unlocked_at", { useTz: true }).nullable();
    t.integer("unlocked_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    // Closure is per-distribution, NOT per-enquiry: one enquiry fans out to several
    // businesses and each closes it for its own reason, so `enquiries.close_reason`
    // could only ever record one of them.
    t.timestamp("closed_at", { useTz: true }).nullable();
    t.text("close_reason").nullable();
    t.timestamps(true, true);
    t.timestamp("deleted_at").nullable();

    t.unique(["enquiry_id", "business_id"]);
  });

  await knex.raw(`
    ALTER TABLE enquiry_distributions
      ADD CONSTRAINT chk_enquiry_distributions_status
      CHECK (status IN ('distributed','unlocked','closed','withdrawn','expired'))
  `);
  await knex.raw(`
    ALTER TABLE enquiry_distributions
      ADD CONSTRAINT chk_enquiry_distributions_closed
      CHECK ((status = 'closed') = (closed_at IS NOT NULL))
  `);
  // Deliberately NOT "closed implies unlocked" — declining a lead you never paid
  // to unlock is legitimate.
  await knex.raw(`
    ALTER TABLE enquiry_distributions
      ADD CONSTRAINT chk_enquiry_distributions_unlocked
      CHECK (status <> 'unlocked' OR unlocked_at IS NOT NULL)
  `);
  await knex.raw(`
    ALTER TABLE enquiry_distributions
      ADD CONSTRAINT chk_enquiry_distributions_tier
      CHECK (tier BETWEEN 1 AND 4)
  `);

  await knex.raw("CREATE INDEX idx_enquiry_distributions_enquiry ON enquiry_distributions (enquiry_id)");
  await knex.raw("CREATE INDEX idx_enquiry_distributions_business ON enquiry_distributions (business_id)");
  await knex.raw("CREATE INDEX idx_enquiry_distributions_status ON enquiry_distributions (status)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiry_distributions");
}
