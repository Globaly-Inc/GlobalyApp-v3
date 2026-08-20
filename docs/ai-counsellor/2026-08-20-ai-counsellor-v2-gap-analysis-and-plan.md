# AI Counsellor v2 — Gap Analysis & Implementation Plan

**Date:** 2026-08-20
**Input:** `aicounselling-prd.md` (v1.0 — "Intelligent Education & Career Counselling Platform")
**Verified against:** code on `staging` (modules `ai-counsellor`, `superadmin/ai-knowledge`)

---

## Part 1 — Verification: what is already built and does it match the PRD?

### What exists today (code-verified)

**Chat pipeline** (`ai-counsellor` module):
- SSE streaming chat via Gemini (`gemini-stream.ts`), with retry on transient errors.
- Sessions, message persistence, auto-titling, 20-message history window.
- Student profile injected into the system prompt (nationality, qualifications, language tests, work experience, budget, destinations) — `knowledge.repository.getProfileContext`.
- Hybrid RAG (`rag.service.searchAll`): parallel keyword search over **courses, visas, institutions, agents, MARA agents** + curated **visa knowledge, FAQs, country guides** + **semantic (pgvector) search** over crawled Knowledge Rack documents.
- Course hydration → context text + `course-card` / `chips` structured blocks, source attribution events, credits/embed billing, guest mode.

**Knowledge Rack** (`superadmin/ai-knowledge` module + `20260814_001_ai_knowledge.ts`):
- Categories (kind, country_code), Sources (URL, trust_tier, crawl_frequency, max_pages), Documents (markdown, content_hash, word_count, `vector(3072)` embedding).
- Crawl worker: URL discovery → scrape to markdown → change detection by hash → embed via `gemini-embedding-001` (3072-dim, normalised) → pgvector HNSW (halfvec) index.
- `match_ai_knowledge_documents()` SQL function with **category-kind and country filters** (built, currently unused by the caller).
- Admin UI at `admin/data/ai-knowledge`; audit logging on all mutations.

### Acceptance-criteria scorecard (PRD §48)

| AC | Requirement | Status |
|----|-------------|--------|
| AC-01 | Answer counselling questions without a matching course | 🟡 Partial — rack docs can answer, but no counselling-knowledge categories seeded, and the system prompt forbids answering outside CONTEXT |
| AC-02 | Retrieve from uploaded knowledge resources | 🟡 URL crawl only — **no PDF/DOCX/TXT upload** |
| AC-03 | Combine structured course data + unstructured knowledge | ✅ Done (`rag.service.searchAll`) |
| AC-04 | Ask follow-ups instead of premature recommendations | 🟡 Chips exist, but no counselling-stage logic; prompt never instructs "discover before recommend" |
| AC-05 | Maintain conversation context | ✅ Done (history + profile) |
| AC-06 | Explain *why* a recommendation fits | ❌ Prompt doesn't require reasoning/assumptions |
| AC-07 | Alternatives and trade-offs | ❌ Not in prompt |
| AC-08 | Distinguish fact vs counselling guidance | ❌ Not implemented |
| AC-09 | Prioritize authoritative sources | ❌ `trust_tier` is stored but **never used in ranking or the prompt** |
| AC-10 | Flag outdated/conflicting resources | 🟡 Freshness tracked (`last_crawled_at`, hash); no effective-dates, no conflict handling |
| AC-11 | Admins add knowledge without code changes | ✅ Done (for URLs) |
| AC-12 | No LLM retraining needed | ✅ Done — RAG by design |
| AC-13 | Country-specific knowledge | 🟡 Schema supports it (`country_code` filter in SQL fn); retrieval never passes the filter |
| AC-14 | No psychological diagnosis claims | ❌ No boundary section in the system prompt (cheap fix) |

**Verdict:** PRD Phases 1–2 (Knowledge Foundation + RAG Counselling) are ~80% built and working at the code level. Phase 3 (Counselling Intelligence) is essentially **not started** — today's bot is a well-grounded *search assistant*, not yet a *counsellor*. That matches the PRD's own framing of where you are.

### Concrete defects / gaps found while verifying

