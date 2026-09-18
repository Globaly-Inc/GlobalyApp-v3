/**
 * The browser-tier concurrency gate. Pure, no network. Run: npm run test:browser-slot
 *
 * Exists because Scrapling spawns a real Chromium for stealthy_fetch/fetch and does not reap it:
 * unbounded, the container went from 4 processes to ~1,600 (99% of its 2GiB) in under a minute,
 * after which it answered MCP handshakes but could no longer open a browser.
 *
 * The subtle half is the HANDOFF. Releasing by "decrement, then wake a waiter" lets a fresh caller
 * take the free slot before the woken waiter resumes, so both run — the limit silently becomes
 * limit+1 under exactly the burst it exists to stop. The concurrent-burst case below is the one
 * that catches it; a sequential test passes either way.
 */
import { __browserSlotInternals as slot } from "../src/modules/superadmin/data-extraction/lib/scraper.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else { failed++; console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const LIMIT = slot.MAX_BROWSER_TIER_CONCURRENCY;
let peak = 0;
let live = 0;

async function fakeBrowserCall(ms: number) {
  await slot.acquireBrowserSlot();
  live++;
  peak = Math.max(peak, live);
  await new Promise((r) => setTimeout(r, ms));
  live--;
  slot.releaseBrowserSlot();
}

// 12 callers arriving at once — the shape that swamped the container.
await Promise.all(Array.from({ length: 12 }, (_, i) => fakeBrowserCall(10 + (i % 3) * 5)));
eq(peak <= LIMIT, true, `peak concurrency ${peak} must not exceed the limit ${LIMIT}`);
eq(slot.inFlight(), 0, "every slot is returned once the burst drains");

// A second burst on the same counters — a leaked slot from round 1 shows up here as a lower peak
// (or a hang), so this also guards the release path rather than only the acquire path.
peak = 0;
await Promise.all(Array.from({ length: 8 }, () => fakeBrowserCall(5)));
eq(peak, LIMIT, `a burst of 8 saturates all ${LIMIT} slots`);
eq(slot.inFlight(), 0, "slots are all returned again");

// Waiters resume in arrival order, so one URL can't be starved by later ones.
const order: number[] = [];
await Promise.all(Array.from({ length: 6 }, async (_, i) => {
  await slot.acquireBrowserSlot();
  order.push(i);
  await new Promise((r) => setTimeout(r, 5));
  slot.releaseBrowserSlot();
}));
eq(order, [0, 1, 2, 3, 4, 5], "slots are granted first-come-first-served");

console.log(`${passed} passed, ${failed} failed (limit=${LIMIT})`);
process.exit(failed > 0 ? 1 : 0);
