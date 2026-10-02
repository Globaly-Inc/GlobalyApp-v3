// The portal's visitor detail page: read one visitor, correct what the chat got wrong.
//
// A separate file from embed.routes, which owns the widget CONFIG endpoints plus the visitor
// LIST. Worth folding the list in here at some point — these are all /embed/visitors — but not
// while that file is being edited elsewhere.

import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors.js";
import {
  VisitorHandoffSchema, VisitorIdParamSchema, VisitorNoteSchema, VisitorPatchSchema, VisitorReplySchema, VisitorResolveSchema,
} from "../schemas/visitor.schema.js";
import * as repo from "../repositories/visitor-edit.repository.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import * as sessionsRepo from "../repositories/sessions.repository.js";
import { refreshChatSummary, refreshContactSummary } from "../services/chat-summaries.service.js";
import * as takeover from "../services/takeover.service.js";
import * as mediaService from "../../enquiries/services/message-media.service.js";

/** Newest turns the inbox shows. ponytail: no paging — widget chats are short; page if they aren't. */
const TRANSCRIPT_LIMIT = 200;

/** A note as the Inbox draws it: its files with freshly signed view URLs. */
async function withNoteFiles(n: { attachments?: unknown } & Record<string, unknown>) {
  return { ...n, attachments: await mediaService.withViewUrls(n.attachments as mediaService.MessageAttachment[]) };
}

/** A transcript row as the Inbox draws it. Token counts, latency and feedback stay internal. */
async function toTranscriptMessage(m: messagesRepo.MessageRow) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    created_at: m.created_at,
    sender_name: m.sender_name ?? null,
    attachments: m.role === "agent" ? await mediaService.withViewUrls(m.attachments as mediaService.MessageAttachment[]) : [],
  };
}

/**
 * The visitor's identity across chats. `visitor_key` is deliberately not in the list allow-list
 * (it's a tracking token), so it's read here, server-side only, to find the visitor's sessions.
 */
async function visitorKeyOf(db: Knex, id: number): Promise<{ visitor_key: string; embed_config_id: number; session_id: number | null } | undefined> {
  return db("ai_widget_visitors").where({ id }).first("visitor_key", "embed_config_id", "session_id");
}

/** A chat as the Inbox and the visitor page draw it. */
function toChat(c: sessionsRepo.VisitorChat) {
  return { id: c.id, started_at: c.created_at, ended_at: c.ended_at ?? null, message_count: c.message_count, summary: c.summary ?? null };
}

