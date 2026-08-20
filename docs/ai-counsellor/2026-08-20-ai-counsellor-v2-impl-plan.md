# AI Counsellor v2 -- Implementation Plan (Phases 5–9)

> **Status:** DRAFT — awaiting approval | **Date:** 2026-08-20 | **App:** GlobalyApp-v3
> **Spec:** docs/ai-counsellor/2026-08-20-ai-counsellor-v2-gap-analysis-and-plan.md (Phases A–E)
> **PRD:** aicounselling-prd.md (v1.0) + docs/ai-counsellor/2026-08-16-ai-counsellor-prd.md
> **Predecessor:** docs/ai-counsellor/2026-08-16-ai-counsellor-plan.md (Phases 1–4, all ✅ shipped)

## Summary

Feature: AI Counsellor v2 — counselling intelligence on top of the shipped chat + Knowledge Rack
Mode: ENHANCEMENT (delta track — only changed files listed; unchanged Phase 1–4 code is not restated)

In scope:
- **Phase 5** — Counselling behaviour prompt + wire the existing country/trust filters into retrieval (gap doc Phase A; AC-04/06/07/08/09/13/14)
- **Phase 6** — Chunked embeddings + admin file upload (PDF/DOCX/TXT) into the Knowledge Rack (Phase B; AC-02, retrieval quality)
- **Phase 7** — Gemini tool calling: agent loop replaces run-all-searches-up-front (Phase C; AC-01/04, PRD §26)
- **Phase 8** — Evolving counselling context per session + opt-in promotion to profile (Phase D; PRD §16/§22)
- **Phase 9** — Eval harness + knowledge freshness (scheduled re-crawl, staleness) (Phase E; AC-10)

Out of scope (explicit):
- Multi-country content expansion, career-pathway entities, assessments, counsellor dashboard, human handoff (gap doc Phase F)
- Fine-tuning / self-hosted models (see gap doc Part 2)
- Separate vector DB, separate intent-classification service, formal stage state machine
- Multimodal attachment input to Gemini (Phase 4 leftover, unchanged)

Migration convention (pre-launch): **edit the existing migration files and do a full DB rollback+re-migrate** — no incremental ALTER migrations. User runs DB commands themselves.

---

## File Map

### Phase 5 — Counselling behaviour + filter wiring

MODIFY
- `backend/src/modules/ai-counsellor/services/prompt.service.ts` — counselling-behaviour sections (see Backend track)
- `backend/src/modules/ai-counsellor/services/rag.service.ts` — country detection, pass filters + trust ordering to rack search
- `backend/src/modules/ai-counsellor/repositories/knowledge.repository.ts` — `matchKnowledgeDocuments(embedding, count, categoryKind?, countryCode?)`; surface `trust_tier`
- `backend/database/migrations/superadmin/20260814_001_ai_knowledge.ts` — add `trust_tier` to `match_ai_knowledge_documents()` RETURNS (join already exists)

No new files. Plus an **admin content task** (not code): seed counselling categories (Career Counselling, Education Systems per country, Career Pathways, Decision-making) and crawl starter official sources.

### Phase 6 — Chunking + file upload

CREATE
- `backend/src/modules/superadmin/ai-knowledge/lib/chunker.ts` — heading-aware markdown splitter (~500–800 tokens, ~10% overlap)
- `backend/src/modules/superadmin/ai-knowledge/lib/chunker.selfcheck.ts` — assert-based self-check (splits, overlap, no empty chunks)

