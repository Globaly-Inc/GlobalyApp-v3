# Phase 6 — Chunked Embeddings + Admin File Upload — Implementation Plan

> **Status:** SUPERSEDED — built 2026-08-22 from the ingestion plan's Phases 1–2 (see its *As built* table). Kept for the rationale; do not implement from this file. | **App:** GlobalyApp-v3
> **Parent plan:** docs/ai-counsellor/2026-08-20-ai-counsellor-v2-impl-plan.md (Phase 6 section)
> **Base branch:** `dev-feat-ai-counsellor-p5` (Phase 5 is NOT merged to staging yet — see Open Questions)

## Section 1 — Summary

Feature: AI Counsellor Phase 6 — chunk-level retrieval + file upload into the Knowledge Rack
Date: 2026-08-21
Mode: ENHANCEMENT (delta track)

In scope:
- `ai_knowledge_chunks` table + `match_ai_knowledge_chunks()` — chunk-level semantic retrieval (~500–800 tokens/chunk, ~10% overlap)
- Crawl worker chunks + embeds per chunk; stale chunks replaced on re-crawl
- Retrieval cutover: rag pipeline reads chunks (full chunk content, no more 1,500-char page truncation), max 2 chunks/doc, trust-tier ordering kept from Phase 5
- Single retrieval path: doc-level `embedding` column + `match_ai_knowledge_documents()` dropped in the same migration
- Admin upload of PDF/TXT/MD (DOCX pending Open Question 1) as a `source_type='file'` rack source → extracted → one document → chunked + embedded inline

Out of scope (explicit):
- Tool calling (Phase 7), counselling context (Phase 8), evals/freshness (Phase 9)
- Upload queue/worker — extraction+embedding runs inline in the request (single file, superadmin-only; move to the crawl queue if uploads ever time out)
- Re-embedding curated tables (`ai_knowledge_visa/_faqs/_country_guides` keep their unused doc-level embedding columns — keyword search only today, untouched)

**Migration convention: append-only.** One NEW dated migration file with real up/down. User runs DB commands.

---

## Section 2 — File Map

CREATE
- `backend/database/migrations/superadmin/20260821_001_ai_knowledge_chunks.ts` — chunks table + match fn + source upload columns + doc-embedding drop (Section 3)
- `backend/src/modules/superadmin/ai-knowledge/lib/chunker.ts` — heading-aware markdown splitter
- `backend/src/modules/superadmin/ai-knowledge/lib/chunker.selfcheck.ts` — assert-based self-check (tsx-run)

MODIFY
- `backend/src/modules/superadmin/ai-knowledge/workers/knowledge-crawl.worker.ts` — `embedDocument()` → `rechunkAndEmbed()`; delete+reinsert chunks on change
- `backend/src/modules/superadmin/ai-knowledge/repositories/rack.repository.ts` — chunk helpers (`replaceChunks`, `chunkCounts`); **fix `is_embedded` / `rackCounts` / doc-list to read chunks, not the dropped `embedding` column**
- `backend/src/modules/superadmin/ai-knowledge/services/rack.service.ts` — `uploadSource()`; `getDocument()` stops destructuring the dropped `embedding`; `crawlSource()` rejects `source_type='file'`
- `backend/src/modules/superadmin/ai-knowledge/routes/rack.routes.ts` — `POST /sources/upload` (multipart)
- `backend/src/modules/superadmin/ai-knowledge/schemas/rack.schema.ts` — `UploadSourceSchema`, allowed-MIME set
- `backend/src/modules/ai-counsellor/repositories/knowledge.repository.ts` — `matchKnowledgeChunks()` replaces `matchKnowledgeDocuments()`
- `backend/src/modules/ai-counsellor/services/rag.service.ts` — KNOWLEDGE ARTICLES section consumes chunks (fetch 8 → max 2/doc → keep 6, full chunk text)
- `frontend/src/app/admin/data/ai-knowledge/apis/types.ts` — `RackSource.source_type/file_name`; upload types
- `frontend/src/app/admin/data/ai-knowledge/apis/real-api.ts` — `uploadSource(FormData)` via existing `httpPostForm`
- `frontend/src/app/admin/data/ai-knowledge/apis/mock-data.ts` — mock upload
- `frontend/src/app/admin/data/ai-knowledge/components/rack-tab.tsx` — "Upload document" action; file sources hide Crawl button, show file name

