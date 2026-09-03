// The whole point of the fix: a rate-limited request must come back 429, not 500.
// Before, error-handler.plugin.ts fell straight through to its 500 branch for any error
// that wasn't an AppError, so clients could not tell "back off" from "server is broken".
import assert from "node:assert/strict";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { errorHandlerPlugin } from "../src/core/plugins/error-handler.plugin.js";
import { NotFoundError } from "../src/shared/errors.js";

const app = Fastify();
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
await app.register(errorHandlerPlugin);
// max:1 on this route only, so the other routes below stay inside the global budget.
app.get("/ok", { config: { rateLimit: { max: 1, timeWindow: "1 minute" } } }, async () => ({ ok: true }));
app.get("/missing", async () => {
  throw new NotFoundError("nope");
});
app.get("/boom", async () => {
  throw new Error("unexpected");
});

const first = await app.inject({ method: "GET", url: "/ok" });
assert.equal(first.statusCode, 200);

const limited = await app.inject({ method: "GET", url: "/ok" });
assert.equal(limited.statusCode, 429, `rate-limited request returned ${limited.statusCode}`);
assert.match(limited.json<{ error: string }>().error, /Rate limit exceeded/);

// AppErrors and genuine 500s must be untouched by the new branch.
assert.equal((await app.inject({ method: "GET", url: "/missing" })).statusCode, 404);
assert.equal((await app.inject({ method: "GET", url: "/boom" })).statusCode, 500);

await app.close();
console.log("error-status-passthrough: ok");