MODIFY
- `backend/database/migrations/superadmin/20260814_001_ai_knowledge.ts` — add `ai_knowledge_chunks` table + HNSW index + `match_ai_knowledge_chunks()`; add `source_type` (`url`|`upload`), `file_path`, `file_name`, `mime_type` to `ai_knowledge_sources` (url nullable for uploads)
- `backend/src/modules/superadmin/ai-knowledge/workers/knowledge-crawl.worker.ts` — chunk → embed chunks (replaces whole-doc embed); delete stale chunks on re-crawl
- `backend/src/modules/superadmin/ai-knowledge/services/rack.service.ts` — `uploadSource()`: store file via `shared/storage`, extract text (reuse `data-extraction/lib/document-extractor.ts`), then same chunk→embed path inline (no crawl queue for uploads)
- `backend/src/modules/superadmin/ai-knowledge/routes/rack.routes.ts` — `POST /sources/upload` (multipart)
- `backend/src/modules/superadmin/ai-knowledge/schemas/rack.schema.ts` — upload input schema
- `backend/src/modules/superadmin/ai-knowledge/repositories/rack.repository.ts` — chunk CRUD, doc-with-chunk-counts
- `backend/src/modules/ai-counsellor/repositories/knowledge.repository.ts` — switch to `match_ai_knowledge_chunks()`
- `backend/src/modules/ai-counsellor/services/rag.service.ts` — inject chunk content (drop the 1,500-char page truncation)
- `frontend/src/app/admin/data/ai-knowledge/components/rack-tab.tsx` — "Upload document" action beside "Add URL source"
- `frontend/src/app/admin/data/ai-knowledge/apis/{types,real-api,mock-data}.ts` — upload endpoint

CONFIRM BEFORE CREATING (path tentative)
- `frontend/src/app/admin/data/ai-knowledge/components/upload-source-dialog.tsx` — only if the existing source dialog can't absorb a file input

### Phase 7 — Tool calling

CREATE
- `backend/src/modules/ai-counsellor/lib/tools.ts` — Gemini function declarations + dispatcher mapping tool name → existing `knowledge.repository` functions

MODIFY
- `backend/src/modules/ai-counsellor/lib/gemini-stream.ts` — accept `tools`, run function-calling rounds (cap 4), stream the final turn
- `backend/src/modules/ai-counsellor/services/chat.service.ts` — agent loop path; `rag.searchAll` kept as fallback (embed mode stays on searchAll — scoping rules already live there)
- `backend/src/modules/ai-counsellor/services/prompt.service.ts` — tool-use guidance (search only when needed; asking a follow-up instead is valid)

### Phase 8 — Counselling context

MODIFY
- `backend/database/migrations/globalyapp/20260816_002_ai_counselor_sessions.ts` — add `counselling_context JSONB NOT NULL DEFAULT '{}'`
- `backend/src/modules/ai-counsellor/lib/tools.ts` — `update_student_context` tool (writes session.counselling_context)
- `backend/src/modules/ai-counsellor/repositories/sessions.repository.ts` — context read/merge-write
- `backend/src/modules/ai-counsellor/services/prompt.service.ts` — inject counselling context; opt-in promotion instruction ("offer to remember, never auto-persist")

### Phase 9 — Evals + freshness

CREATE
- `backend/scripts/ai-evals/questions.json` — ~30 fixed questions (one per PRD §25 response type + PRD §1 examples)
- `backend/scripts/ai-evals/run-evals.ts` — POST each question at a running backend, dump responses + automated checks (asked follow-up? cited? emitted card only when data present?) to a dated markdown report
- `backend/src/modules/superadmin/ai-knowledge/workers/knowledge-recrawl-dispatch.worker.ts` — cron-style dispatcher: query `idx_akd_sources_due` sources, publish to existing crawl queue

MODIFY
- `backend/database/migrations/superadmin/20260814_001_ai_knowledge.ts` — add `last_verified_at`, `effective_until` to `ai_knowledge_sources`
- `backend/src/modules/superadmin/ai-knowledge/routes/rack.routes.ts` + `rack.repository.ts` — staleness sort/filter on source list; verify action (stamps `last_verified_at`)
- `frontend/src/app/admin/data/ai-knowledge/components/rack-tab.tsx` — staleness badge + verify button
- `backend/package.json` — `job:ai-knowledge-recrawl` script entry (matches existing `job:ai-knowledge-crawl` pattern)

