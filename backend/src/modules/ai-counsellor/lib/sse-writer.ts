import type { FastifyReply } from "fastify";

/** Set SSE headers and status 200. Call once before any writeEvent. */
export function initSSE(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
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

/** Write [DONE] marker and end the stream. */
export function writeDone(reply: FastifyReply): void {
  if (reply.raw.destroyed) return;
  reply.raw.write("data: [DONE]\n\n");
  reply.raw.end();
}
