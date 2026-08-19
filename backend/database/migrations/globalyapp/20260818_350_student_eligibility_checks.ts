// Eligibility checks — V1's `eligibility_checks` (3 rows), in V3 shape. MASTER schema.
//
// PLACEMENT (§1.2). This is the expensive decision on this table, so the reasoning
// in full. An eligibility_checks row has exactly two legs:
//
//   student  -> a platform user. Master. `public.platform_users`.
//   service  -> a `business_services` row living INSIDE one tenant's schema.
//
// §1.2's rule is "shared/global + cross-tenant graph -> public (master)". A row
// whose two FKs straddle master and a tenant schema cannot live in the tenant
// schema: put this in Curtin's schema and the row has one leg in `public` that
// Curtin's schema is not the owner of, the student's own history is split across
// every tenant they ever checked against, and "my eligibility history, newest
// first" — which is the entire V1 page — becomes a fan-out over 38 schemas that
// grows with the tenant count. Put it in master and it is one indexed read.
//
// The same call was already made three times in V3 for the same reason:
// `student_favorites` (20260817_820, a save that may point into any tenant),
// `student_job_applications` (20260817_701) and the cross-tenant graph
// (20260816_003 / scripts/migration/w7-master.ts). This follows them; a fourth
// pattern would be invention.
//
// WHY service_id IS A BARE uuid WITH NO FOREIGN KEY
// A cross-schema FK is not expressible in Postgres, so the only candidate parent in
// master is `catalog_services` — the trigger-maintained projection of every tenant
// service (20260817_003), keyed on that same uuid. It is deliberately NOT referenced:
// the projection triggers maintain a row by DELETE + INSERT..SELECT on every service
// UPDATE, and an inbound FK would make every service edit in the product fail on a
// constraint violation. So the uuid is stored bare and resolved by join, exactly as
// `student_favorites.item_id` is. Integrity is the route's job: a check can only be
// created for a service that resolves live in `catalog_services`.
//
// WHAT V3 ADDS TO V1's SHAPE
//   v1_id       the loader's idempotency key (scripts/migration/w7-master.ts).
//   updated_at  V1 had created_at only; V3's timestamps() pair is the house style.
//   CHECK on result — V1 had a Postgres enum (`eligibility_result`). A CHECK carries
//   the same three values without a type V3 has to migrate; the vocabulary lives in
//   modules/eligibility/consts.ts and is the source both this and zod read from.
//
// WHY THE TWO REQUIREMENT LISTS STAY jsonb TEXT ARRAYS
// They are rendered strings, not data: V1 wrote human sentences ("Minimum GPA: 3
// (your GPA: 2)") and the page prints them with a tick or a cross. Normalising them
// into a requirements table would mean re-deriving the sentence for 3 migrated rows
// whose exact text is what a read-parity diff compares. Same shape, same column
// names, byte-faithful.
//
// NO SOFT DELETE. A check is an append-only record of what the rules said at a
// moment; V1 had no deleted_at and nothing in the product deletes one. Re-checking
// the same course appends a row — V1's page shows the history, not a latest-only
// view — so there is deliberately no unique constraint on (user, service) either.

import type { Knex } from "knex";

const TABLE = "student_eligibility_checks";

/** modules/eligibility/consts.ts ELIGIBILITY_RESULTS. A unit test asserts the two agree. */
const RESULTS = ["eligible", "conditionally_eligible", "not_eligible"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(TABLE, (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("platform_user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    // A tenant business_services uuid. No FK — see WHY above.
    t.uuid("service_id").notNullable();
    t.text("result").notNullable().checkIn(RESULTS as unknown as string[], `${TABLE}_result_check`);
    // Rendered sentences, met and unmet. V1 put conditional flags in unmet_requirements
    // and told them apart only by `result`; that is preserved.
    t.jsonb("met_requirements").notNullable().defaultTo("[]");
    t.jsonb("unmet_requirements").notNullable().defaultTo("[]");
    t.text("notes").nullable();
    t.timestamps(true, true);

    // The only query the feature makes: one student's checks, newest first.
    // (platform_user_id, id DESC) serves both the page and its count.
    t.index(["platform_user_id", "id"], `${TABLE}_user_id_idx`);
    // "have I already checked this course" on the history page.
    t.index(["service_id"], `${TABLE}_service_id_idx`);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TABLE);
}
