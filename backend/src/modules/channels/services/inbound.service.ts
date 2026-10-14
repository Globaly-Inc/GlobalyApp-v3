// What happens when Zernio tells us something: a customer wrote, a message was delivered, an
// account was connected or lost. One stored webhook event in, its effects out. Runs in the
// channel-events worker (never in the webhook request, which only stores and queues).
//
// A channel conversation is an ai_widget_visitors row (+ its ai_counselor_sessions thread), so
// takeover, the 15-minute resume, unread, notes and summaries all behave exactly as for the
// website widget. The AI reply is the widget's own (visitor-reply.service).

import type { Knex } from "knex";
import { createChildLogger } from "../../../shared/logger.js";
import type { Recipient } from "../../enquiries/shared/recipient.js";
import * as guestService from "../../ai-counsellor/services/guest.service.js";
import * as visitorService from "../../ai-counsellor/services/visitor.service.js";
import * as takeover from "../../ai-counsellor/services/takeover.service.js";
import * as embedService from "../../ai-counsellor/services/embed.service.js";
import * as embedRepo from "../../ai-counsellor/repositories/embed.repository.js";
import * as messagesRepo from "../../ai-counsellor/repositories/messages.repository.js";
import * as sessionsRepo from "../../ai-counsellor/repositories/sessions.repository.js";
import { judgeWantsHuman } from "../../ai-counsellor/lib/handover-detect.js";
import { refreshChatSummary } from "../../ai-counsellor/services/chat-summaries.service.js";
import { captureVisitorDetails, generateVisitorReply, loadVisitorRules } from "../../ai-counsellor/services/visitor-reply.service.js";
import { judgeEscalation, type EscalationReason } from "../lib/escalation-detect.js";
import { CHANNEL_TEXT_LIMIT, formatForChannel } from "../lib/channel-format.js";
import * as zernioRepo from "../repositories/zernio.repository.js";
import * as connections from "../repositories/connections.repository.js";
import * as channelVisitors from "../repositories/channel-visitors.repository.js";
import * as replyJobs from "../repositories/reply-jobs.repository.js";
import { config as appConfig } from "../../../config.js";
import { channelConfigFor, sendToCustomer, showTyping } from "./outbound.service.js";
import { aiConfigOf, CHANNEL_LABEL, channelVisitorKey, isChannel, PHONE_APP_HANDLER, type AiConfig, type Channel } from "../consts.js";

const logger = createChildLogger("channels-inbound");

/** Matches the widget's history window, so a channel conversation reads the same amount of context. */
const HISTORY_LIMIT = 20;

/** Fixed copy, each its own message — never appended to model text. */
const HANDOVER_LINE = "I've asked our team to join this chat. Someone will reply here as soon as they can — you can keep writing in the meantime.";
const HOLDING_LINE: Record<EscalationReason, string> = {
  sensitive: "Thank you for telling us. This is something our team should help you with directly, so I've passed your message on. Someone will reply here as soon as they can.",
  ai_unsure: "That's a question our admissions team should answer for you, so I've passed it on. Someone will reply here as soon as they can.",
};

// The answer itself is the widget's — lists, bold, course cards — and formatForChannel turns it
// into the platform's own formatting. This only says where it is going and how long it may be.
const surfaceNote = (channel: Channel, cfg: AiConfig) => [
  `CHANNEL: you are replying to a customer on ${CHANNEL_LABEL[channel]}, in a phone chat — not on a website.`,
  "Answer exactly as you would on the website: lead with what they asked, use short bullet points for options, programmes or steps, and bold the key names. It is converted to the app's formatting.",
  `No tables or code blocks. Keep the whole reply under ${Math.round(CHANNEL_TEXT_LIMIT[channel] * 0.8)} characters, course details included.`,
  "Never mention buttons, cards, links to click or a website chat window.",
  // The channel's AI settings (Channels → AI configuration).
  !cfg.capabilities.programs && "Do not give details of specific programmes (fees, duration, intakes, requirements). Say the team will follow up with programme details.",
  !cfg.capabilities.recommend && "Do not recommend or suggest specific programmes.",
  !cfg.capabilities.collect && "Do not ask for the customer's personal details (name, email, phone, age, nationality, education).",
].filter(Boolean).join("\n");

// ---------------------------------------------------------------- payload shapes (the parts we read)

