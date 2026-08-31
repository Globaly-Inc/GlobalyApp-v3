import type { FastifyReply } from "fastify";
import { config } from "../../../config.js";
import { initSSE, writeEvent, writeData, writeDone } from "../lib/sse-writer.js";
import { streamChat, streamChatWithTools, type StreamChatResult } from "../lib/gemini-stream.js";
import { runTool, toolLabel, toolsFor, type ToolSource } from "../lib/tools.js";
import { parseBlocks, parseCards, parseChips, stripBlocks, type ParsedCard } from "../lib/card-parser.js";
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

/** Attach the institution's logo/city to each card from the DB, keyed on the course
 * id the model cited. Decorative, so a lookup failure leaves the cards untouched
 * rather than costing the student their answer. */
async function withInstitutionMedia(cards: ParsedCard[]): Promise<ParsedCard[]> {
  if (!cards.length) return cards;
  try {
    const media = await knowledgeRepo.institutionMediaByCourseIds(cards.map((c) => c.id));
    if (!media.length) return cards;
    const byCourseId = new Map(media.map((m) => [m.course_id, m]));
    return cards.map((card) => {
      const m = byCourseId.get(card.id);
      if (!m) return card;
      return {
        ...card,
        institution_logo_url: m.logo_url,
        institution_cover_url: m.cover_url,
        institution_website: m.website,
        city: card.city ?? m.city ?? undefined,
      };
    });
  } catch (err) {
    logger.warn("Card logo enrichment failed", { err: String(err) });
    return cards;
  }
}

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

    // 3. Conversation history — read BEFORE persisting this turn's message, so "everything
    // before now" needs no positional trick. It used to be read after the insert and then
    // `.slice(0, -1)`'d to drop the new row, which assumed the new row sorted last. When
    // that assumption failed the slice removed the previous ASSISTANT reply instead and
    // left the new user message in history, so the newest thing the model saw as context
    // was the student's PREVIOUS question — and it answered that one, a turn behind.
    //
    // Text turns only — past tool calls and their results are not replayed. Cheaper, and
    // the model re-searches when it actually needs the data again.
    const prevMessages = await messagesRepo.findBySession(session.id, { limit: HISTORY_LIMIT });
    const history = prevMessages.map(m => ({
      role: (m.role === "user" ? "user" : "model") as "user" | "model",
      parts: [{ text: m.content }],
    }));

    // 4. Persist user message
    await messagesRepo.create({
      session_id: session.id,
      role: "user",
      content: opts.content,
      attachments: opts.attachments,
    });

    // 5. Profile context
    const profileContext = await knowledgeRepo.getProfileContext(opts.userId);

    // Discovery turn: first message of a platform session gets NO course data, so
    // the model counsels (asks about goals) instead of dumping recommendations —
    // instructions alone don't stop it when CONTEXT is full of matching courses.
    // Embed visitors are exempt: they come with a specific question about one
    // institution and expect a direct answer. Also exempt: a student whose profile
    // already carries the essentials (destination + level) — for them discovery is
    // already done, and withholding courses on turn 1 reads as an interrogation.
    const isFirstMessage = isNew && session.message_count === 0;
    const p = profileContext?.profile;
    const profileReady = !!(p?.degree_level && p?.preferred_destinations);
    const discoveryTurn = isFirstMessage && !opts.embed && !profileReady;

    // Returning student: this fresh session is not their first ever (the count
    // includes the one just created). Platform only — embed visitors are anonymous.
    const returning =
      isFirstMessage && !opts.embed && (await sessionsRepo.countByUser(opts.userId)) > 1;

    if (opts.reply.raw.destroyed) {
      logger.info("Client disconnected before streaming", { sessionId: session.id });
      return;
    }

    // Kept as well as streamed: the UI renders only the newest step and strips the detail
    // off it (thinking-indicator's `step.split(/[:…]/)[0]`), so "Searched knowledge: <query>
    // — N passages" shows as "Searched knowledge" and the query is unrecoverable afterwards.
    // That is right for students and useless for debugging "why did it answer that?".
    const traceSteps: string[] = [];
    const trace = (step: string) => {
      traceSteps.push(step);
      writeEvent(opts.reply, "trace", { step });
    };
    let emitted = false;
    const onChunk = (chunk: string) => {
      emitted = true;
      writeData(opts.reply, { choices: [{ delta: { content: chunk } }] });
    };

    // 6. Retrieval + stream.
    //
    // Platform sessions run the tool loop: the model decides what to search, and
    // deciding NOT to search — asking the student a question instead — is the
    // behaviour Phase 5 could only ask for in the prompt.
    //
    // Embed mode stays on searchAll: its business scoping (jobIds, skipped
    // institution/agent sources) lives inside that function, and a tool the model
    // could call with its own arguments would route around the scope.
    const useTools = !opts.embed && config.AI_COUNSELLOR_TOOLS;
    let sources: ToolSource[] = [];
    let result: StreamChatResult | null = null;
    // Newest course search that found anything, remembered across tool rounds — it
    // becomes the "View all" deep link into /search with the same filters (step 7b).
    // Holder object: the write happens inside the runTool callback, which TS's
    // control-flow analysis won't credit against a bare `let` (it narrows it to never).
    const courseSearch: { filters: { query: string; country?: string; degree_level?: string } | null } = { filters: null };

    if (useTools) {
      // Proactive Knowledge Rack pass: one vector search seeded with the student's
      // profile + session context as well as their message, so guidance that applies
      // to their situation reaches the model even when they did not ask about it.
      const briefing = await rag.counsellorBriefing({
        message: opts.content,
        profile: profileContext,
        counsellingContext: session.counselling_context,
        onTrace: trace,
      });

      const seen = new Set<string>();
      if (briefing.sources.length) {
        for (const s of briefing.sources) seen.add(`${s.type}:${s.id}`);
        sources = briefing.sources;
        writeEvent(opts.reply, "sources", briefing.sources);
      }
      try {
        result = await streamChatWithTools({
          system: buildSystemPrompt({
            profile: profileContext,
            ragContext: "",
            isFirstMessage,
            toolMode: true,
            // What earlier turns of this session established. Read once here; the
            // update_student_context tool writes the merged version back mid-turn.
            counsellingContext: session.counselling_context,
            discoveryTurn,
            returning,
            proactiveKnowledge: briefing.text,
          }),
          history,
          userMessage: opts.content,
          tools: toolsFor({ discoveryTurn }),
          onChunk,
          onToolCall: (name) => trace(`${toolLabel(name)}…`),
          runTool: async (name, args) => {
            const run = await runTool(name, args, { sessionId: session.id });
            trace(run.trace);
            if (name === "search_courses" && (run.result as { count?: number }).count) {
              courseSearch.filters = {
                query: typeof args.query === "string" ? args.query : "",
                country: typeof args.country === "string" ? args.country : undefined,
                degree_level: typeof args.degree_level === "string" ? args.degree_level : undefined,
              };
            }
            const fresh = run.sources.filter(s => !seen.has(`${s.type}:${s.id}`));
            for (const s of fresh) seen.add(`${s.type}:${s.id}`);
            if (fresh.length) {
              sources = [...sources, ...fresh];
              writeEvent(opts.reply, "sources", fresh);
            }
            return run.result;
          },
        });
      } catch (err) {
        // Nothing streamed yet → the student loses nothing by retrying the old way.
        // Mid-stream failures fall through to the outer catch instead of producing
        // one reply built from two different runs.
        if (emitted) throw err;
        logger.warn("Tool loop failed, falling back to searchAll", {
          sessionId: session.id, err: err instanceof Error ? err.message : String(err),
        });
        trace("Retrying without tools");
        sources = [];
      }
    }

    if (!result) {
      const ragOutput = await rag.searchAll({
        query: opts.content,
        userId: opts.userId,
        jobIds: opts.embed?.jobIds,
        skipCourses: discoveryTurn,
        onTrace: trace,
      });
      sources = ragOutput.sources;
      if (sources.length) writeEvent(opts.reply, "sources", sources);

      result = await streamChat({
        system: buildSystemPrompt({
          profile: profileContext,
          ragContext: ragOutput.contextText,
          isFirstMessage,
          // Carried into the fallback too, so a failed tool loop doesn't read as
          // the counsellor forgetting everything it was told this session.
          counsellingContext: session.counselling_context,
          discoveryTurn,
          returning,
          embedConfig: opts.embed?.config,
        }),
        history,
        userMessage: opts.content,
        onChunk,
      });
    }

    // 7. Parse structured blocks
    const cards = await withInstitutionMedia(parseCards(result.fullText));
    const chips = parseChips(result.fullText);
    const blocks = parseBlocks(result.fullText);
    const cleanText = stripBlocks(result.fullText);

    // 7b. "View all" deep link. The chat shows at most 3 cards; whenever a course
    // search found results, students get a button into the full /search listing with
    // the same filters. Server-built only — the model never writes URLs.
    const filters = courseSearch.filters;
    if (filters) {
      const params = new URLSearchParams({ tab: "courses" });
      if (filters.query) params.set("search", filters.query);
      if (filters.country) params.set("country", filters.country);
      if (filters.degree_level) params.set("degree_level", filters.degree_level);
      blocks.push({ type: "link", label: "View all matching courses", url: `/search?${params}` });
    }

    // 8. Emit cards + chips + blocks
    if (cards.length) writeEvent(opts.reply, "cards", cards);
    if (chips.length) writeEvent(opts.reply, "chips", chips);
    if (blocks.length) writeEvent(opts.reply, "blocks", blocks);

    // 9. Persist assistant message
    const latencyMs = Date.now() - startMs;
    const aiMessage = await messagesRepo.create({
      session_id: session.id,
      role: "assistant",
      content: cleanText,
      sources,
      cards,
      chips,
      blocks,
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens,
      latency_ms: latencyMs,
    });

    // `question` vs `historyTail` is the whole diagnosis for a suspected off-by-one:
    // question is what the model was asked THIS turn, historyTail is the newest message
    // it was given as prior context. If historyTail repeats question, the current message
    // is in the history too and the model can answer either. If question does not match
    // what the student typed, the wrong content left the browser.
    logger.info("Retrieval trace", {
      sessionId: session.id,
      messageId: aiMessage.id,
      question: opts.content,
      historyCount: history.length,
      historyRoles: history.map(h => h.role).join(","),
      historyTail: history.at(-1)?.parts[0]?.text?.slice(0, 80) ?? null,
      steps: traceSteps,
    });

    // 10. Increment message count
    await sessionsRepo.incrementMessageCount(session.id);

    // 11. Credit deduction — after successful response, never on failure.
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

    // 12. Usage + done
    writeEvent(opts.reply, "usage", result.usage);
    writeDone(opts.reply, { message_id: aiMessage.id, session_id: session.id });

    // 13. Auto-title (fire-and-forget)
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
