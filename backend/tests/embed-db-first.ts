/**
 * Embed widget retrieval order — DB first, website snapshot second.
 *
 * In embed mode rag.service's searchAll must answer from structured data when it has any,
 * and only when it has NONE fall back to the owner's site index (the extraction snapshot
 * .md files in GCS, embedded into the knowledge rack). Platform mode is unchanged: the
 * global rack runs in the same parallel batch as everything else.
 *
 * Run: node --import tsx tests/embed-db-first.ts   (or: npm run test:embed-db-first)
 *
 * Same fake-wire harness as tests/ai-counsellor-flow.ts: knex builds real SQL, the fake sits
 * at acquireConnection; the embedding endpoint is faked via global.fetch. No DB needed.
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";
process.env.GEMINI_API_KEY = "test-key";
process.env.EMBEDDING_PROVIDER = "gemini"; // the fake below is the Gemini REST shape

// Dynamic, not static: static imports hoist above the env lines, and config.ts reads the
// provider once at load — the local .env's openrouter setting would win otherwise.
const { masterKnex } = await import("../src/core/db/master-pool.js");
const rag = await import("../src/modules/ai-counsellor/services/rag.service.js");

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
}

// ─── Fake Postgres wire ──────────────────────────────────────────────────────
type PgResponse = { command: string; rows: unknown[]; rowCount?: number };
type Route = [RegExp, () => unknown[]];
const statements: string[] = [];
let routes: Route[] = [];
const client = masterKnex.client as unknown as { acquireConnection: () => Promise<unknown>; releaseConnection: (c: unknown) => Promise<void> };
client.acquireConnection = async () => ({
  query(q: { text: string }, cb: (err: Error | null, res?: PgResponse) => void) {
    statements.push(q.text);
    const route = routes.find(([re]) => re.test(q.text));
    const rows = route ? route[1]() : [];
    cb(null, { command: "SELECT", rows, rowCount: rows.length });
  },
});
client.releaseConnection = async () => {};
const reset = (r: Route[]) => { statements.length = 0; routes = r; };
const rackQueries = () => statements.filter((s) => /match_ai_knowledge_chunks/i.test(s)).length;
const indexOf = (re: RegExp) => statements.findIndex((s) => re.test(s));

// ─── Fake embedding endpoint ─────────────────────────────────────────────────
const vector = Array.from({ length: 3072 }, (_, i) => (i === 0 ? 1 : 0));
global.fetch = (async () => ({ ok: true, json: async () => ({ embedding: { values: vector } }), text: async () => "" }) as unknown as Response) as typeof global.fetch;

const COURSE = [/from "superadmin"\."extraction_courses" as "c"/i, () => [{
  id: "course-1", job_id: "job-1", name: "Bachelor of Nursing", degree_level: "Bachelor",
  institution_name: "Test Uni", institution_country: "Australia",
}]] as Route;
const CHUNK = [/match_ai_knowledge_chunks/i, () => [{
  id: "c1", document_id: "doc-1", content: "Refunds are issued within 28 days of withdrawal.",
  heading_path: "Refund policy", page_number: null, similarity: 0.9, title: "Refund policy",
  url: "https://test.edu/refunds", file_name: null, source_type: "url", category_label: "Widget site indexes",
  source_domain: "test.edu", trust_tier: "official", last_verified_at: null, effective_until: null,
}]] as Route;
const embed = { jobIds: ["job-1"], rackInstitutionId: 5, userId: 1 };

console.log("\n1. embed mode, DB has a course → answered from the DB, snapshot never searched");
{
  reset([COURSE, CHUNK]);
  const out = await rag.searchAll({ ...embed, query: "nursing degree" });
  assert(out.contextText.includes("Bachelor of Nursing"), "the course reaches the context");
  assert(rackQueries() === 0, "match_ai_knowledge_chunks is not called", statements);
  assert(!out.contextText.includes("Refund policy"), "no snapshot passage in the context");
}

console.log("\n2. embed mode, DB has nothing → falls back to the website snapshot");
{
  reset([CHUNK]);
  const out = await rag.searchAll({ ...embed, query: "refund policy withdrawal" });
  assert(rackQueries() === 1, "match_ai_knowledge_chunks is called once", rackQueries());
  assert(indexOf(/match_ai_knowledge_chunks/i) > indexOf(/extraction_courses/i), "…and only AFTER the course query");
  assert(out.contextText.includes("Refunds are issued within 28 days"), "the snapshot passage reaches the context");
  assert(out.traceSteps.some((s) => /Nothing in the database/.test(s)), "the trace says why", out.traceSteps);
}

console.log("\n3. embed mode without an owned site (business widget) → no rack at all");
{
  reset([CHUNK]);
  await rag.searchAll({ jobIds: ["job-1"], rackInstitutionId: null, userId: 1, query: "refund policy withdrawal" });
  assert(rackQueries() === 0, "match_ai_knowledge_chunks is not called");
}

console.log("\n4. platform mode → global rack still runs alongside the DB, hit or not");
{
  reset([COURSE, CHUNK]);
  const out = await rag.searchAll({ userId: 1, query: "nursing degree" });
  assert(rackQueries() === 1, "match_ai_knowledge_chunks is called even though a course was found");
  assert(out.contextText.includes("Bachelor of Nursing") && out.contextText.includes("Refund policy"), "both reach the context");
}

console.log(`\n${passed} passed, ${failed} failed`);
await masterKnex.destroy().catch(() => {});
process.exit(failed ? 1 : 0);
export { };

