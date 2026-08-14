import type { FastifyInstance } from "fastify";
import { ForbiddenError } from "../../../../../shared/errors.js";
import * as repo from "../../../platform/platform.repository.js";
import { IdParamSchema, KeywordInputSchema, KeywordListQuery } from "../schemas/blog.schema.js";
import * as service from "../services/keywords.service.js";

function requireSuperAdmin(role?: string) {
  if (role !== "super_admin") throw new ForbiddenError("Only super_admin can manage the blog");
}

export async function keywordRoutes(app: FastifyInstance) {
  app.get("/keywords", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const { is_active } = KeywordListQuery.parse(req.query);
    const keywords = await service.listKeywords(is_active);
    return reply.send({ keywords });
  });

  app.post("/keywords", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const data = KeywordInputSchema.parse(req.body);
    const keyword = await service.createKeyword(data);
    // admin_audit_logs.entity_id is a uuid column — blog_keywords uses integer ids, so it goes in `details`.
    await repo.logAdminAction(Number(req.auth.sub), "BLOG_KEYWORD_CREATED", "blog_keyword", undefined, { keyword_id: keyword.id });
    return reply.status(201).send(keyword);
  });

  app.patch("/keywords/:id", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const { id } = IdParamSchema.parse(req.params);
    const data = KeywordInputSchema.partial().parse(req.body);
    const keyword = await service.updateKeyword(id, data);
    return reply.send(keyword);
  });

  app.delete("/keywords/:id", async (req, reply) => {
    requireSuperAdmin(req.auth.role);
    const { id } = IdParamSchema.parse(req.params);
    await service.deleteKeyword(id);
    await repo.logAdminAction(Number(req.auth.sub), "BLOG_KEYWORD_DELETED", "blog_keyword", undefined, { keyword_id: id });
    return reply.status(204).send();
  });
}
