import type { Knex } from "knex";

// Institution counterpart of seeders/business/roles_seeder.ts. Idempotent — runs on every
// provision (registration, claim accept, re-provision) and from the roles-tables migration
// as a backfill for existing tenants.
//
// members.role holds the role NAME (text, no role_id FK), so role names here must match
// what member rows/invitations already use ("member" is the members.role column default).

const DEFAULT_ROLES = [
  { name: "owner", display_name: "Owner", description: "Institution owner with full access", is_system: true, sort_order: 0 },
  { name: "admin", display_name: "Admin", description: "Administrative access", is_system: true, sort_order: 1 },
  { name: "member", display_name: "Member", description: "Standard team member", is_system: true, sort_order: 2 },
];

// Module keys reuse the business vocabulary ("business", "agents") on purpose — the shared
// role-drawer UI labels them, and institution member rows are already shaped as agents.
const DEFAULT_PERMISSIONS = [
  { module: "business", action: "read", display_name: "View Institution Profile", description: "View institution details and settings" },
  { module: "business", action: "write", display_name: "Edit Institution Profile", description: "Edit institution details and settings" },
  { module: "agents", action: "read", display_name: "View Team Members", description: "View team member list" },
  { module: "agents", action: "write", display_name: "Manage Team Members", description: "Invite and manage team members" },
  { module: "agents", action: "delete", display_name: "Remove Team Members", description: "Remove members from institution" },
];

// module:action → which roles get it
const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  "business:read":  ["owner", "admin", "member"],
  "business:write": ["owner", "admin"],
  "agents:read":    ["owner", "admin"],
  "agents:write":   ["owner", "admin"],
  "agents:delete":  ["owner", "admin"],
};

export async function seed(knex: Knex): Promise<void> {
  // Seed roles
  for (const role of DEFAULT_ROLES) {
    const exists = await knex("roles").where({ name: role.name }).whereNull("deleted_at").first();
    if (!exists) await knex("roles").insert(role);
  }

  // Seed permissions
  for (const perm of DEFAULT_PERMISSIONS) {
    const exists = await knex("permissions").where({ module: perm.module, action: perm.action }).whereNull("deleted_at").first();
    if (!exists) await knex("permissions").insert(perm);
  }

  // Seed role_permissions
  const roles = await knex("roles").select("id", "name");
  const permissions = await knex("permissions").select("id", "module", "action");

  const roleMap = new Map(roles.map((r: any) => [r.name, r.id]));
  const permMap = new Map(permissions.map((p: any) => [`${p.module}:${p.action}`, p.id]));

  for (const [permKey, roleNames] of Object.entries(ROLE_PERMISSION_MAP)) {
    const permId = permMap.get(permKey);
    if (!permId) continue;
    for (const roleName of roleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) continue;
      const exists = await knex("role_permissions").where({ role_id: roleId, permission_id: permId }).first();
      if (!exists) await knex("role_permissions").insert({ role_id: roleId, permission_id: permId });
    }
  }
}