interface InboxPayload {
  message?: {
    id?: string; conversationId?: string; platformMessageId?: string; text?: string;
    attachments?: { type?: string; originalType?: string; url?: string }[];
    sender?: { id?: string; name?: string; username?: string; phoneNumber?: string | null };
    source?: "whatsapp_business_app" | "cloud_api" | "meta_business_agent";
  };
  conversation?: { id?: string; participantId?: string; participantName?: string; participantUsername?: string };
  account?: { id?: string; accountId?: string; profileId?: string; platform?: string; username?: string; displayName?: string | null; reason?: string };
  metadata?: { standby?: boolean } | null;
  control?: { owner?: "app" | "ai_agent" | "other" };
  error?: { message?: string; title?: string; explanation?: string | null } | null;
  quality?: { qualityRating?: string | null };
  current?: { phoneNumber?: string; businessScopedUserId?: string };
  conversationId?: string | null;
}

const accountIdOf = (p: InboxPayload) => p.account?.accountId ?? p.account?.id ?? null;
const conversationIdOf = (p: InboxPayload) => p.conversation?.id ?? p.message?.conversationId ?? p.conversationId ?? null;

// ---------------------------------------------------------------- tenant resolution

interface Tenant {
  owner: Recipient;
  db: Knex;
  config: embedRepo.EmbedConfigRow;
  conn: connections.ConnectionRow | undefined;
}

/** The webhook knows a Zernio account; this finds the organisation and opens its database. */
async function tenantFor(accountId: string | null): Promise<Tenant | null> {
  if (!accountId) return null;
  const account = await zernioRepo.findAccount(accountId);
  if (!account) return null;
  const owner = zernioRepo.ownerOf(account);
  const config = await channelConfigFor(owner);
  const db = await visitorService.tenantDbFor(config);
  if (!db) return null;
  return { owner, db, config, conn: await connections.findByAccount(db, accountId) };
}

// ---------------------------------------------------------------- entry point

export async function processEvent(eventRowId: number): Promise<void> {
  const ev = await zernioRepo.findEvent(eventRowId);
  if (!ev || !zernioRepo.isEventDue(ev)) return;
  try {
    const outcome = await route(ev.event, ev.payload as InboxPayload);
    if (outcome) logger.info("Zernio event skipped", { eventId: ev.event_id, event: ev.event, reason: outcome });
    await zernioRepo.markEventProcessed(ev.id, outcome ?? undefined);
  } catch (err) {
    // Left unprocessed: a database or model blip must not end the job. The sweep retries it, and a
    // message already stored is picked up again below (messageReceived's retry path).
    const message = err instanceof Error ? err.message : String(err);
    const gaveUp = await zernioRepo.markEventFailed(ev.id, message.slice(0, 500));
    logger.error(gaveUp ? "Zernio event failed; giving up after its last attempt" : "Zernio event failed; will retry", {
      eventId: ev.event_id, event: ev.event, attempt: ev.attempts + 1, err: message,
    });
  }
}

/** Returns a short note when the event was deliberately skipped (stored as the row's `error`). */
async function route(event: string, p: InboxPayload): Promise<string | null> {
  switch (event) {
    case "account.connected": return accountConnected(p);
    case "account.disconnected": return accountDisconnected(p);
    case "whatsapp.account.quality_updated": return qualityUpdated(p);
    case "message.received": return messageReceived(p);
    case "message.sent": return messageSent(p);
    case "message.delivered": case "message.read": case "message.failed": {
      const id = p.message?.platformMessageId;
      if (!id) return "no platform message id";
      const status = event === "message.delivered" ? "delivered" : event === "message.read" ? "read" : "failed";
      const error = p.error ? (p.error.explanation || p.error.message || p.error.title || "Not delivered") : null;
      await messagesRepo.setDelivery(id, status, error);
      return null;
    }
    case "message.edited":
      if (p.message?.platformMessageId && p.message.text != null) await messagesRepo.editByProvider(p.message.platformMessageId, p.message.text);
      return null;
    case "message.deleted":
      if (p.message?.platformMessageId) await messagesRepo.markSenderDeleted(p.message.platformMessageId);
      return null;
    case "conversation.control_changed": return controlChanged(p);
    case "whatsapp.contact.identity_changed": return identityChanged(p);
    default: return `ignored: ${event}`;
  }
}

