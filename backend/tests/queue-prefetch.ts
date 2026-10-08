/**
 * A consumer must not run the whole queue at once.
 *
 * What silently breaks: amqplib hands each delivered message to the callback without waiting for
 * the promise it returns, so concurrency is whatever the broker delivers — i.e. the prefetch. And
 * basic.qos binds only to consumers registered AFTER it, so setting prefetch in startScaling (as
 * the page worker did) left the consumer consume() had already registered unbounded: the limit
 * looked configured and bounded nothing. Measured before the fix: 200 of 200 messages in flight.
 *
 * Why it matters here: jobs went uncapped (migration 20261006_001), so one institution's queue is
 * thousands of messages, not hundreds — 4,969 concurrent Gemini extractions instead of ten.
 *
 * Run: node --import tsx tests/queue-prefetch.ts   (or: npm run test:queue-prefetch)
 * Needs a live LavinMQ (LAVINMQ_URL); uses its own throwaway queue.
 */

import "dotenv/config";
import amqp from "amqplib";
import { queueService } from "../src/shared/queue/queueService.js";
import { queueConfig } from "../src/shared/queue/queueConfig.js";

const Q = "test_prefetch_tmp";
const MESSAGES = 120;
const PREFETCH = 3;
const HANDLER_MS = 400;

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  ok" : "FAIL"}  ${m}`); if (!c) failures++; };

async function admin<T>(fn: (ch: amqp.Channel) => Promise<T>): Promise<T> {
  const conn = await amqp.connect(queueConfig.url);
  const ch = await conn.createChannel();
  try { return await fn(ch); } finally { await ch.close().catch(() => {}); await conn.close().catch(() => {}); }
}

async function main() {
  await admin(async (ch) => {
    await ch.assertQueue(Q, { durable: true });
    await ch.purgeQueue(Q);
    for (let i = 0; i < MESSAGES; i++) ch.sendToQueue(Q, Buffer.from(JSON.stringify({ i })), { persistent: true });
  });
  await new Promise((r) => setTimeout(r, 400));

  let live = 0, peak = 0, done = 0;
  await queueService.consume(Q, async () => {
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, HANDLER_MS));
    live--; done++;
  }, { noAck: false }, PREFETCH);

  // Long enough that an unbounded consumer would have taken the whole queue, short enough that a
  // bounded one is still working through it.
  await new Promise((r) => setTimeout(r, HANDLER_MS * 6));

  ok(peak <= PREFETCH, `peak in-flight ${peak} stays within prefetch ${PREFETCH} (queue held ${MESSAGES})`);
  ok(peak < MESSAGES, `the whole queue did not land at once (peak ${peak} of ${MESSAGES})`);
  ok(done > 0, `messages are still being processed (${done} done) — the limit paces, it does not stall`);

  await admin((ch) => ch.deleteQueue(Q)).catch(() => {});
  await queueService.close();
  console.log(failures ? `\n${failures} failed` : "\nall passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
