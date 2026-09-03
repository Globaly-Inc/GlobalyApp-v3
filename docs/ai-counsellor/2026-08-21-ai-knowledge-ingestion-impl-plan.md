# Unified AI Knowledge Ingestion & Retrieval — Implementation Plan

> **Status:** DRAFT — awaiting approval | **Date:** 2026-08-21 | **App:** GlobalyApp-v3
> **Supersedes:** Phases 6 and 9 of `docs/ai-counsellor/2026-08-20-ai-counsellor-v2-impl-plan.md`
> **Unchanged by this plan:** v2 Phase 5 (shipped), Phase 7 (tool calling), Phase 8 (counselling context)
> **Source registries:** `COUNTRY_STUDENT_VISA_RAG_SOURCES.md`, `COUNTRY_INTERNATIONAL_STUDENT_GUIDELINES_RAG_SOURCES.md`, `EDUCATION_COUNSELLING_BOOKS_RAG_SOURCES.md`

## Context

The AI Counsellor already has a working RAG system. What it does not have is a way to get the
newly-researched country knowledge into it. Three research registries were just added under
`docs/ai-counsellor/`, listing ~236 annotated sources across US/AU/CA/UK with tier, region,
fetchability and copyright classification per entry. Today there is no path for any of it: no
file upload, no chunking, no scheduler, no region metadata, no copyright gate, and no stealth
fetcher — the visa doc calls that last one *"the single highest-priority engineering
prerequisite in this document"*, because US, AU and CA official sites 403 automated fetches.

Outcome: one traceable knowledge corpus fed by structured admin records, uploaded MD/PDF/CSV,
and approved crawled pages — retrievable per-country and per-category, with every answer
traceable to a source and a verification date.

**Decisions taken (confirmed with product owner, 2026-08-21):**

| Decision | Choice |
|---|---|
| Scrapling | Real, landing via rebase. Plan it as the **primary** fetcher; Crawl4AI → Firecrawl remain as fallback tiers. |
| Migrations | **New additive migrations.** Existing rows and embeddings preserved; no rollback + re-migrate. |
| Structured tables | **Direct SQL only.** The three unused `embedding` columns are dropped. |
| Relationship to v2 plan | Revamp — this document replaces v2 Phases 6 and 9 outright. |

---

## 1. Current Architecture Analysis

### 1.1 How AI Knowledge works today

Backend module `backend/src/modules/superadmin/ai-knowledge/`, mounted at
`/api/v3/admin/ai-knowledge` (registered in `src/modules/superadmin/index.ts:22` inside a
`requireAdmin` scope, then `requireSuperAdmin` again as an `onRequest` hook in the module's
`index.ts`). Two halves:

**Curated content** — `routes/content.routes.ts` registers three identical CRUD sets from one
`KINDS` table over `ai_knowledge_visa` / `ai_knowledge_faqs` / `ai_knowledge_country_guides`,
plus the `data_verification_queue` review endpoints. Zod is the only validation — the migration
comment notes V2's CHECK constraints were deliberately dropped in V3. Every write calls
`logAudit()`.

**Knowledge Rack** — `routes/rack.routes.ts`: `ai_knowledge_categories` →
`ai_knowledge_sources` → `ai_knowledge_documents`. `POST /sources/:id/crawl` publishes to the
LavinMQ queue `ai_knowledge_crawl`; `workers/knowledge-crawl.worker.ts` consumes it.

Two invariants a UI change must respect: `domain` is derived server-side from `url` and is not
client-patchable (`rack.service.ts` `createSource`/`updateSource`), and `getDocument` strips
`embedding` and returns `is_embedded` instead.

Frontend `frontend/src/app/admin/data/ai-knowledge/` — Next 16 App Router, Redux Toolkit
(**no react-query**), five tabs, all implemented, no placeholders. `components/rack-tab.tsx`
(475 lines) is the most built-out: 260px category sidebar with inline `CategoryForm` CRUD,
source list with `SourceForm`, per-source Crawl button, `crawl_summary` readout, expandable
document list with "In brain" / "Not embedded" badges, and a 5-second poll while any source is
`queued`/`crawling`.

### 1.2 How the RAG system works today

`backend/src/modules/ai-counsellor/services/rag.service.ts` → `searchAll()` runs **nine
parallel retrievers**, each independently error-trapped so one failure cannot kill the rest.
Eight are keyword `ILIKE` (`anyKeywordILike()`, per-word OR — the repo comment notes
joined-phrase ILIKE matched nothing). Exactly **one** is vector search:

```ts
embedScoped || !embeddingConfigured() ? none : embed(opts.query)
  .then(v => knowledge.matchKnowledgeDocuments(v, 6, countryCode))
```

Embeddings: `gemini-embedding-001` at **3072 dims**, L2-renormalised client-side, one `embed()`
in `backend/src/modules/superadmin/data-extraction/lib/llm-client.ts`. Storage is pgvector with
an HNSW index built over a `halfvec(3072)` cast — plain `vector` HNSW caps at 2000 dims. Cosine
`<=>`. Retrieval goes through the SQL function `superadmin.match_ai_knowledge_documents()`.

Pre-processing: `extractKeywords()` (stopword list + punctuation strip) and
`detectCountryCode()`, which builds cached word-boundary regexes from the `countries` table
plus `COUNTRY_ALIASES = { uk:"GB", usa:"US", america:"US", uae:"AE" }`.

Context assembly is plain string concatenation into labelled blocks — `--- COURSES ---`,
`--- VISA INFORMATION ---`, `--- VISA KNOWLEDGE (admin-verified) ---`, `--- FAQs ---`,
`--- COUNTRY GUIDES ---`, `--- KNOWLEDGE ARTICLES (crawled sources, most authoritative
first) ---` — then `buildSystemPrompt()` appends `"CONTEXT:\n" + ragContext`. Crawled articles
are sorted `TIER_RANK { gov:0, verified_institution:1, other:2 }` then similarity.

**No chunking anywhere.** One embedding per whole page, computed over `markdown.slice(0, 8000)`,
then injected as `markdown.slice(0, 1500)`. This is the single largest quality defect in the
system: a 6,000-word visa page gets one diluted vector, and the passage that actually answers
the question is usually past character 1,500.

### 1.3 How the visa and country guide tables are used

Retrieved by keyword `ILIKE` on a narrow column list. `searchKnowledgeVisas` matches only
`destination_country`, `visa_type`, `post_study_visa`; `searchCountryGuides` matches only
`country`. Each row is rendered into a labelled context block. All three filter `active = true`.

Their `embedding vector(3072)` columns are **dead**. `backend/scripts/embed-backfill.ts` states
it plainly — *"Only two tables carry vectors"* — and targets `ai_knowledge_documents` and
`extraction_memory`. No other writer or reader exists anywhere in the codebase.

**Live conflict, not hypothetical.** Two visa tables reach the model in the same prompt:

| Retriever | Table | Context block |
|---|---|---|
| `searchVisas` | `superadmin.extraction_visas` (crawled staging, `status: pending\|promoted\|discarded`) | `--- VISA INFORMATION ---` |
| `searchKnowledgeVisas` | `superadmin.ai_knowledge_visa` (curated) | `--- VISA KNOWLEDGE (admin-verified) ---` |

`searchVisas` (`knowledge.repository.ts:343`) applies **no `status` filter**, so `pending` and
`discarded` extractions currently reach the AI, with no precedence rule between the two blocks.
Separately, promoting an `extraction_visas` row does not create an `ai_knowledge_visa` entry —
no code path connects the two.

