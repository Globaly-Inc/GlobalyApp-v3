// Institution membership index — the master-DB mirror of a tenant's `members` table.
//
// Exactly why user_business_index exists for businesses: at login the auth service has to
// answer "which orgs does this user belong to?" from the master database alone. It cannot
// scan every tenant schema looking for a `members` row. Without this table only the owner
// (institutions.platform_user_id) is discoverable, so an invited member could never get an
// institution-scoped token.
//
// `members` (tenant) stays authoritative for role; this is the lookup index.

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("user_institution_index", (t) => {
    t.increments("id").primary();
    t.integer("platform_user_id").unsigned().notNullable().references("id").inTable("platform_users").onDelete("CASCADE");
    t.integer("institution_id").unsigned().notNullable().references("id").inTable("institutions").onDelete("CASCADE");
    t.text("role").notNullable().defaultTo("member");
    t.boolean("is_owner").notNullable().defaultTo(false);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("deleted_at").nullable();
    t.unique(["platform_user_id", "institution_id"]);
  });

  // Explicit flag, not derived — matching is_personal_account / is_business_account, which
  // the frontend routes on after login.
  await knex.schema.alterTable("platform_users", (t) => {
    t.boolean("is_institution_account").notNullable().defaultTo(false);
  });

  // ── Backfill ──
  const institutions: { id: number; platform_user_id: number; schema_name: string }[] = await knex("institutions")
    .whereNull("deleted_at")
    .whereNotNull("schema_provisioned_at")
    .select("id", "platform_user_id", "schema_name");

  for (const inst of institutions) {
    await knex("user_institution_index")
      .insert({ platform_user_id: inst.platform_user_id, institution_id: inst.id, role: "owner", is_owner: true })
      .onConflict(["platform_user_id", "institution_id"])
      .ignore();

    // Members invited before this table existed live only in the tenant schema. Reading
    // across schemas is fine — they are all in one database. to_regclass guards a schema
    // that was created before the members migration, or half-provisioned.
    const [{ exists }] = await knex.raw(
      `select to_regclass(?) is not null as exists`,
      [`"${inst.schema_name}".members`],
    ).then((r: any) => r.rows);
    if (!exists) continue;

    const members: { platform_user_id: number; role: string; is_owner: boolean }[] = (
      await knex.raw(
        `select platform_user_id, role, is_owner from "${inst.schema_name}".members
          where deleted_at is null and account_status = 1`,
      )
    ).rows;

    for (const m of members) {
      await knex("user_institution_index")
        .insert({
          platform_user_id: m.platform_user_id,
          institution_id: inst.id,
          role: m.role,
          is_owner: m.is_owner,
        })
        .onConflict(["platform_user_id", "institution_id"])
        .ignore();
    }
  }

  // Anyone now indexed against an institution is an institution account holder.
  await knex.raw(`
    UPDATE platform_users SET is_institution_account = true
     WHERE id IN (SELECT platform_user_id FROM user_institution_index WHERE deleted_at IS NULL)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("platform_users", (t) => {
    t.dropColumn("is_institution_account");
  });
  await knex.schema.dropTableIfExists("user_institution_index");
}
