// Resolves the per-tenant schema for org-context routes.
// Sets req.db to a Knex instance with searchPath = [<org schema uuid>, public].
//
// A business and an institution are both orgs with their own uuid schema, so they share one
// context concept: auth.orgId is the schema_name and auth.orgType says which master table it
// belongs to. Only the kind in context gets its typed row (req.business / req.institution),
// so a route reaching for the wrong one gets undefined rather than another tenant's data.

import fp from "fastify-plugin";
import type { Knex } from "knex";
import { masterKnex } from "../db/master-pool.js";
import { getKnex } from "../db/pool-manager.js";
import { schemaName } from "../db/knex.js";
import type { BusinessRecord, InstitutionRecord } from "../types.js";

export const tenantPlugin = fp(async (app) => {
  app.decorateRequest("db", null as unknown as Knex);
  app.decorateRequest("business", null as unknown as BusinessRecord);
  // `auth.orgId` is the schema_name (a uuid); routes that write central rows need
  // the numeric businesses.id. Resolved here so they don't each re-query for it.
  app.decorateRequest("businessId", null as unknown as number);
  app.decorateRequest("institution", null as unknown as InstitutionRecord);
  app.decorateRequest("institutionId", null as unknown as number);

  app.addHook("onRequest", async (req, reply) => {
    if (!req.auth?.orgId) return;

    // Absent orgType means business — tokens minted before institution context existed
    // carry no orgType and must keep resolving until they expire.
    if (req.auth.orgType === "institution") {
      const institution = await masterKnex<InstitutionRecord>("institutions")
        // Identical gate to the business branch below: account_status 1 means activated. The
        // schema_provisioned_at check is the belt to that braces — a promoted listing nobody
        // has claimed has no schema to connect to, so it must not be enterable even if its
        // account_status were somehow flipped.
        .where({ schema_name: req.auth.orgId, account_status: 1 })
        .whereNotNull("schema_provisioned_at")
        .whereNull("deleted_at")
        .first();

      if (!institution) {
        return reply.status(404).send({ error: "Institution not found or not yet claimed" });
      }

      req.institutionId = Number(institution.id);
      // Pool key is the schema uuid, not the numeric id — institution ids would collide
      // with business ids in the shared pool map (same reason onboardInstitution does it).
      req.db = await getKnex(institution.schema_name, schemaName(institution.schema_name));
      req.institution = institution;
      return;
    }

    const business = await masterKnex<BusinessRecord>("businesses")
      .where({ schema_name: req.auth.orgId, account_status: 1 })
      .whereNull("deleted_at")
      .first();

    if (!business) {
      return reply.status(404).send({ error: "Business not found or inactive" });
    }

    // Coerced: BusinessRecord types `id` as string, but businesses.id is an
    // integer column. Correcting that interface cascades into the businesses
    // module, so it stays a local coercion.
    req.businessId = Number(business.id);
    req.db = await getKnex(business.id, schemaName(business.schema_name));
    req.business = business;
  });
});
