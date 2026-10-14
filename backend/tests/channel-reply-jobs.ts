/**
 * Debounced channel replies against the real table (globalyapp.channel_reply_jobs, migrations
 * 20261013_001 + _002): the max-wait cap, the lease that survives a worker crash, a message landing
 * mid-reply, and retries. Pure "what is owed" rules are in tests/channels.ts.
 *
 * Run: npm run test:channel-reply-jobs   (needs the database; run the globalyapp migrations first)
 *
 * WRITES rows for a made-up owner id and deletes them again, before and after.
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import * as jobs from "../src/modules/channels/repositories/reply-jobs.repository.js";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok   ${name}`); } else { failed++; console.log(`  FAIL ${name}`, detail ?? ""); }
}

const owner = { kind: "business" as const, id: 2_000_000_001 }; // no FK: a made-up owner
const rows = () => masterKnex("channel_reply_jobs").where({ owner_kind: owner.kind, owner_id: owner.id });
const row = async (visitorId: number) => rows().where({ visitor_id: visitorId }).first();
/** Make a visitor's job due now (the waits are seconds; the test shouldn't be). */
const dueNow = (visitorId: number) => rows().where({ visitor_id: visitorId }).update({ due_at: masterKnex.raw("now() - interval '1 second'") });
// Scoped to the test owner IN the claim: an unscoped claim would lease (and count an attempt on)
// real pending replies in this database.
const claimMine = (leaseMs = 60_000) => jobs.claimDueReplies(50, leaseMs, owner);

await rows().del();
try {
  // 1. The cap applies to the very first message, not only to later ones.
  await jobs.scheduleReply(owner, 1, 60_000, 5_000);
  const capped = await row(1);
  const waitMs = new Date(capped.due_at).getTime() - new Date(capped.first_message_at).getTime();
  check("a single message never waits past the max, even with debounce > max", waitMs <= 5_000 + 50, waitMs);

  // 2. A new message pushes the reply back, but not past the burst's cap.
  await jobs.scheduleReply(owner, 2, 1_000, 3_000);
  await masterKnex.raw("SELECT pg_sleep(0.05)");
  await jobs.scheduleReply(owner, 2, 60_000, 3_000);
  const pushed = await row(2);
  check("a later message in the burst is still capped at first message + max",
    new Date(pushed.due_at).getTime() - new Date(pushed.first_message_at).getTime() <= 3_000 + 50);
  check("each message bumps the version", pushed.version === 1, pushed.version);

  // 3. Leased, not deleted: a second poll can't take it, and it survives until finished.
  await dueNow(2);
  const [leased] = await claimMine();
  check("a due job is leased", leased?.visitor_id === 2 && leased.attempts === 1, leased);
  check("a leased job can't be leased again (no second reply)", (await claimMine()).every((j) => j.visitor_id !== 2));
  check("a leased job is still in the table", !!(await row(2)));

  // 4. Worker dies mid-reply: the lease runs out and the job is answered by a later poll.
  await rows().where({ visitor_id: 2 }).update({ claimed_until: masterKnex.raw("now() - interval '1 second'") });
  const [recovered] = await claimMine();
  check("after a crash the expired lease is claimable again", recovered?.visitor_id === 2 && recovered.attempts === 2, recovered);

  // 5. A message lands while the reply is written: finishing keeps the newer burst's job.
  await jobs.scheduleReply(owner, 2, 1_000, 3_000);
  await jobs.finishReply(recovered);
  const kept = await row(2);
  check("a message mid-reply keeps its own pending job", !!kept && kept.claimed_until === null, kept);
  check("…as a new burst (attempts reset)", kept?.attempts === 0, kept?.attempts);

  // 6. Nothing new arrived: finishing deletes the job.
  await dueNow(2);
  const [again] = await claimMine();
  await jobs.finishReply(again);
  check("a finished reply with nothing newer is deleted", !(await row(2)));

  // 7. Failures retry later and stop after MAX_REPLY_ATTEMPTS claims, until the customer writes.
  await jobs.scheduleReply(owner, 3, 0, 0);
  for (let i = 0; i < jobs.MAX_REPLY_ATTEMPTS; i++) {
    await dueNow(3);
    const [j] = await claimMine();
    if (j) await jobs.retryReply(j, 30_000);
    if (i === 0) {
      const r = await row(3);
      check("a failed reply is put back for later", r.claimed_until === null && new Date(r.due_at).getTime() > Date.now() + 20_000, r);
    }
  }
  await dueNow(3);
  check(`after ${jobs.MAX_REPLY_ATTEMPTS} attempts the job is no longer claimed`, (await claimMine()).every((j) => j.visitor_id !== 3));
  await jobs.scheduleReply(owner, 3, 0, 0);
  await dueNow(3);
  check("a new customer message makes it claimable again", (await claimMine()).some((j) => j.visitor_id === 3));
} finally {
  await rows().del();
  console.log(`\nchannel-reply-jobs: ${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
}
process.exit(failed ? 1 : 0);
