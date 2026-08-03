import type { Knex } from "knex";

const DEFAULT_ROLES = [
  { name: "owner", display_name: "Owner", description: "Business owner with full access", is_system: true, sort_order: 0 },
  { name: "admin", display_name: "Admin", description: "Administrative access", is_system: true, sort_order: 1 },
  { name: "manager", display_name: "Manager", description: "Team and operations management", is_system: true, sort_order: 2 },
  { name: "counsellor", display_name: "Counsellor", description: "Student counselling and support", is_system: true, sort_order: 3 },
  { name: "member", display_name: "Member", description: "Standard team member", is_system: true, sort_order: 4 },
];

export async function seed(knex: Knex): Promise<void> {
  for (const role of DEFAULT_ROLES) {
    const exists = await knex("roles").where({ name: role.name }).first();
    if (!exists) await knex("roles").insert(role);
  }
}
