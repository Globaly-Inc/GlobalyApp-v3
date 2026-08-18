// Public scholarship reads — no auth, published rows only.
//
// The response projection is chosen in the repository (PUBLIC_COLUMNS), not here,
// so review_status and friends cannot reach a visitor by way of a handler that
// forgot to strip them.

import type { FastifyInstance } from "fastify";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import {
  FacetsQuerySchema,
  PublicScholarshipListQuery,
  SlugParamSchema,
} from "../../superadmin/monitoring/scholarships/schemas/scholarships.schema.js";
import * as service from "../../superadmin/monitoring/scholarships/services/scholarships.service.js";

export async function publicScholarshipRoutes(app: FastifyInstance) {
  app.get("/scholarships", async (req, reply) => {
    const { q, country, ...pagination } = PublicScholarshipListQuery.parse(req.query);
    const filters = { q, country };
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      service.listPublished(limit, offset, filters),
      service.countPublished(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // V1's facets_scholarships RPC. Declared before /:slug so "facets" is not read
  // as a slug.
  app.get("/scholarships/facets", async (req, reply) => {
    const { q } = FacetsQuerySchema.parse(req.query);
    return reply.send(await service.facets(q));
  });

  app.get("/scholarships/:slug", async (req, reply) => {
    const { slug } = SlugParamSchema.parse(req.params);
    return reply.send(await service.findPublishedBySlug(slug));
  });

  // V1's increment_scholarship_view RPC: a fire-and-forget bump from the detail
  // page, deduped client-side per session.
  //
  // It is a POST and not a side effect of the GET, which is where it started. A
  // GET that writes cannot be cached, and the detail page is served through
  // Next's `revalidate: 60` — so the counter was being bumped at most once per
  // minute per slug no matter how many people opened the page.
  app.post("/scholarships/:slug/view", async (req, reply) => {
    const { slug } = SlugParamSchema.parse(req.params);
    return reply.send(await service.recordView(slug));
  });
}
