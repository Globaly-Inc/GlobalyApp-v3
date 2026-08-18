// Anonymous ambassador reads. Registered at the server root (no auth plugin),
// like the blog and public-services modules.
//
// The PII rule for everything under this prefix lives in public.service.ts and
// is enforced by the projection there, not by a guard here.

import type { FastifyInstance } from "fastify";
import { IdParamSchema, ProgramRefParamSchema } from "../schemas/ambassadors.schema.js";
import * as service from "../services/public.service.js";

export async function publicAmbassadorRoutes(app: FastifyInstance) {
  app.get("/programs/:idOrSlug", async (req, reply) => {
    const { idOrSlug } = ProgramRefParamSchema.parse(req.params);
    return reply.send(await service.getPublicProgram(idOrSlug));
  });

  app.get("/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await service.getPublicAmbassador(id));
  });
}
