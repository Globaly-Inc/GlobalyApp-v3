import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  EmbedConfigCreateSchema,
  EmbedConfigIdParamSchema,
  EmbedKeyQuerySchema,
} from "../schemas/chat.schema.js";
import * as embedRepo from "../repositories/embed.repository.js";
import { NotFoundError } from "../../../shared/errors.js";

/** Embed-config management — business portal only. */
export async function embedRoutes(app: FastifyInstance) {
  app.post("/embed/configs", { preHandler: requireBusinessContext }, async (req, reply) => {
    const data = EmbedConfigCreateSchema.parse(req.body ?? {});
    const config = await embedRepo.create(Number(req.business!.id), data);
    return reply.status(201).send(config);
  });

  app.get("/embed/configs", { preHandler: requireBusinessContext }, async (req, reply) => {
    const configs = await embedRepo.findByBusinessId(Number(req.business!.id));
    return reply.send({ configs });
  });

  app.delete("/embed/configs/:id", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = EmbedConfigIdParamSchema.parse(req.params);
    const updated = await embedRepo.deactivate(id, Number(req.business!.id));
    if (!updated) throw new NotFoundError("Embed config not found");
    return reply.send({ ok: true });
  });

  app.patch("/embed/configs/:id/activate", { preHandler: requireBusinessContext }, async (req, reply) => {
    const { id } = EmbedConfigIdParamSchema.parse(req.params);
    const updated = await embedRepo.reactivate(id, Number(req.business!.id));
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