### 1.4 Where Scrapling fits

Scrapling does not exist in this branch — zero Python, no `requirements.txt`/`pyproject.toml`.
Web acquisition is `backend/src/modules/superadmin/data-extraction/lib/scraper.ts`:

- `scrapeMarkdown(url, opts)` → `{ markdown, links, scraper: "crawl4ai"|"firecrawl"|"none" }`, cascading Crawl4AI `fit` → Crawl4AI `raw` → Firecrawl. `MIN_CONTENT_LEN = 200` gates "did we get real content".
- `discoverUrlsForCrawl(seed)` → Firecrawl `/v2/map` → `/v1/map` → `sitemap.xml` (+ catalogue subdomains) → seed-page links → seed-only.
- `politeFetch` / `politeDelay` / `throttleForHost` — 5 rotating UAs, Chrome `Sec-Fetch-*` and `sec-ch-ua` headers, per-host throttle (`HOST_THROTTLE_MS`, default 800ms), 429/503 backoff honouring `Retry-After`.
- `robots.txt` is read **only** to harvest `Sitemap:` lines. Nothing anywhere honours `Disallow`.

That uniform `{ markdown, links, scraper }` return shape is the whole integration seam.
Scrapling slots in as a new first tier and nothing upstream changes.

### 1.5 Infrastructure

| Concern | Implementation |
|---|---|
| API | Fastify 5, `type: module`, `.js` import specifiers |
| DB | Knex 3 + `pg`; **no ORM**; pgvector via `knex.raw` |
| Schema | `superadmin`, accessed through `masterKnex` |
| Queue | `amqplib` → **LavinMQ**. No bull/bullmq/pg-boss/agenda/node-cron |
| Workers | Standalone tsx entrypoints, top-level `await queueService.consume(...)`, one npm script + one docker-compose service each |
| Scheduling | `setInterval` poll + `--once` flag for external cron (`extraction-schedule.worker.ts`) |
| LLM | `@google/generative-ai` (Gemini only). No OpenAI/Anthropic/voyage/langchain |
| Files | `@fastify/multipart` (global, `server.ts:46`) + `@google-cloud/storage` |
| Parsers | **None installed** — no `pdf-parse`, `marked`, `csv-parse`, `cheerio`, `tiktoken` |

Document parsing already exists in `data-extraction/lib/document-extractor.ts`:
`TEXT_EXTENSIONS = {txt,md,markdown,html,htm,csv,json,xml,tsv}`,
`UNSUPPORTED = {docx,xlsx,pptx}`, and PDFs via **Gemini vision** (`extractPdfWithGemini`,
`mimeType: "application/pdf"`, prompt *"Convert this PDF to clean markdown… Do NOT summarise"*).
`MAX_PDF_BYTES = 25MB`, `MAX_RETURN_CHARS = 40_000`.

### 1.6 Verified gaps

| # | Gap | Evidence |
|---|---|---|
| 1 | No chunking | `grep -rn chunk src/` → only SSE stream chunks |
| 2 | Three `embedding` columns never written or read | `embed-backfill.ts` targets 2 tables; no other writer |
| 3 | No upload path into the Rack | rack routes have no multipart handler; no `source_type` column |
| 4 | No recrawl scheduler | `crawl_frequency` + `idx_akd_sources_due` exist, nothing reads them |
| 5 | Crawl worker has no docker-compose service | npm script only — rack crawls need a manual start |
| 6 | `crawl-rules.ts` is dead code | `filterAndRankUrls` has zero callers; `CrawlKind = visa\|faq\|country_guide` |
| 7 | `filter_category_kind` always `NULL` | hardcoded at `knowledge.repository.ts:478` |
| 8 | Country metadata only at category level | no per-source/region granularity for Tier-3 sources |
| 9 | `extraction_visas` retrieved with no `status` filter | `knowledge.repository.ts:343` |
| 10 | `match_ai_knowledge_documents()` never checks `s.active` | deactivating a source does not hide its documents |
| 11 | No DLQ | `queueService.nack(msg, false, false)` — failed messages are dropped |
| 12 | `data_verification_queue` has no producer | review endpoints exist, nothing inserts |

---

## 2. Recommended Architecture

```
                                SUPER ADMIN  (/api/v3/admin/ai-knowledge)
                                      │
        ┌───────────────┬─────────────┴────────────┬──────────────────┐
        ▼               ▼                          ▼                  ▼
      VISA        COUNTRY GUIDE / FAQ         KNOWLEDGE RACK      VERIFICATION
   ai_knowledge_    ai_knowledge_            ai_knowledge_          QUEUE
      _visa       _country_guides/_faqs         _sources
        │               │                          │
        └───────┬───────┘                 ┌────────┴─────────┐
                │                         │                  │
      STRUCTURED KNOWLEDGE          source_type=            source_type=
      (exact fields, admin-           'upload'                'url'
       owned, never embedded)            │                     │
                │                   MD / PDF / CSV        approved URL
                │                    (GCS object)        + allowed domain
                │                        │                     │
                │                        │            ┌────────▼─────────┐
                │                        │            │ discoverUrlsFor  │
                │                        │            │ Crawl (map /     │
                │                        │            │ sitemap / links) │
                │                        │            └────────┬─────────┘
                │                        │                     │
                │                        │            ┌────────▼─────────┐
                │                        │            │ filterAndRankUrls│
                │                        │            │  (crawl-rules)   │
                │                        │            └────────┬─────────┘
                │                        │                     │
                │                        │            ┌────────▼─────────────────┐
                │                        │            │  scrapeMarkdown()        │
                │                        │            │  SCRAPLING → crawl4ai    │
                │                        │            │           → firecrawl    │
                │                        │            └────────┬─────────────────┘
                │                        │                     │
                │                  ┌─────▼─────────────────────▼─────┐
                │                  │  INGEST PIPELINE (shared)       │
                │                  │  parse → normalize → sha256     │
                │                  │  hash → change detect →         │
                │                  │  heading-aware chunk → embed    │
                │                  └─────────────┬───────────────────┘
                │                                │
                │                  ai_knowledge_documents (markdown, content_hash,
                │                        ingest_status, ingest_error, chunk_count)
                │                                │
                │                  ai_knowledge_chunks (content, heading_path,
                │                        page_number, embedding vector(3072))
                │                                │
                │                       HNSW halfvec cosine
                │                                │
        ┌───────▼────────┐            ┌──────────▼──────────────────┐
        │ DIRECT SQL     │            │ match_ai_knowledge_chunks() │
        │ keyword ILIKE  │            │ filter: country_code,       │
        │ + active +     │            │ category_kind, region       │
        │ last_verified  │            │ order: cosine, tier-rerank  │
        └───────┬────────┘            └──────────┬──────────────────┘
                │                                │
                └──────────────┬─────────────────┘
                               ▼
                    rag.service.searchAll()
                 labelled context blocks + authority
                 + verification date on every line
                               ▼
                      buildSystemPrompt()
                               ▼
                        AI COUNSELLOR
```

**The principle that makes this work:** structured and unstructured knowledge never carry the
same fact. Structured tables own the fields that have a single correct value (fee, processing
days, work-rights hours). The RAG corpus owns prose that explains, qualifies and
contextualises. They are combined at context-assembly time, labelled by authority, and never
merged.

### 2.1 Why no new `knowledge_source` table

