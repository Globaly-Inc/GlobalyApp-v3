// Intake dates keep the precision the institution published them at.
//
// A date column cannot hold "September 2026" without inventing a day, and inventing the day is
// the defect: coerceDate("September 2026") returned "2026-09-01", a date Stanford never stated
// and afterwards indistinguishable from a real 1 September. Universities publish both precisions —
// an exact term start, a month-only application deadline — so the column has to carry both.
//
// text holding ISO 8601 reduced precision: "2026-09-21" or "2026-09". Both sort correctly as text
// ("2026-09" < "2026-09-21" < "2026-10"), and nothing compares these columns as dates in SQL —
// every intake filter, the year facet and the "next intake" ordering read the separate
// intake_month/intake_year integers, and partialDatesAgree does the comparing in JS. Verified by
// grepping every reader before writing this: ai-counsellor already types them string | null, and
// staged.schema.ts already validated them as z.string().
//
// The precision is DERIVED from the value's shape (see lib/partial-date.ts), not stored beside it.
// A second column would be free to disagree with the value it describes, and says nothing the
// value does not already say.
//
// custom_dates (jsonb, added 20260908_003) needs no change: its date members are already strings,
// so they can hold either precision as they stand.

import type { Knex } from "knex";

const S = "superadmin";
const TABLE = `${S}.extraction_intakes`;
const COLUMNS = ["start_date", "end_date", "orientation_date", "admission_deadline"] as const;

/** Named so code can branch on err.constraint. */
const CHECK = (c: string) => `chk_extraction_intakes_${c}_partial`;

/**
 * "2026-09-21" or "2026-09".
 *
 * Written as two alternatives rather than with an optional (-DD)? group, because **knex.raw reads
 * ? as a positional binding placeholder** and rewrote the quantifier into $1 — the first attempt
 * at this migration shipped a pattern ending in $1$, which no row can match, and failed with
 * "violated by some row". Escaping it as a double-backslash ? would also work, but a pattern with
 * no ? in it cannot be broken by a future change to how the query is built.
 *
 * The JS twin of this rule is PARTIAL_DATE_RE in lib/partial-date.ts, which is free to use ?.
 */
const PATTERN = "^\\d{4}-(0[1-9]|1[0-2])$|^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$";

/**
 * The existing date rendered into the new format, or NULL when it cannot be.
 *
 * to_char rather than a plain cast: the default date-to-text cast follows the session's DateStyle,
 * which is not guaranteed to be ISO on every deployment. Anything that still does not match the
 * contract becomes NULL instead of blocking the migration — in practice only a BC or year-zero
 * date, junk a date column can hold but this format cannot express, and keeping it would mean the
 * ADD CONSTRAINT below fails on data nobody wants.
 */
const CONVERT = (c: string) =>
  `(CASE WHEN to_char(${c}, 'YYYY-MM-DD') ~ '${PATTERN}' THEN to_char(${c}, 'YYYY-MM-DD') END)`;

export async function up(knex: Knex): Promise<void> {
  for (const c of COLUMNS) {
    await knex.raw(`ALTER TABLE ${TABLE} ALTER COLUMN ${c} TYPE text USING ${CONVERT(c)}`);
    await knex.raw(
      `ALTER TABLE ${TABLE} ADD CONSTRAINT ${CHECK(c)} CHECK (${c} IS NULL OR ${c} ~ '${PATTERN}')`,
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const c of COLUMNS) {
    await knex.raw(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${CHECK(c)}`);
    // CAST(... AS date), not ::date — knex reads :name as a named binding too, and this file has
    // already been broken once by a placeholder it never meant to write.
    //
    // A month-precision value has no day to go back to. Rather than resurrect the very
    // fabrication this migration removed, those rows lose the value on the way down — the month
    // survives in intake_month/intake_year, which is where every reader looks anyway.
    await knex.raw(
      `ALTER TABLE ${TABLE} ALTER COLUMN ${c} TYPE date
         USING (CASE WHEN ${c} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN CAST(${c} AS date) END)`,
    );
  }
}
