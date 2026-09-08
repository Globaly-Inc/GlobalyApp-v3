/**
 * Embedding test — the four things that actually break in the embedding stack:
 *   1. contract   — EMBEDDING_DIMS matches what the DB columns were created at
 *   2. the model  — embed() still returns 3072 unit-norm dims (a retired model 404s here)
 *   3. semantics  — related text scores higher than unrelated text (normalisation/model swap)
 *   4. retrieval  — match_ai_knowledge_chunks() ranks a live query embedding sanely
 *
 * Run: node --import tsx tests/embeddings.ts   (or: npm run test:embeddings)
 *
 * Every group degrades to SKIP instead of failing when its dependency is absent —
 * no GEMINI_API_KEY, no OPENROUTER_API_KEY, or no reachable DB. READ-ONLY: it never
 * writes a row and never touches the schema.
 *
 * Style matches tests/chunker.ts: plain tsx script, manual counters, no framework.
 */

import "dotenv/config";
import { config } from "../src/config.js";
import { masterKnex } from "../src/core/db/master-pool.js";
import { embedTextFor } from "../src/modules/superadmin/ai-knowledge/lib/chunker.js";
import { EMBEDDING_DIMS, embed, isEmbedConfigured } from "../src/modules/superadmin/data-extraction/lib/llm-client.js";
import { matchKnowledgeChunks } from "../src/modules/ai-counsellor/repositories/knowledge.repository.js";
import { isORConfigured, orEmbed } from "../src/shared/ai/openrouter.js";

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

function skip(label: string, why: string) {
  skipped++;
  console.log(`  skip ${label} — ${why}`);
}

/** Both vectors are unit-norm by the time embed() returns, so the dot product IS the cosine. */
const cosine = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i]!, 0);
const norm = (v: number[]) => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));

// ── 1. Contract: the dimension every embedding column was created at ──────────
console.log("\n1. Dimension contract");
{
  assert(EMBEDDING_DIMS === 3072, "EMBEDDING_DIMS is 3072 (gemini-embedding-001 native width)", EMBEDDING_DIMS);

  // The text the ingest path actually embeds is chunk + its breadcrumb, not chunk alone —
  // a chunk embedded without its heading loses the topic and retrieval quality drops.
  const withPath = embedTextFor("Applicants need IELTS 6.5.", "Entry Requirements > English", "Nepal Guide");
  assert(withPath.startsWith("Entry Requirements > English"), "embedTextFor prefixes the heading path");
  assert(withPath.includes("IELTS 6.5"), "embedTextFor keeps the chunk content");
  assert(
    embedTextFor("body", null, "Nepal Guide").startsWith("Nepal Guide"),
    "embedTextFor falls back to the document title",
  );
}

// ── 2. The model: a live call still returns a usable vector ───────────────────
console.log(`\n2. Live embed() call — EMBEDDING_PROVIDER=${config.EMBEDDING_PROVIDER}`);
let queryVector: number[] | null = null;
if (!isEmbedConfigured()) {
  skip("live embed()", `no key for EMBEDDING_PROVIDER=${config.EMBEDDING_PROVIDER}`);
} else {
  try {
    const v = await embed("Student visa requirements for studying in Australia");
    queryVector = v;
    assert(v.length === EMBEDDING_DIMS, `embed() returns ${EMBEDDING_DIMS} dims`, v.length);
    assert(Math.abs(norm(v) - 1) < 1e-6, "embed() returns a unit-norm vector", norm(v));
    assert(v.every((x) => Number.isFinite(x)), "no NaN/Infinity in the vector");
  } catch (e) {
    assert(false, "embed() call succeeded", (e as Error).message.slice(0, 200));
  }
}