CONFIRM BEFORE CREATING (tentative)
- `frontend/src/app/admin/data/ai-knowledge/components/upload-source-dialog.tsx` — only if the existing inline source dialog in rack-tab.tsx can't absorb a file input cleanly

---

## Section 3 — DB Track

NEW migration `20260821_001_ai_knowledge_chunks.ts` (schema `superadmin`, `EMBEDDING_DIMS = 3072`, no RLS in this schema by module convention — access is superadmin-guarded application layer):

```
[ ] CREATE ai_knowledge_chunks (
      id uuid PK DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES ai_knowledge_documents ON DELETE CASCADE,
      chunk_index int NOT NULL,
      content text NOT NULL,
      token_count int NOT NULL,
      embedding vector(3072) NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(document_id, chunk_index)   -- also serves as the document_id lookup index
    )
[ ] HNSW index: USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
    — same pattern as idx_akd_documents_embedding
[ ] CREATE FUNCTION match_ai_knowledge_chunks(
      query_embedding vector(3072), match_count int DEFAULT 8,
      filter_category_kind text DEFAULT NULL, filter_country_code text DEFAULT NULL)
    RETURNS (id, document_id, chunk_index, content, similarity, title, url,
             category_label, source_domain, trust_tier)
    — chunk → document → category/source joins; WHERE d.active AND ch.embedding IS NOT NULL
      AND category kind/country filters identical to the Phase 5 doc-level function
[ ] ALTER ai_knowledge_sources:
      + source_type text NOT NULL DEFAULT 'url'
      + file_path text NULL, file_name text NULL, mime_type text NULL
      url → DROP NOT NULL
      + CHECK (source_type <> 'url' OR url IS NOT NULL)
    (domain stays NOT NULL — file sources store domain = 'upload')
[ ] ALTER ai_knowledge_documents: DROP INDEX idx_akd_documents_embedding,
    DROP COLUMN embedding; DROP FUNCTION match_ai_knowledge_documents(vector, int, text, text)
    ⚠ retrieval-cutover code (Section 4/5) must deploy together with this migration
[ ] down(): drop chunks table + fn + source columns/check, restore url NOT NULL,
    re-add documents.embedding + HNSW index, recreate match_ai_knowledge_documents
    in its Phase 5 (trust_tier) form — copy from 20260820_001_match_docs_trust_tier.ts
```

Validate on staging DB before app code merges (user runs `npm run migrate:superadmin`).

---

## Section 4 — Backend Track

Rung chosen: no new queue, no new service abstraction — extend the existing worker + service, reuse `shared/storage` and `data-extraction/lib/document-extractor.ts` as-is.

### 4a. Chunker (`lib/chunker.ts`)

```
[ ] splitMarkdown(markdown, title?) → Array<{ content: string; tokenCount: number }>
    - Token estimate: Math.ceil(chars / 4) — no tokenizer dependency
      // ponytail: chars/4 estimate; swap in a real tokenizer only if chunk sizes drift badly
    - Split on markdown headings (#, ##, ###); prepend "Title > Heading" breadcrumb
      to each chunk so headings survive into retrieval context
    - Merge sections < ~120 tokens into the following section
    - Sections > ~800 tokens: split on paragraph boundaries (\n\n) targeting ~600,
      carrying ~10% overlap (last paragraph(s) of previous chunk) forward
    - Fallback for heading-less markdown: pure paragraph packing
[ ] chunker.selfcheck.ts — asserts: heading split, breadcrumb present, overlap present,
    tiny-section merge, paragraph fallback, no chunk > ~900 tokens; non-zero exit on fail
```

