/**
 * Backfill NULL pgvector embeddings — needed after `npm run import:v2`, which
 * deliberately drops V2's OpenAI vectors (1536 dims, incompatible with V3's
 * Gemini 3072). Rerunnable: only touches rows where embedding IS NULL, so an
 * interrupted run just resumes.
 *
 *   npm run embed:backfill
 *   npm run embed:backfill -- --tables extraction_memory
 *
 * Rack documents are NOT here any more: 20260822_001 moved their vectors onto
 * ai_knowledge_chunks, so `npm run chunk:backfill` is what re-embeds the rack.
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { embed, isConfigured } from "../src/modules/superadmin/data-extraction/lib/llm-client.js";

const S = "superadmin";

interface Target {
  table: string;
  columns: string[];
  /** Text to embed — same construction the live writers use. */
  textOf: (row: Record<string, string | null>) => string | null;
}

const TARGETS: Target[] = [
  {
    table: "extraction_memory",
    columns: ["id", "source_excerpt"],
    // Mirrors memory-client.ts rememberMemory()
    textOf: (r) => r.source_excerpt || null,
  },
];

// ponytail: fixed pace, ~5 req/s keeps well under Gemini embed rate limits
const DELAY_MS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function backfillTable(t: Target) {
  const rows: Record<string, string | null>[] = await masterKnex(`${S}.${t.table}`)
    .select(t.columns)
    .whereNull("embedding");

  console.log(`${t.table}: ${rows.length} rows missing embeddings`);
  let done = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const text = t.textOf(row);
    if (!text) { skipped++; continue; }
    try {
      const vector = await embed(text);
      await masterKnex(`${S}.${t.table}`)
        .where({ id: row.id })
        .update({ embedding: masterKnex.raw("?::vector", [`[${vector.join(",")}]`]) });
      done++;
    } catch (e) {
      failed++;
      console.error(`  ${t.table}/${row.id}: ${(e as Error).message.slice(0, 150)}`);
    }
    if (done % 50 === 0 && done > 0) console.log(`  ${t.table}: ${done}/${rows.length}`);
    await sleep(DELAY_MS);
  }

  console.log(`${t.table}: embedded ${done}, skipped ${skipped} (no text), failed ${failed}`);
}

if (!isConfigured()) {
  console.error("GEMINI_API_KEY not configured — cannot embed.");
  process.exit(1);
}

const flagIdx = process.argv.indexOf("--tables");
const only = flagIdx === -1 ? null : new Set(process.argv[flagIdx + 1]?.split(",").map((s) => s.trim()));
const targets = only ? TARGETS.filter((t) => only.has(t.table)) : TARGETS;

for (const t of targets) await backfillTable(t);
await masterKnex.destroy();
