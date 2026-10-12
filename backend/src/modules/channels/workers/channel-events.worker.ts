// Worker — processes stored Zernio webhook events: customer messages (and AI replies), delivery
// updates, connection changes.
//
// Run with: npm run job:channel-events
//
// One event at a time, in order (prefetch 1 plus a single in-process chain), so two messages in
// the same conversation can never be answered out of order or twice. ponytail: one global lane;
// shard by conversation if volume ever needs parallelism.
//
// The queue drops a message whose handler throws, and a publish can fail after the event was
// stored, so a sweep also picks up anything stored but unprocessed for over a minute.

import "dotenv/config";
import { queueService } from "../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../shared/logger.js";
import { masterKnex } from "../../../core/db/master-pool.js";
import { CHANNEL_QUEUES } from "../consts.js";
import { processEvent } from "../services/inbound.service.js";

const logger = createChildLogger("channel-events-worker");
const SWEEP_MS = 60_000;

let lane: Promise<unknown> = Promise.resolve();
function run(eventRowId: number): Promise<void> {
  const next = lane.then(() => processEvent(eventRowId));
  lane = next.catch((err) => logger.error("Event processing crashed", { eventRowId, err: err instanceof Error ? err.message : String(err) }));
  return next;
}

await queueService.consume(CHANNEL_QUEUES.EVENTS, async (msg) => {
  if (!msg) return;
  const { eventRowId } = JSON.parse(msg.content.toString()) as { eventRowId?: unknown };
  // A number or a numeric string (older messages carried pg's int8 string): both are a row id.
  const id = Number(eventRowId);
  if (Number.isSafeInteger(id) && id > 0) await run(id);
}, { noAck: false }, 1);

setInterval(async () => {
  try {
    const rows: { id: number }[] = await masterKnex("zernio_events")
      .whereNull("processed_at")
      // Never attempted (a lost publish, a worker that was down): eligible however old, once the
      // queue has had a minute to deliver it. Failed: only once its backoff has passed.
      .where("received_at", "<", new Date(Date.now() - SWEEP_MS))
      .where((q) => q.whereNull("next_attempt_at").orWhere("next_attempt_at", "<=", new Date()))
      // Due-time order: an event that keeps failing moves back each time, so it can't hold the
      // front of the line against newer work (idx_zernio_events_due).
      .orderByRaw("COALESCE(next_attempt_at, received_at) ASC")
      .limit(50)
      .select("id");
    for (const r of rows) await run(Number(r.id));
  } catch (err) {
    logger.warn("Sweep failed", { err: err instanceof Error ? err.message : String(err) });
  }
}, SWEEP_MS);

logger.info(`Channel events worker started — consuming "${CHANNEL_QUEUES.EVENTS}" queue`);
