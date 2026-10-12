// One logging call for portal actions that both org kinds can take. An institution has no tenant
// activity table, so its entries go to audit_logs (entity "institution") — the superadmin Activity
// tab reads both. Never fails the request it describes.

import type { FastifyRequest } from "fastify";
import { logEnquiryAudit } from "../../enquiries/shared/audit.js";
import * as activityService from "./activity.service.js";

export async function logPortalActivity(req: FastifyRequest, action: string, details: Record<string, unknown>) {
  const userId = Number(req.auth.sub);
  try {
    if (req.auth.orgType === "institution" && req.institution) {
      await logEnquiryAudit(userId, action, { entityType: "institution", entityId: String(req.institution.id), details });
    } else if (req.business) {
      await activityService.logActivity(req.db, userId, action, "service", (details.service_id as string | undefined) ?? null, details);
    }
  } catch {
    // best-effort: an audit write must never undo the change it records
  }
}