// ── 3. Semantics: related beats unrelated ─────────────────────────────────────
// The check that catches a silently swapped model or a broken normalisation: the numbers
// still look like a vector, but the ordering is gone and retrieval quietly returns noise.
console.log("\n3. Semantic ordering");
if (!queryVector) {
  skip("semantic ordering", "no live embedding available");
} else {
  try {
    const [related, unrelated] = await Promise.all([
      embed("Subclass 500 student visa conditions and financial evidence for Australia"),
      embed("A sourdough starter needs flour, water and a warm kitchen shelf"),
    ]);
    const near = cosine(queryVector, related!);
    const far = cosine(queryVector, unrelated!);
    console.log(`       related=${near.toFixed(4)}  unrelated=${far.toFixed(4)}`);
    assert(near > far, "related text scores above unrelated text", { near, far });
    assert(near > 0.5, "related text clears a 0.5 cosine floor", near);
    assert(near <= 1.0001 && far >= -1.0001, "cosines stay inside [-1, 1]", { near, far });
  } catch (e) {
    assert(false, "semantic comparison ran", (e as Error).message.slice(0, 200));
  }
}

// ── 4. Retrieval: the DB side of the same contract ────────────────────────────
console.log("\n4. pgvector storage + retrieval");
let dbUp = false;
try {
  await masterKnex.raw("select 1");
  dbUp = true;
} catch (e) {
  skip("pgvector checks", `DB unreachable (${(e as Error).message.slice(0, 60)})`);
}

if (dbUp) {
  // Every embedding column must be the width embed() produces, or the insert fails at runtime.
  const { rows: cols } = await masterKnex.raw(
    `SELECT c.relname AS table, a.atttypmod AS dims
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'superadmin' AND c.relkind = 'r' AND a.attname = 'embedding'
        AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname`,
  );
  assert(cols.length > 0, "found embedding columns in the superadmin schema");
  for (const col of cols as { table: string; dims: number }[]) {
    assert(col.dims === EMBEDDING_DIMS, `${col.table}.embedding is vector(${EMBEDDING_DIMS})`, col.dims);
  }

  const { rows: counts } = await masterKnex.raw(
    `SELECT count(*)::int AS total, count(embedding)::int AS embedded
       FROM superadmin.ai_knowledge_chunks`,
  );
  const { total, embedded } = counts[0] as { total: number; embedded: number };
  console.log(`       ai_knowledge_chunks: ${embedded}/${total} embedded`);

  if (!queryVector) {
    skip("matchKnowledgeChunks()", "no live query embedding");
  } else if (embedded === 0) {
    skip("matchKnowledgeChunks()", "no embedded chunks — run npm run chunk:backfill");
  } else {
    const hits = await matchKnowledgeChunks(queryVector, 5);
    assert(hits.length > 0, "match_ai_knowledge_chunks returns hits");
    const sims = hits.map((h) => h.similarity);
    assert(
      sims.every((s, i) => i === 0 || s <= sims[i - 1]! + 1e-9),
      "hits come back sorted by similarity, descending",
      sims,
    );
    assert(sims.every((s) => s >= -1.0001 && s <= 1.0001), "similarities stay inside [-1, 1]", sims);
    // Eyeball check: these should read as visa/Australia material, not random pages.
    for (const hit of hits) {
      console.log(`       ${hit.similarity.toFixed(4)}  ${hit.title ?? hit.url ?? hit.id}`);
    }
  }
}

// ── 5. OpenRouter fallback, same width ───────────────────────────────────────
// embed() silently falls back to this when Gemini errors, so a width mismatch here
// only ever surfaces as a failed insert during an outage — the worst time to find out.
console.log("\n5. OpenRouter fallback");
if (!isORConfigured()) {
  skip("orEmbed()", "OPENROUTER_API_KEY not set");
} else {
  try {
    const v = await orEmbed("Student visa requirements for studying in Australia", EMBEDDING_DIMS);
    assert(v.length === EMBEDDING_DIMS, `orEmbed() returns ${EMBEDDING_DIMS} dims`, v.length);
    assert(Math.abs(norm(v) - 1) < 1e-6, "orEmbed() returns a unit-norm vector", norm(v));
  } catch (e) {
    assert(false, "orEmbed() call succeeded", (e as Error).message.slice(0, 200));
  }
}

await masterKnex.destroy();

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed > 0 ? 1 : 0);
