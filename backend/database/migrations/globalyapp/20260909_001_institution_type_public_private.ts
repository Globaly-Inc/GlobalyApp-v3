import type { Knex } from "knex";

/**
 * institution_type is the ownership sector — Public or Private — and the institutions search
 * filter offers whatever distinct values this column holds. It used to carry free-text
 * categories ("University", "Vocational Institute"); nothing can map those onto a sector, so
 * they are dropped rather than guessed, and the check keeps the vocabulary from drifting back.
 * NULL stays legal: a check constraint passes on NULL, and an unclassified institution simply
 * doesn't appear under either filter option.
 */
export async function up(knex: Knex): Promise<void> {
  await knex("institutions")
    .whereNotNull("institution_type")
    .update({ institution_type: knex.raw("initcap(lower(institution_type))") });
  await knex("institutions")
    .whereNotIn("institution_type", ["Public", "Private"])
    .update({ institution_type: null });
  await knex.schema.alterTable("institutions", (t) => {
    t.check("institution_type in ('Public', 'Private')", undefined, "institutions_institution_type_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    t.dropChecks(["institutions_institution_type_check"]);
  });
}