// ---------------------------------------------------------------- accounts

async function accountConnected(p: InboxPayload): Promise<string | null> {
  const accountId = accountIdOf(p);
  const profileId = p.account?.profileId;
  if (!accountId || !profileId || !isChannel(p.account?.platform)) return "not a channel account";
  const owner = await zernioRepo.findProfileOwner(profileId);
  if (!owner) return "unknown profile";
  const channel = p.account!.platform as Channel;
  await zernioRepo.upsertAccount({ account_id: accountId, profile_id: profileId, owner, channel });
  const t = await tenantFor(accountId);
  if (!t) return "no tenant schema";
  await connections.upsert(t.db, {
    channel, zernio_account_id: accountId,
    display_name: p.account?.displayName || p.account?.username || CHANNEL_LABEL[channel],
    handle: p.account?.username ?? null, connected_by_user_id: null,
  });
  return null;
}

async function accountDisconnected(p: InboxPayload): Promise<string | null> {
  const t = await tenantFor(accountIdOf(p));
  // Only a LIVE connection becomes "lost": our own Disconnect already marked it disconnected.
  if (!t?.conn || t.conn.status !== "connected") return "not connected here";
  await connections.setStatus(t.db, t.conn.zernio_account_id, "error", p.account?.reason ?? "Meta ended the connection. Reconnect to keep AI answering.");
  return null;
}

async function qualityUpdated(p: InboxPayload): Promise<string | null> {
  const rating = p.quality?.qualityRating;
  const t = await tenantFor(accountIdOf(p));
  if (!t?.conn || !rating) return "nothing to record";
  await connections.setQuality(t.db, t.conn.zernio_account_id, rating.toLowerCase());
  return null;
}

// ---------------------------------------------------------------- conversations

async function controlChanged(p: InboxPayload): Promise<string | null> {
  const t = await tenantFor(accountIdOf(p));
  const convId = conversationIdOf(p);
  if (!t || !convId) return "unknown conversation";
  const visitor = await channelVisitors.findByConversation(t.db, convId);
  if (!visitor) return "unknown conversation";
  if (p.control?.owner && p.control.owner !== "app") await channelVisitors.setAttention(t.db, visitor.id, "other_app");
  else if (visitor.attention_reason === "other_app") await channelVisitors.clearAttention(t.db, visitor.id);
  return null;
}

async function identityChanged(p: InboxPayload): Promise<string | null> {
  const t = await tenantFor(accountIdOf(p));
  const convId = conversationIdOf(p);
  const handle = p.current?.phoneNumber ? `+${p.current.phoneNumber.replace(/^\+/, "")}` : p.current?.businessScopedUserId;
  if (!t || !convId || !handle) return "nothing to re-key";
  // Zernio already moved the conversation; we key on its id, so only the shown handle changes.
  await t.db("ai_widget_visitors").where({ zernio_conversation_id: convId }).update({ channel_handle: handle });
  return null;
}

