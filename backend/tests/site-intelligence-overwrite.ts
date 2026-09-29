/**
 * writeSiteIntelligence is a WHOLESALE upsert — calling it with an empty analysis erases the
 * previous run's intelligence. This pins that hazard so the call site keeps guarding it.
 *
 * Run: node --import tsx tests/site-intelligence-overwrite.ts  (or: npm run test:site-intelligence-overwrite)
 * Fake wire: knex builds the real SQL and a stub connection captures it. No DB.
 *
 * Exists because a guard added to stop runSiteAnalysis crashing on a malformed model reply
 * (`analysis.site_intelligence ?? {}`) turned a crash into silent data loss: the same `?? {}`
 * is harmless for writeInstitutionOverview, whose merge is COALESCE(NULLIF(EXCLUDED.col,''),
 * existing.col), and destructive here, whose merge is bare .merge(). The asymmetry is the trap.
 */

process.env.DB_USERNAME ||= "x"; process.env.DB_PASSWORD ||= "x";
process.env.DB_NAME ||= "x"; process.env.DB_HOST ||= "127.0.0.1";
process.env.JWT_SECRET ||= "x"; process.env.GEMINI_API_KEY ||= "test-key";

const { masterKnex } = await import("../src/core/db/master-pool.js");

const statements: Array<{ text: string; values: unknown[] }> = [];
const client = masterKnex.client as unknown as { acquireConnection: () => Promise<unknown>; releaseConnection: (c: unknown) => Promise<void> };
client.acquireConnection = async () => ({
  query(q: { text: string; values?: unknown[] }, cb: (e: Error | null, r?: unknown) => void) {
    statements.push({ text: q.text, values: q.values ?? [] });
    cb(null, { command: "INSERT", rows: [{ id: "row-1" }], rowCount: 1 });
  },
});
client.releaseConnection = async () => {};

const { writeSiteIntelligence } = await import("../src/modules/superadmin/data-extraction/lib/staging-writer.js");

let passed = 0, failed = 0;
const assert = (c: boolean, label: string, detail?: unknown) => {
  if (c) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};

// ── The hazard: an empty analysis writes nulls over every column ─────────────
statements.length = 0;
await writeSiteIntelligence("job-1", {} as never);
const sql = statements.at(-1)!;

assert(/on conflict \("job_id"\) do update set/i.test(sql.text), "it is an upsert on job_id", sql.text);
assert(!/coalesce/i.test(sql.text),
  "the conflict update does NOT coalesce — every column is replaced wholesale");
assert(sql.values.filter((v) => v === null).length >= 4,
  "an empty analysis binds nulls for institution_name / type / country / currency", sql.values);
assert(sql.values.includes("{}"),
  "…and empty json for fee_structure / navigation_patterns", sql.values);

// ── A real analysis still writes its values, so the guard must not block those ──
statements.length = 0;
await writeSiteIntelligence("job-1", { country: "AU", currency: "AUD", institution_name: "Curtin" } as never);
assert(statements.at(-1)!.values.includes("AUD") && statements.at(-1)!.values.includes("AU"),
  "a populated analysis still writes its values");

// ── The call site: runSiteAnalysis must SKIP the write, not default it ──────
// This is the assertion that actually guards the bug. The section above only proves the write
// is destructive; nothing there fails if the guard in pipeline-steps.ts is removed.
const { _pageDeps } = await import("../src/modules/superadmin/data-extraction/lib/page-store.js");
const { _llmDeps } = await import("../src/modules/superadmin/data-extraction/lib/llm-client.js");
const steps = await import("../src/modules/superadmin/data-extraction/lib/pipeline-steps.js");

// Homepage served from the snapshot store: a row carrying markdown never reads a file or scrapes.
_pageDeps.findPage = async () => ({
  id: "p1", markdown: "# Example University\n\nCourses and fees.", links: [],
  content_hash: "h", scraper: "scrapling" as never, scraped_at: new Date(), updated_by_platform_user_id: null,
});
steps._stepDeps.writeEvent = async () => {};
steps._stepDeps.publish = async () => {};
steps._stepDeps.setProgress = async () => {};

const job = { id: "job-1", institution_url: "https://example.edu", source_type: "institution", step_mode: "manual" };
const SITE_INTEL = /extraction_site_intelligence/i;

const runWith = async (reply: unknown) => {
  _llmDeps.generate = async () => ({ text: JSON.stringify(reply), usage: undefined, truncated: false });
  statements.length = 0;
  await steps.runSiteAnalysis("job-1", job as never);
};

// A reply with no site_intelligence — the shape that used to write {} over a good row.
await runWith({ institution: { name: "Example University" }, course_page_patterns: ["/courses/"] });
assert(statements.filter((s) => SITE_INTEL.test(s.text)).length === 0,
  "no site_intelligence section → the table is NOT touched, so a previous run survives",
  statements.filter((s) => SITE_INTEL.test(s.text)).map((s) => s.text));
assert(statements.some((s) => /extraction_institution_overview/i.test(s.text)),
  "…while the overview IS still written (its merge coalesces, so {} is safe there)");

// And a reply that does carry one must still be stored.
await runWith({ institution: { name: "Example University" }, site_intelligence: { country: "AU", currency: "AUD" }, course_page_patterns: [] });
assert(statements.some((s) => SITE_INTEL.test(s.text) && s.values.includes("AUD")),
  "a real site_intelligence section is still written");

// ── Non-object sections: truthy but unusable ────────────────────────────────
// extractJson CASTS, so `institution` can come back as a string or an array and sail past a
// truthiness check. Spreading a string yields columns "0","1","2"… (Postgres rejects them) and a
// string `site_intelligence` reads every field as undefined — the null overwrite again, silently.
for (const [label, value] of [["a string", "Example University"], ["an array", ["Example"]]] as const) {
  await runWith({ institution: value, site_intelligence: value, course_page_patterns: "not-an-array" });
  const overview = statements.find((s) => /extraction_institution_overview/i.test(s.text));
  assert(!/"0"/.test(overview?.text ?? ""),
    `institution as ${label} → no indexed character columns in the overview insert`, overview?.text?.slice(0, 160));
  assert(statements.filter((s) => SITE_INTEL.test(s.text)).length === 0,
    `site_intelligence as ${label} → the table is NOT touched`);
}

console.log(`\n${passed} passed, ${failed} failed`);
await masterKnex.destroy().catch(() => {});
process.exit(failed ? 1 : 0);
