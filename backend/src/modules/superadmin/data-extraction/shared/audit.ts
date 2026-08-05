// Audit log helper — writes to superadmin.admin_audit_logs.
// Direct port of V2's logAdmin() pattern.

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