/** A customer message: store it, then let AI answer unless a person has the conversation. */
async function messageReceived(p: InboxPayload): Promise<string | null> {
  const t = await tenantFor(accountIdOf(p));
  const convId = conversationIdOf(p);
  if (!t || !convId) return "unknown account or conversation";
  if (!t.conn || t.conn.status === "disconnected") return "channel not connected";
  const conn = t.conn;
  const channel = conn.channel;

  const text = (p.message?.text ?? "").trim();
  const attachments = (p.message?.attachments ?? []).filter((a) => a.url);
  if (!text && !attachments.length) return "empty message";
  const platformId = p.message?.platformMessageId;
  // Stored already: a redelivery, or a retry of an event that failed after storing the message.
  // The message is not stored twice, but a reply that never went out is still owed.
  const stored = !!platformId && (await messagesRepo.existsByProvider(platformId));
  // ponytail: attachments are noted in the text; showing the media itself needs Zernio's signed URLs.
  const content = [text, ...attachments.map((a) => `[${a.type ?? a.originalType ?? "attachment"}]`)].filter(Boolean).join("\n");

  const visitorKey = channelVisitorKey(convId);
  const session = await guestService.resolveVisitorSession(visitorKey, t.config.id);
  const resolved = await visitorService.resolveVisitor(t.db, { visitorKey, embedConfigId: t.config.id, sessionId: session.id });
  let visitor = resolved as channelVisitors.ChannelVisitorRow;
  if (!visitor.zernio_conversation_id) {
    const sender = p.message?.sender;
    visitor = await channelVisitors.attachChannel(t.db, visitor.id, {
      channel,
      channel_connection_id: conn.id,
      zernio_conversation_id: convId,
      channel_handle: channel === "whatsapp"
        ? (sender?.phoneNumber ?? (sender?.id ? `+${sender.id}` : null))
        : (p.conversation?.participantUsername ? `@${p.conversation.participantUsername.replace(/^@/, "")}` : sender?.username ?? null),
      name: p.conversation?.participantName ?? sender?.name ?? null,
      phone: channel === "whatsapp" ? sender?.phoneNumber ?? null : null,
    });
  }

  // Stored already (a redelivery, or a retry after a failure): not stored twice. The reply is
  // scheduled again below; answerPending answers only what no reply (or suggestion) has claimed yet.
  if (!stored) {
    try {
      await messagesRepo.create({ session_id: session.id, role: "user", content, ...(platformId ? { provider_message_id: platformId } : {}) });
    } catch (err) {
      // A concurrent copy of this event got there first (unique provider_message_id).
      if ((err as { code?: string }).code === "23505") return "duplicate";
      throw err;
    }
    await sessionsRepo.incrementMessageCount(session.id);
    await channelVisitors.recordInbound(t.db, visitor.id);
    await takeover.bumpUnread(t.db, visitor.id);
  }
  // Keep the in-memory row in step: the WhatsApp window check reads last_inbound_at, and on a
  // first message it would otherwise still be null and refuse the reply.
  visitor = { ...visitor, last_inbound_at: new Date() };
  const summarise = () => void refreshChatSummary(session.id, t.config.display_name, { db: t.db, visitorId: visitor.id });

  // Another app (Page Inbox, Meta Business Agent) owns the thread: Meta wouldn't deliver our reply.
  if (p.metadata?.standby) {
    await channelVisitors.setAttention(t.db, visitor.id, "other_app");
    summarise();
    return null;
  }

  // Who answers — stale claims expire first, so a person who went quiet 15 minutes ago hands the
  // conversation back to AI on this very message (the widget's rule, unchanged).
  const control = takeover.whoAnswers(visitor);
  await takeover.expire(t.db, visitor.id, { handler: control.expireHandler, request: control.expireRequest });
  if (control.answerer !== "ai" || visitor.attention_reason === "other_app" || visitor.attention_reason === "sensitive") {
    summarise();
    return null;
  }

  // Debounced: customers often send a burst ("Hello" … "List me some courses"). Each message
  // pushes the reply a few seconds out; when it falls due, ONE reply answers everything the
  // customer said since the last answer (see the reply loop in the channel-events worker).
  await replyJobs.scheduleReply(t.owner, visitor.id, appConfig.CHANNEL_REPLY_DEBOUNCE_MS, appConfig.CHANNEL_REPLY_MAX_WAIT_MS);
  return null;
}

/**
 * AI's turn. Exported for Resume AI: when someone hands the conversation back, the customer's
 * unanswered messages are answered straight away instead of waiting for their next one.
 */
