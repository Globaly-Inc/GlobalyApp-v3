// AI counsellor (E2) — per-token metering, business scope, guest migration,
// fail-closed provider.
//
// Everything runs offline. The module's only outbound dependency is the AiProvider
// interface, stubbed here; the fail-closed path is exercised by clearing the stub
// and asserting 503 rather than a fabricated answer or an empty stream.
//
// The metering assertions read the LEDGER and the wallet, never the HTTP response:
// a response can be right while the money is wrong, and it is the money this suite
// is about.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

type ProviderModule = typeof import("../../src/modules/ai-counsellor/services/provider.js");
type AiProvider = Parameters<ProviderModule["setAiProvider"]>[0] & object;

const STUB_USAGE = { promptTokens: 1_200, completionTokens: 2_800, totalTokens: 4_000 };
/** creditsFor(1200, 2800) with TOKENS_PER_CREDIT = 1000. */
const FULL_TURN_CREDITS = 4;

const ANSWER = "Here is a considered answer about studying abroad. ".repeat(8);

/**
 * Deterministic provider.
 *
 * `failAfterChunks` emits that many chunks and then throws, which is the only
 * honest way to reproduce a stream that dies mid-answer: the client has some of
 * the text, and the provider will never report usage for it.
 */
function makeProvider(opts: { failAfterChunks?: number } = {}): AiProvider {
  const chunkSize = 40;
  return {
    model: "gemini-3.5-flash",
    async streamChat({ onChunk }) {
      let emitted = 0;
      let delivered = "";
      for (let i = 0; i < ANSWER.length; i += chunkSize) {
        if (opts.failAfterChunks !== undefined && emitted >= opts.failAfterChunks) {
          throw new Error("provider stream died mid-answer");
        }
        const chunk = ANSWER.slice(i, i + chunkSize);
        delivered += chunk;
        onChunk(chunk);
        emitted += 1;
      }
      return { fullText: delivered, usage: { ...STUB_USAGE } };
    },
    async generateTitle() {
      return "Study abroad chat";
    },
  };
}

