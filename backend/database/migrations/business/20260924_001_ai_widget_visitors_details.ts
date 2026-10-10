import type { Knex } from "knex";

// Four things a visitor may say about themselves in passing, kept as scalars beside the jsonb
// profile arrays 20260916_001 already carries.
//
// Twin of institution/20260924_001 — same columns, different schema.
//
// Scalars rather than more jsonb because each is one value at a time, and the portal's Visitors
// table filters and groups on them. The jsonb columns next door are one-to-many by nature (two
// degrees, an IELTS and a PTE); these are not.
//
// All nullable, all free text, NO CHECK constraint on any of them — deliberately:
//
//   - `age` holds what the visitor SAID, verbatim ("22", "early 30s"). It is not bucketed. There
//     is no configured age-group list anywhere in this platform to map onto, and inventing one
//     here would mean the stored value could no longer be checked against what they actually
//     wrote. `platform_user_profiles` stores `date_of_birth`, which a chat visitor never gives.
//   - `gender` mirrors `platform_user_profiles.gender`, which is also free text. A CHECK here
//     would reject a self-description the platform side accepts.
//   - `nationality` is normalised to a `globalyapp.countries.name` where the visitor's wording
//     matched one, and `nationality_raw` keeps their own words. Two columns because the match can
//     fail: "I'm Kashmiri" resolves to no country, and dropping it would lose a real answer while
//     storing it as a country name would assert one they did not give. A tenant table cannot FK
//     to globalyapp, so this is a resolved copy, not a reference — a country later renamed there
//     does not propagate, which is correct for a record of what someone said in 2026.
//   - `study_preference` is the SPECIFIC course or program being discussed, never a broad
//     interest. "I'm looking for IT courses" stores nothing. One value: a visitor asking about
//     three programs has the most recent one here, not a concatenation.
//
// Nothing here may be inferred. No value is derived from a name, a writing style, a language, an
// IP or any other indirect signal — see lib/profile-extract, which states that rule to the model
// and is the only writer.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_widget_visitors", (t) => {
    t.text("age").nullable();
    t.text("gender").nullable();
    t.text("nationality").nullable();
    t.text("nationality_raw").nullable();
    t.text("study_preference").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_widget_visitors", (t) => {
    t.dropColumn("study_preference");
    t.dropColumn("nationality_raw");
    t.dropColumn("nationality");
    t.dropColumn("gender");
    t.dropColumn("age");
  });
}