async function answer(
  t: Tenant & { conn: connections.ConnectionRow },
  visitor: channelVisitors.ChannelVisitorRow,
  session: sessionsRepo.SessionRow,
  /** The whole history, ending with the customer's unanswered messages (the burst being answered). */
  prevMessages: messagesRepo.MessageRow[],
  /** Sent anyway when a newer message arrives mid-reply (the burst already waited its maximum). */
  opts: { forced?: boolean } = {},
): Promise<void> {
  const cfg = aiConfigOf(t.conn.ai_config);
  const started = Date.now();
  const summarise = () => void refreshChatSummary(session.id, t.config.display_name, { db: t.db, visitorId: visitor.id });
  const say = (content: string, key: string) => sendToCustomer({ db: t.db, visitor, sessionId: session.id, role: "assistant", content, idempotencyKey: key });

  // Every message since the last answer, in order, as ONE question — so a burst gets one coherent
  // reply, and "Hi" + "can I talk to a person?" is still recognised as a handover request.
  const previous = session.answered_through_message_id ?? null;
  const pending = takeover.owedMessages(prevMessages, previous);
  const asked = pending.questions.join("\n\n");
  const lastId = pending.lastId;
  if (!asked || lastId == null) return;
  const history = pending.history.map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }],
  }));
  // Every response records the last message it answers — first, in one UPDATE — so a retry or a
  // second worker finds those questions taken (and a waiting suggestion isn't regenerated), while
  // anything newer stays owed. Undone if the response never goes out.
  const respond = async (send: () => Promise<unknown>): Promise<boolean> => {
    if (!(await sessionsRepo.claimAnsweredThrough(session.id, lastId))) return false;
    try {
      await send();
      return true;
    } catch (err) {
      await sessionsRepo.releaseAnsweredThrough(session.id, lastId, previous);
      throw err;
    }
  };

  if (cfg.capabilities.escalate && cfg.escalation.human && (await judgeWantsHuman(asked)) && (await takeover.requestHandover(t.db, visitor.id))) {
    if (!(await respond(() => say(HANDOVER_LINE, `handover:${session.id}:${lastId}`)))) return;
    takeover.notifyHandoverRequest(t.config, visitor, asked)
      .catch((err) => logger.warn("Handover email not sent", { visitorId: visitor.id, err: err instanceof Error ? err.message : String(err) }));
    summarise();
    return;
  }

  const reason = cfg.capabilities.escalate ? await judgeEscalation(asked, cfg.escalation) : null;
  if (reason) {
    await channelVisitors.setAttention(t.db, visitor.id, reason);
    await respond(() => say(HOLDING_LINE[reason], `escalate:${session.id}:${lastId}:${reason}`));
    summarise();
    return;
  }

  // "Answer customer questions" off: AI writes nothing; the conversation waits in Needs attention.
  if (!cfg.capabilities.answer) {
    await channelVisitors.setAttention(t.db, visitor.id, "ai_unsure");
    summarise();
    return;
  }

  await showTyping(t.db, visitor);
  const embed = await embedService.buildEmbedContext(t.config);
  const rules = await loadVisitorRules(embed);
  const genStarted = Date.now();
  const reply = await generateVisitorReply({ embed, rules, tenantDb: t.db, visitor, prevMessages, history, asked, surfaceNote: surfaceNote(t.conn.channel, cfg) });
  const generateMs = Date.now() - genStarted;
  // What the customer will see — and what is stored, so the Inbox shows the same message. Course
  // cards are recommendations of programmes, so they follow both of those switches.
  const showCards = cfg.capabilities.programs && cfg.capabilities.recommend;
  const text = formatForChannel(showCards ? reply : { ...reply, cards: [] }, t.conn.channel);
  if (!text.trim()) return;

  // The model takes seconds; a teammate may have taken over (or resolved it) meanwhile. Their
  // claim wins: the AI's reply is dropped, not sent over them.
  const now = await channelVisitors.findById(t.db, visitor.id);
  if (!now || now.resolved_at || takeover.whoAnswers(now).answerer !== "ai" || now.attention_reason === "sensitive" || now.attention_reason === "other_app") {
    logger.info("AI reply dropped: a person has the conversation now", { visitorId: visitor.id });
    return;
  }
  // The customer wrote again while the model was writing: this reply would answer only part of
  // what they've said. Drop it; the reply their new message scheduled answers all of it at once.
  // Not once the burst has waited its maximum, so someone who keeps typing still gets an answer.
  const [newest] = await messagesRepo.findBySession(session.id, { limit: 1 });
  if (!opts.forced && newest && newest.id > lastId && newest.role === "user") {
    logger.info("AI reply superseded by a newer customer message", { visitorId: visitor.id });
    return;
  }

  if (t.conn.ai_mode === "suggest") {
    // Suggest-only: a person reviews and sends it from the Inbox. A draft answers nothing yet, so
    // the questions stay owed (Resume AI, or a newer message, still covers all of them); only the
    // draft marker moves, so a retried event doesn't regenerate the draft staff are reading.
    await channelVisitors.setAttention(t.db, visitor.id, "suggest", text);
    await sessionsRepo.setDraftedThrough(session.id, lastId);
  } else {
    const sent = await respond(() => sendToCustomer({
      db: t.db, visitor, sessionId: session.id, role: "assistant", content: text,
      idempotencyKey: `ai:${session.id}:${lastId}`,
      extra: {
        sources: reply.sources, memory_ids: reply.memory?.ids,
        prompt_tokens: reply.result.usage.promptTokens, completion_tokens: reply.result.usage.completionTokens, total_tokens: reply.result.usage.totalTokens,
      },
    }));
    if (!sent) return;
    // Where a slow reply's time went: the debounce + queue (customer's message → here), context,
    // the model, and Zernio's send.
    const asked_at = prevMessages.find((m) => m.id === lastId)?.created_at;
    logger.info("AI reply sent", {
      visitorId: visitor.id, channel: t.conn.channel,
      sinceCustomerMs: asked_at ? Date.now() - new Date(asked_at).getTime() : null,
      prepareMs: genStarted - started, generateMs, sendMs: Date.now() - genStarted - generateMs,
    });
    if (visitor.attention_reason === "ai_unsure") await channelVisitors.clearAttention(t.db, visitor.id);
  }

  if (cfg.capabilities.collect) await captureVisitorDetails({ embed, rules, tenantDb: t.db, visitor, visitorKey: visitor.visitor_key, history, asked });
  embedRepo.incrementMonthlyUsage(t.config.id)
    .catch((err) => logger.warn("Usage increment failed", { configId: t.config.id, err: String(err) }));
  summarise();
}

