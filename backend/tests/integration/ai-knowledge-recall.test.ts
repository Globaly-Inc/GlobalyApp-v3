// E1 — the recall@5 gate. V2's quality gate (eval/retrieval/run.mjs, threshold
// 0.85), rebuilt as a test so it runs in CI instead of being a release-day command.
//
// Three things are proved here, in this order:
//
//   1. Hybrid retrieval clears recall@5 >= 0.85 on the fixture question set.
//   2. It beats the vector leg alone AND the text leg alone, with numbers. A fusion
//      that does not beat its inputs is complexity with no payoff.
//   3. The gate FAILS when retrieval is degraded. A gate that has never failed
//      proves nothing, so it is called deliberately against two regressions that
//      could plausibly ship: someone drops the text leg, and someone ships without
//      running the embed worker.
//
// The corpus is partly embedded on purpose (12 of 16 documents). That is the state
// V3 is actually in — 207 documents, 0 embeddings, a backlog draining behind a
// worker — and a retrieval design that only holds up at 100% coverage is the wrong
// design.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Knex } from "knex";

import { dbAvailable } from "../helpers/db.js";
import {
  KNOWLEDGE_CORPUS,
  RECALL_K,
  RECALL_QUERIES,
  RECALL_THRESHOLD,
  RecallGateFailure,
  STUB_MODEL,
  assertRecallGate,
  formatRecallTable,
  makeStubEmbedder,
  recallReport,
  resetKnowledgeCorpus,
  seedKnowledgeCorpus,
  type RecallReport,
  type SeededCorpus,
} from "../helpers/knowledge-fixtures.js";
import type { RetrievalLegs } from "../../src/modules/superadmin/ai-knowledge/repositories/retrieval.repository.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("ai-knowledge recall@5 gate", () => {
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: { GEMINI_API_KEY?: string; GEMINI_EMBEDDING_MODEL: string };
  let embedding: typeof import("../../src/modules/superadmin/ai-knowledge/services/embedding.service.js");
  let retrieval: typeof import("../../src/modules/superadmin/ai-knowledge/services/retrieval.service.js");
  let CHUNKS: string;

  let seeded: SeededCorpus;
  const stub = makeStubEmbedder();

  const reports = new Map<string, RecallReport>();

  async function measure(legs: RetrievalLegs, topK = RECALL_K): Promise<RecallReport> {
    const outcomes = [];
    for (const q of RECALL_QUERIES) {
      const result = await retrieval.retrieve({ query: q.query, topK, provider: stub, legs });
      outcomes.push({
        id: q.id,
        expectedDocumentId: seeded.documentIds.get(q.expect)!,
        documentIds: result.chunks.map((c) => c.document_id),
      });
    }
    return recallReport(topK, outcomes);
  }

  beforeAll(async () => {
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = await import("../../src/config.js"));
    embedding = await import("../../src/modules/superadmin/ai-knowledge/services/embedding.service.js");
    retrieval = await import("../../src/modules/superadmin/ai-knowledge/services/retrieval.service.js");
    ({ CHUNKS } = await import("../../src/modules/superadmin/ai-knowledge/repositories/chunk.repository.js"));

    delete config.GEMINI_API_KEY;
    config.GEMINI_EMBEDDING_MODEL = STUB_MODEL;

    await resetKnowledgeCorpus();
    seeded = await seedKnowledgeCorpus({ suffix: "recall" });

    // Every document is chunked — chunking never depends on the provider. Only the
    // documents flagged `embed` get vectors, mirroring a corpus mid-backfill.
    for (const doc of KNOWLEDGE_CORPUS) {
      const id = seeded.documentIds.get(doc.key)!;
      if (doc.embed) {
        await embedding.embedDocument(id, stub);
      } else {
        await embedding.embedDocument(id, stub);
        await masterKnex(CHUNKS).where({ document_id: id }).update({
          embedding: null,
          embedding_model: null,
          embedded_at: null,
        });
      }
    }

    for (const legs of ["hybrid", "vector", "text"] as const) {
      reports.set(legs, await measure(legs));
    }
    console.log(
      `\n[recall gate] ${RECALL_QUERIES.length} questions, ${KNOWLEDGE_CORPUS.length} documents ` +
        `(${KNOWLEDGE_CORPUS.filter((d) => d.embed).length} embedded), threshold ${RECALL_THRESHOLD}\n` +
        formatRecallTable([...reports].map(([k, v]) => [k, v])) +
        "\n",
    );
  });

  afterAll(async () => {
    if (masterKnex) await resetKnowledgeCorpus();
    if (shutdownPools) await shutdownPools();
  });

  it("the corpus is only partly embedded, as production is", async () => {
    const { embedding: status } = await embedding.status();
    expect(status.provider_configured).toBe(false);
    expect(status.chunks_total).toBeGreaterThan(0);
    expect(status.chunks_awaiting).toBeGreaterThan(0);
    expect(status.chunks_embedded).toBeGreaterThan(0);
  });

  it("hybrid retrieval clears the recall@5 gate", () => {
    const hybrid = reports.get("hybrid")!;
    expect(() => assertRecallGate("hybrid", hybrid)).not.toThrow();
    expect(hybrid.recall).toBeGreaterThanOrEqual(RECALL_THRESHOLD);
  });

  it("beats the vector leg alone", () => {
    const hybrid = reports.get("hybrid")!;
    const vector = reports.get("vector")!;
    expect(hybrid.recall).toBeGreaterThan(vector.recall);
    // The vector leg cannot see an unembedded document at all.
    expect(vector.misses.length).toBeGreaterThan(0);
  });

  it("beats the text leg alone", () => {
    const hybrid = reports.get("hybrid")!;
    const text = reports.get("text")!;
    expect(hybrid.recall).toBeGreaterThan(text.recall);
    // The text leg ANDs every lexeme, so a paraphrase returns nothing.
    expect(text.misses.length).toBeGreaterThan(0);
  });

  it("finds each question by the leg the fixture says should find it", async () => {
    const vector = reports.get("vector")!;
    const text = reports.get("text")!;
    for (const q of RECALL_QUERIES) {
      if (q.findable === "vector") expect(vector.hits, `${q.id} via vector`).toContain(q.id);
      if (q.findable === "text") expect(text.hits, `${q.id} via text`).toContain(q.id);
      if (q.findable === "both") {
        expect(vector.hits, `${q.id} via vector`).toContain(q.id);
        expect(text.hits, `${q.id} via text`).toContain(q.id);
      }
      // Whatever the leg, the fusion must find it.
      expect(reports.get("hybrid")!.hits, `${q.id} via hybrid`).toContain(q.id);
    }
  });

  // ── The gate has teeth ──

  it("fails when the text leg is removed", () => {
    const vector = reports.get("vector")!;
    expect(() => assertRecallGate("vector-only", vector)).toThrow(RecallGateFailure);
    expect(() => assertRecallGate("vector-only", vector)).toThrow(/below the 0.85 gate/);
  });

  it("fails when nothing has been embedded", async () => {
    const before = await masterKnex(CHUNKS)
      .whereNotNull("embedding")
      .select("id", "embedding_model", masterKnex.raw("embedding::text AS embedding_text"));

    // The regression this catches: shipping the retrieval path without ever running
    // the embed worker. Hybrid silently becomes text-only.
    await masterKnex(CHUNKS).update({ embedding: null, embedding_model: null, embedded_at: null });
    try {
      const degraded = await measure("hybrid");
      console.log(`[recall gate] degraded (no vectors): ${formatRecallTable([["hybrid", degraded]])}`);
      expect(degraded.recall).toBeLessThan(RECALL_THRESHOLD);
      expect(() => assertRecallGate("hybrid-no-vectors", degraded)).toThrow(RecallGateFailure);
    } finally {
      for (const row of before) {
        await masterKnex(CHUNKS).where({ id: row.id }).update({
          embedding: masterKnex.raw("?::vector", [row.embedding_text]),
          embedding_model: row.embedding_model,
          embedded_at: masterKnex.fn.now(),
        });
      }
    }
  });

  it("fails when the candidate pool is starved", async () => {
    // A plausible "optimisation": shrink each leg's pool. RRF has nothing to fuse.
    const repo = await import("../../src/modules/superadmin/ai-knowledge/repositories/retrieval.repository.js");
    const outcomes = [];
    for (const q of RECALL_QUERIES) {
      const chunks = await repo.hybridSearch({
        queryText: q.query,
        queryEmbedding: (await stub.embedBatch([q.query]))[0],
        topK: 1,
        poolSize: 1,
      });
      outcomes.push({
        id: q.id,
        expectedDocumentId: seeded.documentIds.get(q.expect)!,
        documentIds: chunks.map((c) => c.document_id),
      });
    }
    const starved = recallReport(RECALL_K, outcomes);
    console.log(`[recall gate] degraded (pool of 1): ${formatRecallTable([["hybrid", starved]])}`);
    expect(starved.recall).toBeLessThan(RECALL_THRESHOLD);
    expect(() => assertRecallGate("pool-of-1", starved)).toThrow(RecallGateFailure);
  });

  it("passes the gate again once the degradations are reverted", async () => {
    const restored = await measure("hybrid");
    expect(() => assertRecallGate("hybrid-restored", restored)).not.toThrow();
  });
});
