/**
 * Phase 6→8 flow test — one pass through the real code with only the wire faked:
 *
 *   upload a markdown doc → chunk → embed → store        (Phase 6, ingest)
 *   retrieve chunks → build the counsellor's context      (Phase 6, retrieval)
 *   model calls a search tool → dispatcher hits the DB    (Phase 7)
 *   model records what it learned → prompt carries it     (Phase 8)
 *
 * Run: node --import tsx tests/ai-counsellor-flow.ts  (or: npm run test:ai-counsellor-flow)
 *
 * What is faked, and only this:
 *   - the Postgres wire. knex's own query building and result handling still run —
 *     the fake sits at acquireConnection, so every SQL statement the services
 *     generate is real and gets captured for assertions.
 *   - GCS, via Storage.prototype.bucket.
 *   - the Gemini embedding endpoint, via global.fetch.
 *   - the Gemini chat SDK, via getGenerativeModel.
 *
 * Everything between those boundaries is production code, including the chunker
 * running over a real excerpt of docs/ai-counsellor/DOMESTIC_EDUCATION_SYSTEM/NEPAL.md.
 *
 * Style matches tests/scraper-cascade.ts: plain tsx script, manual counters, no framework.
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";
process.env.GEMINI_API_KEY = "test-key";
process.env.GCS_BUCKET_NAME = "test-bucket";
process.env.GCS_PROJECT_ID = "test-project";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Storage } from "@google-cloud/storage";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { masterKnex } from "../src/core/db/master-pool.js";
import { normaliseMarkdown } from "../src/modules/superadmin/ai-knowledge/lib/chunker.js";
import { streamChatWithTools } from "../src/modules/ai-counsellor/lib/gemini-stream.js";
import { runTool, toolsFor } from "../src/modules/ai-counsellor/lib/tools.js";
import { buildSystemPrompt } from "../src/modules/ai-counsellor/services/prompt.service.js";
import * as rag from "../src/modules/ai-counsellor/services/rag.service.js";
import * as rackService from "../src/modules/superadmin/ai-knowledge/services/rack.service.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const assertEqual = (actual: unknown, expected: unknown, label: string) =>
  assert(actual === expected, label, { actual, expected });

// ─── Fake Postgres wire ──────────────────────────────────────────────────────

interface Statement {
  sql: string;
  values: unknown[];
}

type PgResponse = { command: string; rows: unknown[]; rowCount?: number };
type Route = [RegExp, (stmt: Statement) => PgResponse];

const statements: Statement[] = [];
let routes: Route[] = [];

const rows = (rowList: unknown[], command = "SELECT"): PgResponse => ({
  command,
  rows: rowList,
  rowCount: rowList.length,
});

/** Default: SELECTs find nothing, writes succeed and echo one row back. */
function defaultResponse(sql: string): PgResponse {
  const head = sql.trim().slice(0, 6).toUpperCase();
  if (head.startsWith("INSERT")) return rows([{ id: "generated-id" }], "INSERT");
  if (head.startsWith("UPDATE")) return { command: "UPDATE", rows: [{ id: "generated-id" }], rowCount: 1 };
  if (head.startsWith("DELETE")) return { command: "DELETE", rows: [], rowCount: 1 };
  return rows([]);
}

function installFakeDb() {
  const client = masterKnex.client as unknown as {
    acquireConnection: () => Promise<unknown>;
    releaseConnection: (c: unknown) => Promise<void>;
  };
  client.acquireConnection = async () => ({
    query(
      queryConfig: { text: string; values: unknown[] },
      callback: (err: Error | null, response?: PgResponse) => void,
    ) {
      const stmt = { sql: queryConfig.text, values: queryConfig.values ?? [] };
      statements.push(stmt);
      const route = routes.find(([re]) => re.test(stmt.sql));
      callback(null, route ? route[1](stmt) : defaultResponse(stmt.sql));
    },
  });
  client.releaseConnection = async () => {};
}

