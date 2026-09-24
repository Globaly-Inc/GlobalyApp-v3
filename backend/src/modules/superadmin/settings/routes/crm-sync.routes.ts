import type { FastifyInstance } from "fastify";
import { ForbiddenError } from "../../../../shared/errors.js";
import { syncToCrm } from "../services/crm-sync.service.js";

function requireSuperAdmin(role?: string) {
  if (role !== "super_admin") throw new ForbiddenError("Only super_admin can trigger CRM sync");
}

export async function crmSyncRoutes(app: FastifyInstance) {
  // POST /settings/crm/sync — push all businesses and institutions to GlobalyOS-V2 CRM contacts.
  // Idempotency-Key per listing deduplicates replays within GlobalyOS-V2's window (~24h).
  app.post("/crm/sync", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const result = await syncToCrm();
    return reply.status(200).send(result);
  });
}
