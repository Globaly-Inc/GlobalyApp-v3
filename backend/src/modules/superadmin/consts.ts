export const SUPERADMIN_SCHEMA = "superadmin";

/**
 * Only an admin-approved course reaches students — public pages, search counts and facets, the AI
 * counsellor and the embed widget. 'confirmed' is what Approve / bulk approve write; 'manual' is a
 * course an admin created by hand. Everything else ('unverified' and 'pending' imports, owner-added
 * courses, the auto-verifier's 'verified'/'mismatch', rejected 'flagged') waits for approval.
 */
export const APPROVED_COURSE_STATUSES = ["confirmed", "manual"] as const;
export const approvedCourseSql = (alias: string) =>
  `${alias}.verification_status in (${APPROVED_COURSE_STATUSES.map((s) => `'${s}'`).join(", ")})`;

export const ADMIN_ROLES = ["super_admin", "admin", "data_admin", "moderator"] as const;

export const ALLOWED_ROLES = ["super_admin", "data_admin"] as const;

export const ROLE_DISPLAY: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  data_admin: "Data Admin",
  moderator: "Moderator",
};