/**
 * A due reply (the worker's reply loop): answer everything the customer has said since the last
 * answer, in one message. Also how Resume AI answers what was said while a person had it. Ownership
 * is re-checked here, at reply time — a teammate may have taken over during the debounce.
 */
export async function answerPending(owner: Recipient, visitorId: number, opts: { forced?: boolean } = {}): Promise<void> {
  const config = await channelConfigFor(owner);
  const db = await visitorService.tenantDbFor(config);
  if (!db) return;
  const visitor = await channelVisitors.findById(db, visitorId);
  if (!visitor?.zernio_conversation_id || visitor.channel_connection_id == null || !visitor.session_id) return;
  const conn = await connections.findById(db, visitor.channel_connection_id);
  const session = await sessionsRepo.findById(visitor.session_id);
  if (!conn || conn.status !== "connected" || !session) return;
  const prevMessages = await messagesRepo.findBySession(session.id, { limit: HISTORY_LIMIT });
  // Owed only while something the customer said is unanswered: an earlier reply (or a teammate)
  // may have answered already, which is also what keeps a duplicate job from replying twice.
  const owed = takeover.owedMessages(prevMessages, session.answered_through_message_id ?? null).lastId;
  if (owed == null) return;
  // Suggest mode, and the draft waiting for staff already covers everything owed: nothing new to draft.
  if (conn.ai_mode === "suggest" && visitor.attention_reason === "suggest" && visitor.ai_draft && (session.drafted_through_message_id ?? 0) >= owed) return;
  if (visitor.resolved_at || takeover.whoAnswers(visitor).answerer !== "ai" || visitor.attention_reason === "sensitive" || visitor.attention_reason === "other_app") return;
  await answer({ owner, db, config, conn }, visitor, session, prevMessages, opts);
}

/**
 * Our own send is confirmed here. A reply typed in the WhatsApp Business phone app (coexistence)
 * arrives the same way, and means a person is answering: store it and pause AI.
 */
async function messageSent(p: InboxPayload): Promise<string | null> {
  const platformId = p.message?.platformMessageId;
  if (p.message?.source !== "whatsapp_business_app") {
    if (platformId) await messagesRepo.setDelivery(platformId, "sent");
    return null;
  }
  const t = await tenantFor(accountIdOf(p));
  const convId = conversationIdOf(p);
  if (!t || !convId) return "unknown account or conversation";
  const visitor = await channelVisitors.findByConversation(t.db, convId);
  if (!visitor?.session_id) return "unknown conversation";
  if (platformId && (await messagesRepo.existsByProvider(platformId))) return "duplicate";
  await messagesRepo.create({
    session_id: visitor.session_id, role: "agent", content: p.message?.text ?? "",
    sender_name: PHONE_APP_HANDLER.name, sent_from: "phone_app", delivery_status: "sent",
    ...(platformId ? { provider_message_id: platformId } : {}),
  });
  await sessionsRepo.incrementMessageCount(visitor.session_id);
  await channelVisitors.setPhoneHandler(t.db, visitor.id);
  void refreshChatSummary(visitor.session_id, t.config.display_name, { db: t.db, visitorId: visitor.id });
  return null;
}
