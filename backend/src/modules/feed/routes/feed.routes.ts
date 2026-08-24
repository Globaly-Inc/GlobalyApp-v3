import type { FastifyInstance } from "fastify";
import {
  ListPostsQuerySchema,
  CreatePostSchema,
  PostIdParamSchema,
  SetReactionSchema,
  ComposeWithAiSchema,
  CommentIdParamSchema,
  CreateCommentSchema,
} from "../schemas/feed.schema.js";
import * as service from "../services/feed.service.js";
import * as mediaService from "../services/feed-media.service.js";
import * as aiService from "../services/feed-ai.service.js";
import { BadRequestError } from "../../../shared/errors.js";

export async function feedRoutes(app: FastifyInstance) {
  // ── Media ──
  // Upload first, then attach the returned storage_path to the post. Keeps posting a small JSON request
  // and lets the composer preview the real uploaded object.
  app.post("/media", async (req, reply) => {
    const file = await req.file();
    if (!file) throw new BadRequestError("No file uploaded");
    const uploaded = await mediaService.uploadMedia({
      userId: Number(req.auth.sub),
      filename: file.filename,
      mimeType: file.mimetype,
      buffer: await file.toBuffer(),
    });
    return reply.status(201).send(uploaded);
  });

  // ── Write with AI ──
  app.get("/ai/available", async (_req, reply) => reply.send({ available: aiService.isConfigured() }));

  app.post("/ai/compose", {
    // Generation costs money and provider quota, so this is rate-limited well below the global default.
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const input = ComposeWithAiSchema.parse(req.body ?? {});
    const result = await aiService.composePost({
      userId: Number(req.auth.sub),
      postType: input.post_type,
      draft: input.draft ?? null,
      instruction: input.instruction ?? null,
    });
    return reply.send(result);
  });

  app.get("/posts", async (req, reply) => {
    const query = ListPostsQuerySchema.parse(req.query);
    const result = await service.listPosts(Number(req.auth.sub), query);
    return reply.send(result);
  });

  app.post("/posts", async (req, reply) => {
    // Any author_platform_user_id in the body is dropped by the schema — the JWT decides the author.
    const input = CreatePostSchema.parse(req.body);
    const post = await service.createPost(Number(req.auth.sub), input);
    return reply.status(201).send(post);
  });

  app.delete("/posts/:id", async (req, reply) => {
    const { id } = PostIdParamSchema.parse(req.params);
    await service.deletePost(id, Number(req.auth.sub));
    return reply.status(204).send();
  });

  // Add or update the caller's reaction. Idempotent — no toggling.
  app.post("/posts/:id/reactions", async (req, reply) => {
    const { id } = PostIdParamSchema.parse(req.params);
    const { emoji } = SetReactionSchema.parse(req.body ?? {});
    await service.setReaction(id, Number(req.auth.sub), emoji);
    return reply.status(204).send();
  });

  // Remove the caller's reaction. Idempotent — no row is still a 204.
  app.delete("/posts/:id/reactions", async (req, reply) => {
    const { id } = PostIdParamSchema.parse(req.params);
    await service.removeReaction(id, Number(req.auth.sub));
    return reply.status(204).send();
  });

  app.get("/posts/:id/comments", async (req, reply) => {
    const { id } = PostIdParamSchema.parse(req.params);
    const comments = await service.listComments(id, Number(req.auth.sub));
    return reply.send({ data: comments });
  });

  app.post("/posts/:id/comments", async (req, reply) => {
    const { id } = PostIdParamSchema.parse(req.params);
    const input = CreateCommentSchema.parse(req.body);
    const comment = await service.addComment(id, Number(req.auth.sub), input);
    return reply.status(201).send(comment);
  });

  app.delete("/posts/:id/comments/:commentId", async (req, reply) => {
    const { id, commentId } = CommentIdParamSchema.parse(req.params);
    await service.deleteComment(id, commentId, Number(req.auth.sub));
    return reply.status(204).send();
  });

  app.post("/posts/:id/comments/:commentId/reactions", async (req, reply) => {
    const { id, commentId } = CommentIdParamSchema.parse(req.params);
    const { emoji } = SetReactionSchema.parse(req.body ?? {});
    await service.setCommentReaction(id, commentId, Number(req.auth.sub), emoji);
    return reply.status(204).send();
  });

  app.delete("/posts/:id/comments/:commentId/reactions", async (req, reply) => {
    const { id, commentId } = CommentIdParamSchema.parse(req.params);
    await service.removeCommentReaction(id, commentId, Number(req.auth.sub));
    return reply.status(204).send();
  });
}
