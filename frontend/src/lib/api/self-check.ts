/**
 * Assertions for the http layer's body parsing.
 * Run: node --experimental-strip-types src/lib/api/self-check.ts
 *
 * Same shape as src/components/chat/self-check.ts: plain node:assert, no framework, no runner.
 *
 * Only parseBody is covered, and it lives in its own module for exactly that reason: everything
 * else in http.ts reaches for localStorage through @/lib/session on the first line, so exercising
 * it would mean stubbing a browser rather than testing the branch that actually broke.
 */

import assert from "node:assert/strict";
import { parseBody } from "./parse-body.ts";

// A 204 has no body. res.json() on one throws "Unexpected end of JSON input", which is what a
// PATCH to /members/:userId surfaced as a failed request despite the write succeeding.
assert.equal(await parseBody(new Response(null, { status: 204 })), undefined, "204 parses to undefined");

// Some servers answer 200 with an explicitly empty body rather than 204.
assert.equal(
  await parseBody(new Response("", { status: 200, headers: { "content-length": "0" } })),
  undefined,
  "an explicitly empty 200 parses to undefined",
);

// The ordinary case must be untouched.
assert.deepEqual(
  await parseBody(new Response(JSON.stringify({ ok: true }), { status: 200 })),
  { ok: true },
  "a JSON body still parses",
);

console.log("http self-check: all assertions passed");
