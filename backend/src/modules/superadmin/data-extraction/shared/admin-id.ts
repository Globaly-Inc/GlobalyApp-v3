// Who is acting? — resolved once, at the route boundary, for this whole module.
//
// The admin JWT's `sub` is the platform_user_id, but everything downstream of these
// routes wants a superadmin.admin_users.id: admin_audit_logs.admin_id has a foreign
// key to it, and extraction_promotions.promoted_by is compared against it. The two id
// spaces do not line up — on the dev database admin_users.id runs 9..16 while their
// platform_user_id runs 27..44, with zero overlap — so passing `sub` through either
// violated the FK (a 500 on the very write being audited) or, where the numbers
// happened to collide, attributed the action to a different admin.
//
// Resolving at the boundary rather than inside logAudit() is deliberate: `adminId(req)`
// also feeds ~60 service calls that are not audit writes, and promote.service already
// receives a resolved admin_users.id from its own callers. One id space in, everywhere.
//
// Reuses admin-users' existing lookup rather than adding a second query for it.

import type { FastifyRequest } from "fastify";
import { ForbiddenError } from "../../../../shared/errors.js";
import { findAdminByPlatformUserId } from "../../admin-users/repositories/admin-users.repository.js";

export async function resolveAdminId(req: FastifyRequest): Promise<number> {
  const admin = await findAdminByPlatformUserId(Number(req.auth!.sub));
  if (!admin) throw new ForbiddenError("No active admin record for this account");
  return Number(admin.id);
}
