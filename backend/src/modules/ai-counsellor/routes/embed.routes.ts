import type { FastifyInstance } from "fastify";
import { requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import { recipientFromRequest } from "../../enquiries/shared/recipient.js";
import {
  EmbedConfigCreateSchema,
  EmbedConfigIdParamSchema,
  EmbedKeyQuerySchema,
  VisitorListQuerySchema,
} from "../schemas/chat.schema.js";
import { buildPaginatedResponse } from "../../../shared/pagination.js";
import * as embedRepo from "../repositories/embed.repository.js";
import * as visitorsRepo from "../repositories/visitors.repository.js";
import { ensureOwnerSiteIndex } from "../services/site-index.service.js";
import { NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("embed-routes");

/**
 * Kick off (or refresh) the owner's website index.
 *
 * Fire-and-forget: crawling takes minutes and must never hold up — or fail — the request.
 * Called on activate as well as create, because a widget that existed before this feature
 * shipped would otherwise never get an index: nothing backfills them, and the recrawl
 * dispatcher only revisits sources that already exist. Activating is the one action such an
 * owner is likely to take, and `ensureOwnerSiteIndex` is idempotent.
 */
function startSiteIndex(owner: ReturnType<typeof recipientFromRequest>) {
  embedRepo.ownerWebsite(owner)
    .then((website) => ensureOwnerSiteIndex(owner, website))
    .catch((err) => logger.error("Owner site index failed to start", { owner, err: String(err) }));
}

/** Embed-config management — served to both org kinds; the owner comes from the token's
 *  orgType, so an institution's widgets are scoped to the institution, never to a business. */
export async function embedRoutes(app: FastifyInstance) {
  app.post("/embed/configs", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const data = EmbedConfigCreateSchema.parse(req.body ?? {});
    const owner = recipientFromRequest(req);
    const config = await embedRepo.create(owner, data);

    // Index the owner's own website so the widget can answer from anything published on
    // it, not just from structured extraction.
    startSiteIndex(owner);

    return reply.status(201).send(config);
  });

  app.get("/embed/configs", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const configs = await embedRepo.findByOwner(recipientFromRequest(req));
    return reply.send({ configs });
  });

  app.delete("/embed/configs/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = EmbedConfigIdParamSchema.parse(req.params);
    const updated = await embedRepo.deactivate(id, recipientFromRequest(req));
    if (!updated) throw new NotFoundError("Embed config not found");
    return reply.send({ ok: true });
  });

  app.patch("/embed/configs/:id/activate", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = EmbedConfigIdParamSchema.parse(req.params);
    const owner = recipientFromRequest(req);
    const updated = await embedRepo.reactivate(id, owner);
    if (!updated) throw new NotFoundError("Embed config not found");

    // Covers widgets created before site indexing existed — see startSiteIndex.
    startSiteIndex(owner);

    return reply.send({ ok: true });
  });

  /**
   * The org's own widget visitors and leads.
   *
   * Scoped by `req.db` alone, and that is the whole isolation story: ai_widget_visitors lives
   * in the tenant schema, so the connection the tenant plugin resolved from this token is the
   * only rowset reachable. No `recipientFilter` here — unlike ai_embed_configs, which is a
   * central table and therefore needs one.
   *
   * `counts` rides along with the page so the All/Visitors/Leads tabs can show tallies without
   * three more requests, and `meta.total` is the count for the filter actually applied.
   */
  app.get("/embed/visitors", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { status, search, ...pagination } = VisitorListQuerySchema.parse(req.query ?? {});
    const counts = await visitorsRepo.visitorCounts(req.db, { search });
    const data = await visitorsRepo.listQuery(req.db, { ...pagination, status, search });
    return reply.send({ ...buildPaginatedResponse(data, counts[status], pagination), counts });
  });
}

/** Public branding resolve for the /embed/:key page — never exposes usage or instructions. */
export async function embedPublicRoutes(app: FastifyInstance) {
  app.get("/embed/resolve", async (req, reply) => {
    const { key } = EmbedKeyQuerySchema.parse(req.query ?? {});
    const config = await embedRepo.findByEmbedKey(key);
    if (!config || !config.is_active) throw new NotFoundError("Embed configuration not found");
    return reply.send({
      display_name: config.display_name,
      logo_url: config.logo_url,
      brand_color: config.brand_color,
      // The panel's starter questions differ by owner: an institution's widget answers
      // about its own campus and catalog, a business's counsels on studying abroad.
      // Kind only — never the owner's id.
      owner_kind: config.institution_id != null ? "institution" : "business",
    });
  });
}
