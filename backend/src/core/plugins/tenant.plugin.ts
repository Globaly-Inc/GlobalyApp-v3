// Resolves per-business DB for agent routes.
// Only sets req.db when the authenticated user is an agent (has orgId).
// Student and admin routes use masterKnex directly.

import fp from "fastify-plugin";
import type { Knex } from "knex";
import { masterKnex } from "../db/master-pool.js";
import { getKnex } from "../db/pool-manager.js";
import { buildConnString } from "../db/knex.js";
import type { BusinessRecord } from "../types.js";

export const tenantPlugin = fp(async (app) => {
  app.decorateRequest("db", null as unknown as Knex);

  app.addHook("onRequest", async (req, reply) => {
    // Only resolve per-business DB for authenticated agent requests
    if (!req.auth?.orgId) return;

    const business = await masterKnex<BusinessRecord>("businesses")
      .where({ id: req.auth.orgId, account_status: 1 })
      .first();

    if (!business) {
      return reply.status(404).send({ error: "Business not found or inactive" });
    }

    req.db = getKnex(business.id, buildConnString(business));
  });
});
