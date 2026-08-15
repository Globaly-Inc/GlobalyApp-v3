// Blog post routes — this module has no parent role guard (unlike platform/*, which
// defaults to super_admin + data_admin), so every route here checks super_admin explicitly,
// matching V2's blog RLS policy (super_admin only, data_admin excluded).

import type { FastifyInstance } from "fastify";
import { ForbiddenError, NotFoundError } from "../../../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../../../shared/pagination.js";
import * as storage from "../../../../../shared/storage/storageService.js";
import { config } from "../../../../../config.js";
import * as repo from "../../../platform/platform.repository.js";
import { IdParamSchema, PostInputSchema, PostListQuery } from "../schemas/blog.schema.js";
import * as service from "../services/posts.service.js";

function requireSuperAdmin(role?: string) {
  if (role !== "super_admin") throw new ForbiddenError("Only super_admin can manage the blog");
}

export async function postRoutes(app: FastifyInstance) {
  app.get("/posts", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const { search, category, is_published, ...pagination } = PostListQuery.parse(req.query);
    const filters = { search, category, is_published };
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total] = await Promise.all([
      service.listPosts(limit, offset, filters),
      service.countPosts(filters),
    ]);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.get("/posts/:id", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const { id } = IdParamSchema.parse(req.params);
    const post = await service.findPostById(id);
    if (!post) throw new NotFoundError("Blog post not found");
    return reply.send(post);
  });

  app.post("/posts", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const data = PostInputSchema.parse(req.body);
    const post = await service.createPost(data, Number(req.auth.sub));
    // admin_audit_logs.entity_id is a uuid column — blog_posts uses integer ids, so the
    // post id goes in `details` instead (same convention as feature-flags.routes.ts).
    await repo.logAdminAction(Number(req.auth.sub), "BLOG_POST_CREATED", "blog_post", undefined, { post_id: post.id, title: post.title });
    return reply.status(201).send(post);
  });

  app.patch("/posts/:id", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const { id } = IdParamSchema.parse(req.params);
    const data = PostInputSchema.partial().parse(req.body);
    const post = await service.updatePost(id, data);
    await repo.logAdminAction(Number(req.auth.sub), "BLOG_POST_UPDATED", "blog_post", undefined, { post_id: id, fields: Object.keys(data) });
    return reply.send(post);
  });

  app.delete("/posts/:id", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const { id } = IdParamSchema.parse(req.params);
    await service.deletePost(id);
    await repo.logAdminAction(Number(req.auth.sub), "BLOG_POST_DELETED", "blog_post", undefined, { post_id: id });
    return reply.status(204).send();
  });

  // POST /posts/cover-image (multipart) — uploads to GCS, returns a permanent public URL.
  app.post("/posts/cover-image", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const file = await req.file();
    if (!file) throw new NotFoundError("No file uploaded");

    const buffer = await file.toBuffer();
    storage.validateFile(file.mimetype, buffer.length, new Set([
      "image/jpeg", "image/png", "image/webp", "image/gif",
    ]));

    const storagePath = storage.buildPath("blog-posts", "covers", file.filename);
    await storage.uploadFile(storagePath, buffer, file.mimetype);
    const url = `https://storage.googleapis.com/${config.GCS_BUCKET_NAME}/${storagePath}`;

    return reply.status(201).send({ url });
  });
}
