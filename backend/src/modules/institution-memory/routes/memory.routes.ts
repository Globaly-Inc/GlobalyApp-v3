// Institution portal: how its counsellor is configured, what it has been told and has learned,
// and the widget conversations it can review. Everything here is scoped by req.institutionId — the tenant
// plugin resolves it from the token, and the repository turns it into that institution's schema.
//
// Mounted by the ai-counsellor module under /api/v3/ai-chat/institution/…; the review action
// itself (POST /messages/:id/review) lives in chat.routes beside the student feedback route.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import * as embedRepo from "../../ai-counsellor/repositories/embed.repository.js";
import * as learnRepo from "../repositories/learning.repository.js";
import * as memoryRepo from "../repositories/memory.repository.js";
import * as memories from "../services/memory.service.js";
import { clearRetrievalCache } from "../services/retrieval.service.js";
import { getProfile, parsePatch, patchProfile } from "../services/profile.service.js";
import { CreateMemorySchema, MemoryQuerySchema, PatchMemorySchema, booleanQueryParam, type Actor } from "../schemas/memory.schema.js";
import { NotFoundError } from "../../../shared/errors.js";

const IdParam = z.object({ id: z.string().uuid() });
const SessionIdParam = z.object({ id: z.coerce.number().int().positive() });
const DeprecateBody = z.object({ reason: z.string().trim().min(1).max(300).default("deprecated by the institution") });
const ConversationsQuery = z.object({
  unreviewed: booleanQueryParam.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const actorOf = (req: FastifyRequest): Actor => ({ kind: "admin", id: String(req.auth.sub) });
const configIdsOf = async (institutionId: number) =>
  (await embedRepo.findByOwner({ kind: "institution", id: institutionId })).map((c) => c.id);

export async function institutionMemoryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireInstitutionContext);

  // ── Knowledge Rack configuration ──
  // Voice, behaviour and data-collection rules. One row per institution, in its own schema;
  // an institution that has never saved reads as defaults rather than 404.
  app.get("/institution/ai-profile", async (req, reply) => {
    return reply.send(await getProfile(req.institutionId));
  });

  app.patch("/institution/ai-profile", async (req, reply) => {
    const patch = parsePatch(req.body ?? {});
    return reply.send(await patchProfile(req.institutionId, patch, Number(req.auth.sub)));
  });

  // ── Memories ──
  app.get("/institution/memories", async (req, reply) => {
    const query = MemoryQuerySchema.parse(req.query ?? {});
    return reply.send({ memories: await memoryRepo.list(req.institutionId, query) });
  });

  app.post("/institution/memories", async (req, reply) => {
    const input = CreateMemorySchema.parse(req.body ?? {});
    const out = await memories.createMemory({
      institutionId: req.institutionId, input, source: "admin", actor: actorOf(req), createdBy: Number(req.auth.sub),
    });
    clearRetrievalCache(); // the first memory must not wait out the zero-count cache
    return reply.status(out.outcome === "created" ? 201 : 200).send(out);
  });

  app.get("/institution/memories/:id", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const memory = await memoryRepo.findById(id, req.institutionId);
    if (!memory || memory.status === "deleted") throw new NotFoundError("Memory not found");
    return reply.send(memory);
  });

  app.patch("/institution/memories/:id", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const input = PatchMemorySchema.parse(req.body ?? {});
    return reply.send(await memories.edit(id, req.institutionId, input, actorOf(req)));
  });

  app.post("/institution/memories/:id/approve", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const memory = await memories.approve(id, req.institutionId, actorOf(req));
    clearRetrievalCache();
    return reply.send(memory);
  });

  app.post("/institution/memories/:id/deprecate", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { reason } = DeprecateBody.parse(req.body ?? {});
    return reply.send(await memories.deprecate(id, req.institutionId, actorOf(req), reason));
  });

  app.post("/institution/memories/:id/reactivate", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    return reply.send(await memories.reactivate(id, req.institutionId, actorOf(req)));
  });

  app.post("/institution/memories/:id/unflag", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    return reply.send(await memories.unflag(id, req.institutionId, actorOf(req)));
  });

  app.delete("/institution/memories/:id", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    await memories.remove(id, req.institutionId, actorOf(req));
    return reply.send({ ok: true });
  });

  // ── Conversations to review ──
  app.get("/institution/conversations", async (req, reply) => {
    const query = ConversationsQuery.parse(req.query ?? {});
    const sessions = await learnRepo.findSessionsForConfigs(await configIdsOf(req.institutionId), { limit: query.limit, unreviewedOnly: query.unreviewed });
    return reply.send({ sessions });
  });

  app.get("/institution/conversations/:id/messages", async (req, reply) => {
    const { id } = SessionIdParam.parse(req.params);
    const messages = await learnRepo.findMessagesForReview(id, await configIdsOf(req.institutionId));
    if (!messages) throw new NotFoundError("Conversation not found");
    return reply.send({ session_id: id, messages });
  });
}