`ai_knowledge_sources` already is that model — `url`, `domain`, `title`, `trust_tier`,
`crawl_frequency`, `last_crawled_at`, `last_status`, `last_error`, `doc_count`, `active`,
`added_by`, `added_via`, `crawl_summary`, `UNIQUE(category_id, url)`. Every field proposed in
the brief maps onto it or onto `ai_knowledge_documents`. It needs additive columns, not a
parallel table.

---

## 3. Database Changes

New additive migration: `backend/database/migrations/superadmin/20260821_001_ai_knowledge_ingest.ts`.
Existing rows and embeddings survive.

### 3.1 Reuse unchanged

`ai_knowledge_categories` (topical taxonomy), `data_verification_queue`, and the three curated
content tables apart from the column drop in §3.5.

### 3.2 Modify `ai_knowledge_sources`

| Column | Type | Why |
|---|---|---|
| `source_type` | `text NOT NULL DEFAULT 'url'` | `url` \| `upload`. Discriminates the two ingest paths on one table so uploads reuse trust_tier, category, active, doc_count and audit for free. |
| `file_path` | `text NULL` | GCS relative object path for uploads. |
| `file_name` | `text NULL` | Original filename — the human-readable citation for an upload. |
| `mime_type` | `text NULL` | Drives parser selection without re-sniffing the file. |
| `country_code` | `text NULL` | Per-source country. Today country lives only on the category, forcing one category per (kind, country) and unable to express Tier-3 sources at all. Retrieval reads `COALESCE(source, category)`. |
| `region` | `text NULL` | State/province for Tier-3 sources (`## F. State-Specific Resources (Tier 3)`, provincial healthcare/employment/accommodation). Without this the corpus cannot distinguish NSW from Victoria, and the guidelines doc's *"three regional traps the counsellor must be built to avoid"* are unavoidable. |
| `ingestion_class` | `text NOT NULL DEFAULT 'full_text_allowed'` | Copyright gate: `open_access` \| `full_text_allowed` \| `preview_only` \| `metadata_only` \| `license_required` \| `do_not_ingest`. The books doc states almost every entry *"must not be ingested as full text"*; without a column this is enforced by memory. |
| `rule_class` | `text NULL` | `national` \| `region` \| `institution` \| `temporary` \| `subject_to_change`, from the guidelines doc's label table. Lets the counsellor say "this is a provincial rule" instead of stating it as national law. |
| `last_verified_at` | `timestamptz NULL` | Human verification, distinct from `last_crawled_at` (machine fetch). |
| `effective_until` | `date NULL` | Known expiry for `temporary` rules (fee schedules, caps). |

Plus: `url` becomes nullable; `CHECK ((source_type='url' AND url IS NOT NULL) OR (source_type='upload' AND file_path IS NOT NULL))`;
add `UNIQUE(category_id, file_path)`. The existing `UNIQUE(category_id, url)` stays — Postgres
permits multiple NULLs.

### 3.3 Modify `ai_knowledge_documents`

| Column | Type | Why |
|---|---|---|
| `ingest_status` | `text NOT NULL DEFAULT 'active'` | `pending` \| `processing` \| `active` \| `failed` \| `skipped`. `queueService` nacks with `requeue=false`, so a dropped message leaves no trace — failure state must live in the DB or it is invisible. |
| `ingest_error` | `text NULL` | Failure reason, surfaced in the admin UI. |
| `ingest_stage` | `text NULL` | Which step failed: `fetch` \| `parse` \| `chunk` \| `embed`. |
| `ingest_attempts` | `integer NOT NULL DEFAULT 0` | Retry budget; caps runaway re-embedding of a poison document. |
| `chunk_count` | `integer NOT NULL DEFAULT 0` | Lets the UI show "12 chunks in brain" without a COUNT per row, and drives the cutover fallback. |
| DROP `embedding` | | Superseded by chunks. Dropped **only at cutover** (Phase 3), after chunk retrieval is verified — until then it is the fallback path. |

Index: `(source_id, ingest_status)` for the admin document list and the failed-ingest filter.

### 3.4 New table `ai_knowledge_chunks`

```sql
CREATE TABLE superadmin.ai_knowledge_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES superadmin.ai_knowledge_documents(id) ON DELETE CASCADE,
  chunk_index  integer NOT NULL,
  content      text NOT NULL,
  heading_path text NULL,      -- "Australia > Official Immigration (Tier 1) > Source: Home Affairs"
  page_number  integer NULL,   -- PDF page attribution, NULL otherwise
  token_count  integer NOT NULL DEFAULT 0,
  embedding    vector(3072) NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX idx_akc_document ON superadmin.ai_knowledge_chunks (document_id);
CREATE INDEX idx_akc_embedding ON superadmin.ai_knowledge_chunks
  USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);
```

`ON DELETE CASCADE` means deleting a source removes sources → documents → chunks → embeddings
in one statement. No orphaned vectors, no cleanup job.

`heading_path` is the highest-value-per-byte column here: it makes a chunk self-describing for
both retrieval and citation. The research docs are deeply nested markdown where a bare chunk is
meaningless without its breadcrumb.

### 3.5 New function `match_ai_knowledge_chunks()`

Same conventions as the existing `match_ai_knowledge_documents()` — one more join, `COALESCE`d
country, and two corrections.

```sql
CREATE FUNCTION superadmin.match_ai_knowledge_chunks(
  query_embedding vector(3072),
  match_count int DEFAULT 8,
  filter_category_kind text DEFAULT NULL,
  filter_country_code text DEFAULT NULL,
  filter_region text DEFAULT NULL
) RETURNS TABLE (
  id uuid, document_id uuid, content text, heading_path text, page_number int,
  similarity float, title text, url text, file_name text, source_type text,
  category_label text, source_domain text, trust_tier text,
  rule_class text, region text, last_verified_at timestamptz
) LANGUAGE sql STABLE AS $$
  -- Over-fetch before filtering: pgvector HNSW post-filters, so a WHERE clause on a
  -- joined column can starve the result set below match_count.
  SELECT ... FROM (
    SELECT k.id
    FROM superadmin.ai_knowledge_chunks k
    JOIN superadmin.ai_knowledge_documents d  ON d.id = k.document_id
    JOIN superadmin.ai_knowledge_sources s    ON s.id = d.source_id
    JOIN superadmin.ai_knowledge_categories c ON c.id = d.category_id
    WHERE d.active AND d.ingest_status = 'active' AND s.active
      AND k.embedding IS NOT NULL
      AND (filter_category_kind IS NULL OR c.kind = filter_category_kind)
      AND (filter_country_code IS NULL
           OR COALESCE(s.country_code, c.country_code) IS NULL
           OR COALESCE(s.country_code, c.country_code) = filter_country_code)
      AND (filter_region IS NULL OR s.region IS NULL OR s.region = filter_region)
    ORDER BY k.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
    LIMIT match_count * 4
  ) ...
$$;
```

The two corrections over the document-level function: it adds `AND s.active` (deactivating a
source currently does **not** hide its documents from the counsellor), and it over-fetches
before filtering rather than letting a country+kind filter silently starve the result set.

### 3.6 Drop three dead columns

`ALTER TABLE ... DROP COLUMN embedding` on `ai_knowledge_visa`, `ai_knowledge_faqs`,
`ai_knowledge_country_guides`. Never written, never read, and their presence implies a
retrieval path that does not exist.

---

## 4. Knowledge Ingestion Flows

### 4.1 Structured visa knowledge / country guides / FAQs

Unchanged path, three additions.

