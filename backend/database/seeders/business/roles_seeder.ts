import type { Knex } from "knex";

const DEFAULT_ROLES = [
  { name: "owner", display_name: "Owner", description: "Business owner with full access", is_system: true, sort_order: 0 },
  { name: "admin", display_name: "Admin", description: "Administrative access", is_system: true, sort_order: 1 },
  { name: "manager", display_name: "Manager", description: "Team and operations management", is_system: true, sort_order: 2 },
  { name: "counsellor", display_name: "Counsellor", description: "Student counselling and support", is_system: true, sort_order: 3 },
  { name: "member", display_name: "Member", description: "Standard team member", is_system: true, sort_order: 4 },
];

const DEFAULT_PERMISSIONS = [
  { module: "business", action: "read", display_name: "View Business Profile", description: "View business details and settings" },
  { module: "business", action: "write", display_name: "Edit Business Profile", description: "Edit business details and settings" },
  { module: "agents", action: "read", display_name: "View Team Members", description: "View agent/team member list" },
  { module: "agents", action: "write", display_name: "Manage Team Members", description: "Invite and manage agents" },
  { module: "agents", action: "delete", display_name: "Remove Team Members", description: "Remove agents from business" },
  { module: "enquiries", action: "view", display_name: "View Enquiries", description: "View incoming student enquiries" },
  { module: "enquiries", action: "unlock", display_name: "Unlock Enquiries", description: "Unlock enquiry contact details (spends credits)" },
  { module: "enquiries", action: "respond", display_name: "Respond to Enquiries", description: "Reply to students in enquiry conversations" },
  { module: "enquiries", action: "assign", display_name: "Assign Enquiries", description: "Assign enquiries to team members" },
  { module: "enquiries", action: "convert", display_name: "Convert Enquiries", description: "Mark enquiries as converted" },
];

// module:action → which roles get it
const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  "business:read":  ["owner", "admin", "manager", "counsellor", "member"],
  "business:write": ["owner", "admin"],
  "agents:read":    ["owner", "admin", "manager"],
  "agents:write":   ["owner", "admin"],
  "agents:delete":  ["owner", "admin"],
  "enquiries:view":    ["owner", "admin", "manager", "counsellor", "member"],
  "enquiries:unlock":  ["owner", "admin", "manager"],
  "enquiries:respond": ["owner", "admin", "manager", "counsellor"],
  "enquiries:assign":  ["owner", "admin", "manager"],
  "enquiries:convert": ["owner", "admin", "manager", "counsellor"],
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
