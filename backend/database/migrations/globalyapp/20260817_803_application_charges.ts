// application_charges — the per-application billing ledger (Wave G5).
//
// Schema spec: V2 `application_charges`. Behavioural spec: V1's `charge-application`
// edge function plus AdminApplicationCharges.tsx (waive / refund).
//
// Master (`public`), like every other table that FKs both a business and a
// platform user, and because credit_transactions is master (20260816_005).
//
// ── THIS TABLE IS THE EXACTLY-ONCE MECHANISM ──
// `idempotency_key` is NOT NULL UNIQUE. It is derived, not supplied:
// `application_charge:<application_id>` (see applications/consts.ts). The charge
// path INSERTs here FIRST, inside the same master transaction that then debits the
// wallet through billing/services/credits.service.ts. Consequences:
//   * two concurrent accepts of the same application — the loser blocks on the
//     index until the winner commits, conflicts, and reports "already charged"
//     without ever reaching the debit. One charge, one ledger row.
//   * insufficient credits — spendCredits throws 402, the whole transaction rolls
//     back, and this row disappears with it, so a later top-up can retry. No
//     orphan `pending` charge is left behind (V1 inserted one, on a *separate*
//     non-transactional call, and then returned 402 — so the retry after top-up
//     found a stale pending row and V1's own idempotency check, which only looked
//     for status='charged', charged again anyway. Defect D-G5-3.)
//   * a replayed request — the committed row is found by the fast-path read, and
//     even if that read raced, the wallet debit carries the SAME derived
//     idempotency key against credit_transactions' own UNIQUE index. Two
//     independent guards.
//
// There is no `pending` status. V1's `pending` meant "we tried to charge and the
// wallet was empty", which is not a charge — it is the absence of one, recorded
// where a reader cannot tell it apart from a charge in flight. V3 records nothing
// in that case and returns 402.
//
// ── REFUND (defect D-G5-4) ──
// V1's admin refund granted the credits back and THEN updated the status, in two
// separate un-transacted calls. If the second failed, the credits were granted and
// the row still read `charged`, so the button could be pressed again — unbounded
// free credits. V3 does the status transition FIRST, guarded by
// `WHERE status = 'charged' ... RETURNING`, in the same transaction as the grant,
// whose idempotency key is `application_refund:<id>`.

import type { Knex } from "knex";

const STATUSES = ["charged", "waived", "refunded"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("application_charges", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("business_id").unsigned().notNullable()
      .references("id").inTable("businesses").onDelete("CASCADE");
    t.integer("application_id").unsigned().notNullable()
      .references("id").inTable("applications").onDelete("CASCADE");
    // PII: which student this charge is for. Admin-and-owner only; never in a
    // public projection. Nullable + SET NULL because losing the student must not
    // erase the business's billing history.
    t.integer("student_id").unsigned().nullable()
      .references("id").inTable("platform_users").onDelete("SET NULL");
    // App-level FK into the owning tenant's business_services — see 20260817_802.
    t.integer("service_id").unsigned().nullable();

    t.integer("credits_charged").notNullable().defaultTo(10);
    t.text("status").notNullable().defaultTo("charged")
      .checkIn([...STATUSES], "application_charges_status_check");
    t.timestamp("charged_at").notNullable().defaultTo(knex.fn.now());

    // The debit this charge paid for. SET NULL rather than CASCADE: losing the
    // ledger row must never silently un-charge the application. Same precedent as
    // enquiry_unlocks.credit_transaction_id.
    t.integer("credit_transaction_id").unsigned().nullable()
      .references("id").inTable("credit_transactions").onDelete("SET NULL");
    // The credit-back row, once refunded.
    t.integer("refund_transaction_id").unsigned().nullable()
      .references("id").inTable("credit_transactions").onDelete("SET NULL");

    // Derived, NOT NULL, UNIQUE — the arbiter. See the header.
    t.text("idempotency_key").notNullable();

    t.integer("waived_by").unsigned().nullable(); // app-level FK: superadmin.admin_users.id
    t.timestamp("waived_at").nullable();
    t.timestamp("refunded_at").nullable();

    t.timestamps(true, true);

    t.unique(["idempotency_key"], { indexName: "application_charges_idempotency_uniq" });
    // One charge per application, expressed twice on purpose: the derived key
    // above makes it unforgeable, this makes it readable to anyone inspecting the
    // schema. Deliberately NOT partial on a soft-delete column — this table has
    // none, because voiding a charge is `waived`/`refunded`, never a delete.
    t.unique(["application_id"], { indexName: "application_charges_application_uniq" });

    t.index(["business_id", "charged_at"], "application_charges_business_idx");
    t.index(["status"], "application_charges_status_idx");
  });

  await knex.schema.alterTable("application_charges", (t) => {
    t.check("credits_charged > 0", [], "application_charges_credits_check");
    // Only `refunded_at`, NOT refund_transaction_id — and that is forced by the
    // ordering that makes the refund non-replayable. claimVoid() flips the status
    // FIRST (compare-and-set from 'charged') and the credit grant happens after,
    // so the ledger id cannot exist in the same statement. Postgres CHECK
    // constraints cannot be DEFERRABLE, so there is no way to express "by commit
    // time" here; the link is asserted by the test instead
    // (application-charges.test.ts: refund_transaction_id not null).
    // Reversing the order to satisfy the constraint would reintroduce D-G5-4.
    t.check(
      "status <> 'refunded' OR refunded_at IS NOT NULL",
      [],
      "application_charges_refund_complete_check",
    );
    t.check("status <> 'waived' OR waived_at IS NOT NULL", [], "application_charges_waived_at_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("application_charges");
}
