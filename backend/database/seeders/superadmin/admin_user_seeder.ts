import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  const existing = await knex("superadmin.admin_users").where({ email: "admin@globalyhub.com" }).first();
  if (existing) return;

  await knex("superadmin.admin_users").insert({
    name: "Super Admin",
    email: "admin@globalyapp.com",
    // email: "priansu.koirala@globalyhub.com",
    role: "super_admin",
    account_status: 1,
    is_email_verified: true,
  });
}
