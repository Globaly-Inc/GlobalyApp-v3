import type { FastifyReply } from "fastify";
import { initSSE, writeEvent, writeData, writeDone } from "../lib/sse-writer.js";
import { streamChat } from "../lib/gemini-stream.js";
import { parseCards, parseChips, stripBlocks } from "../lib/card-parser.js";
import { buildSystemPrompt } from "./prompt.service.js";
import * as rag from "./rag.service.js";
import * as sessionService from "./session.service.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import * as knowledgeRepo from "../repositories/knowledge.repository.js";
import * as sessionsRepo from "../repositories/sessions.repository.js";
import * as creditService from "./credit.service.js";
import * as embedRepo from "../repositories/embed.repository.js";
import type { EmbedContext } from "./embed.service.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("chat-service");

const HISTORY_LIMIT = 20;

export async function handleMessage(opts: {
  userId: number;
  sessionId?: number;
  content: string;
  attachments?: string[];
  /** Embed mode (x-embed-key): scope RAG + prompt, bill the business's monthly quota. */
  embed?: EmbedContext;
  reply: FastifyReply;
}): Promise<void> {
  const startMs = Date.now();

  // 1. SSE headers
  initSSE(opts.reply);

  try {
    // 2. Session
    const isNew = !opts.sessionId;
    const session = await sessionService.getOrCreateSession(opts.userId, opts.sessionId, opts.embed?.config.id);

    // Provisional title from the prompt so the sidebar never shows an unnamed chat;
    // autoTitle upgrades it to a generated summary after the first exchange.
    const provisionalTitle = isNew ? opts.content.replace(/\s+/g, " ").trim().slice(0, 60) : undefined;
    if (provisionalTitle) {
      sessionsRepo.update(session.id, { title: provisionalTitle }).catch(() => {});
    }

    writeEvent(opts.reply, "session", { id: session.id, isNew, title: provisionalTitle });

    // 3. Persist user message
    await messagesRepo.create({
      session_id: session.id,
      role: "user",
      content: opts.content,
      attachments: opts.attachments,
    });

    // 4. Profile context
    const profileContext = await knowledgeRepo.getProfileContext(opts.userId);

    // Discovery turn: first message of a platform session gets NO course data, so
    // the model counsels (asks about goals) instead of dumping recommendations —
    // instructions alone don't stop it when CONTEXT is full of matching courses.
    // Embed visitors are exempt: they come with a specific question about one
    // institution and expect a direct answer.
    const isFirstMessage = isNew && session.message_count === 0;
    const discoveryTurn = isFirstMessage && !opts.embed;

    // 5. RAG search
    const ragOutput = await rag.searchAll({
      query: opts.content,
      userId: opts.userId,
      jobIds: opts.embed?.jobIds,
      skipCourses: discoveryTurn,
      onTrace: (step) => writeEvent(opts.reply, "trace", { step }),
    });

    // 6. Sources
    if (ragOutput.sources.length) {
      writeEvent(opts.reply, "sources", ragOutput.sources);
    }

    // 7. System prompt
    const system = buildSystemPrompt({
      profile: profileContext,
      ragContext: ragOutput.contextText,
      isFirstMessage,
      discoveryTurn,
      embedConfig: opts.embed?.config,
    });

    // 8. Conversation history
    const prevMessages = await messagesRepo.findBySession(session.id, { limit: HISTORY_LIMIT });
    // Exclude the user message we just persisted (it's the last one) — it goes as userMessage to streamChat
    const historyMessages = prevMessages.slice(0, -1);
    const history = historyMessages.map(m => ({
      role: (m.role === "user" ? "user" : "model") as "user" | "model",
      parts: [{ text: m.content }],
    }));

    // 9. Stream
    if (opts.reply.raw.destroyed) {
      logger.info("Client disconnected before streaming", { sessionId: session.id });
      return;
    }

    const result = await streamChat({
      system,
      history,
      userMessage: opts.content,
      onChunk: (chunk) => {
        writeData(opts.reply, { choices: [{ delta: { content: chunk } }] });
      },
    });

    // 10. Parse structured blocks
    const cards = parseCards(result.fullText);
    const chips = parseChips(result.fullText);
    const cleanText = stripBlocks(result.fullText);

    // 11. Emit cards + chips
    if (cards.length) writeEvent(opts.reply, "cards", cards);
    if (chips.length) writeEvent(opts.reply, "chips", chips);

    // 12. Persist assistant message
    const latencyMs = Date.now() - startMs;
    const aiMessage = await messagesRepo.create({
      session_id: session.id,
      role: "assistant",
      content: cleanText,
      sources: ragOutput.sources,
      cards,
      chips,
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens,
      latency_ms: latencyMs,
    });

    // 13. Increment message count
    await sessionsRepo.incrementMessageCount(session.id);

    // 14. Credit deduction — after successful response, never on failure.
    // Embed mode bills the business's monthly quota, not the user's wallet.
    if (opts.embed) {
      embedRepo.incrementMonthlyUsage(opts.embed.config.id).catch((err) => {
        logger.warn("Embed usage increment failed", { configId: opts.embed?.config.id, err: String(err) });
      });
    } else {
      creditService.deductCredit(opts.userId, aiMessage.id).catch((err) => {
        logger.warn("Credit deduction failed", { userId: opts.userId, err: String(err) });
      });
    }

    // 15. Usage + done
    writeEvent(opts.reply, "usage", result.usage);
    writeDone(opts.reply, { message_id: aiMessage.id, session_id: session.id });

    // 16. Auto-title (fire-and-forget)
    if (isNew) {
      sessionService.autoTitle(session.id, opts.content, cleanText).catch(() => {});
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Chat stream error", { err: message });

    if (!opts.reply.raw.destroyed) {
      // Friendly text for clients that only render deltas (embed widget)…
      writeData(opts.reply, {
        choices: [{ delta: { content: "I'm sorry, something went wrong on my end. Please try again in a moment." } }],
      });
      // …and the real error as a named event so the main app can surface it
      // instead of flashing-and-dropping the apology (which read as "nothing happened").
      writeEvent(opts.reply, "error", { error: message });
      writeDone(opts.reply);
    }
  }
}