1. **No chunking.** The crawl worker embeds `text.slice(0, 8000)` of each whole page — one vector per document. Long pages lose everything past ~8k chars for retrieval, and whole-page vectors dilute similarity. PRD §31 explicitly calls for semantic chunking. Biggest single retrieval-quality gap.
2. **Metadata filters unused.** `rag.service` calls `matchKnowledgeDocuments(v, 4)` without the `filter_category_kind` / `filter_country_code` params the SQL function already accepts (PRD §32 metadata-aware retrieval). The capability exists; nothing drives it.
3. **`trust_tier` is dead data** — never influences ranking or prompt ordering (PRD §10, §35).
4. **Keyword-only structured search.** `extractKeywords` + stopwords is fine for "nursing melbourne", weak for "I don't know what to study" — exactly the query class the PRD targets. No intent classification exists.
5. **Retrieval-then-generate only (no tool calling).** Every message runs all nine searches once, up front. The PRD's target (§26) is the model deciding which tool to call, including calling none and asking a question instead.
6. **Context injected per doc is capped at 1,500 chars** — a consequence of (1); chunking fixes both ends.

---

## Part 2 — AI fundamentals for this project (read this before the plan)

You mentioned "model training" and "creating our own Gemma to train the AI". Short version: **you do not need to train anything, and you should not.** Here is the mental model.

### The three layers of an AI product

| Layer | What it is | How you change it | Cost |
|-------|-----------|-------------------|------|
| **Base model** (Gemini, GPT, Claude, Gemma) | The pretrained brain. General language + reasoning ability. | You don't. Trained by Google/OpenAI/Anthropic on trillions of tokens, costing millions of dollars. | N/A |
| **Knowledge** (what it knows about *your* domain) | Courses, visas, education systems, counselling frameworks. | **RAG** — retrieve relevant text at question time and paste it into the prompt. Add a document → it's "known" in seconds. | Cents |
| **Behaviour** (how it acts) | Counselling style, asking before recommending, safety boundaries. | **System prompts + orchestration code** (and much later, maybe fine-tuning). | Free |

### Why RAG beats training for knowledge (PRD §38 says the same)

- **Training/fine-tuning does not reliably add facts.** Fine-tuning nudges style and format; it's terrible at making a model *know* that "Course X at Deakin costs AUD 34,000" — and catastrophic when that fee changes next semester, because you can't un-train it. RAG updates by updating a database row.
- **RAG cites its sources.** A fine-tuned model can't tell you which document a claim came from. Your PRD requires citations (§34) — that alone rules out training as the knowledge mechanism.
- **You already have RAG working.** The Knowledge Rack is exactly the right architecture.

### Why not self-host Gemma (or any open model)

Gemma is Google's open-weight model family — you *can* download it and run/fine-tune it yourself. For GlobalyHub today it would be strictly worse:

- **Quality:** Gemma 27B is far below Gemini Flash/Pro at reasoning and instruction-following. Your counselling quality would drop, not rise.
- **Cost:** a GPU box to serve it is ~USD $1,500–3,000/month, always on. Your current Gemini bill is per-token and probably tens of dollars.
- **Ops:** you become responsible for inference infra, scaling, and model updates — a full-time job that doesn't move your product.
- **Fine-tuning it needs data you don't have:** thousands of high-quality counselling conversations with graded outcomes. You can only collect those *by running the RAG product first*.

**When would fine-tuning ever make sense?** Later, and only for *behaviour*: if after ~10k+ real sessions the model still won't follow your counselling style despite good prompts, you could fine-tune (via Google's hosted tuning for Gemini, not self-hosted Gemma) on your best transcripts. Treat it as a year-2+ optimisation, gated on evidence.

### The vocabulary you'll keep meeting

- **Embedding:** a text → 3,072 numbers such that similar meanings land near each other. You already run `gemini-embedding-001`. "Semantic search" = embed the question, find the nearest stored vectors (your pgvector HNSW index).
- **Chunking:** splitting a long document into ~300–800-token passages, each embedded separately, so retrieval returns the *relevant paragraph* rather than a whole page. Your #1 missing piece.
- **RAG:** Retrieval-Augmented Generation — retrieve chunks, paste into prompt, generate. What you have.
- **Tool calling / function calling:** instead of you pre-running every search, the model is given tool declarations (`search_courses`, `search_knowledge`, …) and *chooses* which to call, possibly several in a loop. Gemini supports this natively. This is what turns "search assistant" into "counsellor".
- **Intent classification:** one cheap LLM call (or the first tool-calling turn) that decides what kind of question this is, so retrieval is targeted.
- **Evals:** a fixed set of test questions + expected behaviours you run after every prompt change, so quality is measured, not vibes. This is the "training" a beginner should actually invest in.

---

## Part 3 — Implementation plan

Ordering follows PRD §47 but starts from what's actually missing. Each phase ships independently.

