// The public widget surface. Unauthenticated, cross-origin, and it costs money per
// call — which is why every route here carries its own rate limit and every one
// goes through embedService.resolveWidgetRequest before doing any work.
//
// RATE LIMITS (all per client IP, the @fastify/rate-limit default; the plugin is
// registered once in server.ts and these are route-level overrides, same as
// feed/routes/feed.routes.ts does for its AI generation):
//   POST /messages  10/min — a provider call per request. Matches the existing
//                    precedent for AI generation in this codebase exactly, and is
//                    the tightest limit in the module because it is the only one
//                    that spends money.
//   POST /validate  30/min — one indexed DB read. Loose enough for a page that
//                    reloads, tight enough that key enumeration is not free.
//   GET  /widget.js 60/min — a static string.
// The per-IP key is not the whole cost story (a botnet spreads across IPs), so the
// per-config monthly budget in ai_embed_configs is the actual money ceiling: 402
// once `credits_used_this_month` reaches `monthly_credit_limit`.

import type { FastifyInstance } from "fastify";

import { config } from "../../../config.js";
import { createChildLogger } from "../../../shared/logger.js";
import { creditsFor } from "../../ai-counsellor/consts.js";
import { parseCards, parseChips, stripBlocks } from "../../ai-counsellor/lib/card-parser.js";
import { initSSE, writeData, writeDone, writeEvent } from "../../ai-counsellor/lib/sse-writer.js";
import * as guestService from "../../ai-counsellor/services/guest.service.js";
import { buildSystemPrompt } from "../../ai-counsellor/services/prompt.service.js";
import { assertProviderConfigured, getAiProvider } from "../../ai-counsellor/services/provider.js";
import * as rag from "../../ai-counsellor/services/rag.service.js";
import { buildWidgetScript } from "../lib/widget-script.js";
import * as repo from "../repositories/embed-config.repository.js";
import { EmbedMessageSchema, ValidateEmbedSchema } from "../schemas/embed.schema.js";
import * as embedService from "../services/embed.service.js";

const logger = createChildLogger("ai-embed-widget");

export async function widgetRoutes(app: FastifyInstance) {
  /**
   * POST /validate — the widget's handshake.
   *
   * Answers with the embed-safe projection only (services/embed.service.ts
   * `toPublicConfig`). Three deliberate differences from V1's ai-embed-validate:
   *   1. The origin is checked. V1 had no such notion and served `*`.
   *   2. The response is a projection, not the row. V1 returned custom-instruction
   *      siblings, the credit counters and the scoping ids to the browser.
   *   3. The 402 carries NO config. V1 attached the whole row to its 402 body,
   *      so an out-of-credit widget leaked more than a working one.
   */
  app.post(
    "/validate",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { embed_key } = ValidateEmbedSchema.parse(req.body ?? {});

      const { config: row } = await embedService.resolveWidgetRequest({
        embedKey: embed_key,
        origin: req.headers.origin,
        requireBudget: true,
      });

      return reply.send({ config: embedService.toPublicConfig(row) });
    },
  );

  /**
   * GET /widget.js — the loader a third-party page includes.
   *
   * Public and keyless: the script contains no credential (the host page supplies
   * the embed key via `data-embed-key`), so it is the same bytes for every tenant
   * and is safe to cache. No origin check here for the same reason — refusing to
   * serve a public static script would only move the copy elsewhere while telling
   * an attacker which origins are configured.
   */
  app.get(
    "/widget.js",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (_req, reply) => {
      return reply
        .type("application/javascript; charset=utf-8")
        .header("Cache-Control", "public, max-age=300")
        .send(buildWidgetScript(config.APP_URL));
    },
  );

  /**
   * POST /messages — SSE chat turn.
   *
   * Ladder before a single byte is written: key (401) → origin (403) → budget
   * (402) → provider configured (503). The provider assertion is last and still
   * ahead of `initSSE`, following ai-counsellor/services/provider.ts: an
   * unconfigured platform returns an honest 503, never HTTP 200 with a fabricated
   * answer (defect class §1.6 — V1 shipped exactly that failure mode) and never an
   * SSE stream that produces no tokens.
   *
   * Deliberately NOT reusing guest.service.checkGuestGate: that gate allows one
   * reply per fingerprint FOREVER, which is right for the one-shot signup teaser on
   * globaly.com and wrong here — a partner's visitor gets a conversation. The rate
   * limit above plus the per-config monthly budget are this endpoint's caps.
   */
  app.post(
    "/messages",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const input = EmbedMessageSchema.parse(req.body ?? {});

      const { config: row } = await embedService.resolveWidgetRequest({
        embedKey: input.embed_key,
        origin: req.headers.origin,
        requireBudget: true,
      });

      assertProviderConfigured();
      const provider = getAiProvider();

      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip;
      const fingerprintHash = guestService.hashFingerprint(input.fingerprint, ip);

      initSSE(reply);

      try {
        const ragOutput = await rag.searchAll({
          query: input.content,
          // Widget visitors are anonymous: there is no profile to personalise with.
          userId: 0,
          onTrace: (step) => writeEvent(reply, "trace", { step }),
        });

        if (ragOutput.sources.length) writeEvent(reply, "sources", ragOutput.sources);

        const system = [
          buildSystemPrompt({
            profile: null,
            ragContext: ragOutput.contextText,
            isFirstMessage: true,
          }),
          // The tenant's own instructions come LAST so they refine the platform
          // prompt rather than replace its privacy and no-invention rules.
          row.custom_instructions
            ? `HOST INSTRUCTIONS (from ${row.display_name ?? "the host site"}):\n${row.custom_instructions}`
            : null,
        ]
          .filter(Boolean)
          .join("\n\n");

        const result = await provider.streamChat({
          system,
          history: [],
          userMessage: input.content,
          onChunk: (chunk) => writeData(reply, { choices: [{ delta: { content: chunk } }] }),
        });

        const cards = parseCards(result.fullText);
        const chips = parseChips(result.fullText);
        const cleanText = stripBlocks(result.fullText);

        if (cards.length) writeEvent(reply, "cards", cards);
        if (chips.length) writeEvent(reply, "chips", chips);
        writeEvent(reply, "usage", result.usage);
        writeDone(reply);

        // Charge the widget's monthly budget with the same creditsFor() the
        // counsellor meters with, so one turn costs the same wherever it happened.
        const credits = creditsFor(result.usage.promptTokens, result.usage.completionTokens);
        if (credits > 0) {
          await repo.spendCredits(row.id, credits).catch((err) =>
            logger.error("Failed to charge embed credits", { configId: row.id, err: String(err) }),
          );
        }

        // Transcript persistence rides the existing guest-session table, which has
        // carried `embed_config_id` since 20260816_006 for exactly this.
        //
        // Awaited, unlike the counsellor's fire-and-forget equivalent: the SSE stream
        // is already closed by writeDone above, so awaiting costs the visitor nothing
        // and makes the write observable — a detached promise is a persistence step
        // that no test can assert on and no operator can see fail.
        await guestService
          .createGuestSession({
            fingerprintHash,
            messageContent: input.content,
            responseContent: cleanText,
            responseSources: ragOutput.sources,
            embedConfigId: row.id,
          })
          .catch((err) => logger.error("Failed to persist embed session", { err: String(err) }));
      } catch (err) {
        logger.error("Embed stream error", {
          configId: row.id,
          err: err instanceof Error ? err.message : String(err),
        });
        if (!reply.raw.destroyed) {
          writeData(reply, {
            choices: [{ delta: { content: "I'm sorry, something went wrong. Please try again." } }],
          });
          writeDone(reply);
        }
      }
    },
  );
}
