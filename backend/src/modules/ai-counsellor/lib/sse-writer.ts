import type { FastifyReply } from "fastify";
import { config } from "../../../config.js";

const ALLOWED_ORIGINS = new Set(config.CORS_ORIGINS.split(",").map((o) => o.trim()));

/** Set SSE headers and status 200. Call once before any writeEvent. */
export function initSSE(reply: FastifyReply): void {
  // Tell Fastify we own the raw socket from here — without this, Fastify tries to
  // send its own response when the handler resolves and throws REPLY_ALREADY_SENT.
  reply.hijack();
  // Hijacked replies bypass @fastify/cors entirely, so the browser blocks the
  // stream unless we emit the CORS headers ourselves. Same allowlist as server.ts.
  const origin = reply.request.headers.origin;
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...(origin && ALLOWED_ORIGINS.has(origin)
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          Vary: "Origin",
        }
      : {}),
  });
}

/** Write a named SSE event. Format: event: <type>\ndata: <JSON>\n\n */
export function writeEvent(reply: FastifyReply, event: string, data: unknown): void {
  if (reply.raw.destroyed) return;
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Write a data-only SSE line (OpenAI-compatible delta format).
 *
 * Returns whether the socket took it. Metering counts delivered tokens, so the
 * caller has to be able to tell a written chunk from a dropped one.
 */
export function writeData(reply: FastifyReply, data: unknown): boolean {
  if (reply.raw.destroyed) return false;
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  return true;
}

/** Write [DONE] marker and end the stream. Optional payload goes out first as a named `done` event. */
export function writeDone(reply: FastifyReply, data?: unknown): void {
  if (reply.raw.destroyed) return;
  if (data !== undefined) writeEvent(reply, "done", data);
  reply.raw.write("data: [DONE]\n\n");
  reply.raw.end();
}
