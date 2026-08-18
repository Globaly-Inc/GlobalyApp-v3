// Training certificates + XP/streak gamification. Wave G4.
//
// Spec: V2 `training_certificates` / `training_gamification` (routes/training.ts
// grading + awardXp, routes/ambassadors-public.ts's certificate projection).
//
// ── verification_code ──
// V1 and V2 both modelled a certificate as a private row with an `is_expired`
// boolean; there was no way for a third party to check one. A credential nobody
// outside the platform can verify is a claim, not a certificate, so V3 adds a
// stable public identifier. It is:
//   * NOT NULL UNIQUE, generated with crypto.randomUUID at issue time and never
//     reissued — the certificate id itself is a serial and therefore guessable
//     by enumeration, which is exactly what a verification URL must not be;
//   * the ONLY key the public verify endpoint accepts, and that endpoint
//     projects the credential (holder name, program, level, score, dates) and
//     nothing else — no user id, no email, no business internals.
//
// ── one active certificate per (user, program) ──
// Enforced by a PARTIAL unique index on is_expired = false. V2 handled
// recertification by deleting expired rows before inserting; V3 keeps the
// history (an expired certificate is a fact about the holder) and lets the
// partial index guarantee at most one live credential.

import type { Knex } from "knex";

const CERTIFICATE_LEVELS = ["completion", "bronze", "silver", "gold"] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("training_certificates", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();

    t.integer("user_id").unsigned().notNullable()
      .references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("program_id").unsigned().notNullable()
      .references("id").inTable("training_programs").onDelete("CASCADE");

    t.text("level").notNullable()
      .checkIn([...CERTIFICATE_LEVELS], "training_certificates_level_check");
    t.integer("score").nullable();
    t.text("verification_code").notNullable().unique();

    t.boolean("is_expired").notNullable().defaultTo(false);
    t.timestamp("issued_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("expires_at").nullable();
    t.timestamps(true, true);

    t.index(["user_id", "issued_at"], "training_certificates_user_issued_idx");
    t.index(["program_id"], "training_certificates_program_idx");
  });

  await knex.raw(
    `CREATE UNIQUE INDEX training_certificates_active_uniq
       ON training_certificates (user_id, program_id)
       WHERE is_expired = false`,
  );

  await knex.schema.createTable("training_gamification", (t) => {
    t.increments("id").primary();
    t.uuid("v1_id").nullable().unique();
    t.integer("user_id").unsigned().notNullable().unique()
      .references("id").inTable("platform_users").onDelete("CASCADE");

    t.integer("total_xp").notNullable().defaultTo(0);
    t.integer("current_streak").notNullable().defaultTo(0);
    t.integer("longest_streak").notNullable().defaultTo(0);
    t.timestamp("last_activity_date").nullable();
    // [{ id, name, earned_at }] — V2's shape, carried verbatim.
    t.jsonb("badges").notNullable().defaultTo("[]");
    t.timestamps(true, true);

    t.check("total_xp >= 0", [], "training_gamification_total_xp_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("training_gamification");
  await knex.raw(`DROP INDEX IF EXISTS training_certificates_active_uniq`);
  await knex.schema.dropTableIfExists("training_certificates");
}