export async function visitorRoutes(app: FastifyInstance) {
  app.get("/embed/visitors/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    const visitor = await repo.findVisitorById(req.db, id);
    if (!visitor) throw new NotFoundError("Visitor not found");
    return reply.send(takeover.withMe(visitor, Number(req.auth.sub)));
  });

  /**
   * The visitor's conversation with the assistant, read-only, for the Inbox's AI Embed tab.
   *
   * The sessions are found from the TENANT's visitor row, never from the URL — that row is the
   * ownership proof, since `ai_counselor_messages` lives in the shared master schema where any
   * id would resolve. Every chat the visitor had, newest messages first up to the limit; the first
   * message of each chat carries that chat (`chat`), so the Inbox draws a divider there.
   *
   * Allow-listed to what a transcript draws; token counts, latency and feedback stay internal.
   */
  app.get("/embed/visitors/:id/messages", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    const v = await visitorKeyOf(req.db, id);
    if (!v) throw new NotFoundError("Visitor not found");
    const chats = await sessionsRepo.findChatsByVisitor(v.visitor_key, v.embed_config_id);
    // A visitor whose only chat was adopted into an account has no visitor-key sessions left.
    const ids = chats.length ? chats.map((c) => c.id) : v.session_id != null ? [v.session_id] : [];
    const rows = await messagesRepo.findBySessions(ids, TRANSCRIPT_LIMIT);
    const byId = new Map(chats.map((c) => [c.id, c]));
    const seen = new Set<number>();
    const messages = await Promise.all(rows.map(async (m) => {
      const first = !seen.has(m.session_id);
      seen.add(m.session_id);
      const chat = first ? byId.get(m.session_id) : undefined;
      return { ...(await toTranscriptMessage(m)), session_id: m.session_id, ...(chat ? { chat: toChat(chat) } : {}) };
    }));
    return reply.send({ messages });
  });

  /** Every chat this visitor had, oldest first, each with its own summary — the visitor page's Activity. */
  app.get("/embed/visitors/:id/chats", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    const v = await visitorKeyOf(req.db, id);
    if (!v) throw new NotFoundError("Visitor not found");
    const chats = await sessionsRepo.findChatsByVisitor(v.visitor_key, v.embed_config_id);
    return reply.send({ chats: chats.map(toChat) });
  });

  // ── Human takeover ── Any org member may act; the visitor row on req.db is the ownership proof,
  // and who is acting always comes from the token, never from the body.

  /** A staff reply. Takes the chat over from the AI if nobody is handling it. */
  app.post("/embed/visitors/:id/messages", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    const input = VisitorReplySchema.parse(req.body ?? {});
    const v = await visitorKeyOf(req.db, id);
    if (!v) throw new NotFoundError("Visitor not found");
    // Into the visitor's open chat. If the last one ended, reopen it: the reply then shows on the
    // visitor's next visit instead of vanishing into a chat their widget no longer loads.
    const sessionId = await sessionsRepo.openForReply(v.visitor_key, v.embed_config_id);
    if (sessionId == null) throw new BadRequestError("This visitor has no chat on the widget to reply to");

    const staff = await takeover.staffFor(Number(req.auth.sub));
    const attachments = await mediaService.resolveOwned(staff.id, input.attachments);
    const message = await messagesRepo.create({
      session_id: sessionId,
      role: "agent",
      content: input.body,
      attachments,
      sender_user_id: staff.id,
      sender_name: staff.name,
    });
    await sessionsRepo.incrementMessageCount(sessionId);
    const control = await takeover.claimForReply(req.db, id, staff);
    void refreshChatSummary(sessionId, null, { db: req.db, visitorId: id });
    return reply.status(201).send({
      message: await toTranscriptMessage(message),
      control: takeover.withMe(control ?? {}, staff.id),
    });
  });

  // ── Internal notes ── Staff-only, in their own tenant table (see 20261002_001), so nothing that
  // reads the visitor's thread can ever pick one up. Any org member may read and write them.

  app.get("/embed/visitors/:id/notes", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    if (!(await repo.findVisitorById(req.db, id))) throw new NotFoundError("Visitor not found");
    const rows = await req.db("ai_widget_visitor_notes")
      .where({ visitor_id: id })
      .orderBy([{ column: "created_at" }, { column: "id" }])
      .select("id", "author_name", "content", "attachments", "created_at");
    return reply.send({ notes: await Promise.all(rows.map(withNoteFiles)) });
  });

  app.post("/embed/visitors/:id/notes", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    const { body, attachments } = VisitorNoteSchema.parse(req.body ?? {});
    if (!(await repo.findVisitorById(req.db, id))) throw new NotFoundError("Visitor not found");
    const staff = await takeover.staffFor(Number(req.auth.sub));
    // Only files this member uploaded may be attached — the same guard as a reply.
    const files = await mediaService.resolveOwned(staff.id, attachments);
    const [note] = await req.db("ai_widget_visitor_notes")
      .insert({ visitor_id: id, author_user_id: staff.id, author_name: staff.name, content: body, attachments: JSON.stringify(files) })
      .returning(["id", "author_name", "content", "attachments", "created_at"]);
    return reply.status(201).send({ note: await withNoteFiles(note) });
  });

  app.patch("/embed/visitors/:id/handoff", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    const { mode } = VisitorHandoffSchema.parse(req.body ?? {});
    const userId = Number(req.auth.sub);
    const control = await takeover.setHandoff(req.db, id, mode === "human" ? await takeover.staffFor(userId) : null);
    if (!control) throw new NotFoundError("Visitor not found");
    return reply.send({ control: takeover.withMe(control, userId) });
  });

  app.patch("/embed/visitors/:id/resolve", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    const { resolved } = VisitorResolveSchema.parse(req.body ?? {});
    const userId = Number(req.auth.sub);
    const control = await takeover.setResolved(req.db, id, await takeover.staffFor(userId), resolved);
    if (!control) throw new NotFoundError("Visitor not found");
    return reply.send({ control: takeover.withMe(control, userId) });
  });

  app.post("/embed/visitors/:id/read", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    if (!(await takeover.markRead(req.db, id))) throw new NotFoundError("Visitor not found");
    return reply.code(204).send();
  });

  /** Upload first, then send the returned storage_path with the reply — enquiry chat's two-step flow. */
  app.post("/embed/visitors/messages/media", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const file = await req.file();
    if (!file) throw new BadRequestError("No file uploaded");
    const uploaded = await mediaService.upload({
      userId: Number(req.auth.sub),
      filename: file.filename,
      mimeType: file.mimetype,
      buffer: await file.toBuffer(),
    });
    return reply.status(201).send(uploaded);
  });

  /**
   * Correct a visitor's details.
   *
   * What an owner may touch is only what the visitor themselves stated — name, email, age,
   * gender, nationality, study preference. Everything else on the row is the widget's record of
   * what happened (message counts, timestamps, contact and summary state) or is computed from
   * the row, and is not the owner's to rewrite. The schema enforces that by being strict.
   *
   * The four record sections are editable too, each replaced wholesale.
   *
   * Note the chat stays the source of truth throughout. `recordProfile` overwrites
   * age/gender/nationality/study_preference whenever a later turn restates them, and merges
   * record entries back in by their dedupe key — so a correction here can be superseded by the
   * visitor themselves, and a DELETED entry reappears if they mention it again. That is the
   * right precedence (they know their own qualifications) but it does mean an edit is a
   * correction, not a lock.
   */
  app.patch("/embed/visitors/:id", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { id } = VisitorIdParamSchema.parse(req.params);
    const patch = VisitorPatchSchema.parse(req.body ?? {});
    const visitor = await repo.updateVisitor(req.db, id, patch);
    if (!visitor) throw new NotFoundError("Visitor not found");
    // An owner's correction changes who the person is, so the contact summary follows it.
    void refreshContactSummary(req.db, id);
    return reply.send(takeover.withMe(visitor, Number(req.auth.sub)));
  });
}
