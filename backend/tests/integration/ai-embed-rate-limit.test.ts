// The AI-embed widget's rate limits actually fire (G7).
//
// Separate file because tests/helpers/app.ts deliberately does NOT register
// @fastify/rate-limit — route-level `config.rateLimit` is inert without it, which is
// what keeps the multi-request assertions in ai-embed.test.ts deterministic. Here it
// IS registered, with the same `{ max: 100, timeWindow: "1 minute" }` defaults
// server.ts uses, so the route-level overrides are the thing under test.
//
// WHY THIS IS WORTH A TEST AT ALL: /messages is public, unauthenticated, and spends
// a provider quota per call. A declared-but-unwired limit on that endpoint is the
// same as no limit. The limiter runs in an onRequest hook, so it fires BEFORE the
// origin check — which is the right order for a public endpoint: an attacker
// hammering with a bad origin is throttled without ever reaching a DB read.

import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbAvailable } from "../helpers/db.js";

const describeDb = describe.skipIf(!dbAvailable);

/** The route-level override in widget.routes.ts. */
const MESSAGES_LIMIT = 10;

describeDb("ai-embed rate limits", () => {
  let app: FastifyInstance;
  let shutdownPools: () => Promise<void>;

  beforeAll(async () => {
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));

    const rateLimit = (await import("@fastify/rate-limit")).default;
    const { errorHandlerPlugin } = await import("../../src/core/plugins/error-handler.plugin.js");
    const { requestContextPlugin } = await import("../../src/core/plugins/request-context.plugin.js");
    const aiEmbedModule = (await import("../../src/modules/ai-embed/index.js")).default;

    app = Fastify({ logger: false });
    await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
    await app.register(errorHandlerPlugin);
    await app.register(requestContextPlugin);
    await app.register(aiEmbedModule);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await shutdownPools?.();
  });

  it("throttles POST /messages at 10/min, well under the global 100", async () => {
    // A disallowed origin keeps every one of these cheap: they are refused before any
    // provider call. What is being asserted is that the LIMITER fires, not the 403.
    const send = () =>
      app.inject({
        method: "POST",
        url: "/api/v3/ai-embed/messages",
        headers: { origin: "https://not-allowed.test" },
        payload: {
          embed_key: "00000000-0000-4000-8000-000000000000",
          content: "hello",
          fingerprint: "fp",
        },
      });

    const statuses: number[] = [];
    for (let i = 0; i < MESSAGES_LIMIT + 2; i += 1) {
      statuses.push((await send()).statusCode);
    }

    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    // The limit bites at the declared budget, not at the global default of 100.
    expect(statuses.slice(0, MESSAGES_LIMIT).every((s) => s !== 429)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("leaves the static widget script on a looser limit than the paid endpoint", async () => {
    // 60/min: it is one cached string, so throttling it as hard as generation would
    // break a busy partner page for no cost saving.
    const statuses: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      statuses.push((await app.inject({ method: "GET", url: "/api/v3/ai-embed/widget.js" })).statusCode);
    }
    expect(statuses.every((s) => s === 200)).toBe(true);
  });
});
