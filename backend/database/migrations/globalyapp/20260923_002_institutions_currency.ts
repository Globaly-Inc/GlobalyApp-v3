import type { Knex } from "knex";

// Institution twin of businesses.currency — the self-service Default Currency card silently
// dropped every save for an institution because there was nowhere to store it (see
// toInstitutionPatch's key whitelist and institutionToBusinessProfile's hardcoded `currency: null`).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    t.text("currency").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("institutions", (t) => {
    t.dropColumn("currency");
  });
}
