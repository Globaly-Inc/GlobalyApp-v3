import type { FastifyInstance } from "fastify";
import { requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import { recipientFromRequest } from "../../enquiries/shared/recipient.js";
import {
  EmbedConfigCreateSchema,
  EmbedConfigIdParamSchema,
  EmbedKeyQuerySchema,
} from "../schemas/chat.schema.js";
import * as embedRepo from "../repositories/embed.repository.js";
import { NotFoundError } from "../../../shared/errors.js";

/** Embed-config management — served to both org kinds; the owner comes from the token's
 *  orgType, so an institution's widgets are scoped to the institution, never to a business. */
export async function embedRoutes(app: FastifyInstance) {
  app.post("/embed/configs", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const data = EmbedConfigCreateSchema.parse(req.body ?? {});
    const config = await embedRepo.create(recipientFromRequest(req), data);
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
    const updated = await embedRepo.reactivate(id, recipientFromRequest(req));
    if (!updated) throw new NotFoundError("Embed config not found");
    return reply.send({ ok: true });
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
    });
  });
}
