// enquiries.course_id — the catalog course a student enquired about.
//
// ── why this is not enquiries.service_id ──
// `service_id` is documented in 20260817_100 as "a uuid inside the target org's
// tenant schema", carried from V1, where a student enquired about a service by
// browsing the org that offered it. The student portal's flow is the other one:
// /personal/courses lists `superadmin.extraction_courses` and every card has an
// "Enquire" button that deep-links the course id. That is a different table in a
// different schema meaning a different thing, and putting it in `service_id`
// would overload one column with two provenances — exactly the mistake
// 20260817_001_catalog_extraction_keys.ts calls out and avoids.
//
// The alternative was to drop the value on the floor: the client sends it, the
// `.strict()` schema rejects it, and the fix could have been to stop sending it.
// But the selection is real user input with an entry point in another feature, so
// discarding it would silently amputate that flow and leave every enquiry with no
// recorded subject.
//
// ── why there is no foreign key ──
// No globalyapp migration references a superadmin table, and this one must not be
// the first: `superadmin.extraction_courses` is staging data, and
// merge.repository.ts `deleteRows` HARD deletes from it when the extraction tail
// merges duplicates. A real FK would make a merge either fail or cascade into the
// lead pipeline. So this is an app-level reference — the same pattern
// 20260817_100 uses for `target_org_id` — and readers LEFT JOIN it, so a course
// that has since been merged away renders as an enquiry with no course rather
// than an error.
//
// No index: the only read is enquiry -> course by the course's own primary key.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiries", (t) => {
    t.uuid("course_id").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("enquiries", (t) => {
    t.dropColumn("course_id");
  });
}
