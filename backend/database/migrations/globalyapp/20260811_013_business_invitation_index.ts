import type { Knex } from "knex";

// Globalyapp-side read model over the per-tenant `agent_invitations` table, which stays the system of
// record. Without this, "list my pending invites" would mean fanning out across every business DB.
// Written by a dual write (tenant first, index second) and converged by the reconciler job — see
// src/modules/agents/jobs/reconcile-invitations.ts.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("business_invitation_index", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("business_id").unsigned().notNullable().references("id").inTable("businesses").onDelete("CASCADE");
    // agent_invitations.id in the tenant DB — no FK possible, different database.
    t.uuid("tenant_invitation_id").notNullable().unique();
    t.text("invitee_email_normalized").notNullable();
    t.integer("platform_user_id").unsigned().nullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.text("role").notNullable().defaultTo("member");
    t.text("position").nullable();
    // sha256 of the invite token. Used only for comparison/uniqueness — a hash cannot reconstruct the
    // token, so the authenticated accept path addresses invitations by tenant_invitation_id instead.
    t.text("token_hash").nullable().unique();
    t.text("status").notNullable().defaultTo("pending"); // pending | accepted | declined | expired | revoked
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.integer("invited_by_platform_user_id").unsigned().nullable().references("id").inTable("platform_users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("responded_at", { useTz: true }).nullable();
    t.timestamp("synced_at", { useTz: true }).nullable();
    t.text("sync_error").nullable();
    t.timestamp("deleted_at").nullable();
    t.index(["invitee_email_normalized", "status"], "biz_invite_idx_email_status");
    t.index(["platform_user_id", "status"], "biz_invite_idx_user_status");
    t.index(["business_id", "created_at"], "biz_invite_idx_business_created");
  });

  await knex.raw(`
    CREATE UNIQUE INDEX biz_invite_pending_uniq
      ON business_invitation_index (business_id, invitee_email_normalized)
      WHERE status = 'pending' AND deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("business_invitation_index");
}
