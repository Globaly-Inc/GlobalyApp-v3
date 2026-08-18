// Public institution and agent profiles plus the SEO inventory. Registered
// without the auth plugin, alongside catalog.routes.ts — these are the pages
// search engines and logged-out visitors land on.
//
// Paths mirror V2's contract (GET /institutions/:slug, GET /agents/:slug) under
// V3's /api/v3/catalog prefix, and the canonical URLs they emit mirror V1's
// sitemap (/institutions/{slug}), not V1's internal links (/institution/{slug}) —
// V1 shipped both and indexed the same profile twice.

import type { FastifyInstance } from "fastify";

import { ListServicesQuerySchema } from "../schemas/catalog.schema.js";
import { OrgSlugParamSchema, SitemapQuerySchema } from "../schemas/profiles.schema.js";
import * as service from "../services/profiles.service.js";

export async function profileRoutes(app: FastifyInstance) {
  // Registered before the :slug routes so "sitemap" is never read as a slug.
  app.get("/sitemap", async (req, reply) => {
    return reply.send(await service.getSitemap(SitemapQuerySchema.parse(req.query)));
  });

  for (const kind of ["institution", "agent"] as const) {
    app.get(`/${kind}s/:slug`, async (req, reply) => {
      const { slug } = OrgSlugParamSchema.parse(req.params);
      // The query filters the org's services; org_type/org_id are set from the
      // resolved row, so a visitor cannot point one org's profile at another's.
      const query = ListServicesQuerySchema.parse(req.query);
      return reply.send(await service.getProfile(kind, slug, query));
    });
  }
}
