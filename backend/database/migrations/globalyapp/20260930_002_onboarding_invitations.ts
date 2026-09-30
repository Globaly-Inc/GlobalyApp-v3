// Admin-sent onboarding invites for people with no account yet. Accepting one creates the personal
// account and the org in one step — an institution when the invite's business category is
// "institutions", a business for every other category (`type` records which) — see
// platform-users/services/onboarding-invitations.service.ts.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("onboarding_invitations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("email").notNullable();
    t.text("type").notNullable();
    t.text("org_name").notNullable();
    t.integer("business_category_id").unsigned().nullable().references("id").inTable("business_categories").onDelete("SET NULL");
    t.text("token_hash").notNullable();
    t.jsonb("previous_tokens").notNullable().defaultTo("[]");
    t.integer("invited_by").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.text("status").notNullable().defaultTo("pending");
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.integer("accepted_user_id").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.integer("accepted_institution_id").unsigned().nullable().references("id").inTable("institutions").onDelete("SET NULL");
    t.integer("accepted_business_id").unsigned().nullable().references("id").inTable("businesses").onDelete("SET NULL");
    t.timestamp("accepted_at", { useTz: true }).nullable();
    t.text("email_status").notNullable().defaultTo("queued");
    t.timestamp("email_sent_at", { useTz: true }).nullable();
    t.text("email_error").nullable();
    t.timestamp("link_requested_at", { useTz: true }).nullable();
    t.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE onboarding_invitations
      ADD CONSTRAINT onboarding_invitations_type_check CHECK (type IN ('institution', 'business')),
      ADD CONSTRAINT onboarding_invitations_status_check CHECK (status IN ('pending', 'accepted', 'revoked')),
      ADD CONSTRAINT onboarding_invitations_email_status_check CHECK (email_status IN ('queued', 'sent', 'failed'))
  `);
  await knex.raw(`CREATE UNIQUE INDEX onboarding_invitations_token_hash_uniq ON onboarding_invitations (token_hash)`);
  await knex.raw(`
    CREATE UNIQUE INDEX onboarding_invitations_pending_email_uniq
      ON onboarding_invitations (lower(email)) WHERE status = 'pending'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("onboarding_invitations");
}