```
Admin fills form  →  Zod validate  →  INSERT/UPDATE  →  logAudit
                                            ↓
                     no embedding, no chunking, no queue
                                            ↓
   retrieval: keyword ILIKE + active=true + last_verified_date into the context line
```

1. **Widen `SEARCH_COLUMNS`** in `content.repository.ts`. `visa` currently matches only
   `visa_type` + `destination_country`, so "how many hours can I work" never hits a visa row.
   Add `post_study_visa`, and match the `required_documents` / `common_rejections` arrays.
2. **Emit `last_verified_date`** and an authority label on every structured context line.
3. **Normalise `destination_country` / `country` to ISO2** on write against the existing
   `countries` table, so the RAG country filter and the structured lookup agree on what "UK"
   means.

**Why not embed structured records (Option A over Option B).** Evaluated and rejected: these
rows are small, exact, and already filterable by the two dimensions that matter
(`destination_country`, `visa_type`). Vector search adds no recall over an ILIKE on a
five-column row, and embedding them would put the same fact — `application_fee_usd` — into two
retrieval paths, creating exactly the duplicate-and-conflict problem this plan exists to
prevent, plus a re-embed hook on every admin edit. The hybrid the brief anticipated is real,
but it lives at *context assembly*, not at storage: structured SQL and chunk retrieval run in
parallel and are labelled separately in the prompt.

### 4.2 Markdown upload

```
POST /sources/upload (multipart)
  → validateFile(mime, size, RACK_MIME_TYPES)      [reuse storageService]
  → uploadFile(buildPath("private/ai-knowledge", categoryId, name), buf, mime)
  → INSERT ai_knowledge_sources (source_type='upload', file_path, file_name, mime_type,
                                 country_code, region, trust_tier, ingestion_class)
  → INSERT ai_knowledge_documents (ingest_status='pending')
  → publish ai_knowledge_ingest { documentId }
  → 202 Accepted
```

Worker: download from GCS → already markdown, no parse step → normalise (collapse whitespace,
strip HTML comments, keep headings verbatim) → sha256 → chunk.

The chunker splits on `#`/`##`/`###` boundaries and merges adjacent sections up to ~500–800
tokens (`tokens ≈ chars/4`) with ~10% overlap, never splitting mid-heading, and stamps each
chunk's `heading_path` with the full breadcrumb of enclosing headings. Heading-less documents
fall back to paragraph packing.

This is what makes the three research registries retrievable — they are 1,343 / 1,744 / 1,775
lines of nested `### Source:` and `### Resource:` entries, and heading-aware chunking gives
per-entry granularity for free.

### 4.3 PDF upload

Same as §4.2 up to the queue, then:

```
download → extractPdfWithGemini(buf, fileName)   [reuse document-extractor.ts]
         → markdown → normalise → sha256 → chunk → embed
```

Reuses the existing Gemini-vision extractor, which is **why no OCR dependency is needed** —
vision handles scanned PDFs natively. Three constraints to fix:

- `MAX_RETURN_CHARS = 40_000` silently appends `[…truncated…]` on long PDFs. Raise for the rack path and record truncation in `ingest_error` as a warning rather than swallowing it.
- `MAX_PDF_BYTES = 25MB` vs `GCS_MAX_FILE_SIZE_MB = 10`. The upload cap bites first; raise the rack limit explicitly rather than leaving two disagreeing numbers.
- **Page attribution:** extend the extraction prompt to emit `<!-- page N -->` markers between pages; the chunker carries the last-seen marker into `page_number`. A prompt tweak plus one regex buys real page-level citation.

Failure handling: the extractor already returns typed codes — `unsupported_format`,
`fetch_failed`, `too_large`, `ai_failed`, `no_api_key`. Map straight into
`ingest_status='failed'`, `ingest_stage='parse'`, `ingest_error=<code>`. Never silently drop.

### 4.4 CSV upload

Not embedded as raw text. **One document per file; one chunk per group of N rows, size-driven.**

```
parse header row → for each data row render a labelled block:

    Country: Australia
    Scholarship: Australia Awards
    Eligibility: citizens of partner countries, bachelor's minimum
    Amount: AUD 30,000/year
    Source: dfat.gov.au/...

→ pack row-blocks into chunks up to the same ~500–800 token target, never splitting a row
→ heading_path = the column header list, so the chunk is self-describing
```

Rejected alternatives, and why:

| Option | Why not |
|---|---|
| One document per row | Thousands of documents per file; `doc_count` becomes meaningless and the admin document list is unusable. |
| One chunk per row | A 5-line chunk retrieves poorly — too little context to match against — and burns a 3072-dim vector on 40 tokens. |
| Whole CSV as one blob | One diluted vector: exactly the defect being fixed. |

Repeating the column labels per row is what makes a chunk self-describing: retrieved in
isolation, `Country: Australia / Amount: AUD 30,000` still means something, where
`Australia,30000` does not.

Parsing uses a hand-rolled RFC-4180 split (quoted fields, embedded commas and newlines) —
roughly 30 lines. The backend has no CSV library and does not need one.

### 4.5 Country guides (crawled reinforcement)

Country guides are structured (§4.1) *and* the topical target of crawled sources whose category
`kind = 'country_guide'`. Nothing special: they flow through §4.6 like any URL source, and the
category kind is what lets `detectCategoryKind()` scope retrieval to them.

### 4.6 Scrapling web crawling

```
Admin adds source (url, category, country_code, region, trust_tier,
                   ingestion_class, crawl_frequency, max_pages)
  → POST /sources/:id/crawl  →  publish ai_knowledge_crawl { sourceId, maxPages }
                                              ↓
  discoverUrlsForCrawl(seed)      map → sitemap.xml → page links → seed-only
                                              ↓
  filterAndRankUrls(urls, getRulesForKind(category.kind))     ← wires up the dead file
                                              ↓
  per URL:  scrapeMarkdown(url)   SCRAPLING → crawl4ai fit → crawl4ai raw → firecrawl
                                              ↓
            normalise → sha256 → compare content_hash
                                              ↓
            unchanged → skip (no re-embed)     changed → DELETE old chunks,
                                                         re-chunk, re-embed
                                              ↓
            politeDelay(400, 1200) → next URL
                                              ↓
  UPDATE source: last_crawled_at, last_status, doc_count, crawl_summary
```

`filterAndRankUrls` + `getRulesForKind` already exist in
`data-extraction/lib/crawl-rules.ts` with `CrawlKind = "visa" | "faq" | "country_guide"` —
exactly the category `kind` values — and have **zero callers**. Wiring them in means a visa
source's 25-page budget is spent on `/visas/`, `/immigration/`, `/guidance/` paths instead of
whatever the sitemap happened to list first. Highest quality-per-line change in this plan.

---

## 5. RAG Retrieval Flow

