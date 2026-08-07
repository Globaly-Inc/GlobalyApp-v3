import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  const adminEmail = "admin@globalyhub.com";

  // Create platform_user if not exists
  let user = await knex("platform_users").where({ email: adminEmail }).first();
  if (!user) {
    [user] = await knex("platform_users")
      .insert({
        first_name: "Super",
        last_name: "Admin",
        email: adminEmail,
        username: adminEmail,
        account_status: 1,
        is_email_verified: true,
        user_category: "superadmin",
        user_sub_category: "superadmin",
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
