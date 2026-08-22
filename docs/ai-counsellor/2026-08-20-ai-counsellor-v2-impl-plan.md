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

### Phase 7 — Tool calling — ✅ BUILT 2026-08-22

CREATE
- `backend/src/modules/ai-counsellor/lib/tools.ts` — Gemini function declarations + dispatcher mapping tool name → existing `knowledge.repository` functions

MODIFY
- `backend/src/modules/ai-counsellor/lib/gemini-stream.ts` — accept `tools`, run function-calling rounds (cap 4), stream the final turn
- `backend/src/modules/ai-counsellor/services/chat.service.ts` — agent loop path; `rag.searchAll` kept as fallback (embed mode stays on searchAll — scoping rules already live there)
- `backend/src/modules/ai-counsellor/services/prompt.service.ts` — tool-use guidance (search only when needed; asking a follow-up instead is valid)

#### As built (2026-08-22)

Six tools, all wrapping existing `knowledge.repository` calls: `search_courses`, `get_course_details`,
`search_knowledge` (chunks + curated visa/FAQ/guide rows in one call), `search_visas`,
`search_institutions`, `search_service_providers` (education agents + MARA).

| Decision | Choice |
|---|---|
| Tool results | **JSON**, not the pasted text format. Function responses are JSON natively, and `search_courses` returns a `card` object per course so the model copies card fields verbatim instead of parsing a `CARD_FIELDS` line. `courseCardFields()` in `lib/tools.ts` is now the single mapping both paths use. |
| `update_student_context` | **Deferred to Phase 8** with the `counselling_context` column it writes to. |
| Discovery turn | Course tools are **withheld from the declaration list** rather than forbidden in the prompt — the model cannot list courses it has no tool to fetch. |
| Round cap | 4. On exhaustion the conversation continues in a **tool-free session** (`startChat` with the accumulated history) so the model must answer from what it retrieved. |
| Embed mode | Stays on `searchAll`. Its `jobIds` scoping is what stops one business's widget surfacing a competitor's courses, and a tool the model calls with its own arguments would route around it. |
| Fallback | Tool-loop failure falls back to `searchAll` **only if nothing has streamed yet**; a mid-stream failure surfaces as an error rather than stitching one reply out of two runs. |
| Preamble text | Streamed as it arrives, even on a round that also calls a tool. Buffering to find out whether the round was a tool round would deliver the real answer in one lump. The prompt tells the model not to narrate its searching, so preambles are rare. |
| Kill switch | None. Reverting is a one-line change in `chat.service` (`useTools = false`), and tool failures already fall back automatically. |

Test: `npm run test:ai-tool-loop` — 25 assertions over a mocked SDK (dispatch, `functionResponse`
round-trip, parallel calls in one round, cap + forced answer with tools disabled, usage
accumulation, discovery-turn withholding).

**Cost note:** a tool turn is 2–5 model calls where the old path was always 1, while credits still
deduct 1 per message. Watch token spend per message before turning this loose on a large user base.

### Phase 8 — Counselling context — ✅ BUILT 2026-08-22

MODIFY
- `backend/database/migrations/globalyapp/20260816_002_ai_counselor_sessions.ts` — add `counselling_context JSONB NOT NULL DEFAULT '{}'`
- `backend/src/modules/ai-counsellor/lib/tools.ts` — `update_student_context` tool (writes session.counselling_context)
- `backend/src/modules/ai-counsellor/repositories/sessions.repository.ts` — context read/merge-write
- `backend/src/modules/ai-counsellor/services/prompt.service.ts` — inject counselling context; opt-in promotion instruction ("offer to remember, never auto-persist")

#### As built (2026-08-22)

New migration `globalyapp/20260822_001_ai_counsellor_context.ts` — **not** an edit to `20260816_002`,
which is already applied on staging (append-only rule).

| Decision | Choice |
|---|---|
| Context shape | A **fixed key set**: `goals`, `interests`, `strengths`, `constraints`, `preferred_countries`, `notes` (lists) and `stage` (one of exploring / narrowing / applying / post_offer). An open-ended JSONB would drift into whatever the model felt like writing and nothing downstream could read it. |
| Merge semantics | Lists union, case-insensitively deduped, capped at 8 per key (oldest age out — the context rides in every prompt). `stage` overwrites. Nothing is deleted by a merge. |
| Promotion to the permanent profile | **Not built as a write.** The prompt makes the model *offer* and then point the student at their profile settings; it is explicitly told never to claim it saved anything there. An LLM mutating `platform_user_profiles` on its own read of a conversation deserves its own decision and probably a UI confirmation, not a tool call. |
| Sensitive data | The prompt forbids recording health, financial hardship, immigration difficulty or family problems, even when volunteered (PRD §22). Enforced by instruction only — nothing scans the payload. |
| Scope | **Session-scoped**, per the gap doc. A new session starts fresh; the durable facts live in the static profile. Carrying context across sessions is the same question as profile promotion, and lands with it. |
| Stage | Injected as behavioural guidance, not just a label — exploring widens, narrowing compares, applying gets practical, post_offer covers visa and arrival. |
| Discovery turn | Keeps `update_student_context` (the first message is exactly when a student says what they want) while still withholding the course tools. |
| Fallback path | Context is injected into the `searchAll` fallback prompt too, so a failed tool loop doesn't read as the counsellor forgetting the conversation. |
| Session list payload | `findByUser` now selects explicit columns, excluding the context — the sidebar renders titles and does not need a growing JSONB on every refresh. |