```
User question
      │
      ├─ extractKeywords()            [exists] stopword strip + punctuation
      │
      ├─ detectCountryCode()          [exists] cached country-name regexes + aliases
      │
      ├─ detectCategoryKind()         [NEW]  keyword→kind via crawl-rules include_keywords
      │                                      "work while studying" → visa
      │                                      "education system"    → country_guide
      │                                      null when ambiguous → no filter
      │
      ├──────────────── parallel, each independently error-trapped ────────────────┐
      │                                                                            │
   STRUCTURED (direct SQL, keyword ILIKE, active=true)          RAG (vector)        │
   · searchKnowledgeVisas   → ai_knowledge_visa                 embed(query)        │
   · searchCountryGuides    → ai_knowledge_country_guides            ↓              │
   · searchKnowledgeFaqs    → ai_knowledge_faqs               match_ai_knowledge_   │
   · searchVisas            → extraction_visas                    chunks(           │
     (+ status='promoted'  ← fixes pending/discarded leak)          vec,             │
   · searchCourses / institutions / agents / mara                   count=8,         │
                                                                    kind,            │
                                                                    country,         │
                                                                    region)          │
      │                                                                            │
      └────────────────────────────────┬───────────────────────────────────────────┘
                                       │
                         dedupe: max 2 chunks per document
                         (one long page cannot fill every slot)
                                       │
                         rerank: TIER_RANK then similarity   [exists]
                                       │
                         context assembly — labelled blocks, each line carrying
                         authority + verification date + source ref
                                       │
                              buildSystemPrompt()
                                       │
                                 AI COUNSELLOR
```

### 5.1 Structured only, RAG only, or both

| Question | Path | Why |
|---|---|---|
| "Can I work while studying in Australia?" | **both** | `work_rights_hours` is an exact field; the conditions and exceptions are prose. |
| "What documents do I need for an Australian student visa?" | **both** | `required_documents[]` is the checklist; crawled gov pages carry per-document detail. |
| "What is the education system in Australia?" | **both** | Guide row is the summary; crawled AQF pages are the depth. |
| "What is student life like in Melbourne?" | **RAG-led** | `student_life` is one free-text column with no city granularity. Chunks carry it. |
| "What scholarships are available for international students?" | **RAG only** | No structured scholarship table in the counsellor's path — CSV/crawl territory. |
| "What is the application fee?" | **structured-led** | Single correct number. RAG only if no structured row exists. |

The honest answer is that *both* is the default and the distinction is about which block **leads
the context**, not which query runs — both run in parallel and cost the same either way.

### 5.2 Cutover safety

`matchKnowledgeChunks()` falls back to `matchKnowledgeDocuments()` while any document still has
`chunk_count = 0`, so retrieval never goes empty mid-migration. The fallback and the
document-level `embedding` column are removed together, once backfill is verified.

---

## 6. Scrapling Integration Plan

### 6.1 What the current implementation does

See §1.4. Crawl4AI primary, Firecrawl fallback, both hosted HTTP APIs called via plain
`fetch()`, behind a uniform `{ markdown, links, scraper }` contract. `.env.example` groups the
keys under a literal `# Scrapers` heading.

### 6.2 What stays unchanged

Everything above the fetcher. `discoverUrlsForCrawl`, `filterAndRankUrls`, `politeDelay`,
`throttleForHost`, per-URL change detection, `crawl_summary` progress reporting, the
`ai_knowledge_crawl` queue, and the whole document/chunk pipeline are all fetcher-agnostic.

### 6.3 The integration layer

Scrapling becomes tier 0 of the existing cascade:

```ts
// scraper.ts
export interface ScrapeResult {
  scraper: "scrapling" | "crawl4ai" | "firecrawl" | "none";   // widened union
  ...
}

async function scraplingScrape(url, opts): Promise<...>   // HTTP call, mirrors the crawl4ai tier
```

Config additions in `src/config.ts`, mirroring the existing Crawl4AI keys exactly:
`SCRAPLING_BASE_URL`, `SCRAPLING_API_KEY`, both `.optional()`. When unset the cascade behaves
exactly as today, so the rebase can land before or after this plan's work with no ordering
constraint.

### 6.4 Fetcher-mode first, spider-mode later

**v1 uses Scrapling as a per-URL fetcher, not as a crawl orchestrator.** Scrapling's Spider
does offer allowed_domains, concurrency, per-domain limits, download delays, request dedupe and
pause/resume checkpoints — real capabilities that partly duplicate what `discoverUrlsForCrawl`
already does. But handing crawl orchestration to a Python spider means the Node worker loses
per-URL change detection, per-URL `ingest_status`, and incremental `crawl_summary` reporting —
the three things that make the Rack auditable.

If per-URL fetching proves too slow at scale, add `crawl_mode text DEFAULT 'fetch'` to
`ai_knowledge_sources` and a spider path returning a batch of `{url, markdown}` into the same
change-detection loop. Deferred, not designed now.

### 6.5 Re-crawling, change detection, duplicate prevention

`sha256(normalised_markdown)` → `content_hash`, already implemented and working. The one
change: on a hash change the worker must now
`DELETE FROM ai_knowledge_chunks WHERE document_id = ?` before re-chunking. Today it nulls the
document embedding; with chunks, skipping the delete leaves orphaned stale chunks that still
match queries — the single most likely bug in this whole plan.

Duplicate embeddings are prevented at four levels:

1. `UNIQUE(category_id, url)` and `UNIQUE(category_id, file_path)` on sources
2. `UNIQUE(source_id, url)` on documents
3. `content_hash` equality skip *before* any embedding call
4. `UNIQUE(document_id, chunk_index)` on chunks

### 6.6 Scope and robots

Two safety additions, both small:

1. **Honour `Disallow`** for rack crawls. Nothing in the repo does this today, and the corpus is deliberately official-government-heavy where it matters most.
2. **Constrain discovered URLs to the source's registered `domain`** — already derived server-side and not client-patchable — so a crawl cannot wander off an approved host.

Start with the ~236 already-annotated sources from the three research docs. No open crawler.

---

## 7. Background Job Plan

Three jobs. Not eight.

| Job | Queue / trigger | Responsibility |
|---|---|---|
| `knowledge-crawl.worker.ts` **(modify)** | `ai_knowledge_crawl` | Per source: discover → rank → fetch → hash → change-detect → chunk → embed. Now deletes stale chunks and writes `ingest_status`. |
| `knowledge-ingest.worker.ts` **(new)** | `ai_knowledge_ingest` | Per uploaded document: download from GCS → parse by mime → normalise → chunk → embed. Separate queue because there is no URL discovery and the failure modes differ (parse errors, not fetch errors). |
| `knowledge-recrawl-dispatch.worker.ts` **(new)** | `setInterval` + `--once` | Reads the existing `idx_akd_sources_due` partial index and publishes due sources to `ai_knowledge_crawl`. Copies the `extraction-schedule.worker.ts` pattern verbatim. |

**Chunking and embedding stay inline** in the worker that owns the document. Splitting them into
their own queues buys nothing without a DLQ and costs three more long-lived containers.

`queueService.nack(msg, false, false)` drops failed messages with no DLQ, so **every failure
must be written to `ai_knowledge_documents.ingest_status` / `ingest_error` / `ingest_stage`
before the handler returns.** This is the load-bearing constraint of the job design: the queue
is not a record of anything.

Also add the **missing `ai-knowledge-crawl-worker` docker-compose service** — the worker has
existed since the 20260814 migration with an npm script and no container, so rack crawls only
run when someone starts it by hand.

---

## 8. API and Backend Changes

### 8.1 New files

```
backend/src/modules/superadmin/ai-knowledge/
  lib/chunker.ts                    heading-aware markdown splitter + heading_path/page_number
  lib/chunker.selfcheck.ts          assert-based self-check (repo convention — no test framework)
  lib/csv-to-blocks.ts              RFC-4180 parse → labelled key:value row blocks
  lib/csv-to-blocks.selfcheck.ts    quoted fields, embedded commas/newlines, ragged rows
  lib/ingest.ts                     shared: normalise → hash → chunk → embed → write chunks
  workers/knowledge-ingest.worker.ts
  workers/knowledge-recrawl-dispatch.worker.ts
backend/database/migrations/superadmin/
  20260821_001_ai_knowledge_ingest.ts
backend/scripts/
  chunk-backfill.ts                 chunk + embed existing documents where chunk_count = 0
```

