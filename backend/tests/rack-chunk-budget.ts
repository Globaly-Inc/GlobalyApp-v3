/**
 * capPerDocument() test — the rack chunk budget shared by both retrieval paths
 * (rag.service's searchAll and the search_knowledge tool).
 * Run: node --import tsx tests/rack-chunk-budget.ts   (or: npm run test:rack-chunk-budget)
 *
 * Style matches tests/ai-tool-loop.ts: plain tsx script, manual counters, no framework.
 * Pure function, so no mocks, no DB and no API key are needed.
 *
 * The case that matters: a rack holding ONE document was being throttled to 2 chunks
 * per turn, so a question whose answer sat outside the top 2 got answered from whichever
 * sections did make it — confidently, and about something else.
 */

import { MAX_CHUNKS_PER_DOCUMENT, capPerDocument } from "../src/modules/ai-counsellor/lib/tools.js";

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

/** Chunks as they arrive from match_ai_knowledge_chunks: already ordered by similarity. */
const chunk = (document_id: string, id: string) => ({ document_id, id });

function main() {
  console.log("\ncapPerDocument — single document");
  {
    // One 26-section reference doc: every hit is the same document_id.
    const hits = Array.from({ length: 8 }, (_, i) => chunk("doc-us", `c${i}`));
    const out = capPerDocument(hits);
    assertEqual(out.length, 8, "all 8 chunks survive when there is only one document");
    assertEqual(out.map((c) => c.id).join(","), "c0,c1,c2,c3,c4,c5,c6,c7", "order preserved");
  }

  console.log("\ncapPerDocument — multiple documents");
  {
    // A long page (doc-a) crowding out two other sources: the cap must still bite.
    const hits = [
      chunk("doc-a", "a0"), chunk("doc-a", "a1"), chunk("doc-a", "a2"), chunk("doc-a", "a3"),
      chunk("doc-b", "b0"), chunk("doc-b", "b1"), chunk("doc-b", "b2"),
      chunk("doc-c", "c0"),
    ];
    const out = capPerDocument(hits);
    assertEqual(out.length, 5, "capped to 2 per document + the single-chunk document");
    assertEqual(out.map((c) => c.id).join(","), "a0,a1,b0,b1,c0", "keeps the best 2 of each, in order");
    const perDoc = new Map<string, number>();
    for (const c of out) perDoc.set(c.document_id, (perDoc.get(c.document_id) ?? 0) + 1);
    assert(
      [...perDoc.values()].every((n) => n <= MAX_CHUNKS_PER_DOCUMENT),
      "no document exceeds MAX_CHUNKS_PER_DOCUMENT",
      [...perDoc],
    );
  }

  console.log("\ncapPerDocument — edges");
  {
    assertEqual(capPerDocument([]).length, 0, "empty input is empty output");
    assertEqual(capPerDocument([chunk("doc-a", "a0")]).length, 1, "one chunk survives");
    // Two documents, one chunk each — the cap is active but has nothing to trim.
    assertEqual(
      capPerDocument([chunk("doc-a", "a0"), chunk("doc-b", "b0")]).length,
      2,
      "two documents with one chunk each are untouched",
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
