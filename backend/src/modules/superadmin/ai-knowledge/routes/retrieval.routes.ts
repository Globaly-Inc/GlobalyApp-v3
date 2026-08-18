// Retrieval + embedding routes: search preview, embedding status, re-embed dispatch.

import type { FastifyInstance, FastifyRequest } from "fastify";
import * as retrieval from "../services/retrieval.service.js";
import * as embedding from "../services/embedding.service.js";
import { requestEmbedding } from "../services/dispatch.service.js";
import { ReembedSchema, SearchQuerySchema } from "../schemas/retrieval.schema.js";

const adminId = (req: FastifyRequest) => Number(req.auth!.sub);

export async function retrievalRoutes(app: FastifyInstance) {
  /**
   * What the counsellor would retrieve for this question, and why. `legs` lets an
   * admin see the vector and text legs separately — the same switch the recall gate
   * uses to prove the fusion earns its keep.
   */
  app.get("/search", async (req, reply) => {
    const { q, limit, kind, country, legs } = SearchQuerySchema.parse(req.query);
    const result = await retrieval.retrieve({
      query: q,
      topK: limit,
      categoryKind: kind ?? null,
      countryCode: country ?? null,
      legs,
    });
    return reply.send({
      results: result.chunks,
      retrieval: {
        legs: result.legs,
        vector_leg: result.vector_leg,
        text_leg: result.text_leg,
        degraded: result.degraded,
        degraded_reason: result.degraded_reason,
        model: result.model,
      },
    });
  });

  /** How much of the corpus is actually retrievable right now. Never silent. */
  app.get("/embedding-status", async (_req, reply) => reply.send(await embedding.status()));

  /** 503 when there is no provider — see dispatch.service.ts. */
  app.post("/reembed", async (req, reply) => {
    const input = ReembedSchema.parse(req.body ?? {});
    return reply.status(202).send(await requestEmbedding(input, adminId(req)));
  });
}
