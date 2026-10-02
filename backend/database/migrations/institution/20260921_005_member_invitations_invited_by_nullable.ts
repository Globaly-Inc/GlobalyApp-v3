import type { Knex } from "knex";

// member_invitations.invited_by was NOT NULL, referencing the inviting `members` row — fine when
// an institution's own owner invites a teammate (agents.routes.ts), but a superadmin inviting the
// very first member into an institution that has no owner yet (e.g. one created directly by
// platform staff, never claimed/onboarded) has no member row to reference at all, so the insert
// was impossible — surfaced as "Institution owner member not found" from findOwnerMember() being
// used as a required precondition instead of an optional attribution. Dropping NOT NULL lets a
// superadmin-initiated invite record invited_by as null.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("member_invitations", (t) => {
    t.integer("invited_by").unsigned().nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("member_invitations", (t) => {
    t.integer("invited_by").unsigned().notNullable().alter();
  });
}
