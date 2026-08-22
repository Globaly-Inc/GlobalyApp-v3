/**
 * Chunk + embed rack documents.
 *
 *   npm run chunk:backfill                 # documents with no chunks yet
 *   npm run chunk:backfill -- --all        # re-chunk everything (after a chunker change)
 *   npm run chunk:backfill -- --limit 5    # first N, for a smoke test
 *   npm run chunk:backfill -- --source <uuid>
 *
 * Two real jobs, neither hypothetical:
 *   1. Repair. knowledge-crawl.worker.ts treats chunking as best-effort, so a chunk
 *      or embed failure leaves the document stored with chunk_count = 0. This is how
 *      those get picked up.
 *   2. Re-chunk. Change the sizing in lib/chunker.ts and --all re-runs the corpus.
 *
 * Rerunnable either way — ingestDocumentChunks replaces a document's chunks, never
 * appends to them.
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { isConfigured } from "../src/modules/superadmin/data-extraction/lib/llm-client.js";
import { ingestDocumentChunks } from "../src/modules/superadmin/ai-knowledge/lib/ingest.js";

const DOCUMENTS = "superadmin.ai_knowledge_documents";

// ponytail: fixed pace between documents; ingest.ts already caps concurrency
// within a document, this just keeps a 60-chunk doc from being followed instantly
// by the next one.
const DELAY_MS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const argValue = (flag: string): string | undefined => {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
};

if (!isConfigured()) {
  console.error("GEMINI_API_KEY not configured — chunks would be written without vectors. Aborting.");
  process.exit(1);
}

const limit = Number(argValue("--limit") ?? 0);
const sourceId = argValue("--source");
const all = process.argv.includes("--all");

const query = masterKnex(DOCUMENTS)
  .select("id", "title", "markdown")
  .whereNotNull("markdown")
  .orderBy("crawled_at", "asc");
if (!all) query.where("chunk_count", 0);
if (sourceId) query.where("source_id", sourceId);
if (limit > 0) query.limit(limit);

const documents = await query;
console.log(`${documents.length} document(s) to ${all ? "re-chunk" : "chunk"}`);

let chunks = 0;
let embedded = 0;
let failed = 0;

for (const [index, doc] of documents.entries()) {
  try {
    const result = await ingestDocumentChunks(doc.id, doc.markdown, { title: doc.title });
    chunks += result.chunks;
    embedded += result.embedded;
    console.log(
      `  [${index + 1}/${documents.length}] ${doc.title ?? doc.id}: ${result.chunks} chunks, ${result.embedded} embedded`,
    );
  } catch (e) {
    failed++;
    console.error(`  [${index + 1}/${documents.length}] ${doc.id}: ${(e as Error).message.slice(0, 200)}`);
  }
  await sleep(DELAY_MS);
}

const [{ c: remaining }] = await masterKnex(DOCUMENTS).where("chunk_count", 0).count("* as c");
console.log(`\nDone: ${chunks} chunks written, ${embedded} embedded, ${failed} document(s) failed`);
if (Number(remaining) > 0) {
  console.log(`${remaining} document(s) still un-chunked — they keep using the document-level fallback.`);
}

await masterKnex.destroy();
