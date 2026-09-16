import type { Knex } from "knex";

// extraction_eligibility_requirements.degree_level_id was created as uuid (comment: "FK target:
// public.degree_levels(id), add when table exists") but never wired up anywhere in the codebase —
// it's dead. The institution-services editor now writes real degree_level_id values here (see
// institution-courses.repository.ts), and those are integer ids from public.degree_levels (the
// same catalog service_eligibility_requirements.degree_level_id — the business twin — uses, also
// as a loose integer with no FK). Inserting an integer into the uuid column threw a 500. Switch
// the column to integer to match.
const S = "superadmin";
const TABLE = "extraction_eligibility_requirements";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("degree_level_id");
  });
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.integer("degree_level_id").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  // int -> uuid has no compatible representation, so once the institution editor has written real
  // values here, dropping the column would silently discard them. Refuse rather than lose data.
  const [{ count }] = await knex(`${S}.${TABLE}`).whereNotNull("degree_level_id").count();
  if (Number(count) > 0) {
    throw new Error(
      `${S}.${TABLE}.degree_level_id has ${count} non-null row(s); refusing to roll back and drop them. ` +
        "Clear or migrate the data manually first if you really want to revert this column.",
    );
  }
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("degree_level_id");
  });
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.uuid("degree_level_id").nullable();
  });
}
