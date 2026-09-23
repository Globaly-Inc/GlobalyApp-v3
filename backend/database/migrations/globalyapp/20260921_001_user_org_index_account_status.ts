import type { Knex } from "knex";

// A suspended member/agent (members.account_status / agents.account_status, set via the admin
// "Suspend" action) was never actually blocked from logging in — verifyOtp only checks the
// platform-wide platform_users.account_status, and resolveOrgScope's listUserInstitutions/
// listUserBusinesses only check the ORG's own account_status (is the business/institution itself
// active), never the per-member suspension. So a suspended user could still log in and still had
// that org listed in their session scope, same as an active member. Mirroring the suspend flag
// onto these index tables (which the login path already reads) closes that gap — same pattern
// already used for role/is_owner via insertUserBusinessIndex/insertUserInstitutionIndex.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("user_business_index", (t) => {
    t.integer("account_status").notNullable().defaultTo(1);
  });
  await knex.schema.alterTable("user_institution_index", (t) => {
    t.integer("account_status").notNullable().defaultTo(1);
  });

  // Backfill: an already-suspended member/agent must be blocked immediately by this migration,
  // not only the next time someone re-toggles their status. Reads each tenant's own
  // members/agents table (all in one database, so cross-schema reads are fine) and syncs its
  // current account_status onto the matching index row. to_regclass guards a schema created
  // before that table existed, or half-provisioned.
  const institutions: { id: number; schema_name: string }[] = await knex("institutions")
    .whereNull("deleted_at").whereNotNull("schema_provisioned_at").select("id", "schema_name");
  for (const inst of institutions) {
    const [{ exists }] = await knex.raw(`select to_regclass(?) is not null as exists`, [`"${inst.schema_name}".members`])
      .then((r: any) => r.rows);
    if (!exists) continue;
    const members: { platform_user_id: number; account_status: number }[] = (
      await knex.raw(`select platform_user_id, account_status from "${inst.schema_name}".members where deleted_at is null`)
    ).rows;
    for (const m of members) {
      await knex("user_institution_index")
        .where({ platform_user_id: m.platform_user_id, institution_id: inst.id })
        .update({ account_status: m.account_status });
    }
  }

  const businesses: { id: number; schema_name: string }[] = await knex("businesses")
    .whereNull("deleted_at").whereNotNull("schema_provisioned_at").select("id", "schema_name");
  for (const biz of businesses) {
    const [{ exists }] = await knex.raw(`select to_regclass(?) is not null as exists`, [`"${biz.schema_name}".agents`])
      .then((r: any) => r.rows);
    if (!exists) continue;
    const agents: { platform_user_id: number; account_status: number }[] = (
      await knex.raw(`select platform_user_id, account_status from "${biz.schema_name}".agents where deleted_at is null`)
    ).rows;
    for (const a of agents) {
      await knex("user_business_index")
        .where({ platform_user_id: a.platform_user_id, business_id: biz.id })
        .update({ account_status: a.account_status });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("user_institution_index", (t) => {
    t.dropColumn("account_status");
  });
  await knex.schema.alterTable("user_business_index", (t) => {
    t.dropColumn("account_status");
  });
}