### 4b. Crawl worker (`knowledge-crawl.worker.ts`)

```
[ ] Replace embedDocument() with rechunkAndEmbed(documentId, title, markdown):
    - chunks = splitMarkdown(...); repo.replaceChunks(documentId, chunks) (delete + insert)
    - embed each chunk sequentially (embed() from data-extraction llm-client, unchanged
      client) — best-effort per chunk: failures logged, embedding stays NULL, crawl never fails
[ ] New/updated documents call rechunkAndEmbed; unchanged (hash match) skipped — chunks intact
[ ] Drop the `embedding: null` clearing on update (column is gone); summary.embedded now
    counts documents whose chunks all embedded; add summary.chunks total
```

### 4c. Upload (`rack.service.ts` + routes + schema)

```
[ ] POST /admin/ai-knowledge/sources/upload — multipart (@fastify/multipart already
    registered in server.ts). Fields: category_id (uuid), title?, trust_tier?
    File: 1 required. Superadmin guard inherited from module hook.
[ ] UploadSourceSchema — validates fields; MIME allowlist:
    application/pdf, text/plain, text/markdown (+ docx type if OQ1 approved)
[ ] uploadSource() flow:
    1. findCategory or 404
    2. storage.validateFile(mime, size, RACK_UPLOAD_MIMES) — trust boundary, size cap
       from the global multipart limit (GCS_MAX_FILE_SIZE_MB)
    3. storage.buildPath("ai-knowledge", "uploads", filename) → storage.uploadFile()
    4. insert source: { source_type:'file', url:null, domain:'upload', file_path,
       file_name, mime_type, trust_tier, crawl_frequency:'off', added_by }
    5. createDocumentExtractor().extract({ file_url: storagePath, file_name })
       — extractor already downloads GCS object paths directly and handles
       PDF-via-Gemini + text formats; zero refactor
    6. extraction error → source.last_status='failed' + last_error, return 422 detail
       (source row kept so the admin sees the failure; file kept for retry-by-delete-and-reupload)
    7. insert ONE document row (markdown = extracted text, title = provided || first
       heading || filename, content_hash, word_count, crawled_at = now)
    8. rechunkAndEmbed inline (same helper the worker uses — export it or move into
       rack.service; single implementation either way)
    9. syncDocCount; last_status='ok'; logAudit AI_KNOWLEDGE_SOURCE_UPLOAD
    10. return { source, document_id, chunks, embedded }
[ ] crawlSource(): BadRequestError when source.source_type === 'file'
[ ] deleteSource(): also storage.deleteFile(file_path) when set (best-effort)
```

### 4d. Retrieval cutover (`knowledge.repository.ts` + `rag.service.ts` — p5 versions)

```
[ ] KnowledgeChunkResult interface; matchKnowledgeChunks(embedding, count=8, countryCode?)
    → SELECT * FROM superadmin.match_ai_knowledge_chunks(...); delete
    matchKnowledgeDocuments + KnowledgeDocumentResult
[ ] rag.service documents branch: fetch 8 chunks → keep max 2 per document_id → cap 6
    → keep Phase 5 trust-tier-first sort → inject FULL chunk content (delete the
    `.slice(0, 1500)` cap — chunks are already ≤ ~800 tokens)
    Article line: `Article: {title} ({source_domain}, {category_label})` unchanged;
    source entry stays type "document" with document_id (frontend contract unchanged)
```

### 4e. Admin rack reads (breakage from column drop — must ship in same PR)

```
[ ] rack.repository.listDocuments: is_embedded ← EXISTS(chunk with embedding NOT NULL);
    add chunk_count subquery for the UI
[ ] rack.repository.rackCounts: embedded_documents ← COUNT(DISTINCT document_id) on
    embedded chunks; add chunks total
[ ] rack.service.getDocument: stop destructuring `embedding`; is_embedded from chunks
```

