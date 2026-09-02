import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../../shared/errors.js";
import { PublicLeadInputSchema } from "../superadmin/marketing/guides/schemas/guides.schema.js";
import * as service from "../superadmin/marketing/guides/services/guides.service.js";

// Public guide landing-page data + lead capture — the only two public endpoints this track adds.
export default async function guidesPublicModule(app: FastifyInstance) {
  app.register(
    async (scoped) => {
      scoped.get("/", async (_req, reply) => {
        const guides = await service.listPublishedGuides();
        return reply.send(guides);
      });

      scoped.get("/:slug", async (req, reply) => {
        const { slug } = req.params as { slug: string };
        const guide = await service.getPublicGuideBySlug(slug);
        if (!guide) throw new NotFoundError("Guide not found");
        return reply.send(guide);
      });

      scoped.post("/:slug/leads", async (req, reply) => {
        const { slug } = req.params as { slug: string };
        const input = PublicLeadInputSchema.parse(req.body);
        const result = await service.submitLead(slug, input);
        return reply.send(result);
      });
    },
    { prefix: "/api/v3/public/guides" },
  );
}
