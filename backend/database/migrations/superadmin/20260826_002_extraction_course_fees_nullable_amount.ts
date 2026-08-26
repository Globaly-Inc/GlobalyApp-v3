// currency/total_amount were NOT NULL with fake defaults ("AUD" / 0). That forced
// staging-writer to store a fake "$0 AUD" fee whenever the LLM couldn't confidently parse a
// fee's amount or currency (a range like "$25,000-$30,000", "Contact us", a non-AUD
// institution) — indistinguishable in the UI from a real, confirmed zero-cost fee.
// Null now means "unknown", not "confirmed zero" — see staging-writer.ts's coerceMoney().

import type { Knex } from "knex";

const S = "superadmin";
const TABLE = "extraction_course_fees";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ${S}.${TABLE} ALTER COLUMN currency DROP NOT NULL`);
  await knex.raw(`ALTER TABLE ${S}.${TABLE} ALTER COLUMN currency DROP DEFAULT`);
  await knex.raw(`ALTER TABLE ${S}.${TABLE} ALTER COLUMN total_amount DROP NOT NULL`);
  await knex.raw(`ALTER TABLE ${S}.${TABLE} ALTER COLUMN total_amount DROP DEFAULT`);
}

export async function down(knex: Knex): Promise<void> {
  await knex(`${S}.${TABLE}`).whereNull("currency").update({ currency: "AUD" });
  await knex(`${S}.${TABLE}`).whereNull("total_amount").update({ total_amount: 0 });
  await knex.raw(`ALTER TABLE ${S}.${TABLE} ALTER COLUMN currency SET DEFAULT 'AUD'`);
  await knex.raw(`ALTER TABLE ${S}.${TABLE} ALTER COLUMN currency SET NOT NULL`);
  await knex.raw(`ALTER TABLE ${S}.${TABLE} ALTER COLUMN total_amount SET DEFAULT 0`);
  await knex.raw(`ALTER TABLE ${S}.${TABLE} ALTER COLUMN total_amount SET NOT NULL`);
}
