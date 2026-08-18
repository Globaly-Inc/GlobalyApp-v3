// SSE frame writing. Same wire format as the AI counsellor's lib/sse-writer.ts
// (`event:` + `data:` + blank line) so the frontend parser is shared.
//
// The one difference: this opens the stream with reply.hijack(). The counsellor's stream
// ends inside its own handler, so Fastify's reply lifecycle still closes cleanly around
// it. A chat stream outlives the handler by minutes — hijacking hands the socket over and
// stops Fastify waiting on a reply that will never be sent.

import type { FastifyReply } from "fastify";

export function openStream(reply: FastifyReply): void {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // nginx must not buffer a stream
  });
  reply.raw.write(": connected\n\n"); // flushes headers so the client's fetch() resolves
}

export function writeEvent(reply: FastifyReply, event: string, data: unknown): void {
  if (reply.raw.destroyed) return;
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Comment frame — ignored by EventSource, keeps idle proxies from dropping the socket. */
export function writeComment(reply: FastifyReply, text: string): void {
  if (reply.raw.destroyed) return;
  reply.raw.write(`: ${text}\n\n`);
}
