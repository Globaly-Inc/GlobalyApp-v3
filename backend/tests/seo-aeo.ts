/**
 * SEO/AEO dashboard tests — pure-function contracts (AEO readiness scorer, suggestion merge
 * dedup, staleness), the GSC not-configured degrade path, and one DB round-trip through
 * rankings.service. Run: npm run test:seo-aeo
 *
 * Style matches tests/referrals.ts: a plain tsx script with manual counters, no framework.
 *
 * Unlike referrals.ts this suite does NOT require a dedicated `_test` database — every fixture
 * it inserts (blog_keywords, blog_posts, seo_keyword_snapshots rows) is deleted at the end of
 * the run, so it's safe against a shared/dev database.
 *
 * Never calls the real GSC API: the GSC cases only exercise the not-configured path (GSC_KEY_FILE
 * / GSC_SITE_URL are unset in .env per the plan), which is pure/local and makes no network call.
 */

import { masterKnex } from "../src/core/db/master-pool.js";
import { computeAeoReadiness } from "../src/modules/superadmin/marketing/seo/services/aeo-readiness.service.js";
import { mergeSuggestions, type Suggestion } from "../src/modules/superadmin/marketing/seo/services/suggestions.service.js";
import { computeStale, getRankings } from "../src/modules/superadmin/marketing/seo/services/rankings.service.js";
import { parseActionPlan } from "../src/modules/superadmin/marketing/seo/services/action-plan.service.js";
import { GscNotConfiguredError, isConfigured, checkConnection, querySearchAnalytics } from "../src/modules/superadmin/marketing/seo/lib/gsc-client.js";