Test: `npm run test:counselling-context` — 15 assertions (union without duplicates, blank rejection,
cap and ageing, stage overwrite, no input mutation, discovery-turn tool availability).

### Phase 9 — Evals + freshness — ✅ BUILT 2026-08-22

CREATE
- `backend/scripts/ai-evals/questions.json` — ~30 fixed questions (one per PRD §25 response type + PRD §1 examples)
- `backend/scripts/ai-evals/run-evals.ts` — POST each question at a running backend, dump responses + automated checks (asked follow-up? cited? emitted card only when data present?) to a dated markdown report
- `backend/src/modules/superadmin/ai-knowledge/workers/knowledge-recrawl-dispatch.worker.ts` — cron-style dispatcher: query `idx_akd_sources_due` sources, publish to existing crawl queue

MODIFY
- `backend/database/migrations/superadmin/20260814_001_ai_knowledge.ts` — add `last_verified_at`, `effective_until` to `ai_knowledge_sources`
- `backend/src/modules/superadmin/ai-knowledge/routes/rack.routes.ts` + `rack.repository.ts` — staleness sort/filter on source list; verify action (stamps `last_verified_at`)
- `frontend/src/app/admin/data/ai-knowledge/components/rack-tab.tsx` — staleness badge + verify button
- `backend/package.json` — `job:ai-knowledge-recrawl` script entry (matches existing `job:ai-knowledge-crawl` pattern)

#### As built (2026-08-22)

New migration `superadmin/20260822_002_ai_knowledge_freshness.ts` — append-only, not an edit to `20260814_001`.

**Evals.** `scripts/ai-evals/questions.json` — 30 questions, each tagged with the acceptance criteria
it covers, 28 carrying structural expectations. `npm run ai:evals -- --token <jwt>` posts each at a
running backend over the real SSE endpoint and writes a dated report to `docs/ai-counsellor/evals/`.

| Decision | Choice |
|---|---|
| What is checked | **Structure only** — asked a question, cited a source, emitted a card, hedged, admitted a gap, did not diagnose, did not re-ask a known budget. Answer quality is a human read, and the report prints every reply in full for it. An LLM judge would be a second thing to trust. |
| Multi-turn questions | `setup` / `setup2` send earlier turns in the same session first, because memory, stage and the counsel-before-recommend gate only exist on a second turn. |
| Exit code | Non-zero on **transport** errors only. A failed structural check is a finding to read and diff between runs, not a broken build. |
| Corpus-dependent checks | `cites` and `card` are expected on the knowledge and course questions and **will fail until the rack and course data are seeded**. That gap is the signal — run the same set before and after loading the 8 country docs. |
| Auth | Takes `--token <jwt>`; each question burns a credit on that account. |

**Freshness.** `last_verified_at` (a human confirmed it) and `effective_until` (a known expiry) on
`ai_knowledge_sources`, both distinct from `last_crawled_at` (a machine fetched it).

| Decision | Choice |
|---|---|
| Reaching the student | `match_ai_knowledge_chunks()` is recreated to return both, so retrieval carries them into the context and the tool payload. The prompt tells the model to say when a figure was last confirmed and to flag one past its validity date instead of asserting it (AC-10). |
| Admin surface | `POST /sources/:id/verify` stamps the date; the rack list sorts by staleness (`NULLS FIRST` — never verified is the stalest state); the UI shows amber past six months or never-verified, red past `effective_until`. |
| Re-crawl | `knowledge-recrawl-dispatch.worker.ts` polls hourly, publishes due `url` sources (weekly = 7 days, monthly = 30) to the existing crawl queue, marks them `queued` so a repeat pass is a no-op, caps 25 per run. Uploaded files are excluded — there is no page to re-fetch. Container + Makefile targets added. |
| Not built | `rule_class` ("this is a provincial rule, not national law") from the ingestion plan. It needs region metadata that has no source of truth yet. |

Test: `npm run test:ai-evals-checks` — 34 assertions over the SSE frame parser and every check
(including that no documented check goes unused, which caught three dead entries).

**Inert until there is a corpus:** with zero crawled sources the dispatcher has nothing to dispatch
and the staleness badges have nothing to colour. Both start working the moment a URL source is added.

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