const sqlFor = (re: RegExp) => statements.filter((s) => re.test(s.sql));
const reset = (newRoutes: Route[] = []) => {
  statements.length = 0;
  routes = newRoutes;
};

// ─── Fake GCS + embedding endpoint ───────────────────────────────────────────

const uploaded: Array<{ path: string; bytes: number; mime: string }> = [];
const deletedObjects: string[] = [];

function installFakeStorage() {
  Storage.prototype.bucket = ((_name: string) => ({
    file: (path: string) => ({
      save: async (buffer: Buffer, opts: { contentType: string }) => {
        uploaded.push({ path, bytes: buffer.length, mime: opts.contentType });
      },
      delete: async () => { deletedObjects.push(path); },
      download: async () => [Buffer.from("")],
      exists: async () => [true],
    }),
  })) as unknown as typeof Storage.prototype.bucket;
}

let embedCalls = 0;
const EMBEDDING_DIMS = 3072;

function installFakeEmbedding() {
  // One unit vector per call — embed() validates the dimension count and normalises.
  const vector = Array.from({ length: EMBEDDING_DIMS }, (_, i) => (i === 0 ? 1 : 0));
  global.fetch = (async () => {
    embedCalls++;
    return {
      ok: true,
      json: async () => ({ embedding: { values: vector } }),
      text: async () => "",
    } as unknown as Response;
  }) as typeof global.fetch;
}

// ─── Fake Gemini chat ────────────────────────────────────────────────────────

interface Turn {
  chunks?: string[];
  calls?: Array<{ name: string; args: Record<string, unknown> }>;
}

function mockGeminiChat(turns: Turn[]) {
  let at = 0;
  const session = (toolsAvailable: boolean) => ({
    sendMessageStream: async () => {
      const turn = turns[Math.min(at, turns.length - 1)];
      at++;
      return {
        stream: (async function* () {
          for (const text of turn.chunks ?? []) yield { text: () => text };
        })(),
        response: Promise.resolve({
          functionCalls: () => (toolsAvailable ? turn.calls : undefined),
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }),
      };
    },
    getHistory: async () => [],
  });
  GoogleGenerativeAI.prototype.getGenerativeModel = (() => ({
    startChat: (params: { tools?: unknown[] }) => session(!!params?.tools),
  })) as unknown as typeof GoogleGenerativeAI.prototype.getGenerativeModel;
}

// ─── Real source material ────────────────────────────────────────────────────

/** A real slice of the Nepal research doc — headings and tables intact. */
const NEPAL_EXCERPT = readFileSync(
  new URL("../../docs/ai-counsellor/DOMESTIC_EDUCATION_SYSTEM/NEPAL.md", import.meta.url),
  "utf-8",
).slice(0, 24_000);

const CATEGORY_ID = "11111111-1111-1111-1111-111111111111";
const SOURCE_ID = "22222222-2222-2222-2222-222222222222";
const DOCUMENT_ID = "33333333-3333-3333-3333-333333333333";

