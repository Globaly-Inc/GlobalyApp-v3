// Resolves per-business schema for business context routes.
// Sets req.db to a Knex instance with searchPath = [biz_{id}, public].

import fp from "fastify-plugin";
import type { Knex } from "knex";
import { masterKnex } from "../db/master-pool.js";
import { getKnex } from "../db/pool-manager.js";
import { schemaName } from "../db/knex.js";
import type { BusinessRecord } from "../types.js";

export const tenantPlugin = fp(async (app) => {
  app.decorateRequest("db", null as unknown as Knex);

  app.addHook("onRequest", async (req, reply) => {
    if (!req.auth?.orgId) return;

    const business = await masterKnex<BusinessRecord>("businesses")
      .where({ schema_name: req.auth.orgId, account_status: 1 })
      .first();

    if (!business) {
      return reply.status(404).send({ error: "Business not found or inactive" });
    }

    req.db = await getKnex(business.id, schemaName(business.schema_name));
  });
});
