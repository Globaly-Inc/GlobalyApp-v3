import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import { initSSE, writeEvent, writeData, writeDone } from "../lib/sse-writer.js";
import { getAiProvider } from "./provider.js";
import { parseCards, parseChips, stripBlocks } from "../lib/card-parser.js";
import { buildSystemPrompt } from "./prompt.service.js";
import * as rag from "./rag.service.js";
import * as sessionService from "./session.service.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import * as knowledgeRepo from "../repositories/knowledge.repository.js";
import * as sessionsRepo from "../repositories/sessions.repository.js";
import * as metering from "./metering.service.js";
import { estimateTokens, tokensFromChars } from "../consts.js";
import type { ChatScope } from "./scope.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("chat-service");

const HISTORY_LIMIT = 20;

export async function handleMessage(opts: {
  scope: ChatScope;
  sessionId?: number;
  content: string;
  attachments?: string[];
  reply: FastifyReply;
}): Promise<void> {
  const startMs = Date.now();
  // Minted before the provider is reached — see metering.service for why the id
  // has to exist ahead of the call rather than being derived from its result.
  const turnId = randomUUID();
  const provider = getAiProvider();

  // What the client has actually received. This, not the intended answer, is what
  // a mid-stream failure is metered on.
  let delivered = "";
  let promptChars = 0;
  // Captured so an interrupted turn still settles against the right session, even
  // when the session was created by this very request.
  let sessionId: number | null = opts.sessionId ?? null;

  // 1. SSE headers
  initSSE(opts.reply);

  try {
    // 2. Session
    const isNew = !opts.sessionId;
    const session = await sessionService.getOrCreateSession(opts.scope, opts.sessionId);
    sessionId = session.id;

    writeEvent(opts.reply, "session", { id: session.id, isNew, turn_id: turnId });

    // 3. Persist user message
    await messagesRepo.create({
      session_id: session.id,
      role: "user",
      content: opts.content,
      attachments: opts.attachments,
    });

    // 4. Profile context (personal chats only — a business chat has no student profile)
    const profileContext =
      opts.scope.ownerType === "user" ? await knowledgeRepo.getProfileContext(opts.scope.userId) : null;

    // 5. RAG search
    const ragOutput = await rag.searchAll({
      query: opts.content,
      userId: opts.scope.userId,
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
      isFirstMessage: isNew && session.message_count === 0,
    });
    promptChars = system.length + opts.content.length;

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

    const result = await provider.streamChat({
      system,
      history,
      userMessage: opts.content,
      onChunk: (chunk) => {
        delivered += chunk;
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

    // 14. Settle — one usage row, one debit, in one transaction.
    const settled = await metering.settleTurn({
      turnId,
      scope: opts.scope,
      sessionId: session.id,
      messageId: aiMessage.id,
      model: provider.model,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      outcome: "complete",
    });

    // 15. Usage + done
    writeEvent(opts.reply, "usage", {
      ...result.usage,
      message_id: aiMessage.id,
      credits_charged: settled.charged,
    });
    writeDone(opts.reply);

    // 16. Auto-title (fire-and-forget)
    if (isNew) {
      sessionService.autoTitle(session.id, opts.content, cleanText).catch(() => {});
    }
  } catch (err) {
    logger.error("Chat stream error", { err: err instanceof Error ? err.message : String(err) });

    // Settle whatever reached the client. Same turn id, so a settlement that
    // already happened is a no-op and a half-answer never costs a whole one.
    // The provider reports nothing for a stream it did not finish, hence the
    // estimate over the delivered bytes.
    await metering
      .settleTurn({
        turnId,
        scope: opts.scope,
        sessionId,
        messageId: null,
        model: provider.model,
        promptTokens: delivered ? tokensFromChars(promptChars) : 0,
        completionTokens: estimateTokens(delivered),
        outcome: "interrupted",
      })
      .catch((settleErr) =>
        logger.error("Failed to settle interrupted turn", { turnId, err: String(settleErr) }),
      );

    // Write a friendly error to the stream so the client doesn't hang
    if (!opts.reply.raw.destroyed) {
      writeData(opts.reply, {
        choices: [{ delta: { content: "I'm sorry, something went wrong on my end. Please try again in a moment." } }],
      });
      writeDone(opts.reply);
    }
  }
}