describeDb("ai counsellor", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: Record<string, unknown>;
  let provider: ProviderModule;
  let metering: typeof import("../../src/modules/ai-counsellor/services/metering.service.js");

  let userA = 0;
  let userB = 0;
  let bizA = 0;
  let bizB = 0;
  let userWalletA = 0;
  let userWalletB = 0;
  let bizWalletA = 0;
  let bizWalletB = 0;

  let tokenA = "";
  let tokenB = "";
  let tokenBizA = "";
  let tokenBizB = "";

  let runId = "";

  /**
   * Every platform_user this suite invents, so afterAll can take them back out.
   *
   * Leaving them behind is not harmless: the database is shared, and a stray
   * `businesses` row makes the W1 tenant-provisioning suite provision one more
   * schema on every future run.
   */
  const createdUserIds: number[] = [];
  let extractionJobId = "";
  const suiteStart = new Date();

  const START_CREDITS = 200;

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = (await import("../../src/config.js")) as unknown as { config: Record<string, unknown> });
    provider = await import("../../src/modules/ai-counsellor/services/provider.js");
    metering = await import("../../src/modules/ai-counsellor/services/metering.service.js");

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const aiChatModule = (await import("../../src/modules/ai-counsellor/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(aiChatModule);
    await app.ready();

    // ── fixtures ──
    runId = `${process.pid}${Date.now() % 1_000_000}`;

    const insertUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: "AI",
          last_name: label,
          email: uniqueEmail(`ai.${label}`),
          account_status: 1,
        })
        .returning(["id"]);
      createdUserIds.push(Number(row.id));
      return Number(row.id);
    };
    userA = await insertUser("owner-a");
    userB = await insertUser("owner-b");

    const insertBusiness = async (ownerId: number, label: string) => {
      const [row] = await masterKnex("businesses")
        .insert({
          owner_id: ownerId,
          subdomain: `ai-${label}-${runId}`,
          business_name: `AI ${label} ${runId}`,
          account_status: 1,
          status: "active",
        })
        .returning(["id", "schema_name"]);
      return { id: Number(row.id), schema: row.schema_name as string };
    };
    const a = await insertBusiness(userA, "a");
    const b = await insertBusiness(userB, "b");
    bizA = a.id;
    bizB = b.id;

    // Wallets. Free credits for the users (the AI-chat bucket), purchased credits
    // for the businesses (they have no free bucket — see 20260816_004).
    const insertUserWallet = async (userId: number) => {
      const [row] = await masterKnex("credit_wallets")
        .insert({ owner_type: "user", platform_user_id: userId, free_balance: START_CREDITS })
        .returning(["id"]);
      return Number(row.id);
    };
    const insertBizWallet = async (businessId: number) => {
      const [row] = await masterKnex("credit_wallets")
        .insert({
          owner_type: "business",
          business_id: businessId,
          purchased_balance: START_CREDITS,
          balance: START_CREDITS,
        })
        .returning(["id"]);
      return Number(row.id);
    };
    userWalletA = await insertUserWallet(userA);
    userWalletB = await insertUserWallet(userB);
    bizWalletA = await insertBizWallet(bizA);
    bizWalletB = await insertBizWallet(bizB);

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "ai@vitest.local", ...claims }, config.JWT_SECRET as string);

    tokenA = sign({ sub: String(userA), type: "platform_user" });
    tokenB = sign({ sub: String(userB), type: "platform_user" });
    tokenBizA = sign({ sub: String(userA), type: "platform_user", orgId: a.schema });
    tokenBizB = sign({ sub: String(userB), type: "platform_user", orgId: b.schema });

    provider.setAiProvider(makeProvider());
  });

  afterAll(async () => {
    provider?.setAiProvider(null);
    await app?.close();

    if (masterKnex) {
      // Wallets, ledger rows, sessions, messages and usage events all cascade from
      // their owner, and the businesses cascade from theirs — so removing the users
      // removes everything this suite wrote about them.
      // Guest rows are keyed by a hash, so there is no run marker to match on —
      // but nothing else in the suite set writes this table.
      await masterKnex("ai_guest_chat_sessions").where("created_at", ">=", suiteStart).del();
      await masterKnex("businesses").whereIn("id", [bizA, bizB]).del();
      await masterKnex("platform_users").whereIn("id", createdUserIds).del();
      if (extractionJobId) {
        await masterKnex("superadmin.extraction_visas").where("visa_stream", "like", `%${runId}`).del();
        await masterKnex("superadmin.extraction_mara_agents").where({ marn: `MARN-${runId}` }).del();
        // courses / institution overview / agents cascade from the job.
        await masterKnex("superadmin.extraction_jobs").where({ id: extractionJobId }).del();
      }
    }

    await shutdownPools?.();
    await masterKnex?.destroy();
  });

  // ── helpers ────────────────────────────────────────────────────────────────

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (url: string, token: string) => app.inject({ method: "GET", url, headers: auth(token) });
  const post = (url: string, token: string, payload: unknown = {}) =>
    app.inject({ method: "POST", url, headers: auth(token), payload: payload as object });

  const chat = (token: string, payload: Record<string, unknown> = { content: "Where should I study?" }) =>
    post("/api/v3/ai-chat/messages", token, payload);

  /** Spendable total, which is what the counsellor charges against. */
  async function walletTotal(walletId: number): Promise<number> {
    const row = await masterKnex("credit_wallets").where({ id: walletId }).first();
    return Number(row.free_balance) + Number(row.subscription_balance) + Number(row.purchased_balance);
  }

  async function usageRows(where: Record<string, unknown>) {
    return masterKnex("ai_usage_events").where(where).orderBy("id");
  }

  async function ledgerRows(walletId: number) {
    return masterKnex("credit_transactions").where({ wallet_id: walletId }).orderBy("id");
  }

  /** Pull one SSE event's JSON payload out of an injected response body. */
  function sseEvent(payload: string, event: string): Record<string, unknown> | undefined {
    for (const frame of payload.split("\n\n")) {
      const lines = frame.split("\n");
      if (lines[0]?.trim() !== `event: ${event}`) continue;
      const data = lines.find((l) => l.startsWith("data:"));
      if (data) return JSON.parse(data.slice(5).trim());
    }
    return undefined;
  }

  const scopeOf = (kind: "user" | "business", userId: number, businessId: number | null) =>
    ({ ownerType: kind, userId, businessId } as Parameters<typeof metering.settleTurn>[0]["scope"]);

  // ── guards ─────────────────────────────────────────────────────────────────

  describe("guards", () => {
    it("rejects an unauthenticated chat", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/ai-chat/messages",
        payload: { content: "hello" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("leaves the guest surface open", async () => {
      // No token: it must not be a 401. The fingerprint gate is what limits it.
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/ai-chat/guest/messages",
        payload: { content: "hi", fingerprint: `fp-open-${runId}` },
      });
      expect(res.statusCode).not.toBe(401);
    });
  });

  // ── fail closed ────────────────────────────────────────────────────────────

  describe("provider fail-closed", () => {
    it("returns 503 and writes nothing when no API key is configured", async () => {
      provider.setAiProvider(null);
      const key = config.GEMINI_API_KEY;
      delete config.GEMINI_API_KEY;

      const before = await walletTotal(userWalletA);
      const usageBefore = (await usageRows({ platform_user_id: userA })).length;

      const res = await chat(tokenA);

      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe("AI_PROVIDER_UNAVAILABLE");
      // Not a fake answer and not an empty stream: a JSON error with real headers.
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.payload).not.toContain("data:");

      expect(await walletTotal(userWalletA)).toBe(before);
      expect((await usageRows({ platform_user_id: userA })).length).toBe(usageBefore);

      if (key !== undefined) config.GEMINI_API_KEY = key;
      provider.setAiProvider(makeProvider());
    });

    it("returns 503 on the guest surface too", async () => {
      provider.setAiProvider(null);
      const key = config.GEMINI_API_KEY;
      delete config.GEMINI_API_KEY;

      const res = await app.inject({
        method: "POST",
        url: "/api/v3/ai-chat/guest/messages",
        payload: { content: "hi", fingerprint: `fp-503-${runId}` },
      });

      expect(res.statusCode).toBe(503);
      expect(res.payload).not.toContain("data:");

      if (key !== undefined) config.GEMINI_API_KEY = key;
      provider.setAiProvider(makeProvider());
    });
  });

  // ── metering ───────────────────────────────────────────────────────────────

  describe("metering", () => {
    it("charges a completed turn once, against the tokens the provider reported", async () => {
      const before = await walletTotal(userWalletA);
      const res = await chat(tokenA);
      expect(res.statusCode).toBe(200);

      const usage = sseEvent(res.payload, "usage");
      expect(usage?.credits_charged).toBe(FULL_TURN_CREDITS);

      const session = sseEvent(res.payload, "session");
      const turnId = session?.turn_id as string;
      expect(turnId).toBeTruthy();

      const rows = await usageRows({ idempotency_key: `ai-turn:${turnId}` });
      expect(rows).toHaveLength(1);
      expect(rows[0].owner_type).toBe("user");
      expect(rows[0].platform_user_id).toBe(userA);
      expect(rows[0].business_id).toBeNull();
      expect(rows[0].model).toBe("gemini-3.5-flash");
      expect(rows[0].prompt_tokens).toBe(STUB_USAGE.promptTokens);
      expect(rows[0].completion_tokens).toBe(STUB_USAGE.completionTokens);
      expect(rows[0].total_tokens).toBe(STUB_USAGE.totalTokens);
      expect(Number(rows[0].cost_micros)).toBeGreaterThan(0);
      expect(rows[0].credits_charged).toBe(FULL_TURN_CREDITS);
      expect(rows[0].outcome).toBe("complete");

      expect(await walletTotal(userWalletA)).toBe(before - FULL_TURN_CREDITS);
    });

    it("settles a turn exactly once under genuinely concurrent settlements", async () => {
      const turnId = `concurrent-${runId}`;
      const before = await walletTotal(userWalletB);

      const input = {
        turnId,
        scope: scopeOf("user", userB, null),
        sessionId: null,
        messageId: null,
        model: "gemini-3.5-flash",
        promptTokens: STUB_USAGE.promptTokens,
        completionTokens: STUB_USAGE.completionTokens,
        outcome: "complete" as const,
      };

      const results = await Promise.all([
        metering.settleTurn(input),
        metering.settleTurn(input),
        metering.settleTurn(input),
        metering.settleTurn(input),
        metering.settleTurn(input),
      ]);

      // The ledger, not the responses, is the assertion that matters.
      const rows = await usageRows({ idempotency_key: `ai-turn:${turnId}` });
      expect(rows).toHaveLength(1);
      expect(rows[0].credits_charged).toBe(FULL_TURN_CREDITS);

      const ledger = await masterKnex("credit_transactions")
        .where({ wallet_id: userWalletB })
        .andWhere("idempotency_key", "like", `ai-turn:${turnId}:%`);
      expect(ledger).toHaveLength(1);
      expect(Number(ledger[0].amount)).toBe(-FULL_TURN_CREDITS);

      expect(await walletTotal(userWalletB)).toBe(before - FULL_TURN_CREDITS);

      // Exactly one winner; every other attempt reported itself a duplicate.
      expect(results.filter((r) => r.metered)).toHaveLength(1);
      expect(results.filter((r) => r.duplicate)).toHaveLength(4);
    });

    it("charges each concurrent request once, and only once", async () => {
      const before = await walletTotal(userWalletA);
      const responses = await Promise.all([chat(tokenA), chat(tokenA), chat(tokenA)]);

      const turnIds = responses.map((r) => sseEvent(r.payload, "session")?.turn_id as string);
      expect(new Set(turnIds).size).toBe(3);

      for (const turnId of turnIds) {
        expect(await usageRows({ idempotency_key: `ai-turn:${turnId}` })).toHaveLength(1);
      }
      expect(await walletTotal(userWalletA)).toBe(before - 3 * FULL_TURN_CREDITS);
    });

    it("does not overcharge a stream that dies mid-answer, and cannot be charged twice", async () => {
      provider.setAiProvider(makeProvider({ failAfterChunks: 3 }));
      const before = await walletTotal(userWalletA);

      const res = await chat(tokenA);
      const turnId = sseEvent(res.payload, "session")?.turn_id as string;
      expect(turnId).toBeTruthy();

      const rows = await usageRows({ idempotency_key: `ai-turn:${turnId}` });
      expect(rows).toHaveLength(1);
      expect(rows[0].outcome).toBe("interrupted");
      // Only the delivered chunks are metered; the provider reported nothing.
      expect(rows[0].completion_tokens).toBeGreaterThan(0);
      expect(rows[0].completion_tokens).toBeLessThan(STUB_USAGE.completionTokens);

      const charged = rows[0].credits_charged;
      expect(charged).toBeGreaterThan(0);
      expect(charged).toBeLessThanOrEqual(FULL_TURN_CREDITS);
      const afterInterrupt = await walletTotal(userWalletA);
      expect(afterInterrupt).toBe(before - charged);

      // Replaying the very same turn — the retry a client or a reconnect would do —
      // takes nothing, because the usage row is the gate.
      const replay = await metering.settleTurn({
        turnId,
        scope: scopeOf("user", userA, null),
        sessionId: null,
        messageId: null,
        model: "gemini-3.5-flash",
        promptTokens: STUB_USAGE.promptTokens,
        completionTokens: STUB_USAGE.completionTokens,
        outcome: "complete",
      });
      expect(replay.duplicate).toBe(true);
      expect(replay.charged).toBe(0);
      expect(await usageRows({ idempotency_key: `ai-turn:${turnId}` })).toHaveLength(1);
      expect(await walletTotal(userWalletA)).toBe(afterInterrupt);

      provider.setAiProvider(makeProvider());
    });

    it("meters nothing when the stream fails before delivering a token", async () => {
      provider.setAiProvider(makeProvider({ failAfterChunks: 0 }));
      const before = await walletTotal(userWalletA);
      const usageBefore = (await usageRows({ platform_user_id: userA })).length;

      const res = await chat(tokenA);
      expect(res.statusCode).toBe(200);

      expect(await walletTotal(userWalletA)).toBe(before);
      expect((await usageRows({ platform_user_id: userA })).length).toBe(usageBefore);

      provider.setAiProvider(makeProvider());
    });

    it("meters only what the socket accepted when the client walks away mid-answer", async () => {
      // A client that disconnects is not a provider failure: the answer completes
      // and the provider reports its full usage. Only the bytes the socket took
      // were delivered, so only those may be charged. Driven through the service
      // rather than inject(), because a dead socket is the whole point.
      const chatService = await import("../../src/modules/ai-counsellor/services/chat.service.js");

      let deltas = 0;
      const raw = {
        destroyed: false,
        writeHead() {},
        write(chunk: unknown) {
          // Named frames (session, trace, sources) are bookkeeping; only the
          // data-only frames carry answer text.
          if (String(chunk).startsWith("data: {")) {
            deltas += 1;
            if (deltas >= 3) raw.destroyed = true; // three chunks in, the client is gone
          }
          return true;
        },
        end() {},
      };
      const before = await walletTotal(userWalletA);
      const [{ max: previousId }] = await masterKnex("ai_usage_events").max("id as max");

      await chatService.handleMessage({
        scope: scopeOf("user", userA, null),
        content: "Where should I study?",
        reply: { raw } as unknown as Parameters<typeof chatService.handleMessage>[0]["reply"],
      });

      const row = await masterKnex("ai_usage_events")
        .where({ platform_user_id: userA })
        .orderBy("id", "desc")
        .first();

      // The row must be this turn's, not a leftover from the case before it.
      expect(Number(row.id)).toBeGreaterThan(Number(previousId ?? 0));
      expect(deltas).toBe(3);
      expect(row.outcome).toBe("interrupted");
      expect(row.completion_tokens).toBeGreaterThan(0);
      expect(row.completion_tokens).toBeLessThan(STUB_USAGE.completionTokens);
      expect(row.credits_charged).toBeLessThan(FULL_TURN_CREDITS);
      expect(await walletTotal(userWalletA)).toBe(before - row.credits_charged);
    });

    it("returns 402 with no usage row when the wallet is empty", async () => {
      const [emptyUser] = await masterKnex("platform_users")
        .insert({ first_name: "AI", last_name: "Broke", email: uniqueEmail("ai.broke"), account_status: 1 })
        .returning(["id"]);
      const brokeId = Number(emptyUser.id);
      createdUserIds.push(brokeId);
      await masterKnex("credit_wallets").insert({
        owner_type: "user",
        platform_user_id: brokeId,
        free_balance: 0,
      });

      const jwt = (await import("jsonwebtoken")).default;
      const brokeToken = jwt.sign(
        { sub: String(brokeId), type: "platform_user", email: "broke@vitest.local" },
        config.JWT_SECRET as string,
      );

      const res = await chat(brokeToken);
      expect(res.statusCode).toBe(402);
      expect(res.json().code).toBe("PAYMENT_REQUIRED");
      expect(await usageRows({ platform_user_id: brokeId })).toHaveLength(0);
      expect(await masterKnex("ai_counselor_sessions").where({ platform_user_id: brokeId })).toHaveLength(0);
    });

    it("clamps the charge to what the wallet holds rather than going negative", async () => {
      const [thin] = await masterKnex("platform_users")
        .insert({ first_name: "AI", last_name: "Thin", email: uniqueEmail("ai.thin"), account_status: 1 })
        .returning(["id"]);
      const thinId = Number(thin.id);
      createdUserIds.push(thinId);
      const [wallet] = await masterKnex("credit_wallets")
        .insert({ owner_type: "user", platform_user_id: thinId, free_balance: 1 })
        .returning(["id"]);

      const settled = await metering.settleTurn({
        turnId: `thin-${runId}`,
        scope: scopeOf("user", thinId, null),
        sessionId: null,
        messageId: null,
        model: "gemini-3.5-flash",
        promptTokens: STUB_USAGE.promptTokens,
        completionTokens: STUB_USAGE.completionTokens,
        outcome: "complete",
      });

      expect(settled.charged).toBe(1);
      expect(await walletTotal(Number(wallet.id))).toBe(0);
    });

    it("spends free credits before purchased ones", async () => {
      const [mixed] = await masterKnex("platform_users")
        .insert({ first_name: "AI", last_name: "Mixed", email: uniqueEmail("ai.mixed"), account_status: 1 })
        .returning(["id"]);
      const mixedId = Number(mixed.id);
      createdUserIds.push(mixedId);
      const [wallet] = await masterKnex("credit_wallets")
        .insert({
          owner_type: "user",
          platform_user_id: mixedId,
          free_balance: 2,
          purchased_balance: 50,
          balance: 50,
        })
        .returning(["id"]);
      const walletId = Number(wallet.id);

      await metering.settleTurn({
        turnId: `mixed-${runId}`,
        scope: scopeOf("user", mixedId, null),
        sessionId: null,
        messageId: null,
        model: "gemini-3.5-flash",
        promptTokens: STUB_USAGE.promptTokens,
        completionTokens: STUB_USAGE.completionTokens,
        outcome: "complete",
      });

      const row = await masterKnex("credit_wallets").where({ id: walletId }).first();
      expect(Number(row.free_balance)).toBe(0);
      expect(Number(row.purchased_balance)).toBe(50 - (FULL_TURN_CREDITS - 2));
      // The split stays auditable: one ledger row per bucket that moved.
      const ledger = await ledgerRows(walletId);
      expect(ledger.map((r) => r.balance_type).sort()).toEqual(["free", "purchased"]);
      expect(ledger.reduce((sum, r) => sum + Number(r.amount), 0)).toBe(-FULL_TURN_CREDITS);
    });
  });

  // ── wallet scoping ─────────────────────────────────────────────────────────

  describe("wallet scoping", () => {
    it("debits the business wallet in a business context and leaves the user's alone", async () => {
      const bizBefore = await walletTotal(bizWalletA);
      const userBefore = await walletTotal(userWalletA);

      const res = await chat(tokenBizA);
      expect(res.statusCode).toBe(200);
      const turnId = sseEvent(res.payload, "session")?.turn_id as string;

      const rows = await usageRows({ idempotency_key: `ai-turn:${turnId}` });
      expect(rows).toHaveLength(1);
      expect(rows[0].owner_type).toBe("business");
      expect(rows[0].business_id).toBe(bizA);

      expect(await walletTotal(bizWalletA)).toBe(bizBefore - FULL_TURN_CREDITS);
      expect(await walletTotal(userWalletA)).toBe(userBefore);

      // Written through billing's own ledger vocabulary.
      const ledger = await masterKnex("credit_transactions")
        .where({ wallet_id: bizWalletA })
        .andWhere({ idempotency_key: `ai-turn:${turnId}:business` });
      expect(ledger).toHaveLength(1);
      expect(ledger[0].transaction_type).toBe("ai_deduct");
      expect(Number(ledger[0].amount)).toBe(-FULL_TURN_CREDITS);
    });

    it("debits the user wallet in a personal context and leaves the business's alone", async () => {
      const bizBefore = await walletTotal(bizWalletA);
      const userBefore = await walletTotal(userWalletA);

      const res = await chat(tokenA);
      expect(res.statusCode).toBe(200);

      expect(await walletTotal(userWalletA)).toBe(userBefore - FULL_TURN_CREDITS);
      expect(await walletTotal(bizWalletA)).toBe(bizBefore);
    });

    it("never lets one business reach another's wallet", async () => {
      const otherBefore = await walletTotal(bizWalletB);
      await chat(tokenBizA);
      expect(await walletTotal(bizWalletB)).toBe(otherBefore);
    });

    it("reports the wallet of the caller's current scope, not both", async () => {
      const personal = await get("/api/v3/ai-chat/credits/balance", tokenA);
      const business = await get("/api/v3/ai-chat/credits/balance", tokenBizA);

      expect(personal.statusCode).toBe(200);
      expect(business.statusCode).toBe(200);
      expect(personal.json().total).toBe(await walletTotal(userWalletA));
      expect(business.json().total).toBe(await walletTotal(bizWalletA));
      // Businesses have no free bucket; that one belongs to the AI-chat signup grant.
      expect(business.json().free).toBe(0);
      expect(personal.json().total).not.toBe(business.json().total);
    });
  });

  // ── session isolation ──────────────────────────────────────────────────────

  describe("session isolation", () => {
    let personalSessionId = 0;
    let businessSessionId = 0;

    beforeAll(async () => {
      const personal = await chat(tokenA);
      personalSessionId = Number(sseEvent(personal.payload, "session")?.id);
      const business = await chat(tokenBizA);
      businessSessionId = Number(sseEvent(business.payload, "session")?.id);
      expect(personalSessionId).toBeGreaterThan(0);
      expect(businessSessionId).toBeGreaterThan(0);
      expect(personalSessionId).not.toBe(businessSessionId);
    });

    it("lists only the sessions of the calling scope", async () => {
      const personal = await get("/api/v3/ai-chat/sessions", tokenA);
      const business = await get("/api/v3/ai-chat/sessions", tokenBizA);

      const personalIds = personal.json().sessions.map((s: { id: number }) => s.id);
      const businessIds = business.json().sessions.map((s: { id: number }) => s.id);

      expect(personalIds).toContain(personalSessionId);
      expect(personalIds).not.toContain(businessSessionId);
      expect(businessIds).toContain(businessSessionId);
      expect(businessIds).not.toContain(personalSessionId);
    });

    it("refuses to read a business session from a personal context", async () => {
      const res = await get(`/api/v3/ai-chat/sessions/${businessSessionId}/messages`, tokenA);
      expect(res.statusCode).toBe(403);
    });

    it("refuses to read a personal session from a business context", async () => {
      const res = await get(`/api/v3/ai-chat/sessions/${personalSessionId}/messages`, tokenBizA);
      expect(res.statusCode).toBe(403);
    });

    it("refuses to read another business's session", async () => {
      const res = await get(`/api/v3/ai-chat/sessions/${businessSessionId}/messages`, tokenBizB);
      expect(res.statusCode).toBe(403);
    });

    it("refuses to read another user's personal session", async () => {
      const res = await get(`/api/v3/ai-chat/sessions/${personalSessionId}/messages`, tokenB);
      expect(res.statusCode).toBe(403);
    });

    it("refuses to continue a session belonging to the other scope", async () => {
      const before = await masterKnex("ai_counselor_messages")
        .where({ session_id: businessSessionId })
        .count<{ count: string }[]>("* as count");
      const walletBefore = await walletTotal(userWalletA);

      const res = await chat(tokenA, { content: "carry on", session_id: businessSessionId });

      // The stream opens, the ownership check fails, and the turn leaves no trace:
      // no message appended, no usage row, no credit spent.
      const after = await masterKnex("ai_counselor_messages")
        .where({ session_id: businessSessionId })
        .count<{ count: string }[]>("* as count");
      expect(Number(after[0].count)).toBe(Number(before[0].count));

      const turnId = sseEvent(res.payload, "session")?.turn_id;
      expect(turnId).toBeUndefined();
      expect(await walletTotal(userWalletA)).toBe(walletBefore);
      expect(
        await masterKnex("ai_usage_events")
          .where({ session_id: businessSessionId, owner_type: "user" }),
      ).toHaveLength(0);
    });

    it("refuses to rename a session belonging to the other scope", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v3/ai-chat/sessions/${businessSessionId}`,
        headers: auth(tokenA),
        payload: { title: "stolen" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── guest migration ────────────────────────────────────────────────────────

  describe("guest migration", () => {
    async function seedGuest(label: string): Promise<string> {
      const hash = `guest-${label}-${runId}`;
      const expires = new Date(Date.now() + 7 * 86_400_000);
      await masterKnex("ai_guest_chat_sessions").insert({
        fingerprint_hash: hash,
        message_content: "What can I study in Australia?",
        response_content: "Plenty. Here is a start.",
        response_sources: JSON.stringify([{ type: "course", id: "c1", title: "BSc" }]),
        expires_at: expires,
      });
      return hash;
    }

    it("moves the transcript into the caller's own history", async () => {
      const hash = await seedGuest("happy");
      const res = await post("/api/v3/ai-chat/guest/migrate", tokenA, { fingerprint_hash: hash });

      expect(res.statusCode).toBe(200);
      const { session_id: sessionId, migrated } = res.json();
      expect(migrated).toBe(true);
      expect(sessionId).toBeGreaterThan(0);

      const session = await masterKnex("ai_counselor_sessions").where({ id: sessionId }).first();
      expect(Number(session.platform_user_id)).toBe(userA);
      expect(session.owner_type).toBe("user");
      expect(session.business_id).toBeNull();
      expect(Number(session.message_count)).toBe(2);

      const messages = await masterKnex("ai_counselor_messages")
        .where({ session_id: sessionId })
        .orderBy("id");
      expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
      expect(messages[0].content).toBe("What can I study in Australia?");

      const guest = await masterKnex("ai_guest_chat_sessions").where({ fingerprint_hash: hash }).first();
      expect(Number(guest.migrated_to_session_id)).toBe(sessionId);
    });

    it("is not re-migratable — a second call moves nothing", async () => {
      const hash = await seedGuest("once");
      const first = await post("/api/v3/ai-chat/guest/migrate", tokenA, { fingerprint_hash: hash });
      const second = await post("/api/v3/ai-chat/guest/migrate", tokenA, { fingerprint_hash: hash });

      expect(first.json().migrated).toBe(true);
      expect(second.statusCode).toBe(200);
      expect(second.json().migrated).toBe(false);
      expect(second.json().session_id).toBe(first.json().session_id);

      // One session, two messages. Not two sessions, not four messages.
      const sessions = await masterKnex("ai_counselor_sessions").whereIn(
        "id",
        masterKnex("ai_guest_chat_sessions").where({ fingerprint_hash: hash }).select("migrated_to_session_id"),
      );
      expect(sessions).toHaveLength(1);
      const messages = await masterKnex("ai_counselor_messages").where({ session_id: first.json().session_id });
      expect(messages).toHaveLength(2);
    });

    it("cannot be claimed twice by concurrent callers, nor land in two accounts", async () => {
      const hash = await seedGuest("race");
      const results = await Promise.all([
        post("/api/v3/ai-chat/guest/migrate", tokenA, { fingerprint_hash: hash }),
        post("/api/v3/ai-chat/guest/migrate", tokenB, { fingerprint_hash: hash }),
        post("/api/v3/ai-chat/guest/migrate", tokenA, { fingerprint_hash: hash }),
      ]);

      const bodies = results.map((r) => r.json());
      expect(bodies.filter((b) => b.migrated)).toHaveLength(1);
      const winner = bodies.find((b) => b.migrated)!.session_id;
      for (const body of bodies) expect(body.session_id).toBe(winner);

      const copies = await masterKnex("ai_counselor_messages").where({ session_id: winner });
      expect(copies).toHaveLength(2);
    });

    it("reports nothing to migrate for an unknown fingerprint", async () => {
      const res = await post("/api/v3/ai-chat/guest/migrate", tokenA, {
        fingerprint_hash: `never-existed-${runId}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ session_id: null, migrated: false });
    });

    it("refuses an expired transcript", async () => {
      const hash = `guest-stale-${runId}`;
      await masterKnex("ai_guest_chat_sessions").insert({
        fingerprint_hash: hash,
        message_content: "old question",
        response_content: "old answer",
        expires_at: new Date(Date.now() - 86_400_000),
      });

      const res = await post("/api/v3/ai-chat/guest/migrate", tokenA, { fingerprint_hash: hash });
      expect(res.json()).toEqual({ session_id: null, migrated: false });
    });

    it("requires authentication to migrate", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/ai-chat/guest/migrate",
        payload: { fingerprint_hash: `whatever-${runId}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });
  // ── session lifecycle & feedback ────────────────────────────────────────────

  describe("session lifecycle", () => {
    const patch = (url: string, token: string, payload: unknown) =>
      app.inject({ method: "PATCH", url, headers: auth(token), payload: payload as object });

    async function newSession(token: string): Promise<number> {
      const res = await chat(token);
      return Number(sseEvent(res.payload, "session")?.id);
    }

    it("renames a session", async () => {
      const id = await newSession(tokenA);
      const res = await patch(`/api/v3/ai-chat/sessions/${id}`, tokenA, { title: "My shortlist" });
      expect(res.statusCode).toBe(200);
      expect(res.json().title).toBe("My shortlist");
    });

    it("hides an archived session unless it is asked for", async () => {
      const id = await newSession(tokenA);
      expect((await patch(`/api/v3/ai-chat/sessions/${id}`, tokenA, { is_archived: true })).statusCode).toBe(200);

      const plain = await get("/api/v3/ai-chat/sessions", tokenA);
      const withArchived = await get("/api/v3/ai-chat/sessions?include_archived=true", tokenA);
      const ids = (res: typeof plain) => res.json().sessions.map((s: { id: number }) => s.id);

      expect(ids(plain)).not.toContain(id);
      expect(ids(withArchived)).toContain(id);
    });

    it("soft-deletes a session and stops serving it", async () => {
      const id = await newSession(tokenA);
      expect((await patch(`/api/v3/ai-chat/sessions/${id}`, tokenA, { delete: true })).statusCode).toBe(200);

      const listed = await get("/api/v3/ai-chat/sessions?include_archived=true", tokenA);
      expect(listed.json().sessions.map((s: { id: number }) => s.id)).not.toContain(id);
      expect((await get(`/api/v3/ai-chat/sessions/${id}/messages`, tokenA)).statusCode).toBe(404);
    });

    it("404s an unknown session", async () => {
      expect((await get("/api/v3/ai-chat/sessions/99999999/messages", tokenA)).statusCode).toBe(404);
    });

    it("serves the transcript of a session the caller owns", async () => {
      const id = await newSession(tokenA);
      const res = await get(`/api/v3/ai-chat/sessions/${id}/messages`, tokenA);
      expect(res.statusCode).toBe(200);
      expect(res.json().messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    });

    it("records feedback on the caller's own message, and nobody else's", async () => {
      const id = await newSession(tokenA);
      const message = await masterKnex("ai_counselor_messages")
        .where({ session_id: id, role: "assistant" })
        .first();

      const ok = await patch(`/api/v3/ai-chat/messages/${message.id}/feedback`, tokenA, {
        feedback: "positive",
      });
      expect(ok.statusCode).toBe(200);
      const stored = await masterKnex("ai_counselor_messages").where({ id: message.id }).first();
      expect(stored.feedback).toBe("positive");

      const stranger = await patch(`/api/v3/ai-chat/messages/${message.id}/feedback`, tokenB, {
        feedback: "negative",
      });
      expect(stranger.statusCode).toBe(403);
      const unchanged = await masterKnex("ai_counselor_messages").where({ id: message.id }).first();
      expect(unchanged.feedback).toBe("positive");
    });

    it("404s feedback on a message that does not exist", async () => {
      const res = await patch("/api/v3/ai-chat/messages/99999999/feedback", tokenA, { feedback: "positive" });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── admin credit grant ─────────────────────────────────────────────────────

  describe("credit grant", () => {
    it("lets an admin top up a user wallet and records the ledger row", async () => {
      const jwt = (await import("jsonwebtoken")).default;
      const adminToken = jwt.sign(
        { sub: "1", type: "admin", role: "super_admin", email: "admin@vitest.local" },
        config.JWT_SECRET as string,
      );

      const before = await walletTotal(userWalletB);
      const res = await post("/api/v3/ai-chat/credits/grant", adminToken, {
        user_id: userB,
        amount: 25,
        balance_type: "purchased",
        reason: "admin_grant",
      });

      expect(res.statusCode).toBe(200);
      expect(await walletTotal(userWalletB)).toBe(before + 25);

      const ledger = await masterKnex("credit_transactions")
        .where({ wallet_id: userWalletB, reason: "admin_grant" })
        .orderBy("id", "desc")
        .first();
      expect(Number(ledger.amount)).toBe(25);
      expect(ledger.transaction_type).toBe("manual_adjustment");
    });

    it("refuses a non-admin", async () => {
      const res = await post("/api/v3/ai-chat/credits/grant", tokenA, {
        user_id: userA,
        amount: 1_000,
        balance_type: "purchased",
        reason: "admin_grant",
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── retrieval grounding ────────────────────────────────────────────────────
  //
  // Retrieval itself is E1's module; what is asserted here is the counsellor's half
  // of the contract: whatever the knowledge layer returns reaches the prompt and is
  // announced to the client as a source.

  describe("retrieval", () => {
    // Unique per run: extraction_visas has a natural-key unique index, so a second
    // run of this suite must not re-insert the same row.
    let keyword = "";

    beforeAll(async () => {
      keyword = `zorbistan${runId}`;
      await masterKnex("superadmin.extraction_visas").insert({
        country_code: "ZB",
        subclass_code: "500",
        // Part of extraction_visas_natural_key, so this is what keeps runs distinct.
        visa_stream: keyword,
        category: "study",
        name: `${keyword} student visa`,
        description: `A study visa for ${keyword}.`,
        duration_months: 24,
        application_fee_amount: 710,
        application_fee_currency: "AUD",
        processing_time_min_days: 20,
        processing_time_max_days: 60,
        official_url: "https://example.test/visa",
      });
      // A course only reaches the prompt through its institution, which only exists
      // inside an extraction job — so the whole chain is seeded, not stubbed.
      const [job] = await masterKnex("superadmin.extraction_jobs")
        .insert({ institution_url: `https://${keyword}.test` })
        .returning(["id"]);
      extractionJobId = job.id;
      await masterKnex("superadmin.extraction_institution_overview").insert({
        job_id: job.id,
        name: `${keyword} University`,
        country: "Zorbistan",
        city: "Zorb City",
        website: `https://${keyword}.test`,
        description: `A university in ${keyword}.`,
      });
      await masterKnex("superadmin.extraction_courses").insert({
        job_id: job.id,
        name: `${keyword} BSc Computing`,
        degree_level: "Bachelor",
        subject_area: "Computing",
        duration_weeks: 156,
        country_code: "ZB",
        source_url: `https://${keyword}.test/bsc`,
        description: `A computing degree in ${keyword}.`,
      });
      await masterKnex("superadmin.extraction_agents").insert({
        job_id: job.id,
        name: `${keyword} Education Agents`,
        country: "Zorbistan",
        city: "Zorb City",
        website: `https://agents.${keyword}.test`,
        location_count: 1,
      });
      await masterKnex("superadmin.extraction_mara_agents").insert({
        marn: `MARN-${runId}`,
        agent_name: `${keyword} Migration`,
        business_name: `${keyword} Migration Pty`,
        registration_status: "active",
        office_country: "Australia",
        practice_areas: ["student visas"],
        status: "pending",
      });
    });

    it("announces the retrieved rows as sources and traces the search", async () => {
      // rag.service joins the surviving keywords into one LIKE phrase, so the
      // question has to be the phrase — that is the retrieval layer's own shape.
      const res = await chat(tokenA, { content: keyword });
      expect(res.statusCode).toBe(200);

      const sources = sseEvent(res.payload, "sources") as unknown as Array<{ type: string }>;
      expect(sources).toBeTruthy();
      const types = sources.map((s) => s.type);
      expect(types).toContain("course");
      expect(types).toContain("institution");
      expect(types).toContain("visa");
      expect(types).toContain("agent");
      expect(types).toContain("mara_agent");

      expect(res.payload).toContain("event: trace");
    });

    it("says so, rather than searching, when the question carries no keywords", async () => {
      const res = await chat(tokenA, { content: "is it a the" });
      expect(res.statusCode).toBe(200);
      expect(res.payload).toContain("No searchable keywords extracted");
      expect(sseEvent(res.payload, "sources")).toBeUndefined();
    });
  });

  // ── guest chat ─────────────────────────────────────────────────────────────

  describe("guest chat", () => {
    const guest = (fingerprint: string, content = "What can I study?") =>
      app.inject({
        method: "POST",
        url: "/api/v3/ai-chat/guest/messages",
        payload: { content, fingerprint },
      });

    /** The transcript write is fire-and-forget; give it the ticks it needs. */
    async function waitForGuestRow(hash: string): Promise<Record<string, unknown>> {
      for (let i = 0; i < 60; i++) {
        const row = await masterKnex("ai_guest_chat_sessions").where({ fingerprint_hash: hash }).first();
        if (row) return row;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(`guest transcript for ${hash} was never persisted`);
    }

    it("answers a first-time guest and stores the transcript", async () => {
      const fingerprint = `fp-first-${runId}`;
      const res = await guest(fingerprint);

      expect(res.statusCode).toBe(200);
      expect(res.payload).toContain("event: guest-meta");
      expect(res.payload).toContain("data: [DONE]");

      const hash = sseEvent(res.payload, "guest-meta")!.fingerprint_hash as string;
      const row = await waitForGuestRow(hash);
      expect(row.response_content).toContain("studying abroad");
      expect(row.migrated_to_session_id).toBeNull();
    });

    it("refuses a second reply to the same guest and never meters one", async () => {
      const fingerprint = `fp-second-${runId}`;
      const first = await guest(fingerprint);
      expect(first.statusCode).toBe(200);

      // The gate only closes once the first transcript has landed, and the hash the
      // stream reported is the only reliable way to wait for that exact row.
      const hash = sseEvent(first.payload, "guest-meta")!.fingerprint_hash as string;
      await waitForGuestRow(hash);

      const second = await guest(fingerprint);
      expect(second.statusCode).toBe(403);
      // Guest turns are never metered: there is no wallet to debit.
      expect(await masterKnex("ai_usage_events").whereNull("platform_user_id")).toHaveLength(0);
    });
  });
});
