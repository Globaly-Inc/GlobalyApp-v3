// Audit log helper — writes to superadmin.admin_audit_logs.
// Direct port of V2's logAdmin() pattern.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { findAdminByPlatformUserId } from "../../admin-users/repositories/admin-users.repository.js";

export async function logAudit(
  platformUserId: number,
  action: string,
  opts?: {
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
  },
) {
  // admin_audit_logs.admin_id FKs admin_users.id, but routes pass req.auth.sub
  // (platform_users.id) — resolve the link record first, like logAdminAction does.
  const admin = await findAdminByPlatformUserId(platformUserId);
  if (!admin) return;
  await masterKnex("superadmin.admin_audit_logs").insert({
    admin_id: admin.id,
    action,
    entity_type: opts?.entityType ?? null,
    entity_id: opts?.entityId ?? null,
    details: JSON.stringify(opts?.details ?? {}),
  });
}
