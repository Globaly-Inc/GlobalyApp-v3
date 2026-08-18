// The anonymous read of a published student profile.
//
// Registered by publicStudentProfilesModule, OUTSIDE the server's authenticated scope — the
// same structural trick other-services and events use. Being unauthenticated is a property of
// where the route is registered, not of a path string in an allow-list that somebody can
// mis-write.
//
// `/api/v3/students/jobs` (search module) is a static sibling of `:slug` and wins the match, as
// it should — derived slugs always end in "-u<id>", so no real slug can ever be shadowed.

import type { FastifyInstance } from "fastify";

import { SlugParamSchema } from "../schemas/public-profile.schema.js";
import * as service from "../services/public-profiles.service.js";

export async function publicStudentProfileRoutes(app: FastifyInstance) {
  app.get("/students/:slug", async (req, reply) => {
    const { slug } = SlugParamSchema.parse(req.params);
    return reply.send(await service.getPublicProfile(slug));
  });
}
