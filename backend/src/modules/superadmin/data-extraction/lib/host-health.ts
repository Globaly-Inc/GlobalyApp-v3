// How fast may we ask this host, and should we still be asking it at all?
//
// Two measured wall-clock problems, one place to decide about a host:
//
//  - A host that keeps failing is paid for in full, every time. Caltech: 307 of 531 snapshot
//    pages came back scraper_down, each walking get (22s) → stealthy_fetch (30s) → fetch (35s)
//    → Firecrawl, so 531 pages took 6,447s (0.08/s) against 1.2–1.4/s on a clean site. Roughly
//    1.7 hours re-proving that three caltech.edu subdomains were down.
//
//  - A fixed gap paces every host identically, and on a catalogue-concentrated site that gap IS
//    the wall-clock: CSU Ohio 500 pages/356s, Aalto 500/402s, UConn 500/409s — 1.2–1.4 pages/s,
//    exactly the ceiling an 800ms gap implies, with 16–32 fetchers in flight buying nothing
//    because they all queue behind one host's slot. The 800ms was precautionary (nothing has
//    ever 429'd us), so it earns the right to shrink on evidence and widen on a real 429.
//
// ponytail: state is per PROCESS while extraction_host_slots paces across them, so N workers
// each learn a host separately and the effective gap is their average. Move gapMs into that
// table if that divergence ever shows up in a run.

/** Starting gap, and the value a 429 snaps back to. */
export const BASE_GAP_MS = Math.max(1, Math.floor(Number(process.env.HOST_THROTTLE_MS) || 800));
/** Never go below this however well a host behaves. */
export const FLOOR_GAP_MS = Math.max(1, Math.floor(Number(process.env.HOST_THROTTLE_MIN_MS) || 200));
/** Never back off past this however badly it behaves. */
export const CEILING_GAP_MS = 8_000;
/** Clean fetches in a row before the gap halves. */
export const SPEEDUP_AFTER = 20;
/** Unusable results in a row before we stop asking this host. */
export const TRIP_AFTER = 5;
/** How long the circuit stays open before one trial request is allowed through. */
export const TRIP_FOR_MS = 10 * 60_000;

export type HostOutcome = "ok" | "failed" | "throttled";

interface HostState {
  gapMs: number;
  oks: number;
  fails: number;
  openUntil: number;
}

const hosts = new Map<string, HostState>();

function stateOf(host: string): HostState {
  let s = hosts.get(host);
  if (!s) {
    s = { gapMs: BASE_GAP_MS, oks: 0, fails: 0, openUntil: 0 };
    hosts.set(host, s);
  }
  return s;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** The gap to reserve before the next request to this host. */
export function hostGapMs(host: string): number {
  return stateOf(host).gapMs;
}

/**
 * Is this host tripped right now?
 *
 * Half-open on expiry: the circuit closes but the failure count is left one short of the
 * threshold, so a single further failure re-trips immediately. Closing to a clean slate would
 * spend TRIP_AFTER more full-ladder failures — minutes each — re-learning the same thing every
 * TRIP_FOR_MS.
 */
export function isHostCircuitOpen(host: string, now = Date.now()): boolean {
  const s = hosts.get(host);
  if (!s?.openUntil) return false;
  if (now < s.openUntil) return true;
  s.openUntil = 0;
  s.fails = TRIP_AFTER - 1;
  return false;
}

/**
 * Record what a host just did.
 *
 * `throttled` (a real 429/503) widens the gap but never counts toward the trip: a host saying
 * "slower" is alive and worth crawling, and tripping on it would stop the one site that told us
 * exactly how to succeed.
 */
export function noteHostOutcome(host: string, outcome: HostOutcome, now = Date.now()): void {
  const s = stateOf(host);
  if (outcome === "throttled") {
    s.oks = 0;
    s.gapMs = Math.min(CEILING_GAP_MS, Math.max(BASE_GAP_MS, s.gapMs * 2));
    return;
  }
  if (outcome === "ok") {
    s.fails = 0;
    s.oks++;
    if (s.oks >= SPEEDUP_AFTER && s.gapMs > FLOOR_GAP_MS) {
      s.gapMs = Math.max(FLOOR_GAP_MS, Math.floor(s.gapMs / 2));
      s.oks = 0;
    }
    return;
  }
  s.oks = 0;
  s.fails++;
  if (s.fails >= TRIP_AFTER) s.openUntil = now + TRIP_FOR_MS;
}

/** What the circuit breaker puts in a page's `error`. Phrased so isScraperInfraFailure() owns it:
 *  a tripped host must read as "we stopped asking", never as a dead page. */
export function circuitOpenError(host: string): string {
  return `scraper circuit open for ${host} — ${TRIP_AFTER} consecutive failures, not retried for ${Math.round(TRIP_FOR_MS / 60_000)}m`;
}

export function hostHealth(host: string): Readonly<HostState> | undefined {
  return hosts.get(host);
}

/** Test seam — the map is module-level, so a test asserting a trip must clear it. */
export function resetHostHealth(): void {
  hosts.clear();
}