### 8.2 Modified files

| File | Change |
|---|---|
| `ai-knowledge/shared/queues.ts` | add `INGEST: "ai_knowledge_ingest"` |
| `ai-knowledge/routes/rack.routes.ts` | `POST /sources/upload` (multipart); `POST /sources/:id/verify`; `POST /documents/:id/reingest`; `GET /chunks?document_id=` |
| `ai-knowledge/schemas/rack.schema.ts` | `UploadSourceSchema`; add `source_type`, `country_code`, `region`, `ingestion_class`, `rule_class` to source schemas; `INGESTION_CLASSES` / `RULE_CLASSES` const arrays alongside the existing `TRUST_TIERS` |
| `ai-knowledge/services/rack.service.ts` | `uploadSource()`, `verifySource()`, `reingestDocument()`; refuse `do_not_ingest`/`metadata_only` at upload; delete the GCS object in `deleteSource` |
| `ai-knowledge/repositories/rack.repository.ts` | chunk reads; documents joined with `chunk_count`/`ingest_status`; staleness sort |
| `ai-knowledge/workers/knowledge-crawl.worker.ts` | call `filterAndRankUrls`; delete stale chunks; chunk+embed via `lib/ingest.ts`; write `ingest_status` |
| `ai-knowledge/repositories/content.repository.ts` | widen `SEARCH_COLUMNS`; ISO2 country normalisation on write |
| `data-extraction/lib/scraper.ts` | Scrapling tier 0; widen `scraper` union; honour robots `Disallow`; constrain to source domain |
| `data-extraction/lib/document-extractor.ts` | `<!-- page N -->` markers in the PDF prompt; raise the rack char cap; surface truncation |
| `ai-counsellor/repositories/knowledge.repository.ts` | `matchKnowledgeChunks()`; `status='promoted'` on `searchVisas`; return verification dates |
| `ai-counsellor/services/rag.service.ts` | `detectCategoryKind()`; pass kind+country+region; chunk blocks with heading_path + authority + verified date; drop the 1,500-char slice; max 2 chunks/document |
| `ai-counsellor/services/prompt.service.ts` | extend the existing conflict rule with freshness and `rule_class` ("provincial rule, not national") |
| `src/config.ts` | `SCRAPLING_BASE_URL`, `SCRAPLING_API_KEY` |
| `backend/.env.example` | the two Scrapling keys under the existing `# Scrapers` heading |
| `backend/package.json` | `job:ai-knowledge-ingest`, `job:ai-knowledge-recrawl`, `chunk:backfill` |
| `docker-compose.yml` | `ai-knowledge-crawl-worker`, `ai-knowledge-ingest-worker` services |

---

## 9. Frontend / Super Admin Changes

Keep the existing five tabs and the inline-card form pattern. Almost everything lands in the
Rack tab; Visa/FAQs/Guides tabs are untouched apart from reading the same data they already do.

`components/rack-tab.tsx` is already 475 lines against the 300-line cap in `frontend/AGENTS.md`,
so the additions come with an extraction rather than more inlining:

```
components/rack-tab.tsx               (slimmed — list + orchestration)
components/source-form.tsx            (extracted; + country, region, ingestion_class, rule_class)
components/upload-source-dialog.tsx   (new — file picker + metadata, via httpPostForm)
components/document-drawer.tsx        (+ chunk list, ingest_status, ingest_error, page numbers)
```

Behaviour additions:

- **Upload document** button beside Add URL source. Accepts `.md`/`.pdf`/`.csv`, posted multipart via the existing `httpPostForm` helper in `lib/api/http.ts`.
- Source rows show a `source_type` badge (URL / Upload) alongside the trust tier already shown.
- **Staleness badge:** `last_verified_at` older than 6 months → amber; past `effective_until` → red. Plus a **Verify** button stamping `last_verified_at`.
- Document rows show `ingest_status` and `chunk_count` ("12 chunks in brain"), with `ingest_error` inline on failure and a **Re-ingest** action.
- Reuse the existing 5-second poll while any source is `queued`/`crawling`, extended to cover `ingest_status = 'processing'`.

Store: extend `store/ai-knowledge-slice.ts` with `uploadSource`, `verifySource`,
`reingestDocument`, `fetchChunks` thunks alongside the existing nine. `apis/types.ts`,
`real-api.ts` and `mock-data.ts` updated in parity, per the repo's `createApi({mock, real})`
convention.

**Not doing:** no redesign, no move to the dialog+table pattern used by
`admin/monitoring/scholarships`, no pagination. AI Knowledge has no pagination today
(limit-capped at 200, no offset or count), and adding it is a backend change out of scope here.

---

## 10. Implementation Order

Each phase is a separate PR. Phase 1 is the tracer bullet: it proves chunk retrieval end to end
on real data before anything else depends on it.

### Phase 1 — Chunking + retrieval cutover — ✅ BUILT 2026-08-22 (with Phase 2, one PR)
- **Goal:** replace whole-page embeddings with chunks; end the 1,500-char truncation.
- **Files:** `lib/chunker.ts` + selfcheck, `lib/ingest.ts`, `knowledge-crawl.worker.ts`, `knowledge.repository.ts`, `rag.service.ts`, `scripts/chunk-backfill.ts`
- **DB:** `20260821_001` — `ai_knowledge_chunks`, HNSW index, `match_ai_knowledge_chunks()`, `documents.ingest_*` + `chunk_count`
- **API:** `GET /chunks?document_id=`
- **Frontend:** chunk list in `document-drawer.tsx`
- **Testing:** `chunker.selfcheck.ts` (heading split, overlap, tiny-section merge, paragraph fallback, `heading_path` correctness) exits non-zero on failure; `npm run chunk:backfill` over existing documents; SQL smoke of `match_ai_knowledge_chunks` with and without filters; one live counsellor question comparing the retrieved passage against the old 1,500-char slice.
- **Depends on:** nothing.

### Phase 2 — File upload (MD / PDF / CSV) — ✅ BUILT 2026-08-22 as MD/PDF/TXT, no CSV
- **Goal:** admins can upload the three research docs and any CSV dataset.
- **Files:** `lib/csv-to-blocks.ts` + selfcheck, `workers/knowledge-ingest.worker.ts`, `rack.service.ts`, `rack.routes.ts`, `rack.schema.ts`, `document-extractor.ts`
- **DB:** `sources.source_type/file_path/file_name/mime_type` + CHECK + `UNIQUE(category_id, file_path)`
- **API:** `POST /sources/upload`, `POST /documents/:id/reingest`
- **Frontend:** `upload-source-dialog.tsx`, `source_type` badge, ingest status + Re-ingest
- **Testing:** `csv-to-blocks.selfcheck.ts` (quoted fields, embedded commas/newlines, ragged rows); upload one of each type and assert chunk counts, `heading_path` on the MD, `page_number` on the PDF, row integrity on the CSV; assert a corrupt PDF lands `ingest_status='failed'` with `ingest_stage='parse'` and nothing half-written.

#### As built (2026-08-22) — deviations from Phases 1–2 as written

Phase 5's cutover safety (§5.2, `matchKnowledgeChunks` falling back to `matchKnowledgeDocuments`) was **not built**: it presumed existing documents, and there were none. Retrieval is chunk-only.

