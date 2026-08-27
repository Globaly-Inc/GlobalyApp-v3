import type { Knex } from "knex";

// Bootstrap super admins. Idempotent on both tables, so re-running after adding an
// email here only creates what is missing — safe on an already-seeded database.
const SUPER_ADMINS = [
  { email: "subash.chaudhary@globalyhub.com", first_name: "Super", last_name: "Admin" },
  { email: "wonjala.joshi@globalyhub.com", first_name: "Wonjala", last_name: "Joshi" },
] as const;

export async function seed(knex: Knex): Promise<void> {
  for (const admin of SUPER_ADMINS) {
    // Create platform_user if not exists
    let user = await knex("platform_users").where({ email: admin.email }).first();
    if (!user) {
      [user] = await knex("platform_users")
        .insert({
          first_name: admin.first_name,
          last_name: admin.last_name,
          email: admin.email,
          account_status: 1,
          is_email_verified: true,
          is_personal_account: true,
        })
        .returning("*");
    }

    // Create admin role-link if not exists
    const existing = await knex("superadmin.admin_users").where({ platform_user_id: user.id }).first();
    if (!existing) {
      await knex("superadmin.admin_users").insert({
        platform_user_id: user.id,
        role: "super_admin",
        is_active: true,
      });
    }
  }
}
