// Live thread delivery.
//
// MULTI-PROCESS: there is deliberately no in-memory subscriber registry. Each connection
// tails `conversation_messages` from its own keyset cursor, so a message written by ANY
// api process (or a worker, or psql) reaches every connected participant wherever that
// connection landed. Nothing here depends on one node holding all the sockets, so no
// LavinMQ fan-out is needed to make delivery correct — the queue would only buy latency.
// ponytail: the ceiling is one SELECT per connection per tick. If concurrent chats ever
// make that the hot query, publish sends to a LavinMQ fanout exchange
// (shared/queue/queueService) and have each process bridge its own connections, keeping
// this poll as the reconnect/catch-up path.
//
// The cursor is the serial message id, never a timestamp: messages inserted in one
// statement share a created_at to the microsecond, and a `>` on that would skip one.

import type { FastifyReply, FastifyRequest } from "fastify";

import { openStream, writeComment, writeEvent } from "../lib/sse.js";
import * as messagesRepo from "../repositories/messages.repository.js";

/** How often a connection tails for new messages. */
export const STREAM_TICK_MS = Number(process.env.MESSAGING_STREAM_TICK_MS ?? 1000);

/** Ceiling on one tick's push, so a long backlog can't build an unbounded write buffer. */
const MAX_BATCH = 200;

let active = 0;

/** Open streams in this process. Exported so tests can prove disconnect cleans up. */
export function activeStreamCount(): number {
  return active;
}

/**
 * Streams messages after `sinceId` until the client goes away.
 *
 * Caller MUST have verified participation first — this hijacks the socket, after which a
 * JSON error response is no longer possible.
 */
export function streamConversation(
  req: FastifyRequest,
  reply: FastifyReply,
  conversationId: number,
  sinceId: number,
): void {
  openStream(reply);
  const raw = reply.raw;

  let cursor = sinceId;
  let closed = false;
  let ticking = false;

  const tick = async () => {
    if (closed || ticking) return;
    // Back-pressure: the kernel buffer is still full from the last batch. Skip rather than
    // queue more in this process's memory — the cursor has not moved, so nothing is lost.
    if (raw.writableNeedDrain) return;
    ticking = true;
    try {
      const rows = await messagesRepo.since(conversationId, cursor, MAX_BATCH);
      for (const message of rows) {
        writeEvent(reply, "message", message);
        cursor = message.id;
      }
      writeComment(reply, "ping");
    } catch (err) {
      req.log.error({ err, conversationId }, "message stream tick failed");
    } finally {
      ticking = false;
    }
  };

  const timer = setInterval(tick, STREAM_TICK_MS);
  timer.unref(); // a live stream must never be the reason the process stays up

  const stop = () => {
    if (closed) return;
    closed = true;
    active -= 1;
    clearInterval(timer);
    req.raw.off("close", stop);
    req.raw.off("error", stop);
    raw.end();
  };

  active += 1;
  req.raw.on("close", stop);
  req.raw.on("error", stop);

  void tick(); // replay anything already past the cursor without waiting a full tick
}
