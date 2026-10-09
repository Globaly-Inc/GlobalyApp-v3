/**
 * Per-host pacing + circuit breaker.
 * Run: node --import tsx tests/host-health.ts   (or: npm run test:host-health)
 *
 * Style matches tests/scraper-cascade.ts: plain tsx script, manual counters, no framework.
 * Scrapling is mocked by patching Client.prototype.connect/callTool, same as that file.
 *
 * §4 is the one that matters most: the breaker's own error must read as "we stopped asking",
 * never as a dead page. Without it a ten-minute wobble on one host stamps every URL under it
 * dead, and every active site-list read skips them from then on.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Small gaps keep the integration section fast; the assertions are all relative to the
// exported constants, so the values themselves don't matter.
process.env.HOST_THROTTLE_MS = "64";
process.env.HOST_THROTTLE_MIN_MS = "8";
process.env.SCRAPLING_BASE_URL = "https://scrapling.test";
process.env.CRAWL4AI_BASE_URL = "";
process.env.FIRECRAWL_API_KEY = "";
// Deliberately UNCONDITIONAL dummies, not `|| "x"`. throttleForHost reserves a slot in the shared
// extraction_host_slots table, so inheriting real credentials — anyone running this after sourcing
// .env, which is how it gets run — made the test write example.com's pacing into the real database
// and shift live crawls. Bad creds make reserveSharedHostSlot fail and fall back to the in-process
// map, which is the path under test anyway.
process.env.DB_USERNAME = "test-host-health";
process.env.DB_PASSWORD = "test-host-health";
process.env.DB_NAME = "test-host-health";
process.env.JWT_SECRET = "x";

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function main() {
  const {
    BASE_GAP_MS, FLOOR_GAP_MS, CEILING_GAP_MS, SPEEDUP_AFTER, TRIP_AFTER, TRIP_FOR_MS,
    circuitOpenError, hostGapMs, hostOf, isHostCircuitOpen, noteHostOutcome, resetHostHealth,
  } = await import("../src/modules/superadmin/data-extraction/lib/host-health.js");
  const { isScraperInfraFailure } = await import("../src/modules/superadmin/data-extraction/lib/classify-failure.js");
  const { deadReasonOf } = await import("../src/modules/superadmin/data-extraction/lib/site-snapshot.js");
  const { scrapeMarkdown } = await import("../src/modules/superadmin/data-extraction/lib/scraper.js");

  // ── §1 the gap adapts ─────────────────────────────────────────────────────
  resetHostHealth();
  assertEqual(hostGapMs("a.edu"), BASE_GAP_MS, "a host starts at the base gap");

  for (let i = 0; i < SPEEDUP_AFTER - 1; i++) noteHostOutcome("a.edu", "ok");
  assertEqual(hostGapMs("a.edu"), BASE_GAP_MS, `${SPEEDUP_AFTER - 1} clean fetches is not yet enough to speed up`);
  noteHostOutcome("a.edu", "ok");
  assertEqual(hostGapMs("a.edu"), BASE_GAP_MS / 2, `the gap halves after ${SPEEDUP_AFTER} clean fetches`);

  // Enough rounds to drive it well past the floor if nothing stopped it.
  for (let i = 0; i < SPEEDUP_AFTER * 12; i++) noteHostOutcome("a.edu", "ok");
  assertEqual(hostGapMs("a.edu"), FLOOR_GAP_MS, "however well a host behaves, the gap stops at the floor");

  // The three assertions above are all relative to SPEEDUP_AFTER, so raising the constant to
  // infinity satisfies every one of them while the speed-up never fires — verified, they stayed
  // green with it at 1e6. These two are absolute: a well-behaved host must actually get faster
  // within a page budget a real crawl reaches.
  assertEqual(SPEEDUP_AFTER <= 100, true, "the speed-up threshold is reachable inside one site's crawl");
  // A fresh host, NOT resetHostHealth() — that would clear a.edu and leave the 429 assertions
  // below starting from base instead of from the floor they just earned.
  for (let i = 0; i < 500; i++) noteHostOutcome("fast.edu", "ok");
  assertEqual(hostGapMs("fast.edu") < BASE_GAP_MS, true, "500 clean fetches leaves a host strictly faster than base");

  noteHostOutcome("a.edu", "throttled");
  assertEqual(hostGapMs("a.edu"), BASE_GAP_MS, "a 429 snaps a sped-up host back to the base gap");
  noteHostOutcome("a.edu", "throttled");
  assertEqual(hostGapMs("a.edu"), BASE_GAP_MS * 2, "a second 429 doubles it");
  for (let i = 0; i < 20; i++) noteHostOutcome("a.edu", "throttled");
  assertEqual(hostGapMs("a.edu"), CEILING_GAP_MS, "backoff stops at the ceiling");

  // A throttle must not also count as a failure, or a rate-limited host — the one site telling us
  // exactly how to succeed — would trip and stop being crawled at all.
  resetHostHealth();
  for (let i = 0; i < TRIP_AFTER * 3; i++) noteHostOutcome("b.edu", "throttled");
  assertEqual(isHostCircuitOpen("b.edu"), false, "a host that only rate-limits us never trips");

  // ── §2 the breaker trips, resets and half-opens ───────────────────────────
  resetHostHealth();
  for (let i = 0; i < TRIP_AFTER - 1; i++) noteHostOutcome("c.edu", "failed");
  assertEqual(isHostCircuitOpen("c.edu"), false, `${TRIP_AFTER - 1} failures leaves the circuit closed`);
  noteHostOutcome("c.edu", "ok");
  for (let i = 0; i < TRIP_AFTER - 1; i++) noteHostOutcome("c.edu", "failed");
  assertEqual(isHostCircuitOpen("c.edu"), false, "one success resets the streak — the failures must be consecutive");

  resetHostHealth();
  const t0 = 1_000_000;
  for (let i = 0; i < TRIP_AFTER; i++) noteHostOutcome("d.edu", "failed", t0);
  assertEqual(isHostCircuitOpen("d.edu", t0), true, `${TRIP_AFTER} consecutive failures trips the circuit`);
  assertEqual(isHostCircuitOpen("d.edu", t0 + TRIP_FOR_MS - 1), true, "and it stays open for the whole window");
  assertEqual(isHostCircuitOpen("d.edu", t0 + TRIP_FOR_MS), false, "after the window one trial request is allowed");
  // Half-open: closing to a clean slate would re-spend TRIP_AFTER full-ladder failures — minutes
  // each — every window, which is the cost this whole mechanism exists to avoid.
  noteHostOutcome("d.edu", "failed", t0 + TRIP_FOR_MS);
  assertEqual(isHostCircuitOpen("d.edu", t0 + TRIP_FOR_MS), true, "a single failure after the window re-trips immediately");

  assertEqual(hostOf("https://x.edu/a?b=1"), "x.edu", "hostOf reads the host");
  assertEqual(hostOf("not a url"), null, "hostOf is null for junk rather than throwing");

  // ── §3 scrapeMarkdown short-circuits a tripped host ───────────────────────
  // example.com, not a made-up host: assertPublicUrl resolves the name and returns BEFORE the
  // circuit check (SSRF guard first, always), so an unresolvable host never reaches host-health.
  resetHostHealth();
  let toolCalls = 0;
  (Client.prototype as any).connect = async function () {};
  (Client.prototype as any).callTool = async function () {
    toolCalls++;
    return { structuredContent: { status: 200, content: [""], url: "https://example.com" } };
  };

  for (let i = 0; i < TRIP_AFTER; i++) await scrapeMarkdown(`https://example.com/dead-${i}`, { breaker: true });
  assertEqual(isHostCircuitOpen("example.com"), true, "real scrape failures trip the host");

  const callsBefore = toolCalls;
  const r = await scrapeMarkdown("https://example.com/next", { breaker: true });
  assertEqual(toolCalls, callsBefore, "a tripped host costs no provider call at all");
  assertEqual(r.blocked, true, "the page is reported blocked");
  assertEqual(/circuit open/.test(r.error ?? ""), true, "with the breaker named in the error");

  // The admin's Retry button is also the only way to test a trip before it expires.
  await scrapeMarkdown("https://example.com/next", { breaker: true, forceFirecrawl: true });
  assertEqual(toolCalls > callsBefore, true, "an admin retry still goes through an open circuit");

  // The page worker does NOT arm the breaker, and must not: its scraper_down retry republishes
  // with forceFirecrawl:false, so an open circuit would answer instantly and burn all three
  // attempts in milliseconds — killing a whole single-host queue on one blip. Default is OFF.
  const beforeUnarmed = toolCalls;
  const unarmed = await scrapeMarkdown("https://example.com/next");
  assertEqual(toolCalls > beforeUnarmed, true, "an UNARMED caller still reaches the scraper on a tripped host");
  assertEqual(/circuit open/.test(unarmed.error ?? ""), false, "and is never short-circuited");

  // ── §3b review findings: recovery, probing, and what counts as a result ───
  // A response of ANY kind proves the host is up, so it must clear the circuit — not just reset
  // the count. Another caller in this process (site-crawl, site_analysis) does not arm the
  // breaker, so it can fetch a host the snapshot is skipping and is the evidence of recovery.
  resetHostHealth();
  for (let i = 0; i < TRIP_AFTER; i++) noteHostOutcome("recov.edu", "failed", t0);
  assertEqual(isHostCircuitOpen("recov.edu", t0), true, "host is tripped");
  noteHostOutcome("recov.edu", "ok", t0);
  assertEqual(isHostCircuitOpen("recov.edu", t0), false, "a success CLEARS the circuit, not just the fail count");

  resetHostHealth();
  for (let i = 0; i < TRIP_AFTER; i++) noteHostOutcome("slow.edu", "failed", t0);
  noteHostOutcome("slow.edu", "throttled", t0);
  assertEqual(isHostCircuitOpen("slow.edu", t0), false, "a 429 is a response too — it clears the circuit");

  // Old failures must not survive a response: four fails, a 429, one more fail is not five
  // consecutive failures at a host that demonstrably answered in between.
  resetHostHealth();
  for (let i = 0; i < TRIP_AFTER - 1; i++) noteHostOutcome("mix.edu", "failed", t0);
  noteHostOutcome("mix.edu", "throttled", t0);
  noteHostOutcome("mix.edu", "failed", t0);
  assertEqual(isHostCircuitOpen("mix.edu", t0), false, "a response resets the failure streak");

  // Only ONE caller probes on expiry. 16 fetchers are in flight during a snapshot, and releasing
  // them all at a host we believe is down is a thundering herd.
  resetHostHealth();
  for (let i = 0; i < TRIP_AFTER; i++) noteHostOutcome("probe.edu", "failed", t0);
  const after = t0 + TRIP_FOR_MS;
  assertEqual(isHostCircuitOpen("probe.edu", after), false, "the first caller after expiry probes");
  assertEqual(isHostCircuitOpen("probe.edu", after), true, "every other caller is still held back");
  assertEqual(isHostCircuitOpen("probe.edu", after + TRIP_FOR_MS), false, "a probe that never reports re-probes next window, never stuck open");

  // Backoff must never shrink the gap. With HOST_THROTTLE_MS above a fixed 8s ceiling, the min()
  // clamped a 429's backoff to BELOW the current gap.
  assertEqual(CEILING_GAP_MS >= BASE_GAP_MS, true, "the backoff ceiling is never below the base gap");

  // ── §3c a 404 is not a verdict on the host ────────────────────────────────
  // Recorded as neither: as a failure it would trip a healthy catalogue for having dead links; as
  // a success its wall of 404s earned speed-up credit and could halve the gap straight back down
  // after a 429 had just widened it.
  resetHostHealth();
  (Client.prototype as any).callTool = async function () {
    return { structuredContent: { status: 404, content: [""], url: "https://example.com/gone" } };
  };
  const gapBefore = hostGapMs("example.com");
  for (let i = 0; i < SPEEDUP_AFTER * 2; i++) await scrapeMarkdown(`https://example.com/gone-${i}`);
  assertEqual(hostGapMs("example.com"), gapBefore, "a wall of 404s earns no speed-up credit");
  assertEqual(isHostCircuitOpen("example.com"), false, "and never trips the host either");

  // ── §3d a 404 still RECOVERS the host ─────────────────────────────────────
  // The probe that reopens a circuit frequently lands on a dead link — that is the shape of a
  // catalogue. Recording nothing left `openUntil` pushed out by the probe itself, so the host was
  // re-skipped every window, indefinitely. A 404 proves the server answered.
  // BOTH go through scrapeMarkdown on purpose. The defects were in recordHostOutcome and in
  // scraplingScrape's 404 return, so a direct noteHostOutcome("alive") call passes whether or not
  // the wiring is right — verified: it stayed green with both fixes reverted.
  resetHostHealth();
  (Client.prototype as any).callTool = async function () {
    return { structuredContent: { status: 404, content: [""], url: "https://example.com/gone" } };
  };
  // Trip the host with the window ALREADY elapsed, so the next real call is the probe.
  const elapsed = Date.now() - TRIP_FOR_MS - 1;
  for (let i = 0; i < TRIP_AFTER; i++) noteHostOutcome("example.com", "failed", elapsed);
  assertEqual(isHostCircuitOpen("example.com", elapsed + 1), true, "tripped while the window was live");
  const probe = await scrapeMarkdown("https://example.com/gone", { breaker: true });
  assertEqual(probe.notFound, true, "the probe got a 404");
  assertEqual(isHostCircuitOpen("example.com"), false, "a 404 probe CLEARS the circuit — the host answered");

  // ...and still buys no speed-up.
  resetHostHealth();
  const gap0 = hostGapMs("alive.edu");
  for (let i = 0; i < SPEEDUP_AFTER * 3; i++) noteHostOutcome("alive.edu", "alive");
  assertEqual(hostGapMs("alive.edu"), gap0, "a wall of 404s earns no speed-up credit");

  // 429 on plain HTTP, then a browser tier confirming 404. The 404/410 return dropped the
  // throttled flag, and the host's own request to slow down went with it.
  resetHostHealth();
  let tierCall = 0;
  (Client.prototype as any).callTool = async function () {
    tierCall++;
    const status = tierCall === 1 ? 429 : 404;
    return { structuredContent: { status, content: [""], url: "https://example.com/slow" } };
  };
  const gapBeforeMix = hostGapMs("example.com");
  await scrapeMarkdown("https://example.com/slow");
  assertEqual(hostGapMs("example.com") > gapBeforeMix, true, "a 429 then a confirmed 404 still widens the gap");

  // ── §4 a tripped host must not mark its pages DEAD ────────────────────────
  const err = circuitOpenError("example.com");
  assertEqual(isScraperInfraFailure(err), true, "the breaker's error is classified as OUR failure");
  assertEqual(
    deadReasonOf({ blocked: true, markdown: "", error: err }),
    "scraper_down",
    "so a circuit-open page is scraper_down (retried later), never 'blocked' (stamped dead forever)",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0));