---

## DB Track

All changes are **edits to existing migration files** + full rollback/re-migrate (pre-launch convention). No RLS in this stack — access control is route-level guards (superadmin routes already guarded; no change).

```
[ ] superadmin/20260814_001_ai_knowledge.ts:
    [ ] ai_knowledge_chunks (id uuid PK, document_id FK CASCADE, chunk_index int,
        content text, token_count int, embedding vector(3072), created_at)
        + UNIQUE(document_id, chunk_index)
    [ ] HNSW index on chunks embedding (halfvec cast, same pattern as documents)
    [ ] match_ai_knowledge_chunks(query_embedding, match_count, filter_category_kind,
        filter_country_code) — joins chunk→document→category/source; returns
        chunk content, similarity, title, url, category_label, source_domain, trust_tier
    [ ] match_ai_knowledge_documents(): add trust_tier to RETURNS (Phase 5 can ship
        before chunks exist)
    [ ] ai_knowledge_sources: + source_type text NOT NULL DEFAULT 'url',
        file_path/file_name/mime_type nullable, last_verified_at, effective_until;
        url nullable (CHECK: url required when source_type='url')
    [ ] Keep doc-level embedding column until Phase 6 cutover verified, then drop
        in the same edit before launch
[ ] globalyapp/20260816_002_ai_counselor_sessions.ts:
    [ ] + counselling_context jsonb NOT NULL DEFAULT '{}'
[ ] User runs rollback + migrate + verifies (their workflow, via `!`)
```

Index check: chunk retrieval filters on `document_id` (FK index) and vector order (HNSW) — covered. Recrawl dispatcher uses existing `idx_akd_sources_due` — covered.

## Backend Track

Rung: plain service/repo code on existing patterns — no new deps, no new queues (recrawl dispatcher reuses `KNOWLEDGE_QUEUES.CRAWL`).

```
Phase 5: — ✅ code done 2026-08-20 (pending DB re-migrate + category seeding)
[x] prompt.service.ts — add sections: counsel-before-recommend (ask 1–3 clarifying
    questions when context is thin); recommendations must state why + assumptions +
    trade-offs + alternatives; label "from our database" vs "general guidance";
    never guarantee outcomes/admission; psych boundary (no diagnosis, suggest
    professionals for distress); prefer higher-trust sources, surface conflicts
[x] rag.service.ts — country detection (word-boundary match of country names +
    uk/usa/america/uae aliases against countries table, cached in-memory) →
    pass filter_country_code; rack match count 4→6; KNOWLEDGE ARTICLES sorted
    trust-tier-first with tier labels in context lines
[x] knowledge.repository.matchKnowledgeDocuments — countryCode param + trust_tier
    in results; new listCountryNames()
[x] migration 20260814_001 — match_ai_knowledge_documents() returns trust_tier
    (RETURNS TABLE changed → needs DROP FUNCTION + re-create, or full re-migrate)

Phase 6:
[ ] chunker.ts — split on #/## headings, merge to ~500–800 tokens (token ≈ chars/4),
    ~10% overlap; fallback paragraph split for heading-less docs
[ ] crawl worker — per changed doc: delete old chunks, insert+embed new ones
    (embed per chunk; best-effort like today — chunk without vector is not fatal)
[ ] rack.service.uploadSource — multipart via shared/storage (existing MIME allowlist),
    extract text with document-extractor, create source(source_type='upload') +
    one document, chunk+embed inline, return counts
[ ] retrieval cutover — rag.service uses match_ai_knowledge_chunks; dedupe by
    document (max 2 chunks/doc) so one long doc can't fill all slots

Phase 7:
[ ] tools.ts — declarations: search_courses(query, country?, degree_level?),
    search_visas(query, country?), search_institutions(query),
    search_knowledge(query, category_kind?, country?), get_course_details(id),
    update_student_context(patch)  ← no-op until Phase 8
[ ] gemini-stream.ts — function-calling loop (max 4 rounds), then stream final text;
    emit each tool call as a "trace" SSE event (reuses existing thinking indicator)
[ ] chat.service.ts — authed chat uses agent loop; embed mode keeps searchAll
    (business scoping stays exactly as shipped); on tool-loop error fall back to
    searchAll + single generation

Phase 8:
[ ] update_student_context tool → sessions.repository merge into counselling_context
[ ] prompt.service — inject counselling_context after profile block; instruct
    opt-in promotion, sensitive info never auto-persisted

Phase 9:
[ ] run-evals.ts — needs staging URL + test JWT via env; report to
    docs/ai-counsellor/evals/YYYY-MM-DD-report.md
[ ] recrawl dispatcher — SELECT due sources (frequency vs last_crawled_at),
    publish to crawl queue; run via cron / manual `npm run job:ai-knowledge-recrawl`
```

