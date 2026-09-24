import type { Knex } from "knex";

/**
 * Retires the two tables the matcher no longer reads.
 *
 * `enquiry_match_directory` was a denormalised projection of businesses + representations. Every
 * column it cached is now read live off `businesses` / `countries` in one join, and its lack of a
 * unique constraint on business_id was actively harmful: one candidate per ROW meant a business
 * with many subject-area rows filled every distribution slot itself.
 *
 * `representations` is superseded by `business_representations` — the table the Partners tab
 * already writes. No data is carried across: eligibility is re-declared through that tab, which
 * is the point of the change.
 *
 * The FK swap has to happen first. `enquiry_distributions.representation_id` references
 * `representations(id)`, and an incoming foreign key blocks DROP TABLE whether or not either side
 * holds any rows. Repointing it at `business_representations(uuid)` — also a uuid, also unique —
 * keeps that column meaning "which link caused this match" instead of leaving it unconstrained.
 *
 * Outgoing FKs (`representations` -> superadmin.extraction_*) need no handling: Postgres drops
 * constraints defined ON a table along with the table.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE enquiry_distributions
      DROP CONSTRAINT IF EXISTS enquiry_distributions_representation_id_foreign
  `);

  // Any surviving pointer refers to a row that is about to disappear.
  await knex("enquiry_distributions").whereNotNull("representation_id").update({ representation_id: null });

  await knex.raw(`
    ALTER TABLE enquiry_distributions
      ADD CONSTRAINT enquiry_distributions_representation_id_foreign
      FOREIGN KEY (representation_id) REFERENCES business_representations (uuid) ON DELETE SET NULL
  `);

  await knex.schema.dropTableIfExists("enquiry_match_directory");
  await knex.schema.dropTableIfExists("representations");
}

/**
 * Deliberately a no-op. Re-creating the tables would give back two empty shells — the directory
 * was a projection with no writer left, and eligibility now lives in business_representations.
 * 20260811_016 and _017 still hold the DDL if either is ever needed again.
 */
export async function down(): Promise<void> {}