Migration `superadmin/20260822_001_ai_knowledge_chunks.ts` (not `20260821_001`), append-only per the repo rule.

| Planned | Built | Why |
|---|---|---|
| `knowledge-ingest.worker.ts` + `ai_knowledge_ingest` queue | **Inline in `rack.service.uploadSource()`** | The frontend contract already shipped (`upload-source-form.tsx` → `{ chunks, embedded }` in the response) and expects a synchronous count. A 130KB doc is ~60 chunks ≈ 12s at `EMBED_CONCURRENCY=5`. No new queue, worker, container or npm script. Move it to the crawl queue if a book-sized PDF ever times out. |
| `documents.ingest_status/_error/_stage/_attempts` | **Not added** | Those columns exist because a queued failure is invisible. Inline upload returns the error to the admin and rolls back (source row + GCS object deleted), so there is no half-ingested row to describe. Re-add with the worker if upload ever goes async. |
| CSV upload + `lib/csv-to-blocks.ts` | **Dropped** | Nothing in the current dataset is CSV. |
| `POST /documents/:id/reingest` | **Dropped** | Re-crawl re-chunks automatically; an upload is replaced by delete + re-upload. |
| `GET /chunks?document_id=` + chunk list UI | **Dropped** | `chunk_count` on the document row answers "did it chunk". Add the endpoint when tuning retrieval needs chunk-level inspection. |
| `sources.ingestion_class` / `rule_class` / `region` / `last_verified_at` / `effective_until` | **Not added** (only `country_code`) | Copyright gate and freshness are Phase 3/5. `country_code` came early because `match_ai_knowledge_chunks()` COALESCEs it, and adding it later would mean dropping and recreating the function. |
| Drop `documents.embedding` | **Dropped in the same migration**, with `match_ai_knowledge_documents()` and its HNSW index | `ai_knowledge_documents` held 0 rows, so a fallback had nothing to serve and there was no backfill window to protect. Keeping it would have cost a second vector query on every turn that matched no chunk — which, with an empty rack, is every turn. `down()` restores column, index and function as 20260820_001 left them. `embed:backfill` lost its rack target; `chunk:backfill` replaces it. |
| `chunker.selfcheck.ts` | **`backend/tests/chunker.ts`** (`npm run test:chunker`) | Repo convention: standalone tsx scripts under `tests/`, no selfcheck files exist. |

Added beyond the plan: markdown-table integrity in the chunker (a table is never split without repeating its header row — the country docs are table-dense), and the missing `ai-knowledge-crawl-worker` docker-compose service plus Makefile targets, since chunking on re-crawl now depends on that worker actually running.
- **Depends on:** Phase 1 (`lib/ingest.ts`).

### Phase 3 — Metadata, copyright gate, structured cleanup
- **Goal:** country/region/category filtering actually reaches the query; copyright is enforced in code.
- **Files:** `rack.schema.ts`, `rack.service.ts`, `content.repository.ts`, `rag.service.ts` (`detectCategoryKind`), `knowledge.repository.ts`, `prompt.service.ts`
- **DB:** `sources.country_code/region/ingestion_class/rule_class/last_verified_at/effective_until`; **drop** the three dead `embedding` columns; drop `documents.embedding` once Phase 1 is verified
- **API:** metadata fields on source create/patch; `POST /sources/:id/verify`
- **Frontend:** metadata fields in `source-form.tsx`; staleness badge + Verify button
- **Testing:** an Australia visa question must not retrieve UK chunks; a `metadata_only` source must be rejected at upload with a clear error; a `do_not_ingest` source must never produce a chunk; verify `searchVisas` no longer returns `pending`/`discarded` extractions.
- **Depends on:** Phases 1–2.

### Phase 4 — Scrapling tier + crawl quality
- **Goal:** the US/AU/CA corpora become buildable; page budgets get spent on relevant URLs.
- **Files:** `scraper.ts`, `knowledge-crawl.worker.ts`, `src/config.ts`, `.env.example`
- **DB:** none
- **API:** none
- **Frontend:** show which `scraper` was used, in the existing `crawl_summary` line
- **Testing:** crawl one AU gov source that currently 403s and assert non-empty markdown with `scraper: "scrapling"`; assert the cascade still works with `SCRAPLING_BASE_URL` unset; assert `filterAndRankUrls` changes which 25 pages a visa source fetches; assert a `Disallow`ed path is skipped.
- **Depends on:** the Scrapling rebase landing. **Every earlier phase is independent of it** — this is the only phase that touches `scraper.ts`, and it is sequenced last for exactly that reason.

### Phase 5 — Scheduling + operations
- **Goal:** the corpus refreshes itself and failures are visible.
- **Files:** `workers/knowledge-recrawl-dispatch.worker.ts`, `package.json`, `docker-compose.yml`
- **DB:** none
- **API:** staleness sort/filter on the source list
- **Frontend:** staleness sort in the rack list
- **Testing:** run the dispatcher `--once` against seeded due sources and assert only due ones are published; assert the two new worker containers come up and consume; kill a worker mid-ingest and assert the document is left `processing` and is recoverable via Re-ingest.
- **Depends on:** Phases 1–2.

### Phase 6 — Seed and expand
- **Goal:** real coverage, one country at a time.
- Seed categories and the ~236 annotated sources from the three research docs, starting with **Australia only** (deepest existing data), then UK, then US/CA once Phase 4 proves the fetcher.
- Upload the three research registries themselves as MD sources — they are high-quality curated prose, and `heading_path` makes them retrievable at `### Source:` granularity.
- **Testing:** the eval harness from v2 Phase 9 (unchanged by this plan) run before and after each country's seeding, reports kept dated and diffable under `docs/ai-counsellor/evals/`.

---

## 11. Knowledge Priority and Conflict Resolution

No numeric scoring model. The data already carries authority, and a formula nobody can debug is
worse than labels the model can read.

**Recommended priority order** (evaluated against the actual tables, not assumed):

```
1. Verified structured admin knowledge   ai_knowledge_visa / _country_guides / _faqs
                                         + last_verified_date, admin-owned, single correct value
        ↓
2. Official government source            trust_tier = 'gov'          (existing TIER_RANK 0)
        ↓
3. Verified institution / education portal trust_tier = 'verified_institution'  (TIER_RANK 1)
        ↓
4. Approved uploaded research document    source_type = 'upload', ingestion_class allows it
        ↓
5. Other approved resource                trust_tier = 'other'        (TIER_RANK 2)
```

Structured leads because it is the only tier a human explicitly signed off on with a date.
Uploaded research sits below official sources but above general web, because it is curated yet
secondary. Tiers 2/3/5 map exactly onto the `TIER_RANK` sort that already ships.

**Mechanism, not magic:**

- Every context line carries authority (`trust_tier` label), `rule_class`, and a verification date. Uploads carry `file_name` instead of a domain.
- `prompt.service.ts` already instructs *"If CONTEXT sources conflict, prefer official government sources and tell the student the sources differ — never silently pick one."* Extend it with the freshness rule and `rule_class` ("this is a provincial rule, not national law").
- The existing trust-tier-then-similarity sort stays.
- **Structured vs crawled disagreement:** the structured value leads and the crawled passage is presented as supporting context. If the crawled source is `gov` and *newer* than the structured row's `last_verified_date`, both are surfaced with their dates and the model is instructed to flag the discrepancy rather than resolve it.
- **The `extraction_visas` fix belongs here:** adding `status='promoted'` removes unreviewed extractions from the conflict surface entirely, which is most of this problem solved by one WHERE clause.