// ── Harness ─────────────────────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(id: string, label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  PASS ${id}  ${label}`);
  } else {
    failed++;
    failures.push(`${id} ${label}`);
    console.log(`  FAIL ${id}  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

async function expectThrow(id: string, label: string, fn: () => Promise<unknown>, matches: (err: unknown) => boolean) {
  try {
    await fn();
    check(id, label, false, "expected a throw, got none");
  } catch (err) {
    check(id, label, matches(err), err instanceof Error ? err.message : String(err));
  }
}

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

// ── Fixture cleanup registry ───────────────────────────────────────────────────────────────────
const cleanup: Array<() => Promise<unknown>> = [];

// ── Tests: AEO readiness scorer (pure) ─────────────────────────────────────────────────────────
function tAeoReadiness() {
  console.log("\nT-01  computeAeoReadiness — pure scorer");

  const fullyReady = `
    <p>Studying abroad in Canada costs between CAD 20,000 and 35,000 a year for most programs.</p>
    <h2>Frequently Asked Questions</h2>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}</script>
  `;
  const readyScore = computeAeoReadiness(fullyReady, "A clear meta description for the page.");
  check("T-01a", "all four checks pass -> score 100", readyScore.score === 100, readyScore);
  check("T-01a2", "hasFaqSection true", readyScore.hasFaqSection);
  check("T-01a3", "hasFaqJsonLd true", readyScore.hasFaqJsonLd);
  check("T-01a4", "hasAnswerShapedIntro true (short first <p>)", readyScore.hasAnswerShapedIntro);
  check("T-01a5", "hasMetaDescription true", readyScore.hasMetaDescription);

  const notReady = `<p>${"word ".repeat(80)}</p><h2>Something else entirely</h2>`;
  const notReadyScore = computeAeoReadiness(notReady, null);
  check("T-01b", "no checks pass -> score 0", notReadyScore.score === 0, notReadyScore);
  check("T-01b2", "hasFaqSection false", !notReadyScore.hasFaqSection);
  check("T-01b3", "hasFaqJsonLd false", !notReadyScore.hasFaqJsonLd);
  check("T-01b4", "hasAnswerShapedIntro false (first <p> > 60 words)", !notReadyScore.hasAnswerShapedIntro);
  check("T-01b5", "hasMetaDescription false (null)", !notReadyScore.hasMetaDescription);

  const emptyContent = computeAeoReadiness(null, "");
  check("T-01c", "null content / empty meta -> score 0, no throw", emptyContent.score === 0, emptyContent);
}

// ── Tests: suggestion merge dedup (pure) ───────────────────────────────────────────────────────
function tSuggestionMerge() {
  console.log("\nT-02  mergeSuggestions — case-insensitive dedup");

  const gsc: Suggestion[] = [
    { keyword: "Study Visa Australia", source: "gsc", impressions: 500, position: 14 },
    { keyword: "student housing uk", source: "gsc", impressions: 300, position: 12 },
  ];
  const ai: Suggestion[] = [
    { keyword: "study visa australia", source: "ai" }, // dup of gsc row, different case
    { keyword: "part time work visa canada", source: "ai" },
  ];

  const merged = mergeSuggestions(gsc, ai);
  check("T-02a", "3 unique keywords out of 4 (case-insensitive dup dropped)", merged.length === 3, merged);
  const dupEntry = merged.find((s) => s.keyword.toLowerCase() === "study visa australia");
  check("T-02b", "GSC entry wins the collision (real demand data over AI guess)", dupEntry?.source === "gsc", dupEntry);
  check("T-02c", "AI-only suggestion retained", merged.some((s) => s.keyword === "part time work visa canada" && s.source === "ai"));
  check("T-02d", "GSC-only suggestion retained", merged.some((s) => s.keyword === "student housing uk" && s.source === "gsc"));

  const empty = mergeSuggestions([], []);
  check("T-02e", "empty inputs -> empty output, no throw", empty.length === 0);
}

// ── Tests: staleness (pure) ─────────────────────────────────────────────────────────────────────
function tStale() {
  console.log("\nT-03  computeStale — 48h threshold");

  const now = new Date("2026-08-27T12:00:00.000Z");
  const fresh = new Date("2026-08-26T13:00:00.000Z"); // 23h old
  const stale = new Date("2026-08-25T00:00:00.000Z"); // 60h old

  check("T-03a", "snapshot < 48h old -> not stale", computeStale(fresh, now) === false);
  check("T-03b", "snapshot > 48h old -> stale", computeStale(stale, now) === true);
  check("T-03c", "no snapshot at all (null) -> stale", computeStale(null, now) === true);
}

// ── Tests: action plan parsing (pure, external-output validation boundary) ────────────────────
function tParseActionPlan() {
  console.log("\nT-04  parseActionPlan — Zod boundary over untrusted Gemini output");

  const valid = parseActionPlan(
    'Sure, here you go:\n[{"priority":1,"action":"Add an FAQ block","keyword":"study visa australia"}]',
  );
  check("T-04a", "valid JSON array (wrapped in prose) parses to 1 item", valid.length === 1, valid);
  check("T-04a2", "priority/action/keyword preserved", valid[0]?.priority === 1 && valid[0]?.action === "Add an FAQ block" && valid[0]?.keyword === "study visa australia");

  const malformed = parseActionPlan("not json at all, no brackets");
  check("T-04b", "no JSON array found -> empty, no throw", malformed.length === 0);

  const badShape = parseActionPlan('[{"priority": 9, "action": "x"}]'); // priority out of 1|2|3
  check("T-04c", "item failing schema is dropped", badShape.length === 0, badShape);

  const mixed = parseActionPlan('[{"priority":2,"action":"ok item"},{"priority":9,"action":"bad item"}]');
  check("T-04d", "Zod drops the whole array on any invalid item (array-level parse)", mixed.length === 0, mixed);
}

// ── Tests: GSC not-configured path (no network call) ───────────────────────────────────────────
async function tGscNotConfigured() {
  console.log("\nT-05  GSC not-configured path (GSC_KEY_FILE/GSC_SITE_URL unset)");

  if (process.env.GSC_KEY_FILE || process.env.GSC_SITE_URL) {
    console.log("  SKIP T-05  GSC_KEY_FILE/GSC_SITE_URL are set in this environment — not-configured path not exercisable here");
    return;
  }

  check("T-05a", "isConfigured() -> false", (await isConfigured()) === false);
  await expectThrow("T-05b", "querySearchAnalytics throws GscNotConfiguredError (never a raw googleapis error)", () =>
    querySearchAnalytics({ startDate: "2026-01-01", endDate: "2026-01-02", dimensions: ["query"] }),
    (err) => err instanceof GscNotConfiguredError);
  const connected = await checkConnection();
  check("T-05c", "checkConnection() -> false (mapped, never throws)", connected === false);
}

// ── Test: rankings service DB round-trip ────────────────────────────────────────────────────────
async function tRankingsRoundTrip() {
  console.log("\nT-06  rankings.service.getRankings() — DB round-trip");

  const keyword = `seo-test-${RUN}`;
  const [kwRow] = await masterKnex("superadmin.blog_keywords")
    .insert({ keyword, category: "Study", difficulty: "medium", is_active: true })
    .returning("id");
  cleanup.push(() => masterKnex("superadmin.blog_keywords").where({ id: kwRow.id }).delete());

  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - 5); // well past the 48h threshold
  const dateStr = staleDate.toISOString().slice(0, 10);

  await masterKnex("superadmin.seo_keyword_snapshots").insert({
    keyword, date: dateStr, position: 14.5, impressions: 250, clicks: 8, ctr: 0.032,
  });
  cleanup.push(() => masterKnex("superadmin.seo_keyword_snapshots").where({ keyword }).delete());

  const result = await getRankings();
  const row = result.rows.find((r) => r.keyword === keyword);
  check("T-06a", "tracked keyword appears in rankings (union of blog_keywords + focus_keyword)", !!row, {
    trackedCount: result.rows.length,
  });
  check("T-06b", "row carries the inserted snapshot's position/impressions/clicks", row?.position === 14.5 && row?.impressions === 250 && row?.clicks === 8, row);
  check("T-06c", "5-day-old snapshot -> stale: true", result.stale === true, { stale: result.stale, newestSnapshotAt: result.newestSnapshotAt });
}

// ── Run ─────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`SEO/AEO tests — DB=${process.env.DB_NAME}  run=${RUN}`);

  tAeoReadiness();
  tSuggestionMerge();
  tStale();
  tParseActionPlan();
  await tGscNotConfigured();
  await tRankingsRoundTrip();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log("failed:\n  " + failures.join("\n  "));

  for (const fn of cleanup.reverse()) {
    await fn().catch(() => {});
  }

  await masterKnex.destroy();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\nSUITE ERROR:", err);
  for (const fn of cleanup.reverse()) {
    await fn().catch(() => {});
  }
  await masterKnex.destroy();
  process.exit(1);
});