### Phase A — Quick wins: make the existing system honest (1–2 days)

No schema changes.

1. **Counselling behaviour prompt** (`prompt.service.ts`): add sections for — counsel before recommending (ask 1–3 clarifying questions when context is thin); explain *why* + assumptions + trade-offs when recommending; distinguish "from our database" vs "general guidance"; never guarantee outcomes/admission; psychological-safety boundary (no diagnosis; suggest professionals for distress). Covers AC-04/06/07/08/14 at the prompt level.
2. **Use the filters that already exist:** detect country mentions (simple lookup against the countries table) and pass `filter_country_code` + raise doc count in `matchKnowledgeDocuments`. Covers AC-13.
3. **Trust-tier ordering:** include `trust_tier` in match results, sort context blocks tier-first, and add a prompt line "prefer higher-trust sources; if sources conflict, say so." Covers AC-09 and most of AC-10.
4. **Seed counselling categories** in the Knowledge Rack (Career Counselling, Education Systems per country, Career Pathways, Psychology/Decision-making) and crawl a starter set of official sources. Without content, none of the counselling behaviour has anything to stand on. (Admin task, not code.)

### Phase B — Chunking + document upload (the real Phase-1 completion, ~1 week)

1. **Chunk table:** `ai_knowledge_chunks (id, document_id FK cascade, chunk_index, content, token_count, embedding vector(3072))` + HNSW index; new `match_ai_knowledge_chunks()` mirroring the existing function (keep the doc-level function until cutover). Heading-aware splitting (split on `#`/`##`, merge to ~500–800 tokens, ~10% overlap) — markdown headings make this a ~50-line function, no library needed.
2. Crawl worker embeds chunks instead of the whole page; re-crawl re-chunks changed docs.
3. **File upload sources:** new `source_type = upload` on `ai_knowledge_sources`; store file in existing object storage; extract text (reuse `data-extraction/lib/document-extractor.ts` — it already exists); then same chunk→embed path. Covers AC-02 fully.
4. Retrieval switches to chunk-level; per-chunk context injection replaces the 1,500-char page truncation.

### Phase C — Tool calling: the Counselling Engine's skeleton (~1–2 weeks)

Replace "run all 9 searches every time" with Gemini function calling:

1. Declare tools: `search_courses`, `search_visas`, `search_institutions`, `search_knowledge(category?, country?)`, `get_course_details`, `update_student_context`. Implementations already exist in `knowledge.repository` — this is re-plumbing, not rebuilding.
2. Agent loop in `chat.service`: model may call tools (cap ~4 rounds), then answers; stream the final turn. Keep `searchAll` as fallback when tool calling fails.
3. The model choosing *not* to search and instead asking a follow-up question **is** intent detection and stage management — you get PRD §13/§26 behaviour without building a separate intent classifier. Covers AC-01/04 properly.

### Phase D — Counselling profile + memory (~1 week)

1. `counselling_context` JSONB on sessions (interests, strengths, constraints, stage, preferred countries…) — updated via the `update_student_context` tool from Phase C; injected into the prompt alongside the existing static profile. This is PRD §16/§22's evolving profile.
2. Explicit opt-in promotion of session context to the persistent student profile ("Want me to remember Australia as your preferred destination?"). Sensitive info never auto-persists (PRD §22).

### Phase E — Evals + freshness (ongoing, start small)

1. **Eval set:** ~30 fixed questions (one per PRD §25 response type + the §1 example list) + a script that runs them against staging and dumps responses for review. Add checks like "did it ask a follow-up?", "did it cite?". Run on every prompt change. This is your quality flywheel and your future fine-tuning dataset.
2. **Freshness:** `last_verified_at` + `effective_until` on sources; admin list sorted by staleness; scheduled re-crawl by `crawl_frequency` (index `idx_akd_sources_due` already exists — just needs a cron dispatcher). Completes AC-10.

### Phase F — Later (PRD Phases 4–5)

Multi-country expansion (content, not code — the schema is country-aware once Phase A wires it), career-pathway entities, assessments, counsellor dashboard, human handoff. Don't design these now.

### Explicitly not doing

- ❌ Self-hosted / fine-tuned Gemma (see Part 2).
- ❌ Separate vector DB (pgvector already scales past 1M chunks; revisit only if p95 retrieval latency hurts).
- ❌ Separate intent-classification service (tool calling subsumes it).
- ❌ Formal counselling-stage state machine (prompt + counselling_context.stage covers it; add the machine only if evals show the prompt drifting).