## Frontend Track

Minimal — v2 is almost entirely backend.

```
[ ] rack-tab.tsx — "Upload document" (file input: pdf/docx/txt/md) + progress +
    error state; staleness badge (last_verified_at > 6 months → amber) + Verify button
[ ] apis (admin ai-knowledge) — uploadSource (multipart), verifySource; mock parity
[ ] No personal-app changes: tool-call traces ride the existing "trace" SSE event
    and thinking indicator unchanged
```

## Test Plan

No test framework exists in the backend — per repo convention, runnable self-checks + the eval harness are the regression net.

```
[ ] Tracer bullet (Phase 6): chunker.selfcheck.ts — asserts heading split, overlap,
    merge of tiny sections, paragraph fallback; run with tsx, exits non-zero on fail
[ ] Phase 5 smoke: one script hit of match_ai_knowledge_documents with/without
    country filter against seeded rows (SQL-level, user-run)
[ ] Phase 7 smoke: scripted chat turn asserting ≥1 tool call trace event and a
    final done event (extends run-evals.ts plumbing)
[ ] Phase 9 IS the test suite: run evals after every prompt/tool change; keep the
    dated reports so regressions are diffable
[ ] Gates per phase: npx tsc --noEmit clean; no secrets in code (GEMINI key stays
    in config); embed-mode scoping re-checked after Phase 7 (competitor-leak rule)
```

## Risk & Rollback

Risks:
- **Tool calling degrades embed mode** → embed keeps the shipped searchAll path untouched; agent loop is authed-chat only until proven.
- **Chunk cutover empties retrieval** (docs not yet re-embedded) → cutover reads chunks with doc-level fallback until re-crawl completes; drop fallback after verification.
- **Prompt bloat** (counselling sections + tools + context) → evals track token usage per question; trim if prompt_tokens jump >30%.
- **Upload of malicious/huge files** → existing shared/storage MIME allowlist + size cap; extractor already sandboxes parsing (superadmin-only route).
- **Gemini function-calling latency** (up to 4 rounds) → trace events keep UX honest; cap rounds, 30s budget then fallback.

Rollback:
- DB: full rollback + re-migrate of edited migrations (standard pre-launch workflow)
- Backend: each phase is a separate PR; revert restores prior behaviour (searchAll path never deleted)
- Frontend: upload button is additive; revert rack-tab commit

## Open Questions

```
[ ] Phase 5 seeding: which countries first for Education System categories?
    (Suggest: Australia only, matching current data depth) — owner: product
[ ] Phase 9 evals need a staging test user + JWT — owner: dev
[ ] Drop doc-level embedding column at Phase 6 cutover, or keep both pre-launch?
    (Suggest: drop, one retrieval path) — owner: dev
```

---

Plan saved → docs/ai-counsellor/2026-08-20-ai-counsellor-v2-impl-plan.md

Open questions above must be resolved before implementation starts (Phase 5 can begin regardless — none block it).

Type **"approved"** to hand off to implementation, or tell me what to change.
