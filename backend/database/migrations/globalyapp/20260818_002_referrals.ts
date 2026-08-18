// Referral program — codes and the referral lifecycle.
//
// Deliberately credit-free: Phase 1 records referrals only. The credited/expired columns below are
// schema-reserved so the credits phase can ship without an ALTER, but nothing writes them yet.

import type { Knex } from "knex";
import { generateReferralCode } from "../../../src/modules/referrals/utils/generate-referral-code.js";

export async function up(knex: Knex): Promise<void> {
  // ── referral_codes ──
  // ONE table for both code types (individuals and business entities), which makes the single
  // shared namespace free rather than something to enforce across two tables.
  await knex.schema.createTable("referral_codes", (t) => {
    t.increments("id").primary();
    t.text("code").notNullable();
    t.text("owner_type").notNullable();
    t.integer("owner_id").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE referral_codes
      ADD CONSTRAINT referral_codes_owner_type_check CHECK (owner_type IN ('user', 'business')),
      ADD CONSTRAINT referral_codes_owner_unique UNIQUE (owner_type, owner_id)
  `);

  // Case-insensitive global uniqueness. Both this and referral_codes_owner_unique are explicitly
  // NAMED so codes.service.issueCode can branch on err.constraint: an owner conflict means "this
  // entity already has a code, return it", a code collision means "retry with a fresh code", and
  // anything else must NOT be retried. Inferring that from a message string would be fragile.
  await knex.raw(`CREATE UNIQUE INDEX referral_codes_code_lower ON referral_codes (lower(code))`);

  // ── referrals ──
  await knex.schema.createTable("referrals", (t) => {
    t.increments("id").primary();

    // INV-5: attribution is written against the immutable surrogate key, never the human-readable
    // code, so changing code lookup or formatting later cannot rewrite history.
    t.integer("referral_code_id").notNullable()
      .references("id").inTable("referral_codes").onDelete("RESTRICT");

    // Denormalised at attribution time so nothing about the code record can retroactively reassign
    // a historical referral.
    t.text("referrer_type").notNullable();
    t.integer("referrer_id").notNullable();

    // In Phase 1 this is always ('user', id): a business is never a referred party, even for a
    // business_referral, which qualifies THROUGH the referred user's own business.
    t.text("referred_type").notNullable();
    t.integer("referred_id").notNullable();

    t.text("state").notNullable();
    t.text("action_type").nullable(); // null until qualification

    // Which business verification paid out — the audit-grade answer to "why 100 credits?".
    t.integer("qualifying_business_id").nullable();

    t.timestamp("signed_up_at", { useTz: true }).notNullable();
    t.timestamp("qualified_at", { useTz: true }).nullable();
    t.timestamp("credited_at", { useTz: true }).nullable();
    t.timestamp("expired_at", { useTz: true }).nullable();

    // Snapshot: a later config change must never rewrite what was actually paid.
    t.integer("credits_awarded").nullable();

    // Phase 3 governance.
    t.text("void_category").nullable();
    t.text("void_reason_internal").nullable();
    t.integer("voided_by").nullable();
    t.text("rejected_reason").nullable();

    t.timestamps(true, true); // timestamptz
  });

  await knex.raw(`
    ALTER TABLE referrals
      ADD CONSTRAINT referrals_referrer_type_check CHECK (referrer_type IN ('user', 'business')),
      ADD CONSTRAINT referrals_referred_type_check CHECK (referred_type IN ('user', 'business')),
      ADD CONSTRAINT referrals_state_check CHECK (
        state IN ('signed_up', 'credited', 'expired', 'voided', 'rejected')
      ),
      ADD CONSTRAINT referrals_action_type_check CHECK (
        action_type IS NULL OR action_type IN ('student_referral', 'business_referral')
      ),
      ADD CONSTRAINT referrals_referred_unique UNIQUE (referred_type, referred_id),
      ADD CONSTRAINT referrals_credits_positive CHECK (
        credits_awarded IS NULL OR credits_awarded > 0
      ),
      ADD CONSTRAINT referrals_credited_complete CHECK (
        state <> 'credited' OR (
          credits_awarded IS NOT NULL AND credited_at IS NOT NULL
          AND qualified_at IS NOT NULL AND action_type IS NOT NULL
        )
      ),
      ADD CONSTRAINT referrals_qualifying_business_only_for_business CHECK (
        qualifying_business_id IS NULL OR action_type = 'business_referral'
      )
  `);

  // Notes on the constraints above:
  //  * state: credited/expired/voided/rejected are SCHEMA-RESERVED — listed so no later migration
  //    has to ALTER the constraint, but no Phase 1 code writes them. Phase 1 writes signed_up only.
  //  * action_type: business_upgrade_referral is deliberately ABSENT. V3 never issues it and no V2
  //    rows are migrated, so admitting it would be dead surface.
  //  * referrals_referred_unique is INV-3 — a person is referred at most once, EVER. Strictly
  //    stronger than the PRD unique_referral_pair(referrer, referred), which is therefore redundant.
  //    Named so materialiseReferral can recognise this specific 23505 as "already attributed"
  //    rather than as an unexpected error.

  // The referrer history query.
  await knex.raw(`CREATE INDEX referrals_referrer_idx ON referrals (referrer_type, referrer_id, state)`);
  // No index on state alone: the Phase 2 expiry sweep wants (state, signed_up_at) and gets it in the
  // Phase 2 migration, when there is data to justify it.

  // ── Backfill ──
  // Every pre-existing entity gets a code, INCLUDING soft-deleted rows: a code is inert without a
  // referrals row, and skipping them would leave the "impossible" no-code branch reachable if a row
  // were ever restored.
  await backfillCodes(knex, "user", "platform_users");
  await backfillCodes(knex, "business", "businesses");
}

/**
 * Idempotent and safe to re-run, including after a crash part-way through.
 *
 * Knex's knex_migrations_globalyapp table stops a COMPLETED migration from re-running; this handles
 * the case Knex does not. Codes are generated in TypeScript rather than SQL because
 * gen_random_bytes() is pgcrypto and no migration in this repo runs CREATE EXTENSION pgcrypto —
 * gen_random_uuid(), used elsewhere, is PostgreSQL core. Assuming pgcrypto would have failed the
 * migration before a single referral code existed.
 */
async function backfillCodes(knex: Knex, ownerType: "user" | "business", table: string) {
  const BATCH = 500;
  const MAX_CODE_ATTEMPTS = 5;
  let issued = 0;

  for (;;) {
    const ids: number[] = await knex(table)
      .whereNotExists(function () {
        this.select(knex.raw("1"))
          .from("referral_codes")
          .whereRaw("referral_codes.owner_type = ?", [ownerType])
          .whereRaw(`referral_codes.owner_id = ${table}.id`);
      })
      .orderBy("id")
      .limit(BATCH)
      .pluck("id");

    if (ids.length === 0) break;

    for (const ownerId of ids) {
      let done = false;
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !done; attempt++) {
        try {
          await knex.raw(
            `INSERT INTO referral_codes (owner_type, owner_id, code)
             VALUES (?, ?, ?)
             ON CONFLICT ON CONSTRAINT referral_codes_owner_unique DO NOTHING`,
            [ownerType, ownerId, generateReferralCode()],
          );
          // Inserted, or this owner already had a code (a concurrent registration won). Both are
          // success — never an error.
          done = true;
        } catch (err: unknown) {
          // ONLY a generated-code collision is worth retrying. Anything else is a real fault and
          // must fail the migration rather than spin.
          if ((err as { constraint?: string })?.constraint === "referral_codes_code_lower") continue;
          throw err;
        }
      }
      if (!done) {
        throw new Error(
          `Referral code backfill: ${MAX_CODE_ATTEMPTS} code collisions for ${ownerType} ${ownerId} — aborting rather than looping`,
        );
      }
      issued++;
    }

    if (ids.length < BATCH) break;
  }

  if (issued > 0) console.log(`[migration] backfilled ${issued} ${ownerType} referral codes`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("referrals"); // FK to referral_codes
  await knex.schema.dropTableIfExists("referral_codes");
}
