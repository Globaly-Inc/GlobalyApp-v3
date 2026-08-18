// Prefix: /api/v3/favorites — the signed-in person's own saved items.
// The owner is req.auth.sub on every route; no route accepts a user id.

import type { FastifyInstance } from "fastify";

import * as service from "../services/favorites.service.js";
import {
  AddFavoriteSchema,
  FavoriteIdParamSchema,
  ListFavoritesQuerySchema,
} from "../schemas/favorites.schema.js";

export async function favoriteRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const query = ListFavoritesQuerySchema.parse(req.query ?? {});
    return reply.send(await service.list(Number(req.auth.sub), query));
  });

  app.post("/", async (req, reply) => {
    const body = AddFavoriteSchema.parse(req.body ?? {});
    return reply.send(await service.save(Number(req.auth.sub), body));
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = FavoriteIdParamSchema.parse(req.params);
    await service.remove(Number(req.auth.sub), id);
    return reply.status(204).send();
  });
}
