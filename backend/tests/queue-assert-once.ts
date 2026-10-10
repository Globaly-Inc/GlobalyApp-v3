/**
 * publish() asserts a queue once per channel, not once per message.
 *
 * What silently breaks:
 *   1. messages must still reach the queue when only the first publish asserts
 *   2. the cache must be dropped when the channel is replaced — assertions live on a CHANNEL, and
 *      a default-exchange publish to a queue that no longer exists is dropped with no error, so a
 *      stale cache loses messages silently
 *
 * Why it exists: assertQueue is a broker round-trip (~41ms against local LavinMQ) and publish ran
 * one per message — queue_pages paid 205s of it to queue one uncapped job's 4,969 course URLs.
 *
 * Run: node --import tsx tests/queue-assert-once.ts   (or: npm run test:queue-assert-once)
 * Needs a live LavinMQ (LAVINMQ_URL); uses its own throwaway queue.
 */

import "dotenv/config";
import amqp from "amqplib";
import { queueService } from "../src/shared/queue/queueService.js";
import { queueConfig } from "../src/shared/queue/queueConfig.js";

const Q = "test_assert_once_tmp";
let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  ok" : "FAIL"}  ${m}`); if (!c) failures++; };

async function admin<T>(fn: (ch: amqp.Channel) => Promise<T>): Promise<T> {
  const conn = await amqp.connect(queueConfig.url);
  const ch = await conn.createChannel();
  try { return await fn(ch); } finally { await ch.close().catch(() => {}); await conn.close().catch(() => {}); }
}
const depth = () => admin(async (ch) => (await ch.checkQueue(Q)).messageCount).catch(() => -1);

async function main() {
  await admin(async (ch) => { await ch.assertQueue(Q, { durable: true }); await ch.purgeQueue(Q); });

  for (let i = 0; i < 50; i++) await queueService.publish(Q, { i });
  ok(await depth() === 50, "50 publishes land (one assert, fifty messages)");

  // Queue gone AND channel replaced: the only shape where the invalidation is what saves the send.
  await admin((ch) => ch.deleteQueue(Q));
  await queueService.close();
  for (let i = 0; i < 10; i++) await queueService.publish(Q, { i });
  ok(await depth() === 10, "after close(), a publish re-asserts and still lands");

  await admin((ch) => ch.deleteQueue(Q)).catch(() => {});
  await queueService.close();
  console.log(failures ? `\n${failures} failed` : "\nall passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
