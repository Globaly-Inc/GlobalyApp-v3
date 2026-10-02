import type { Knex } from "knex";

// extraction_course_accreditation_assignments already had an `accreditation_id` column reserved
// for the global public.accreditations catalog (comment: "FK target: public.accreditations(id),
// add when table exists") but it was created as uuid and never wired up — public.accreditations
// uses integer ids, same as service_accreditations.accreditation_id on the business twin. The
// institution-services editor now links accreditations through this column (see
// institution-courses.repository.ts), sending the integer ids the admin's accreditation picker
// already uses, so the uuid column rejected every insert. Switch it to integer to match.
const S = "superadmin";
const TABLE = "extraction_course_accreditation_assignments";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("accreditation_id");
  });
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.integer("accreditation_id").nullable();
  });
  await knex.raw(`CREATE INDEX idx_eca_accreditation ON ${S}.${TABLE} (accreditation_id)`);
}

export async function down(knex: Knex): Promise<void> {
  // int -> uuid has no compatible representation, so once the institution editor has linked real
  // accreditations here, dropping the column would silently discard them. Refuse rather than lose data.
  const [{ count }] = await knex(`${S}.${TABLE}`).whereNotNull("accreditation_id").count();
  if (Number(count) > 0) {
    throw new Error(
      `${S}.${TABLE}.accreditation_id has ${count} non-null row(s); refusing to roll back and drop them. ` +
        "Clear or migrate the data manually first if you really want to revert this column.",
    );
  }
  await knex.raw(`DROP INDEX IF EXISTS ${S}.idx_eca_accreditation`);
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.dropColumn("accreditation_id");
  });
  await knex.schema.withSchema(S).alterTable(TABLE, (t) => {
    t.uuid("accreditation_id").nullable();
  });
  await knex.raw(`CREATE INDEX idx_eca_accreditation ON ${S}.${TABLE} (accreditation_id)`);
}
