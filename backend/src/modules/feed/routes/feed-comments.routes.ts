import type { FastifyInstance } from "fastify";

import { PostIdParamSchema } from "../schemas/feed.schema.js";
import {
  CommentIdParamSchema,
  CreateCommentSchema,
  ListCommentsQuerySchema,
  UpdateCommentSchema,
} from "../schemas/feed-comment.schema.js";
import * as service from "../services/feed-comments.service.js";

export async function feedCommentRoutes(app: FastifyInstance) {
  app.get("/posts/:id/comments", async (req, reply) => {
    const { id } = PostIdParamSchema.parse(req.params);
    const query = ListCommentsQuerySchema.parse(req.query);
    return reply.send(await service.listComments(id, Number(req.auth.sub), query));
  });

  app.post("/posts/:id/comments", async (req, reply) => {
    const { id } = PostIdParamSchema.parse(req.params);
    // Any author_platform_user_id in the body is rejected by the schema — the JWT decides the author.
    const input = CreateCommentSchema.parse(req.body);
    const comment = await service.addComment(id, Number(req.auth.sub), input);
    return reply.status(201).send(comment);
  });

  app.patch("/comments/:id", async (req, reply) => {
    const { id } = CommentIdParamSchema.parse(req.params);
    const { content } = UpdateCommentSchema.parse(req.body);
    return reply.send(await service.editComment(id, Number(req.auth.sub), content));
  });

  // One route for both the author removing their own and an admin moderating anyone's — the
  // authorisation branch lives in the service, so there is no second, laxer delete path.
  app.delete("/comments/:id", async (req, reply) => {
    const { id } = CommentIdParamSchema.parse(req.params);
    await service.deleteComment(id, {
      userId: Number(req.auth.sub),
      isAdmin: req.auth.type === "admin",
    });
    return reply.status(204).send();
  });
}
