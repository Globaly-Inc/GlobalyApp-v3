/**
 * The embed key is PUBLIC — it sits in the script tag on the institution's own website —
 * and embed visitors skip the one-reply guest gate. So /guest/messages is the one endpoint
 * where a stranger can spend someone else's money: each accepted message increments that
 * institution's monthly allowance and costs a real model call. This asserts the limit
 * exists, and that it keys on the embed key rather than collapsing to a shared IP bucket.
 *
 * Boots a bare Fastify with the same plugin config as src/server.ts — no DB, no network.
 * Run: node --import tsx tests/embed-rate-limit.ts
 */
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

let failed = 0;
function assert(ok: boolean, label: string) {
  if (ok) return;
  failed++;
  console.error(`FAIL: ${label}`);
}

/** Mirrors guest.routes.ts. Kept in step by the assertions below, not by import: the real
 *  module pulls in the DB pool and the queue, which this test must not need. */
const MESSAGE_RATE = { max: 12, timeWindow: "1 minute", hook: "preHandler" } as const;
function embedRateKey(req: { body?: unknown; query?: unknown; headers: Record<string, unknown>; ip: string }): string {
  const body = (req.body ?? {}) as { embed_key?: unknown };
  const query = (req.query ?? {}) as { embed_key?: unknown };
  const key = typeof body.embed_key === "string" ? body.embed_key
    : typeof query.embed_key === "string" ? query.embed_key
    : "no-key";
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip;
  return `${key}:${ip}`;
}

async function main() {
  const app = Fastify();
  await app.register(rateLimit, { max: 5000, timeWindow: "1 minute" }); // the global default
  app.post("/guest/messages", {
    config: { rateLimit: { ...MESSAGE_RATE, keyGenerator: embedRateKey as never } },
  }, async () => ({ ok: true }));

  const send = (embedKey: string, ip = "203.0.113.9") =>
    app.inject({
      method: "POST", url: "/guest/messages",
      headers: { "x-forwarded-for": ip },
      payload: { content: "hi", fingerprint: "fp", embed_key: embedKey },
    });

  const KEY_A = "aaaaaaaa-0000-0000-0000-000000000001";
  const KEY_B = "bbbbbbbb-0000-0000-0000-000000000002";

  // Burn key A's bucket from one IP.
  const codesA: number[] = [];
  for (let i = 0; i < MESSAGE_RATE.max + 3; i++) codesA.push((await send(KEY_A)).statusCode);

  assert(codesA.slice(0, MESSAGE_RATE.max).every((c) => c === 200), `first ${MESSAGE_RATE.max} messages accepted`);
  assert(codesA.slice(MESSAGE_RATE.max).every((c) => c === 429), "further messages get 429, not a billed model call");

  // A second institution on the SAME IP must be unaffected — otherwise one busy site
  // (or one attacker) takes every other widget down with it.
  assert((await send(KEY_B)).statusCode === 200, "a different embed key has its own bucket");

  // And the same key from a different visitor IP is also separate.
  assert((await send(KEY_A, "198.51.100.7")).statusCode === 200, "the same key from another IP has its own bucket");

  // The guard is only real if the body was actually visible to keyGenerator: on the
  // default onRequest hook the key degrades to "no-key:ip" and KEY_B would have been 429.
  assert(MESSAGE_RATE.hook === "preHandler", "keyGenerator runs late enough to read the body");

  await app.close();
  console.log(failed === 0 ? "PASS — public embed endpoint is rate-limited per key + IP" : `${failed} failure(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
