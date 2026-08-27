import type { Knex } from "knex";

const DEFAULT_ROLES = [
  { name: "owner", display_name: "Owner", description: "Institution owner with full access", is_system: true, sort_order: 0 },
  { name: "admin", display_name: "Admin", description: "Administrative access", is_system: true, sort_order: 1 },
  { name: "manager", display_name: "Manager", description: "Team and operations management", is_system: true, sort_order: 2 },
  { name: "member", display_name: "Member", description: "Standard team member", is_system: true, sort_order: 3 },
];

const DEFAULT_PERMISSIONS = [
  { module: "profile", action: "read", display_name: "View Institution Profile", description: "View institution details and settings" },
  { module: "profile", action: "write", display_name: "Edit Institution Profile", description: "Edit institution details and settings" },
  { module: "members", action: "read", display_name: "View Members", description: "View institution member list" },
  { module: "members", action: "write", display_name: "Manage Members", description: "Invite and manage members" },
  { module: "members", action: "delete", display_name: "Remove Members", description: "Remove members from institution" },
  { module: "courses", action: "read", display_name: "View Courses", description: "View institution course listings" },
  { module: "courses", action: "write", display_name: "Manage Courses", description: "Create and edit courses" },
  { module: "enquiries", action: "view", display_name: "View Enquiries", description: "View incoming student enquiries" },
  { module: "enquiries", action: "respond", display_name: "Respond to Enquiries", description: "Reply to students in enquiry conversations" },
  { module: "roles", action: "manage", display_name: "Manage Roles", description: "Create, edit, and delete roles" },
];

// module:action → which roles get it
const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  "profile:read":      ["owner", "admin", "manager", "member"],
  "profile:write":     ["owner", "admin"],
  "members:read":      ["owner", "admin", "manager"],
  "members:write":     ["owner", "admin"],
  "members:delete":    ["owner", "admin"],
  "courses:read":      ["owner", "admin", "manager", "member"],
  "courses:write":     ["owner", "admin", "manager"],
  "enquiries:view":    ["owner", "admin", "manager", "member"],
  "enquiries:respond": ["owner", "admin", "manager"],
  "roles:manage":      ["owner", "admin"],
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
