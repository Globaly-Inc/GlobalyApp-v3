// AI-embed widget (G7) — origin allowlist, fail-closed provider, budget gate,
// cross-tenant isolation, and the embed script.
//
// The cases come from what the feature MUST do, not from V1: V1's
// ai-embed-validate had no origin check at all and served
// `Access-Control-Allow-Origin: *`, so there is no legacy behaviour to reproduce
// here — only the §1.6 security bar to hold.
//
// Everything runs offline. The only outbound dependency is ai-counsellor's
// AiProvider interface, stubbed here; the fail-closed path is exercised by clearing
// the stub and asserting 503 rather than a fabricated answer or an empty stream.
//
// THE ASSERTION THAT MATTERS MOST is "refuses a disallowed origin". Deleting the
// `assertOriginAllowed` call from services/embed.service.ts must break this file —
// that is the mutation test recorded in the wave report.

import Fastify, { type FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable, uniqueEmail } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

type ProviderModule = typeof import("../../src/modules/ai-counsellor/services/provider.js");
type AiProvider = Parameters<ProviderModule["setAiProvider"]>[0] & object;

const ALLOWED_ORIGIN = "https://partner.example.com";
const OTHER_ALLOWED_ORIGIN = "https://school.edu.au:8443";
const ANSWER = "Studying in Australia usually starts with choosing an intake. ".repeat(4);

function makeProvider(): AiProvider {
  return {
    model: "gemini-3.5-flash",
    async streamChat({ onChunk }) {
      const chunkSize = 40;
      let delivered = "";
      for (let i = 0; i < ANSWER.length; i += chunkSize) {
        const chunk = ANSWER.slice(i, i + chunkSize);
        delivered += chunk;
        onChunk(chunk);
      }
      return {
        fullText: delivered,
        usage: { promptTokens: 900, completionTokens: 1_100, totalTokens: 2_000 },
      };
    },
    async generateTitle() {
      return "Embed chat";
    },
  };
}

/**
 * Poll until `read` returns a truthy value.
 *
 * Needed because an SSE response completes when `writeDone` ends the raw socket,
 * which is BEFORE the handler's post-stream bookkeeping (credit charge, transcript
 * write) has committed. `app.inject` resolves at the socket, so asserting on the
 * database immediately after it is a race — not a flaky test, a genuine ordering
 * property of streaming responses.
 */
async function waitFor<T>(read: () => Promise<T>, timeoutMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
}

