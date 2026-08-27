// Saved-items routes — any authenticated platform user manages their own shortlist.
// No extra preHandler: the global JWT hook in auth.plugin.ts is the gate, and every handler
// scopes its query to req.auth.sub, same as courses.routes.ts.

import type { FastifyInstance } from "fastify";
import * as service from "../services/saved-items.service.js";
import * as searchCoursesRepo from "../../search/repositories/courses.repository.js";
import * as searchBusinessesRepo from "../../search/repositories/businesses.repository.js";
import * as storage from "../../../shared/storage/storageService.js";
import { withCardFields } from "../../search/utils/course-card-fields.js";
import { SavedItemParamSchema, SavedItemsQuerySchema } from "../schemas/saved-items.schema.js";

// One page of saved items is plenty — the heart is a shortlist, not a catalog.
const SAVED_LIMIT = 100;

export async function savedItemsRoutes(app: FastifyInstance) {
  app.get("/saved", async (req, reply) => {
    const { type, expand } = SavedItemsQuerySchema.parse(req.query);
    const items = await service.listSaved(Number(req.auth.sub), type);
    // Cards on the search page only need ids to fill their hearts; the Saved tab asks for the
    // full rows, reusing the search queries so both render through the same cards.
    if (!expand) return reply.send({ items });

    const courseIds = items.filter((i) => i.item_type === "course").map((i) => i.item_id);
    const institutionIds = items.filter((i) => i.item_type === "institution").map((i) => i.item_id);

    const [courseRows, institutions] = await Promise.all([
      courseIds.length
        ? searchCoursesRepo.listPublicCourses({ courseIds }, undefined, SAVED_LIMIT, 0)
        : Promise.resolve([]),
      institutionIds.length
        ? searchBusinessesRepo.listPublicInstitutionsByFragments(institutionIds)
        : Promise.resolve([]),
    ]);

    return reply.send({
      items,
      courses: await Promise.all(courseRows.map(withCardFields)),
      // Owner-registered institutions store logo_url as a storage key, so it has to be signed here
      // exactly as /search/institutions does — otherwise the card renders a raw key as an <img> src.
      institutions: await Promise.all(institutions.map(async (i) => ({
        ...i, logo_url: await storage.resolvePreviewUrl(i.logo_url),
      }))),
    });
  });

  app.post("/saved/:itemType/:itemId", async (req, reply) => {
    const { itemType, itemId } = SavedItemParamSchema.parse(req.params);
    const is_saved = await service.toggle(Number(req.auth.sub), itemType, itemId);
    return reply.send({ is_saved });
  });

  app.delete("/saved/:itemType/:itemId", async (req, reply) => {
    const { itemType, itemId } = SavedItemParamSchema.parse(req.params);
    const is_saved = await service.unsave(Number(req.auth.sub), itemType, itemId);
    return reply.send({ is_saved });
  });
}
