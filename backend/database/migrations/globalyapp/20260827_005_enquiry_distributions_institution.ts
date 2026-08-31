import type { Knex } from "knex";

// A distribution can now belong to a business OR an institution.
//
// The institution fallback (matching.service) sends an enquiry nobody represents to the
// institution the course belongs to. An institution has no `businesses` row — promote routes a
// job to one table or the other, never both — so the recipient had to become polymorphic rather
// than an institution being given a shadow business identity.
//
// Exactly one of the two ids is set, enforced by CHECK rather than convention: every read in the
// enquiry lane branches on which one it is, and a row with both (or neither) has no meaning.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiry_distributions", (t) => {
    t.integer("institution_id").unsigned().nullable().references("id").inTable("institutions").onDelete("CASCADE");
  });

  await knex.raw(`ALTER TABLE enquiry_distributions ALTER COLUMN business_id DROP NOT NULL`);

  await knex.raw(`
    ALTER TABLE enquiry_distributions
      ADD CONSTRAINT chk_enquiry_distributions_recipient
      CHECK (num_nonnulls(business_id, institution_id) = 1)
  `);

  // The existing unique(enquiry_id, business_id) can't cover this: NULLs are distinct in a
  // unique index, so without its own partial index one enquiry could be fanned out to the same
  // institution repeatedly.
  await knex.raw(`
    CREATE UNIQUE INDEX enquiry_distributions_enquiry_institution_uniq
      ON enquiry_distributions (enquiry_id, institution_id)
      WHERE institution_id IS NOT NULL
  `);

  await knex.raw(
    "CREATE INDEX idx_enquiry_distributions_institution ON enquiry_distributions (institution_id)",
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_enquiry_distributions_institution");
  await knex.raw("DROP INDEX IF EXISTS enquiry_distributions_enquiry_institution_uniq");
  await knex.raw("ALTER TABLE enquiry_distributions DROP CONSTRAINT IF EXISTS chk_enquiry_distributions_recipient");
  // Institution rows have no business to fall back to, so they go rather than block the column.
  await knex("enquiry_distributions").whereNotNull("institution_id").del();
  await knex.raw(`ALTER TABLE enquiry_distributions ALTER COLUMN business_id SET NOT NULL`);
  await knex.schema.alterTable("enquiry_distributions", (t) => {
    t.dropColumn("institution_id");
  });
}
