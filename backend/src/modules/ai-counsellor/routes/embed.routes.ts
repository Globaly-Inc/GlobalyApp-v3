import type { FastifyInstance } from "fastify";
import { requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import { recipientFromRequest } from "../../enquiries/shared/recipient.js";
import {
  EmbedConfigCreateSchema,
  EmbedConfigIdParamSchema,
  EmbedConfigUpdateSchema,
  EmbedDeveloperIdParamSchema,
  EmbedKeyQuerySchema,
  SendSnippetSchema,
  VisitorListQuerySchema,
} from "../schemas/chat.schema.js";
import { embedSnippet, forgetRecipient, listRecipients, sendSnippet } from "../services/embed-handoff.service.js";
import { buildPaginatedResponse } from "../../../shared/pagination.js";
import * as embedRepo from "../repositories/embed.repository.js";
import * as visitorsRepo from "../repositories/visitors.repository.js";
import * as takeover from "../services/takeover.service.js";
import { ensureOwnerSiteIndex } from "../services/site-index.service.js";
import { ConflictError, NotFoundError } from "../../../shared/errors.js";
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
    // One widget per business or institution. The Inbox, the widget switch and the visitor list
    // all assume a single widget, and a second one would split one org's visitors across two keys.
    // ponytail: a check, not a unique index — two simultaneous creates could both pass; add a
    // partial unique index on the owner columns if that ever happens.
    if ((await embedRepo.findByOwner(owner)).length) {
      throw new ConflictError("This organisation already has a widget. Edit it instead.");
    }
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

  /**
   * What the portal's AI-embed card opens with: the org's widget — minted on the spot if they have
   * none — plus whoever the snippet would be mailed to, so the card knows whether to ask for one.
   *
   * POST, not GET, because the first call writes. Idempotent after that.
   */
  app.post("/embed/ensure", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const owner = recipientFromRequest(req);
    const existing = await embedRepo.findByOwner(owner);
    const config = await embedRepo.ensureForOwner(owner);

    // Only a genuinely new widget needs its owner's site crawled; re-indexing on every card view
    // would re-crawl the whole site each time the portal home loads. Matched on id rather than
    // `existing.length`: findByOwner counts INACTIVE rows too, so an org whose only widget was
    // deactivated would be handed a brand-new one with no site index behind it.
    if (!existing.some((c) => c.id === config.id)) startSiteIndex(owner);

    // req.db is the tenant schema these rows live in — see embed-handoff.service.
    const developers = await listRecipients(req.db, config.id);
    return reply.send({ config, snippet: embedSnippet(config.embed_key), developers });
  });

  /**
   * Mail the snippet to addresses the owner typed, and record them.
   *
   * Nobody is invited and no account is created — the recipients are agencies and contractors, not
   * staff — so this needs no team-write permission, only membership of the org whose code it is.
   *
   * No config id: the card works on the one widget `ensureForOwner` resolves, which is owner-scoped
   * by construction, so there is no id here to tamper with.
   */
  app.post("/embed/send-snippet", {
    // Capped per caller: the snippet itself is public, but mail going out over our domain is not
    // free to spray at arbitrary addresses.
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    preHandler: requireBusinessOrInstitutionContext,
  }, async (req, reply) => {
    const { emails } = SendSnippetSchema.parse(req.body ?? {});
    const config = await embedRepo.ensureForOwner(recipientFromRequest(req));
    const result = await sendSnippet({
      db: req.db,
      configId: config.id,
      embedKey: config.embed_key,
      orgName: req.institution?.institution_name ?? req.business?.business_name ?? "Your organisation",
      emails,
    });
    return reply.send(result);
  });

  /** Drop a recipient from the list. Removes the record only — nothing was ever provisioned. */
  app.delete("/embed/developers/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = EmbedDeveloperIdParamSchema.parse(req.params);
    const config = await embedRepo.ensureForOwner(recipientFromRequest(req));
    if (!await forgetRecipient(req.db, config.id, id)) throw new NotFoundError("Recipient not found");
    return reply.status(204).send();
  });

  // Appearance + limits after creation. The key and the owner never change here.
  app.patch("/embed/configs/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = EmbedConfigIdParamSchema.parse(req.params);
    const patch = EmbedConfigUpdateSchema.parse(req.body ?? {});
    const config = await embedRepo.update(id, recipientFromRequest(req), patch);
    if (!config) throw new NotFoundError("Embed config not found");
    return reply.send(config);
  });

  // A leaked or copied key is retired by minting a new one; the owner re-pastes the snippet.
  // Visitor threads are keyed on the embed key too, so they start fresh — by design.
  app.post("/embed/configs/:id/rotate-key", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = EmbedConfigIdParamSchema.parse(req.params);
    const config = await embedRepo.rotateKey(id, recipientFromRequest(req));
    if (!config) throw new NotFoundError("Embed config not found");
    return reply.send(config);
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
    const rows = await visitorsRepo.listQuery(req.db, { ...pagination, status, search });
    const data = rows.map((r: Record<string, unknown>) => takeover.withMe(r, Number(req.auth.sub)));
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
      position: config.position ?? "right",
      greeting: config.greeting,
      subtitle: config.subtitle,
      // The panel's starter questions differ by owner: an institution's widget answers
      // about its own campus and catalog, a business's counsels on studying abroad.
      // Kind only — never the owner's id.
      owner_kind: config.institution_id != null ? "institution" : "business",
    });
  });
}