async function main() {
  installFakeDb();
  installFakeStorage();
  installFakeEmbedding();

  // ── Step 1: upload a markdown document (Phase 6, ingest) ──
  console.log("\nPhase 6 — upload, chunk, embed, store");
  reset([
    [/ai_knowledge_categories/i, () => rows([{ id: CATEGORY_ID, kind: "country_guide" }])],
    [/insert into "superadmin"\."ai_knowledge_sources"/i, () => rows([{ id: SOURCE_ID }], "INSERT")],
    [/insert into "superadmin"\."ai_knowledge_documents"/i, () => rows([{ id: DOCUMENT_ID }], "INSERT")],
    [/update "superadmin"\."ai_knowledge_sources"/i, () => ({
      command: "UPDATE", rows: [{ id: SOURCE_ID, last_status: "ok" }], rowCount: 1,
    })],
  ]);

  const upload = await rackService.uploadSource(
    { category_id: CATEGORY_ID, trust_tier: "gov", title: "Nepal — Domestic Education System" },
    { name: "NEPAL.md", buffer: Buffer.from(NEPAL_EXCERPT, "utf-8") },
    42,
  );

  assert(upload.chunks > 5, "the document is split into several chunks", upload.chunks);
  assertEqual(upload.embedded, upload.chunks, "every chunk got an embedding");
  assertEqual(embedCalls, upload.chunks, "one embedding request per chunk");

  assertEqual(uploaded.length, 1, "the file was stored once");
  assert(
    uploaded[0]!.path.startsWith(`ai-knowledge/uploads/${CATEGORY_ID}/`),
    "stored under the category path", uploaded[0]?.path,
  );
  assertEqual(uploaded[0]!.mime, "text/markdown", "markdown mime is recorded");

  const sourceInsert = sqlFor(/insert into "superadmin"\."ai_knowledge_sources"/i)[0];
  assert(!!sourceInsert, "a source row was inserted");
  assert(sourceInsert!.values.includes("file"), "inserted as source_type = file", sourceInsert!.values);
  assert(sourceInsert!.values.includes("upload"), "domain is 'upload' (the column is NOT NULL)");
  assert(sourceInsert!.values.includes("off"), "crawl_frequency is off — a file has nothing to re-crawl");

  const chunkInserts = sqlFor(/insert into "superadmin"\."ai_knowledge_chunks"/i);
  assert(chunkInserts.length > 0, "chunks were inserted");
  const headingPaths = chunkInserts.flatMap((s) =>
    s.values.filter((v): v is string => typeof v === "string" && v.includes(">")),
  );
  assert(headingPaths.length > 0, "chunks carry a heading breadcrumb", headingPaths[0]);
  assert(
    sqlFor(/delete from "superadmin"\."ai_knowledge_chunks"/i).length === 1,
    "stale chunks are cleared before writing new ones",
  );
  assert(
    sqlFor(/update "superadmin"\."ai_knowledge_documents" set "chunk_count"/i).length === 1,
    "chunk_count is written back to the document",
  );
  assertEqual(deletedObjects.length, 0, "nothing was rolled back on the happy path");

  // ── Step 1b: re-uploading the same filename updates it in place ──
  console.log("\nPhase 6 — re-upload replaces, never duplicates");
  const EXISTING = {
    id: SOURCE_ID, file_path: "ai-knowledge/uploads/old-object.md",
    source_type: "file", file_name: "NEPAL.md",
  };
  reset([
    [/ai_knowledge_categories/i, () => rows([{ id: CATEGORY_ID }])],
    // The lookup that makes a re-upload an update.
    [/select \* from "superadmin"\."ai_knowledge_sources".*"file_name"/is, () => rows([EXISTING])],
    [/from "superadmin"\."ai_knowledge_documents"/i, () => rows([
      { id: DOCUMENT_ID, source_id: SOURCE_ID, title: "Nepal", content_hash: "stale-hash", chunk_count: 14 },
    ])],
    [/update "superadmin"\."ai_knowledge_documents"/i, () => ({
      command: "UPDATE", rows: [{ id: DOCUMENT_ID }], rowCount: 1,
    })],
    [/update "superadmin"\."ai_knowledge_sources"/i, () => ({
      command: "UPDATE", rows: [{ id: SOURCE_ID }], rowCount: 1,
    })],
  ]);
  uploaded.length = 0;
  deletedObjects.length = 0;

  const reupload = await rackService.uploadSource(
    { category_id: CATEGORY_ID, trust_tier: "gov" },
    { name: "NEPAL.md", buffer: Buffer.from(NEPAL_EXCERPT, "utf-8") },
    42,
  );

  assertEqual(reupload.replaced, true, "the re-upload is reported as a replacement");
  assertEqual(reupload.unchanged, false, "changed content is re-ingested");
  assertEqual(reupload.document_id, DOCUMENT_ID, "the same document row is reused");
  assertEqual(
    sqlFor(/insert into "superadmin"\."ai_knowledge_sources"/i).length, 0,
    "no second source row is created",
  );
  assertEqual(
    sqlFor(/insert into "superadmin"\."ai_knowledge_documents"/i).length, 0,
    "no second document row is created",
  );
  assert(
    sqlFor(/delete from "superadmin"\."ai_knowledge_chunks"/i).length === 1,
    "the previous chunks are cleared",
  );
  assert(reupload.chunks > 5, "the new content is chunked", reupload.chunks);
  assert(
    deletedObjects.includes(EXISTING.file_path),
    "the superseded file is removed from storage", deletedObjects,
  );

  // Byte-identical content skips the embedding work entirely.
  reset([
    [/ai_knowledge_categories/i, () => rows([{ id: CATEGORY_ID }])],
    [/select \* from "superadmin"\."ai_knowledge_sources".*"file_name"/is, () => rows([EXISTING])],
    [/from "superadmin"\."ai_knowledge_documents"/i, () => rows([
      {
        id: DOCUMENT_ID, source_id: SOURCE_ID, title: "Nepal", chunk_count: 14,
        content_hash: createHash("sha256").update(normaliseMarkdown(NEPAL_EXCERPT)).digest("hex"),
      },
    ])],
  ]);
  const embedsBefore = embedCalls;
  const again = await rackService.uploadSource(
    { category_id: CATEGORY_ID, trust_tier: "gov" },
    { name: "NEPAL.md", buffer: Buffer.from(NEPAL_EXCERPT, "utf-8") },
    42,
  );
  assertEqual(again.unchanged, true, "identical content is detected as unchanged");
  assertEqual(embedCalls, embedsBefore, "unchanged content costs no embedding calls");
  assertEqual(
    sqlFor(/delete from "superadmin"\."ai_knowledge_chunks"/i).length, 0,
    "unchanged content leaves its chunks alone",
  );

  // ── Step 2: a failed upload leaves nothing behind ──
  console.log("\nPhase 6 — failed upload rolls back");
  reset([
    [/ai_knowledge_categories/i, () => rows([{ id: CATEGORY_ID }])],
    [/insert into "superadmin"\."ai_knowledge_sources"/i, () => rows([{ id: SOURCE_ID }], "INSERT")],
  ]);
  uploaded.length = 0;
  deletedObjects.length = 0;

  let uploadError: string | null = null;
  await rackService
    .uploadSource(
      { category_id: CATEGORY_ID, trust_tier: "other" },
      { name: "empty.md", buffer: Buffer.from("   \n  ", "utf-8") },
      42,
    )
    .catch((e: Error) => { uploadError = e.message; });

  assert(uploadError !== null, "an unreadable file is rejected", uploadError);
  assertEqual(deletedObjects.length, 1, "the stored object is deleted on failure");
  assertEqual(
    sqlFor(/delete from "superadmin"\."ai_knowledge_sources"/i).length, 1,
    "the source row is deleted on failure — no half-ingested rack entry",
  );

  // ── Step 3: a file source cannot be crawled ──
  reset([[/from "superadmin"\."ai_knowledge_sources"/i, () => rows([
    { id: SOURCE_ID, active: true, source_type: "file", category_id: CATEGORY_ID },
  ])]]);
  let crawlError: string | null = null;
  await rackService.crawlSource(SOURCE_ID, undefined, 42).catch((e: Error) => { crawlError = e.message; });
  assert(
    crawlError !== null && /nothing to crawl/i.test(String(crawlError)),
    "crawling an uploaded file is refused", crawlError,
  );

  // ── Step 4: retrieval reaches the counsellor's context (Phase 6, read side) ──
  console.log("\nPhase 6 — chunk retrieval into the prompt context");
  const longPassage = "Nepal's Grade 12 examination is administered by the National Examinations Board. "
    .repeat(40); // ~3,200 chars — the old path truncated at 1,500
  reset([
    [/from "countries"/i, () => rows([{ name: "Nepal", iso2: "NP" }])],
    [/match_ai_knowledge_chunks/i, () => rows([
      {
        id: "c1", document_id: DOCUMENT_ID, content: longPassage,
        heading_path: "1. Country Education System Overview > 1.1 Governing authority",
        page_number: null, similarity: 0.91, title: "Nepal — Domestic Education System",
        url: null, file_name: "NEPAL.md", source_type: "file",
        category_label: "Country guides", source_domain: "upload", trust_tier: "gov",
      },
      {
        id: "c2", document_id: DOCUMENT_ID, content: "Second passage from the same document.",
        heading_path: "2. Qualifications", page_number: null, similarity: 0.88,
        title: "Nepal — Domestic Education System", url: null, file_name: "NEPAL.md",
        source_type: "file", category_label: "Country guides", source_domain: "upload",
        trust_tier: "gov",
      },
      {
        id: "c3", document_id: DOCUMENT_ID, content: "Third passage — should be capped out.",
        heading_path: "3. Grading", page_number: null, similarity: 0.80,
        title: "Nepal — Domestic Education System", url: null, file_name: "NEPAL.md",
        source_type: "file", category_label: "Country guides", source_domain: "upload",
        trust_tier: "gov",
      },
    ])],
  ]);

  const ragOutput = await rag.searchAll({ query: "How does grading work in Nepal?", userId: 7 });

  assert(ragOutput.contextText.includes(longPassage.trim().slice(0, 1600)),
    "the full passage reaches the context — no 1,500-char truncation");
  assert(ragOutput.contextText.includes("1.1 Governing authority"),
    "the heading breadcrumb is in the context");
  assert(ragOutput.contextText.includes("NEPAL.md"),
    "an uploaded file is cited by filename, not a URL");
  assert(ragOutput.contextText.includes("official government source"),
    "the trust tier is stated for the model");
  assert(!ragOutput.contextText.includes("Third passage"),
    "no more than two chunks from one document");
  assertEqual(ragOutput.sources.length, 1, "two chunks of one document are one source");
  assertEqual(ragOutput.sources[0]?.id, DOCUMENT_ID, "the source points at the document");

  // ── Step 5: the model's own tool call runs against the same data (Phase 7) ──
  console.log("\nPhase 7 — tool dispatch");
  reset([
    [/from "superadmin"\."ai_knowledge_faqs"/i, () => rows([
      { id: "f1", question: "Is SEE the same as Grade 10?", answer: "Yes." },
    ])],
    [/match_ai_knowledge_chunks/i, () => rows([
      {
        id: "c1", document_id: DOCUMENT_ID, content: "Grade 12 is the standard basis for university entry.",
        heading_path: "2. Qualifications", page_number: 4, similarity: 0.93,
        title: "Nepal — Domestic Education System", url: null, file_name: "NEPAL.md",
        source_type: "file", category_label: "Country guides", source_domain: "upload",
        trust_tier: "gov",
      },
    ])],
  ]);

  const knowledgeRun = await runTool("search_knowledge", { query: "Grade 12 Nepal", country_code: "np" }, {
    sessionId: 99,
  });
  const knowledgeResult = knowledgeRun.result as {
    passages: Array<{ content: string; authority: string; source: string; page: number | null }>;
    faqs: unknown[];
  };
  assertEqual(knowledgeResult.passages.length, 1, "the tool returns the retrieved passage");
  assertEqual(knowledgeResult.passages[0]?.authority, "gov", "authority travels with the passage");
  assertEqual(knowledgeResult.passages[0]?.page, 4, "page attribution travels with the passage");
  assertEqual(knowledgeResult.faqs.length, 1, "curated FAQs come back in the same call");
  assert(knowledgeRun.sources.some((s) => s.id === DOCUMENT_ID), "the passage's document is cited");
  assert(knowledgeRun.sources.some((s) => s.type === "faq"), "the FAQ is cited");

  const chunkCall = sqlFor(/match_ai_knowledge_chunks/i)[0];
  assert(chunkCall!.values.includes("NP"), "the country filter is uppercased and passed to SQL",
    chunkCall!.values.at(-1));

  // ── Step 6: recording what was learned, and reading it back (Phase 8) ──
  console.log("\nPhase 8 — counselling context");
  reset([
    [/from "ai_counselor_sessions"/i, () => rows([
      { id: 99, counselling_context: { interests: ["mathematics"], stage: "exploring" } },
    ])],
  ]);

  const contextRun = await runTool("update_student_context", {
    interests: ["Mathematics", "data science"],
    constraints: ["budget under AUD 40,000"],
    stage: "narrowing",
  }, { sessionId: 99 });

  const recorded = (contextRun.result as { context: Record<string, unknown> }).context;
  assert(Array.isArray(recorded.interests) && (recorded.interests as string[]).length === 2,
    "the repeated interest is not duplicated", recorded.interests);
  assertEqual(recorded.stage, "narrowing", "the stage was advanced");
  assert(Array.isArray(recorded.constraints), "the new constraint was stored");

  const contextUpdate = sqlFor(/update "ai_counselor_sessions" set "counselling_context"/i)[0];
  assert(!!contextUpdate, "the merged context is written back to the session");
  assert(
    String(contextUpdate!.values[0]).includes("data science"),
    "the written JSON carries the new interest", contextUpdate!.values[0],
  );

  const prompt = buildSystemPrompt({
    profile: null,
    ragContext: "",
    isFirstMessage: false,
    toolMode: true,
    counsellingContext: recorded as never,
  });
  assert(prompt.includes("never re-ask"), "the prompt tells the model not to re-ask what it knows");
  assert(prompt.includes("data science"), "what was learned is in the prompt");
  assert(prompt.includes("narrowing down"), "the stage becomes behavioural guidance");
  assert(prompt.includes("not saved to their profile"),
    "the prompt is explicit that session context is not the permanent profile");
  assert(/never record health/i.test(prompt), "the sensitive-data rule is present");

  // ── Step 7: one full turn — search, record, answer (Phases 7 + 8 together) ──
  console.log("\nPhases 7+8 — a full turn through the agent loop");
  reset([
    [/from "ai_counselor_sessions"/i, () => rows([{ id: 99, counselling_context: {} }])],
    [/match_ai_knowledge_chunks/i, () => rows([
      {
        id: "c1", document_id: DOCUMENT_ID, content: "Post-study work rights run two to four years.",
        heading_path: "6. Post-study work", page_number: null, similarity: 0.9,
        title: "Australia", url: "https://immi.homeaffairs.gov.au/", file_name: null,
        source_type: "url", category_label: "Visa", source_domain: "immi.homeaffairs.gov.au",
        trust_tier: "gov",
      },
    ])],
  ]);
  mockGeminiChat([
    { calls: [{ name: "search_knowledge", args: { query: "post study work Australia" } }] },
    { calls: [{ name: "update_student_context", args: { preferred_countries: ["Australia"], stage: "narrowing" } }] },
    { chunks: ["Australia gives you two to four years of post-study work rights. "] },
  ]);

  const executed: string[] = [];
  const turn = await streamChatWithTools({
    system: "test",
    history: [],
    userMessage: "What are my post-study work options in Australia?",
    tools: toolsFor(),
    onChunk: () => {},
    runTool: async (name, args) => {
      executed.push(name);
      return (await runTool(name, args, { sessionId: 99 })).result;
    },
  });

  assertEqual(executed.join(" → "), "search_knowledge → update_student_context",
    "the model searched, then recorded what it learned");
  assertEqual(turn.toolRounds, 2, "two tool rounds in one turn");
  assert(turn.fullText.includes("post-study work rights"), "the answer streamed after the tools ran");
  assert(sqlFor(/match_ai_knowledge_chunks/i).length === 1, "retrieval ran once against the rack");
  assert(
    sqlFor(/update "ai_counselor_sessions" set "counselling_context"/i).length === 1,
    "the session context was persisted during the turn",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  if (failed > 0) process.exit(1);
}

main();
