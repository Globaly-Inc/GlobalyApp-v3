// E1 — chunking, embedding and hybrid retrieval against real Postgres + pgvector.
//
// The load-bearing cases:
//   * the embed worker is idempotent over a re-delivered message
//   * no API key yields a 503 and persisted chunks with NULL vectors — never a
//     zero-vector placeholder, never a "dispatched: true" that does nothing
//   * a document from a deactivated source, or a deactivated document, is not
//     retrievable — unpublishing has to actually unpublish
//   * a model change makes existing vectors stale without a schema change
//   * the vector leg and the text leg each find things the other cannot, which is
//     the premise the RRF fusion rests on

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Knex } from "knex";

import { dbAvailable } from "../helpers/db.js";
import {
  KNOWLEDGE_CORPUS,
  STUB_MODEL,
  makeStubEmbedder,
  resetKnowledgeCorpus,
  seedKnowledgeCorpus,
  type SeededCorpus,
} from "../helpers/knowledge-fixtures.js";

const describeDb = describe.skipIf(!dbAvailable);

describeDb("ai-knowledge RAG pipeline", () => {
  let masterKnex: Knex;
  let shutdownPools: () => Promise<void>;
  let config: { GEMINI_API_KEY?: string; GEMINI_EMBEDDING_MODEL: string };

  let embedding: typeof import("../../src/modules/superadmin/ai-knowledge/services/embedding.service.js");
  let retrieval: typeof import("../../src/modules/superadmin/ai-knowledge/services/retrieval.service.js");
  let chunkRepo: typeof import("../../src/modules/superadmin/ai-knowledge/repositories/chunk.repository.js");
  let EmbeddingUnavailableError: typeof import("../../src/modules/superadmin/ai-knowledge/lib/embedding-provider.js").EmbeddingUnavailableError;

  let seeded: SeededCorpus;
  const stub = makeStubEmbedder();

  const docId = (key: string) => seeded.documentIds.get(key)!;

  beforeAll(async () => {
    ({ masterKnex } = await import("../../src/core/db/master-pool.js"));
    ({ shutdownAll: shutdownPools } = await import("../../src/core/db/pool-manager.js"));
    ({ config } = await import("../../src/config.js"));
    embedding = await import("../../src/modules/superadmin/ai-knowledge/services/embedding.service.js");
    retrieval = await import("../../src/modules/superadmin/ai-knowledge/services/retrieval.service.js");
    chunkRepo = await import("../../src/modules/superadmin/ai-knowledge/repositories/chunk.repository.js");
    ({ EmbeddingUnavailableError } = await import(
      "../../src/modules/superadmin/ai-knowledge/lib/embedding-provider.js"
    ));

    // The stub is the provider under test; the real key must not be reachable.
    delete config.GEMINI_API_KEY;
    config.GEMINI_EMBEDDING_MODEL = STUB_MODEL;

    await resetKnowledgeCorpus();
    seeded = await seedKnowledgeCorpus({ suffix: "rag" });
  });

  afterAll(async () => {
    if (masterKnex) await resetKnowledgeCorpus();
    if (shutdownPools) await shutdownPools();
  });

  const countChunks = async (documentId: string) =>
    Number((await masterKnex(chunkRepo.CHUNKS).where({ document_id: documentId }).count("* as c").first())?.c ?? 0);

  // ── Chunking + idempotency ──

  it("chunks a document and embeds every chunk", async () => {
    const result = await embedding.embedDocument(docId("au-visa-work"), stub);
    expect(result.skipped).toBeNull();
    expect(result.chunks).toBeGreaterThan(0);
    expect(result.embedded).toBe(result.chunks);
    expect(result.awaiting).toBe(0);

    const rows = await masterKnex(chunkRepo.CHUNKS)
      .where({ document_id: docId("au-visa-work") })
      .select("chunk_index", "embedding_model", "content", "char_count")
      .orderBy("chunk_index");
    expect(rows).toHaveLength(result.chunks);
    expect(rows.map((r) => r.chunk_index)).toEqual(rows.map((_, i) => i));
    for (const row of rows) {
      expect(row.embedding_model).toBe(STUB_MODEL);
      expect(row.char_count).toBe(row.content.length);
    }
  });

  it("is idempotent over a re-delivered message", async () => {
    const id = docId("au-visa-work");
    const before = await countChunks(id);

    const first = await embedding.handleEmbedMessage(JSON.stringify({ documentId: id }), stub);
    const second = await embedding.handleEmbedMessage(JSON.stringify({ documentId: id }), stub);

    expect(first.handled).toBe("document");
    expect(second.handled).toBe("document");
    if (first.handled === "document") expect(first.result.skipped).toBe("already_current");
    if (second.handled === "document") expect(second.result.skipped).toBe("already_current");
    // No duplicate chunks, no second round of provider calls.
    expect(await countChunks(id)).toBe(before);
  });

  it("discards a malformed message instead of redelivering it for ever", async () => {
    expect((await embedding.handleEmbedMessage("not json", stub)).handled).toBe("discarded");
    expect((await embedding.handleEmbedMessage("[1,2,3]", stub)).handled).toBe("discarded");
    expect((await embedding.handleEmbedMessage(JSON.stringify({ documentId: 7 }), stub)).handled).toBe("discarded");
  });

  it("re-chunks when the document's content changes, dropping the stale vectors", async () => {
    const id = docId("ca-fees");
    await embedding.embedDocument(id, stub);

    await masterKnex(chunkRepo.DOCUMENTS).where({ id }).update({
      markdown: "Tuition in Canada was revised upward this year for every international programme of study.",
      content_hash: "revised-hash-0001",
    });

    const result = await embedding.embedDocument(id, stub);
    expect(result.rechunked).toBe(true);
    const hashes = await masterKnex(chunkRepo.CHUNKS).where({ document_id: id }).pluck("content_hash");
    expect(new Set(hashes)).toEqual(new Set(["revised-hash-0001"]));
  });

  it("treats a model change as stale without a schema change", async () => {
    const id = docId("uk-fees");
    await embedding.embedDocument(id, stub);

    const otherModel = makeStubEmbedder("stub-lexical-semantic-002");
    const result = await embedding.embedDocument(id, otherModel);

    expect(result.skipped).toBeNull();
    expect(result.embedded).toBe(result.chunks);
    const models = await masterKnex(chunkRepo.CHUNKS).where({ document_id: id }).pluck("embedding_model");
    expect(new Set(models)).toEqual(new Set(["stub-lexical-semantic-002"]));
  });

  // ── Fail-closed ──

  it("throws 503 with no API key — after the chunks are safely persisted", async () => {
    const id = docId("au-fees");
    await masterKnex(chunkRepo.CHUNKS).where({ document_id: id }).delete();
    expect(config.GEMINI_API_KEY).toBeUndefined();

    await expect(embedding.embedDocument(id)).rejects.toBeInstanceOf(EmbeddingUnavailableError);

    const rows = await masterKnex(chunkRepo.CHUNKS)
      .where({ document_id: id })
      .select("embedding", "embedding_model", "embedded_at");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // NULL, not a zero vector: an all-zero embedding is indistinguishable from a
      // real one at the column level and would poison ranking silently.
      expect(row.embedding).toBeNull();
      expect(row.embedding_model).toBeNull();
      expect(row.embedded_at).toBeNull();
    }
  });

  it("reports the pending count rather than swallowing it", async () => {
    const handled = await embedding.handleEmbedMessage(JSON.stringify({ documentId: docId("au-fees") }));
    expect(handled.handled).toBe("pending");
    if (handled.handled === "pending") expect(handled.awaiting).toBeGreaterThan(0);

    const { embedding: status } = await embedding.status();
    expect(status.provider_configured).toBe(false);
    expect(status.model).toBe(STUB_MODEL);
    expect(status.chunks_awaiting).toBeGreaterThan(0);
    expect(status.documents_awaiting).toBeGreaterThan(0);
  });

  it("keeps chunking during a sweep with no provider, and says so", async () => {
    const result = await embedding.embedPending(50);
    expect(result.provider_unavailable).toBe(true);
    // Chunking is not gated on the provider — the text leg works without vectors.
    const total = Number((await masterKnex(chunkRepo.CHUNKS).count("* as c").first())?.c ?? 0);
    expect(total).toBeGreaterThan(0);
  });

  // ── Visibility ──

  describe("visibility", () => {
    it("returns nothing from a deactivated document", async () => {
      const id = docId("uk-ihs");
      await embedding.embedDocument(id, stub);

      const query = "Immigration Health Surcharge National Health Service";
      const before = await retrieval.retrieve({ query, topK: 10, provider: stub });
      expect(before.chunks.some((c) => c.document_id === id)).toBe(true);

      await masterKnex(chunkRepo.DOCUMENTS).where({ id }).update({ active: false });
      try {
        const after = await retrieval.retrieve({ query, topK: 10, provider: stub });
        expect(after.chunks.some((c) => c.document_id === id)).toBe(false);
      } finally {
        await masterKnex(chunkRepo.DOCUMENTS).where({ id }).update({ active: true });
      }
    });

    it("returns nothing from a deactivated (unpublished) source", async () => {
      const query = "Immigration Health Surcharge National Health Service";
      await masterKnex(`superadmin.ai_knowledge_sources`).where({ id: seeded.sourceId }).update({ active: false });
      try {
        const result = await retrieval.retrieve({ query, topK: 10, provider: stub });
        expect(result.chunks).toHaveLength(0);
      } finally {
        await masterKnex(`superadmin.ai_knowledge_sources`).where({ id: seeded.sourceId }).update({ active: true });
      }
    });

    it("returns nothing from a deactivated category", async () => {
      const query = "Immigration Health Surcharge National Health Service";
      await masterKnex(`superadmin.ai_knowledge_categories`).where({ id: seeded.categoryId }).update({ active: false });
      try {
        const result = await retrieval.retrieve({ query, topK: 10, provider: stub });
        expect(result.chunks).toHaveLength(0);
      } finally {
        await masterKnex(`superadmin.ai_knowledge_categories`).where({ id: seeded.categoryId }).update({ active: true });
      }
    });

    it("honours the category kind filter", async () => {
      const query = "student visa work hours per fortnight Australia";
      const matching = await retrieval.retrieve({ query, topK: 10, provider: stub, categoryKind: "immigration" });
      const other = await retrieval.retrieve({ query, topK: 10, provider: stub, categoryKind: "accommodation" });
      expect(matching.chunks.length).toBeGreaterThan(0);
      expect(other.chunks).toHaveLength(0);
    });
  });

  // ── Degradation is reported, not silent ──

  it("flags a text-only answer when no embedding provider is configured", async () => {
    const result = await retrieval.retrieve({ query: "Immigration Health Surcharge" });
    expect(result.degraded).toBe(true);
    expect(result.degraded_reason).toBe("embedding_unavailable");
    expect(result.vector_leg).toBe(false);
    expect(result.text_leg).toBe(true);
  });

  it("refuses instead of degrading when the caller demands the vector leg", async () => {
    await expect(
      retrieval.retrieve({ query: "Immigration Health Surcharge", requireVector: true }),
    ).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  // ── The premise behind fusion ──

  it("each leg finds documents the other cannot", async () => {
    // Every corpus document embedded, so the only difference is the retrieval leg.
    for (const doc of KNOWLEDGE_CORPUS) await embedding.embedDocument(docId(doc.key), stub);

    // Worded nothing like the document: websearch_to_tsquery ANDs "aussie", which
    // appears nowhere, so the text leg has nothing to return.
    const paraphrase = "how many hours can I work on an aussie study permit";
    const textOnly = await retrieval.retrieve({ query: paraphrase, topK: 5, provider: stub, legs: "text" });
    const vectorOnly = await retrieval.retrieve({ query: paraphrase, topK: 5, provider: stub, legs: "vector" });
    expect(textOnly.chunks).toHaveLength(0);
    expect(vectorOnly.chunks.map((c) => c.document_id)).toContain(docId("au-visa-work"));

    // And a chunk with no vector at all is invisible to the vector leg by construction.
    const orphan = docId("english-tests");
    await masterKnex(chunkRepo.CHUNKS).where({ document_id: orphan }).update({
      embedding: null,
      embedding_model: null,
      embedded_at: null,
    });
    const exact = "IELTS 6.5 overall postgraduate courses";
    const vectorBlind = await retrieval.retrieve({ query: exact, topK: 5, provider: stub, legs: "vector" });
    const textSees = await retrieval.retrieve({ query: exact, topK: 5, provider: stub, legs: "text" });
    expect(vectorBlind.chunks.map((c) => c.document_id)).not.toContain(orphan);
    expect(textSees.chunks.map((c) => c.document_id)).toContain(orphan);
  });

  it("records both ranks so a fused score can be explained", async () => {
    const result = await retrieval.retrieve({
      query: "student visa work hours per fortnight Australia",
      topK: 5,
      provider: stub,
    });
    expect(result.degraded).toBe(false);
    const top = result.chunks[0];
    expect(top.score).toBeGreaterThan(0);
    expect(top.vector_rank !== null || top.text_rank !== null).toBe(true);
    expect(top.source_domain).toBe("fixture.invalid");
    expect(top.category_label).toBe("E1 recall fixture");
  });
});
