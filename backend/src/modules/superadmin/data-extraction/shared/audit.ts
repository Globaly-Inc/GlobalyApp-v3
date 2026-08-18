// Audit log helper — writes to superadmin.admin_audit_logs.
// Direct port of V2's logAdmin() pattern.
//
// `adminId` is a superadmin.admin_users.id, which is what the FK on this table
// points at. It is NOT the admin JWT's `sub` — that is the platform_user_id, and
// the two id spaces do not overlap. Callers get the right one from
// resolveAdminId() in ./admin-id.ts.

import { masterKnex } from "../../../../core/db/master-pool.js";

export async function logAudit(
  adminId: number,
  action: string,
  opts?: {
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
  },
) {
  await masterKnex("superadmin.admin_audit_logs").insert({
    admin_id: adminId,
    action,
    entity_type: opts?.entityType ?? null,
    entity_id: opts?.entityId ?? null,
    details: JSON.stringify(opts?.details ?? {}),
  });
}
