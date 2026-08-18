// Handlers only: zod parse, the caller's own id from the JWT, one service call.
//
// The caller is always `req.auth.sub`. No route accepts a student id, a session owner
// or a wallet from the body — V1's sop-generate took the session id from the body and
// then re-derived everything from the row, which is right, but its intake accepted a
// `student_id` and trusted it.
//
// Responses are ALLOWLIST REBUILDS, not row spreads. A draft is a student's personal
// writing; a column added by a later migration must be excluded until someone lists it
// here on purpose.

import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  ConfigQuerySchema,
  CreateSessionSchema,
  DocumentIdParamSchema,
  ExportQuerySchema,
  RestoreVersionSchema,
  SaveVersionSchema,
  SessionIdParamSchema,
  UpsertAnswersSchema,
} from "../schemas/sop.schema.js";
import * as documentService from "../services/document.service.js";
import * as generationService from "../services/generation.service.js";
import * as sessionService from "../services/session.service.js";
import type { DocumentRow, SessionRow } from "../repositories/sop.repository.js";

const callerId = (req: FastifyRequest): number => Number(req.auth.sub);

/** Session summary. Deliberately without profile_snapshot or chat_history. */
function sessionSummary(row: SessionRow) {
  return {
    id: row.id,
    country_id: row.country_id,
    target_org_type: row.target_org_type,
    target_org_id: row.target_org_id,
    course_service_id: row.course_service_id,
    status: row.status,
    stage: row.stage,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Version metadata. No `content`: the history list is not a bulk text download. */
function versionSummary(row: DocumentRow) {
  return {
    id: row.id,
    document_type: row.document_type,
    version: row.version,
    is_current: row.is_current,
    word_count: row.word_count,
    char_count: row.char_count,
    quality_score: row.quality_score,
    edit_depth_pct: Number(row.edit_depth_pct),
    created_at: row.created_at,
  };
}

/** The full draft, which the owner is entitled to. */
function documentDetail(row: DocumentRow) {
  return {
    ...versionSummary(row),
    content: row.content,
    quality_breakdown: row.quality_breakdown,
    analysis: row.analysis,
  };
}

export async function sopRoutes(app: FastifyInstance) {
  // ── destination reference data ──
  app.get("/config", async (req, reply) => {
    const { country_code } = ConfigQuerySchema.parse(req.query ?? {});
    return reply.send(await generationService.getDestinationConfig(country_code));
  });

  // ── intake ──
  app.post("/sessions", async (req, reply) => {
    const input = CreateSessionSchema.parse(req.body ?? {});
    const session = await sessionService.createSession(callerId(req), input);
    return reply.status(201).send(sessionSummary(session));
  });

  app.get("/sessions", async (req, reply) => {
    const { data } = await sessionService.listSessions(callerId(req));
    return reply.send({ data: data.map(sessionSummary) });
  });

  app.get("/sessions/:id", async (req, reply) => {
    const { id } = SessionIdParamSchema.parse(req.params);
    const { session, answers, documents } = await sessionService.getSession(id, callerId(req));
    return reply.send({
      ...sessionSummary(session),
      profile_snapshot: session.profile_snapshot ?? {},
      answers: answers.map((a) => ({
        question_key: a.question_key,
        answer: a.answer,
        answer_json: a.answer_json,
        updated_at: a.updated_at,
      })),
      documents: documents.map(documentDetail),
    });
  });

  app.put("/sessions/:id/answers", async (req, reply) => {
    const { id } = SessionIdParamSchema.parse(req.params);
    const { answers } = UpsertAnswersSchema.parse(req.body ?? {});
    const result = await sessionService.saveAnswers(id, callerId(req), answers);
    return reply.send({
      ready: result.ready,
      answers: result.answers.map((a) => ({
        question_key: a.question_key,
        answer: a.answer,
        answer_json: a.answer_json,
        updated_at: a.updated_at,
      })),
    });
  });

  // ── generation ──
  //
  // 201 when a draft was produced, 200 when one already existed. The order of the
  // guards inside generationService is the fail-closed and metering contract; nothing
  // in this handler may run before it.
  app.post("/sessions/:id/generate", async (req, reply) => {
    const { id } = SessionIdParamSchema.parse(req.params);
    const result = await generationService.generate(id, callerId(req));
    return reply.status(result.generated ? 201 : 200).send({
      generated: result.generated,
      charged: result.generated ? (result.charged ?? 0) : 0,
      documents: result.documents.map(documentDetail),
    });
  });

  // ── revisions ──
  app.get("/documents/:id/versions", async (req, reply) => {
    const { id } = DocumentIdParamSchema.parse(req.params);
    const { data } = await documentService.listVersions(id, callerId(req));
    return reply.send({ data: data.map(versionSummary) });
  });

  app.get("/documents/:id", async (req, reply) => {
    const { id } = DocumentIdParamSchema.parse(req.params);
    const doc = await documentService.getVersion(id, callerId(req));
    return reply.send(documentDetail(doc));
  });

  app.post("/documents/:id/versions", async (req, reply) => {
    const { id } = DocumentIdParamSchema.parse(req.params);
    const { content } = SaveVersionSchema.parse(req.body ?? {});
    const saved = await documentService.saveVersion(id, callerId(req), content);
    return reply.status(201).send(documentDetail(saved));
  });

  app.post("/documents/:id/restore", async (req, reply) => {
    const { id } = DocumentIdParamSchema.parse(req.params);
    const { version } = RestoreVersionSchema.parse(req.body ?? {});
    const restored = await documentService.restoreVersion(id, callerId(req), version);
    return reply.status(201).send(documentDetail(restored));
  });

  // ── export ──
  //
  // `text` and `markdown` only. See consts.ts: there is no PDF or DOCX writer in this
  // backend, and a format the server cannot produce is a 400 from the zod enum rather
  // than a mislabelled body.
  app.get("/documents/:id/export", async (req, reply) => {
    const { id } = DocumentIdParamSchema.parse(req.params);
    const { format } = ExportQuerySchema.parse(req.query ?? {});
    const result = await documentService.exportDocument(id, callerId(req), format);
    return reply
      .header("content-type", result.contentType)
      .header("content-disposition", `attachment; filename="${result.filename}"`)
      .send(result.body);
  });
}