---

## 12. Risks and Edge Cases

| Risk | Handling |
|---|---|
| **Stale chunks after re-crawl** | Highest-probability bug in this plan. `DELETE FROM ai_knowledge_chunks WHERE document_id = ?` before re-chunking, in the same transaction as the document update. Assert chunk count after re-crawling a changed page. |
| **Retrieval empties during cutover** | `matchKnowledgeChunks` falls back to `matchKnowledgeDocuments` while any document has `chunk_count = 0`. Fallback and the doc-level column are removed together, after backfill. |
| **HNSW post-filter starvation** | pgvector post-filters, so a country+kind filter can return far fewer than `match_count`. The function over-fetches `match_count * 4` before filtering. |
| **Duplicate knowledge** | Four levels (§6.5). Identical content under two different URLs still duplicates — accepted; `content_hash` is indexed, so a dedupe report is cheap to add later. |
| **Conflicting information** | Never silently merged. See §11. |
| **Outdated visa rules** | `last_verified_at` + `effective_until`, surfaced in context and as an admin badge. Stale knowledge is **labelled, not auto-deactivated** — a stale gov page beats nothing, and silent deactivation creates invisible coverage holes. |
| **Changed webpages** | `content_hash` diff. Unchanged pages skip embedding entirely — existing behaviour, preserved. |
| **Broken URLs / crawler failures** | `last_status`/`last_error` on the source (exists), `ingest_status`/`ingest_error`/`ingest_stage` per document (new). No DLQ exists, so DB state is the only record — written before the handler returns. |
| **PDF extraction failures** | Typed error codes already returned; mapped to `ingest_stage='parse'`. Vision-based extraction means scanned PDFs work, but a 300-page PDF hits the char cap — truncation is recorded as a warning, not swallowed. |
| **CSV structure differences** | Ragged rows padded, header-less files rejected with a clear message, non-UTF8 rejected at parse. Covered by the selfcheck. |
| **Embedding failures** | Already best-effort per the existing worker — *"a document with no vector is still useful to a human reader"*. Per-chunk now, so partial embedding is normal; `chunk_count` vs embedded count exposes it. `ingest_attempts` caps retries on a poison document. |
| **Partial ingestion** | `ingest_status='processing'` marks in-flight work. A worker killed mid-run leaves a recoverable row, not a silent half-corpus. Re-ingest is idempotent — chunks are deleted and rewritten wholesale. |
| **Deleted sources** | `ON DELETE CASCADE` handles sources → documents → chunks. GCS objects are **not** cascaded — `deleteSource` must call `storageService.deleteFile(file_path)` for uploads or the bucket leaks. |
| **Inactive knowledge** | `active` on source and document. The new function checks `s.active`, which the document-level function never did. |
| **Country naming inconsistencies** | Normalise to ISO2 on write against the existing `countries` table, on both structured records and sources. `detectCountryCode()` already resolves `uk`→`GB`, `usa`/`america`→`US`. Without this the RAG filter and the structured lookup disagree on "UK". |
| **Source attribution** | Every chunk resolves to document → source → (`url` or `file_name`) + `trust_tier` + `last_verified_at`, all returned by `match_ai_knowledge_chunks()` and rendered into the context line. `heading_path` and `page_number` give within-document precision. |
| **Copyright violation** | `ingestion_class` refused at upload for `do_not_ingest`/`metadata_only`, re-checked in the worker before chunking. Belt and braces, because the books doc is explicit that most of it must not be ingested as full text. |
| **Scrapling rebase conflicts `scraper.ts`** | Phase 4 is the only phase touching that file and is sequenced last. Phases 1–3 and 5 are independent of the rebase. |
| **Prompt bloat** | Chunks are shorter than the old 1,500-char page slices but there are more of them. Cap at 8 chunks with max 2 per document; the eval harness tracks `prompt_tokens` per question. |

---

## Assumptions (explicitly flagged)

1. **Scrapling will expose an HTTP interface.** It is a Python library and this backend is Node; the plan assumes a service reachable via `SCRAPLING_BASE_URL`, mirroring `CRAWL4AI_BASE_URL`. If the team ships it as a CLI invoked by subprocess instead, only `scraplingScrape()` in `scraper.ts` changes.
2. **A running Crawl4AI/Firecrawl deployment exists.** `CRAWL4AI_BASE_URL` is commented out in `.env.example` and `FIRECRAWL_API_KEY` is a placeholder — unverified whether either is live in any environment.
3. **`text/markdown` is not in the storage MIME allowlist.** `validateFile()` accepts an `allowedTypes` override, so the rack passes its own set rather than editing the global one. Browsers send `.md` as either `text/markdown` or `text/plain`; both are accepted.
4. **`GCS_MAX_FILE_SIZE_MB` defaults to 10 while the PDF extractor allows 25MB.** Which limit is intended for knowledge uploads is a product decision; the plan raises the rack limit explicitly rather than leaving two disagreeing numbers.
5. **`data_verification_queue` stays without a producer.** Community submission is unimplemented and out of scope; the Queue tab keeps showing V2-imported rows only.
6. **Token counting is `chars / 4`**, matching the v2 plan. No tokeniser dependency is added.
7. **Chunk retrieval count of 8** (up from 6 documents) is a starting point, not a measured optimum. The v2 Phase 9 eval harness is what should tune it.
8. **`HOST_THROTTLE_MS` is read directly from `process.env`** in `scraper.ts` and is absent from both the config schema and `.env.example`. Not changed here, but worth folding into `config.ts` when Phase 4 touches that file.

---

## Verification

After Phases 1–3:

```bash
# 1. Migrate (additive — existing rows and embeddings preserved)
cd backend && npm run migrate:superadmin

# 2. Self-checks (repo convention: no test framework, assert-based)
node --import tsx src/modules/superadmin/ai-knowledge/lib/chunker.selfcheck.ts
node --import tsx src/modules/superadmin/ai-knowledge/lib/csv-to-blocks.selfcheck.ts

# 3. Backfill chunks for documents already in the DB
npm run chunk:backfill

# 4. Typecheck
npx tsc --noEmit
```

Then, with the backend and the two new workers running:

1. Upload `docs/ai-counsellor/COUNTRY_STUDENT_VISA_RAG_SOURCES.md` via the Rack tab as an Australia / visa / gov source. Confirm the document reaches `ingest_status='active'` with a chunk count in the dozens, and that a spot-checked chunk's `heading_path` reads like `Australia > Official Immigration / Visa Sources (Tier 1) > Source: <name>`.
2. Upload a scholarships CSV. Confirm each chunk holds whole rows with column labels intact and no row split across a boundary.
3. Ask the counsellor *"Can I work while studying in Australia?"* Confirm the structured `work_rights_hours` appears with its verification date, the retrieved chunks are the passage that answers the question rather than a page preamble, and no UK or Canadian chunk appears.
4. Ask *"What documents do I need for an Australian student visa?"* Confirm the answer cites a source URL or filename traceable to a rack source.
5. Re-crawl a source whose page has changed. Confirm `SELECT count(*) FROM superadmin.ai_knowledge_chunks WHERE document_id = ?` matches the new chunk count exactly — no orphans from the previous version.
6. Deactivate a source and confirm its chunks stop appearing in counsellor context.
7. Upload a file against a `do_not_ingest` source and confirm rejection with a clear error and no chunk rows created.
