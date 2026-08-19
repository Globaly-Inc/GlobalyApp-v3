
import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as repo from "../../superadmin/marketing/blog/repositories/posts.repository.js";
import { IdOrSlugParam, PublicPostListQuery } from "../schemas/public-blog.schema.js";

export async function publicBlogRoutes(app: FastifyInstance) {
  app.get("/blog/filters", async (_req, reply) => {
    const filters = await repo.listPublishedFilterValues();
    return reply.send(filters);
  });

  app.get("/blog/posts", async (req, reply) => {
    const { category, country_focus, ...pagination } = PublicPostListQuery.parse(req.query);
    const filters = { category, country_focus };
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      repo.listPublishedPosts(limit, offset, filters),
      repo.countPublishedPosts(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.get("/blog/posts/:idOrSlug", async (req, reply) => {
    const { idOrSlug } = IdOrSlugParam.parse(req.params);
    const post = /^\d+$/.test(idOrSlug)
      ? await repo.findPublishedPostById(Number(idOrSlug))
      : await repo.findPublishedPostBySlug(idOrSlug);
    if (!post) throw new NotFoundError("Blog post not found");
    await repo.incrementViews(post.id);
    return reply.send(post);
  });
}