---

## Section 5 — Frontend Track

```
[ ] apis/types.ts — RackSource + { source_type: "url" | "file"; file_name: string | null };
    UploadSourceResult type
[ ] apis/real-api.ts — uploadSource(categoryId, file, opts): FormData via existing
    httpPostForm (lib/api/http.ts:219) — no new fetch code
[ ] apis/mock-data.ts — mock uploadSource
[ ] rack-tab.tsx —
    - "Upload document" button beside "Add source" (visible when a category is selected)
    - Dialog: native <input type="file" accept=".pdf,.txt,.md"> + optional title +
      trust-tier select (reuse the options already rendered in the source dialog)
    - On success: toast + reload sources for the category
    - Source rows with source_type='file': show file_name instead of URL, hide the
      Crawl button and crawl-frequency label
[ ] Reuse existing shadcn/ui primitives already in rack-tab (Dialog, Button, Label,
    Select, EmptyState) — no new primitives
```

Design reference: existing rack-tab source dialog pattern; no Figma needed (one dialog, matches sibling dialogs).

---

## Section 6 — Test Plan

No backend test framework — runnable self-checks per repo convention.

```
[ ] Tracer bullet: backend/src/modules/superadmin/ai-knowledge/lib/chunker.selfcheck.ts
    — written FIRST, run with `npx tsx .../chunker.selfcheck.ts`, non-zero exit on fail
[ ] Migration smoke (staging): run migration → \df superadmin.match_ai_knowledge_chunks
    → re-crawl one source → chunks + embeddings present → one chat query returns
    chunk-level KNOWLEDGE ARTICLES context
[ ] Upload smoke: upload a small PDF + a .md file → source/document/chunks rows exist,
    is_embedded true; upload a .exe → 400
[ ] Regression: embed-mode chat still skips the rack entirely (embedScoped path untouched)
[ ] Gates: npx tsc --noEmit clean (backend + frontend); no secrets grep;
    down() migration reviewed against 20260820_001 for exact function restoration
```

---

## Section 7 — Risk & Rollback

Risks:
- **Retrieval empty at cutover** (docs not re-chunked yet) → immediately after migration, re-crawl all active sources (admin "Crawl" per source, or one-off dispatch loop); until then the KNOWLEDGE ARTICLES section is simply absent — chat still answers from structured + curated data
- **Admin rack UI breaks on dropped column** → Section 4e ships in the same PR; caught in plan, not in prod
- **Embed volume** (~25 pages × ~8 chunks = ~200 embed calls/crawl) → sequential + existing polite delays; acceptable for a background worker. // ponytail ceiling: batch embedding API if crawl time matters
- **Inline upload latency** (Gemini PDF extraction ~10–30s) → acceptable for a superadmin tool; move to crawl queue if it ever times out
- **Upload abuse** → superadmin-only route + MIME allowlist + global multipart size cap

Rollback:
- Single PR revert; migration has a real down() (restores doc-level embedding + Phase 5 match function — doc vectors themselves are lost and need one re-crawl to re-embed)
- Uploaded sources survive rollback as inert rows (source_type column dropped by down(); delete uploaded sources first if rolling back)

---

## Section 8 — Open Questions

```
[ ] OQ1 — DOCX support requires a new dependency (`mammoth`); the current
    document-extractor hard-rejects docx and Gemini inlineData can't take it.
    Recommend: add mammoth (small, zero-config) — or ship PDF/TXT/MD now and
    add DOCX later. Owner: dev (you)
[ ] OQ2 — Branch base: Phase 5 (`dev-feat-ai-counsellor-p5`) is not merged to
    staging. Recommend: merge p5 → staging first, then branch
    `dev-feat-ai-counsellor-p6` off staging. Owner: dev (you)
[ ] OQ3 — Confirm staging DB already has 20260820_001_match_docs_trust_tier applied
    (plan doc says yes, pre-convention) — down() copies that function shape. Owner: dev
```
