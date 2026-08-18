// Scribe, under /api/v3/business/scribe behind requireBusinessContext.
//
// The counsellor is always Number(req.auth.sub) and the business is always
// req.business — resolved by tenant.plugin from the JWT's orgId. V1 accepted
// `business_id` in the body and authorised against it; nothing here does.
//
// There is deliberately NO route that deletes a session. `scribe_consent_log`
// cascades from `scribe_sessions`, so a delete would destroy the legal consent
// record along with the transcript it evidences — the audit trail must not be
// deletable by the party it audits. Retention is an operator/DPO action, not an
// API call.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import type { AiContext } from "../services/ai.service.js";
import * as ai from "../services/ai.service.js";
import * as sessions from "../services/session.service.js";
import {
  ChunkParamSchema,
  EndSessionSchema,
  IdParamSchema,
  ListSessionsQuerySchema,
  PutTranscriptsSchema,
  SaveReviewSchema,
  StartSessionSchema,
} from "../schemas/scribe.schema.js";

const COACHING_HISTORY_LIMIT = 20;

function counselorId(req: FastifyRequest): number {
  return Number(req.auth.sub);
}

function aiContext(req: FastifyRequest): AiContext {
  return {
    db: req.db!,
    businessId: Number(req.business!.id),
    businessType: req.business!.business_type ?? null,
    counselorId: counselorId(req),
  };
}

/** Consent evidence taken from the connection, not from the body. */
function evidence(req: FastifyRequest) {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return {
    ip_address: (first?.split(",")[0].trim() || req.ip || null)?.slice(0, 200) ?? null,
    user_agent: (req.headers["user-agent"] ?? null)?.slice(0, 500) ?? null,
  };
}

export async function scribeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireBusinessContext);

  app.get("/stats", async (req, reply) =>
    reply.send(await sessions.stats(req.db!, counselorId(req))),
  );

  app.get("/sessions", async (req, reply) => {
    const query = ListSessionsQuerySchema.parse(req.query);
    return reply.send(await sessions.listSessions(req.db!, counselorId(req), query));
  });

  // Consent is the body, not a side effect — a session cannot exist without it.
  app.post("/sessions", async (req, reply) => {
    const body = StartSessionSchema.parse(req.body);
    return reply
      .code(201)
      .send(await sessions.startSession(req.db!, counselorId(req), body, evidence(req)));
  });

  app.get("/sessions/:id", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await sessions.getSession(req.db!, id, counselorId(req)));
  });

  app.post("/sessions/:id/end", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const body = EndSessionSchema.parse(req.body ?? {});
    return reply.send(await sessions.endSession(req.db!, id, counselorId(req), body));
  });

  // ── Transcript ────────────────────────────────────────────────────────────

  app.get("/sessions/:id/transcripts", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await sessions.listTranscripts(req.db!, id, counselorId(req)));
  });

  // PUT, because it is an upsert on (session_id, chunk_index): re-sending chunk 7
  // replaces chunk 7. No provider is involved, so this works with no key at all.
  app.put("/sessions/:id/transcripts", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { chunks } = PutTranscriptsSchema.parse(req.body);
    return reply.send(await sessions.putTranscripts(req.db!, id, counselorId(req), chunks));
  });

  // ── Provider paths — each 503s when unconfigured, after every guard ────────

  app.post("/sessions/:id/transcription-token", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await ai.mintTranscriptionToken(aiContext(req), id));
  });

  app.post("/sessions/:id/coaching", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.code(201).send(await ai.generateCoaching(aiContext(req), id));
  });

  app.get("/sessions/:id/coaching", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await ai.listCoaching(aiContext(req), id, COACHING_HISTORY_LIMIT));
  });

  app.post("/sessions/:id/review", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    return reply.send(await ai.generateReview(aiContext(req), id));
  });

  // The counsellor's approval of the draft. No provider, so it always works.
  app.put("/sessions/:id/review", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const body = SaveReviewSchema.parse(req.body);
    return reply.send(await ai.saveReview(aiContext(req), id, body));
  });

  app.post("/sessions/:id/transcripts/:chunkIndex/translate", async (req, reply) => {
    const { id, chunkIndex } = ChunkParamSchema.parse(req.params);
    return reply.send(await ai.translateChunk(aiContext(req), id, chunkIndex));
  });
}