describeDb("ai-embed widget", () => {
  let app: FastifyInstance;
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let cfg: Record<string, unknown>;
  let provider: ProviderModule;

  const createdUserIds: number[] = [];
  let userA = 0;
  let userB = 0;
  let bizA = 0;
  let bizB = 0;
  let tokenBizA = "";
  let tokenBizB = "";
  let tokenNoBiz = "";

  /** Active, in-budget, two allowed origins. The happy-path config. */
  let liveKey = "";
  let liveConfigId = 0;
  /** Active but with an EMPTY allowlist — must be usable from nowhere. */
  let noOriginKey = "";
  /** is_active = false. */
  let inactiveKey = "";
  /** credits_used_this_month >= monthly_credit_limit. */
  let exhaustedKey = "";
  /** Owned by business B — used for the cross-tenant checks. */
  let bizBConfigId = 0;

  const suiteStart = new Date();

  beforeAll(async () => {
    const jwt = (await import("jsonwebtoken")).default;
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config: cfg } = (await import("../../src/config.js")) as unknown as {
      config: Record<string, unknown>;
    });
    provider = await import("../../src/modules/ai-counsellor/services/provider.js");

    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const aiEmbedModule = (await import("../../src/modules/ai-embed/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(aiEmbedModule);
    await app.ready();

    const runId = `${process.pid}${Date.now() % 1_000_000}`;

    const insertUser = async (label: string) => {
      const [row] = await masterKnex("platform_users")
        .insert({
          first_name: "Embed",
          last_name: label,
          email: uniqueEmail(`embed.${label}`),
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
          subdomain: `embed-${label}-${runId}`,
          business_name: `Embed ${label} ${runId}`,
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

    const insertConfig = async (businessId: number, values: Record<string, unknown>) => {
      const [row] = await masterKnex("ai_embed_configs")
        .insert({ business_id: businessId, ...values })
        .returning(["id", "embed_key"]);
      return { id: Number(row.id), key: row.embed_key as string };
    };

    const live = await insertConfig(bizA, {
      display_name: "Partner Assistant",
      welcome_message: "Hi! Ask me about our courses.",
      starter_questions: ["What intakes are open?", "What are the fees?"],
      custom_instructions: "Only discuss our own programmes.",
      allowed_origins: [ALLOWED_ORIGIN, OTHER_ALLOWED_ORIGIN],
      monthly_credit_limit: 1000,
      is_active: true,
    });
    liveKey = live.key;
    liveConfigId = live.id;

    noOriginKey = (
      await insertConfig(bizA, {
        display_name: "No Origins",
        allowed_origins: [],
        is_active: true,
      })
    ).key;

    inactiveKey = (
      await insertConfig(bizA, {
        display_name: "Retired Widget",
        allowed_origins: [ALLOWED_ORIGIN],
        is_active: false,
      })
    ).key;

    exhaustedKey = (
      await insertConfig(bizA, {
        display_name: "Out Of Credits",
        allowed_origins: [ALLOWED_ORIGIN],
        monthly_credit_limit: 5,
        credits_used_this_month: 5,
        is_active: true,
      })
    ).key;

    bizBConfigId = (
      await insertConfig(bizB, {
        display_name: "Rival Widget",
        allowed_origins: ["https://rival.example.com"],
        is_active: true,
      })
    ).id;

    const sign = (claims: Record<string, unknown>) =>
      jwt.sign({ email: "embed@vitest.local", ...claims }, cfg.JWT_SECRET as string);
    tokenBizA = sign({ sub: String(userA), type: "platform_user", orgId: a.schema });
    tokenBizB = sign({ sub: String(userB), type: "platform_user", orgId: b.schema });
    tokenNoBiz = sign({ sub: String(userA), type: "platform_user" });

    provider.setAiProvider(makeProvider());
  });

  afterAll(async () => {
    provider?.setAiProvider(null);
    await app?.close();

    if (masterKnex) {
      await masterKnex("ai_guest_chat_sessions").where("created_at", ">=", suiteStart).del();
      // Configs cascade from businesses, businesses from their owners.
      await masterKnex("businesses").whereIn("id", [bizA, bizB]).del();
      await masterKnex("platform_users").whereIn("id", createdUserIds).del();
    }
    await shutdownPools?.();
  });

  const validate = (embedKey: string, origin?: string) =>
    app.inject({
      method: "POST",
      url: "/api/v3/ai-embed/validate",
      headers: origin ? { origin } : {},
      payload: { embed_key: embedKey },
    });

  const sendMessage = (embedKey: string, origin?: string) =>
    app.inject({
      method: "POST",
      url: "/api/v3/ai-embed/messages",
      headers: origin ? { origin } : {},
      payload: { embed_key: embedKey, content: "What intakes are open?", fingerprint: "fp-1" },
    });

  // ── THE ORIGIN ALLOWLIST ───────────────────────────────────────────────────
  // This block is the security core of the wave. Removing the origin check from
  // services/embed.service.ts must fail here.

  describe("origin allowlist", () => {
    it("accepts a request from an allowed origin", async () => {
      const res = await validate(liveKey, ALLOWED_ORIGIN);
      expect(res.statusCode).toBe(200);
      expect(res.json().config.display_name).toBe("Partner Assistant");
    });

    it("accepts every origin on the list, not just the first", async () => {
      const res = await validate(liveKey, OTHER_ALLOWED_ORIGIN);
      expect(res.statusCode).toBe(200);
    });

    it("REFUSES a disallowed origin with 403", async () => {
      const res = await validate(liveKey, "https://evil.example.com");
      expect(res.statusCode).toBe(403);
      // Refused, not "allowed with a warning": no config comes back.
      expect(res.json().config).toBeUndefined();
    });

    it("refuses a look-alike origin a suffix match would admit", async () => {
      for (const origin of [
        "https://partner.example.com.evil.test",
        "https://evil-partner.example.com",
        "https://sub.partner.example.com",
      ]) {
        const res = await validate(liveKey, origin);
        expect(res.statusCode, origin).toBe(403);
      }
    });

    it("refuses the same host on the wrong scheme or port", async () => {
      expect((await validate(liveKey, "http://partner.example.com")).statusCode).toBe(403);
      expect((await validate(liveKey, "https://partner.example.com:8443")).statusCode).toBe(403);
    });

    it("refuses a request with NO Origin header — a non-browser client gets nothing", async () => {
      // The whole point: CORS cannot make this decision, because curl ignores CORS.
      const res = await validate(liveKey);
      expect(res.statusCode).toBe(403);
    });

    it("refuses the opaque 'null' origin a sandboxed iframe sends", async () => {
      expect((await validate(liveKey, "null")).statusCode).toBe(403);
    });

    it("refuses every origin when the allowlist is empty", async () => {
      expect((await validate(noOriginKey, ALLOWED_ORIGIN)).statusCode).toBe(403);
      expect((await validate(noOriginKey, "https://anything.test")).statusCode).toBe(403);
    });

    it("guards /messages with the same check, before any provider call", async () => {
      const res = await sendMessage(liveKey, "https://evil.example.com");
      expect(res.statusCode).toBe(403);
      // A 403 body, not an SSE stream: nothing was generated and nothing was billed.
      expect(res.headers["content-type"]).not.toContain("text/event-stream");
    });
  });

  // ── KEY VALIDITY ───────────────────────────────────────────────────────────

  describe("embed key", () => {
    it("401s an unknown key", async () => {
      const res = await validate("00000000-0000-4000-8000-000000000000", ALLOWED_ORIGIN);
      expect(res.statusCode).toBe(401);
    });

    it("401s a deactivated config, indistinguishably from a wrong key", async () => {
      const res = await validate(inactiveKey, ALLOWED_ORIGIN);
      expect(res.statusCode).toBe(401);
      expect(res.json().error ?? res.json().message).toBeDefined();
    });

    it("400s a malformed key rather than querying with it", async () => {
      const res = await validate("not-a-uuid", ALLOWED_ORIGIN);
      expect(res.statusCode).toBe(400);
    });
  });

  // ── WHAT THE PUBLIC RESPONSE MAY CONTAIN ───────────────────────────────────

  describe("public config projection", () => {
    it("returns only the embed-safe fields", async () => {
      const res = await validate(liveKey, ALLOWED_ORIGIN);
      expect(Object.keys(res.json().config).sort()).toEqual([
        "brand_color",
        "display_name",
        "embed_key",
        "logo_url",
        "starter_questions",
        "welcome_message",
      ]);
    });

    it("never leaks the tenant's instructions, allowlist, ids or credit state", async () => {
      // V1 returned the credit counters and the scoping ids to the browser, and
      // returned the whole row again in its 402 body.
      const body = (await validate(liveKey, ALLOWED_ORIGIN)).payload;
      for (const leak of [
        "custom_instructions",
        "allowed_origins",
        "business_id",
        "monthly_credit_limit",
        "credits_used_this_month",
        "scoped_institution_ids",
        "Only discuss our own programmes",
      ]) {
        expect(body, leak).not.toContain(leak);
      }
    });
  });

  // ── BUDGET ─────────────────────────────────────────────────────────────────

  describe("monthly budget", () => {
    it("402s a widget that has spent its limit, with no config attached", async () => {
      const res = await validate(exhaustedKey, ALLOWED_ORIGIN);
      expect(res.statusCode).toBe(402);
      expect(res.json().config).toBeUndefined();
    });

    it("charges credits against the config after a completed turn", async () => {
      const before = await masterKnex("ai_embed_configs")
        .select("credits_used_this_month")
        .where({ id: liveConfigId })
        .first();

      const res = await sendMessage(liveKey, ALLOWED_ORIGIN);
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/event-stream");

      // creditsFor(900, 1100) with TOKENS_PER_CREDIT = 1000 → 2.
      const expected = Number(before.credits_used_this_month) + 2;
      const after = await waitFor(async () => {
        const row = await masterKnex("ai_embed_configs")
          .select("credits_used_this_month")
          .where({ id: liveConfigId })
          .first();
        return Number(row.credits_used_this_month) === expected ? row : null;
      });
      expect(Number(after?.credits_used_this_month)).toBe(expected);
    });

    it("persists the transcript against the embed config", async () => {
      const row = await waitFor(() =>
        masterKnex("ai_guest_chat_sessions")
          .select("embed_config_id", "message_content")
          .where({ embed_config_id: liveConfigId })
          .orderBy("id", "desc")
          .first(),
      );
      expect(row).toBeDefined();
      expect(row.message_content).toBe("What intakes are open?");
    });
  });

  // ── FAIL-CLOSED PROVIDER ───────────────────────────────────────────────────

  describe("fail-closed AI", () => {
    it("503s when no provider is configured — never a fabricated answer", async () => {
      provider.setAiProvider(null);
      try {
        const res = await sendMessage(liveKey, ALLOWED_ORIGIN);
        expect(res.statusCode).toBe(503);
        expect(res.headers["content-type"]).not.toContain("text/event-stream");
        // The V1 defect class this exists to prevent: HTTP 200 with content.
        expect(res.payload).not.toContain("data:");
      } finally {
        provider.setAiProvider(makeProvider());
      }
    });

    it("does not charge credits for a turn it refused to run", async () => {
      const before = await masterKnex("ai_embed_configs")
        .select("credits_used_this_month")
        .where({ id: liveConfigId })
        .first();

      provider.setAiProvider(null);
      try {
        await sendMessage(liveKey, ALLOWED_ORIGIN);
      } finally {
        provider.setAiProvider(makeProvider());
      }

      const after = await masterKnex("ai_embed_configs")
        .select("credits_used_this_month")
        .where({ id: liveConfigId })
        .first();
      expect(Number(after.credits_used_this_month)).toBe(Number(before.credits_used_this_month));
    });
  });

  // ── THE EMBED SCRIPT ───────────────────────────────────────────────────────

  describe("GET /widget.js", () => {
    it("serves JavaScript without a key", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v3/ai-embed/widget.js" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("javascript");
    });

    it("contains no provider credential and no embed key", async () => {
      const body = (await app.inject({ method: "GET", url: "/api/v3/ai-embed/widget.js" })).payload;
      expect(body).not.toContain("GEMINI");
      expect(body).not.toContain(liveKey);
      expect(body).not.toContain(cfg.JWT_SECRET as string);
    });

    it("reads the key only from its own script tag and takes no postMessage orders", async () => {
      const body = (await app.inject({ method: "GET", url: "/api/v3/ai-embed/widget.js" })).payload;
      expect(body).toContain("document.currentScript");
      // No channel for the host page to hand it a different tenant's key.
      expect(body).not.toContain("addEventListener(\"message\"");
      expect(body).not.toContain("window.postMessage");
    });

    it("renders model output as text, never as markup", async () => {
      const body = (await app.inject({ method: "GET", url: "/api/v3/ai-embed/widget.js" })).payload;
      // Assignment, not the word — the module comment says "never innerHTML".
      expect(body).not.toMatch(/\.innerHTML\s*=/);
      expect(body).not.toMatch(/insertAdjacentHTML/);
      expect(body).toContain("textContent");
    });
  });

  // ── OWNER CRUD + CROSS-TENANT ISOLATION ────────────────────────────────────

  describe("owner config management", () => {
    const auth = (token: string) => ({ authorization: `Bearer ${token}` });

    it("403s without business context", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/ai-embed/configs",
        headers: auth(tokenNoBiz),
      });
      expect(res.statusCode).toBe(403);
    });

    it("lists only the caller's own configs", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v3/ai-embed/configs",
        headers: auth(tokenBizA),
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().configs.map((c: { id: number }) => c.id);
      expect(ids).toContain(liveConfigId);
      expect(ids).not.toContain(bizBConfigId);
    });

    it("business B cannot patch business A's config", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v3/ai-embed/configs/${liveConfigId}`,
        headers: auth(tokenBizB),
        payload: { allowed_origins: ["https://attacker.test"] },
      });
      expect(res.statusCode).toBe(404);

      const row = await masterKnex("ai_embed_configs")
        .select("allowed_origins")
        .where({ id: liveConfigId })
        .first();
      expect(row.allowed_origins).toContain(ALLOWED_ORIGIN);
    });

    it("creates a config, normalising and requiring at least one origin", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/ai-embed/configs",
        headers: auth(tokenBizA),
        payload: {
          display_name: "New Widget",
          allowed_origins: ["https://Fresh.Example.COM/embed?x=1"],
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().config.allowed_origins).toEqual(["https://fresh.example.com"]);
    });

    it("rejects an empty allowlist at create time", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/ai-embed/configs",
        headers: auth(tokenBizA),
        payload: { display_name: "Open Widget", allowed_origins: [] },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects a javascript: origin — webUrl(), never z.string().url()", async () => {
      for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "*", "https://*.a.test"]) {
        const res = await app.inject({
          method: "POST",
          url: "/api/v3/ai-embed/configs",
          headers: auth(tokenBizA),
          payload: { display_name: "Bad", allowed_origins: [bad] },
        });
        expect(res.statusCode, bad).toBe(400);
      }
    });

    it("rejects a javascript: logo_url too", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v3/ai-embed/configs",
        headers: auth(tokenBizA),
        payload: {
          display_name: "Bad Logo",
          allowed_origins: [ALLOWED_ORIGIN],
          logo_url: "javascript:alert(1)",
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
