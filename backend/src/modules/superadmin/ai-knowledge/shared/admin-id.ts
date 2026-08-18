// Who is writing? — resolved once, for every audited route in this module.
//
// superadmin.admin_audit_logs.admin_id has a foreign key to superadmin.admin_users.id,
// but the admin JWT's `sub` is the platform_user_id (see the comment in
// admin-users.service.ts: "JWT.sub is platform_user_id now"). The two id spaces do not
// line up — on the dev database admin_users.id runs 9..16 while their platform_user_id
// runs 27..44 — so passing `sub` straight into logAudit() either violates the FK (a 500
// on every create/update/delete) or silently attributes the write to a different admin.
//
// Reuses admin-users' existing lookup rather than adding a second query for the same
// mapping.

import type { FastifyRequest } from "fastify";
import { ForbiddenError } from "../../../../shared/errors.js";
import { findAdminByPlatformUserId } from "../../admin-users/repositories/admin-users.repository.js";

export async function resolveAdminId(req: FastifyRequest): Promise<number> {
  const admin = await findAdminByPlatformUserId(Number(req.auth!.sub));
  if (!admin) throw new ForbiddenError("No active admin record for this account");
  return Number(admin.id);
}
