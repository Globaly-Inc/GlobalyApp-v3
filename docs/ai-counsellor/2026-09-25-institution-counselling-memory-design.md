# Institution-specific AI counselling context and memory — analysis and design

Date: 2026-09-25 (revised same day after review; wiring and portal completed 2026-09-28)
Status: approved 2026-09-25, then **re-scoped the same day** to the memory and learning
pipeline only. The embed widget's chat is a consumer of this module, not part of it.

## Shipped state (2026-09-28)

Backend complete and wired. What exists, in the order a request meets it:

| Piece | Where |
|---|---|
| Retrieval on every embed turn (signed-in and widget visitor) | `chat.service.handleMessage` and `guest.routes POST /guest/messages` call `retrieveMemories` beside `rag.searchAll`; the block is `buildSystemPrompt({ institutionGuidance })`, placed after BOUNDARIES; the ids used are written on the assistant row in the same INSERT (`messages.repository.create({ memory_ids })`) |
| Student thumbs | `PATCH /messages/:id/feedback` (owner-checked, was an IDOR) and `POST /guest/messages/:id/feedback` (embed_key + fingerprint) → `learning-signals.service.recordStudentFeedback` → `feedback` job when memories were used |
| Counsellor review | `POST /messages/:id/review` (`requireInstitutionContext`, body `ReviewMessageSchema`) → `recordCounsellorReview` → `correction` job for corrected, and for approved/flagged when memories were used |
| Conversation end | `POST /guest/conversation-end` with `action=end` → `onConversationEnd` → `conversation` job when the widget has `auto_learn` |
| Worker | `npm run job:institution-memory` (compose profile `globalyapp-institution-memory`); corrected → correction + derived candidates; approved → positive vote + reinforce each memory used; flagged → negative vote each; conversation → extractor candidates; hourly sweep |
| Institution portal API | `/api/v3/ai-chat/institution/memories` (GET list with `MemoryQuerySchema`, POST create, GET/PATCH/DELETE `:id`, POST `:id/approve|deprecate|reactivate|unflag`) and `/institution/conversations` (GET list, `?unreviewed=true`), `/institution/conversations/:id/messages` (thread with review columns) — `institution-memory/routes/memory.routes.ts`, mounted by the ai-counsellor module |
| Student-facing message lists | `messages.repository.findBySession` selects explicit columns; `review_*`, `feedback_actor`, `memory_ids` never leave through them |

Runbook for a deploy:
1. `npm run migrate:globalyapp` (20260925_001: message columns, `auto_learn`, pgvector-in-public guard; 20260928_001: widget `greeting`/`subtitle`) **before** `npm run migrate:tenants` (institution 20260925_001: the table + match function). New institutions get the table at provisioning.
2. `TYPESAFE_API_KEY` is optional; unset = regex filters and vote-everything attribution.
3. Start the worker (`job:institution-memory`) or nothing is learned; retrieval works without it.
4. Tests, no DB needed: `npm run test:institution-memory-{lifecycle,retrieval,learning,chat-wiring,publishers}`. Against the dev DB: `test:institution-memory-dry-run`.

Not in this repo's backend scope: the widget's thumbs UI (message ids are real now, so it can post to the guest feedback route), and the institution portal pages over the API above.

Implemented as `backend/src/modules/institution-memory/` (schemas, repositories, services,
worker, `index.ts` public surface).

**Where the data lives (revised at the user's request).** The memory table and its retrieval
function are **per-institution tenant-schema** objects, like `ai_widget_visitors`:
`database/migrations/institution/20260925_001_institution_ai_memories.ts`, applied by
`npm run migrate:tenants`. There is no `institution_id` column: the schema is the boundary, and
the repository resolves `institutionId → schema_name` through the pool manager (an unprovisioned
institution has no memory; reads are empty, writes throw). What hangs off `public` tables stays in
`database/migrations/globalyapp/20260925_001_ai_messages_learning.ts`: the message review and
`memory_ids` columns, `ai_embed_configs.auto_learn`, and the pgvector public-schema guard (which
must run before any tenant migration needs the `vector` type).
Simplifications versus §9–§11 below: no settings table (`ai_embed_configs.auto_learn` is the
one opt-in; tone and style are `RESPONSE_PREFERENCE` memories), no events table (a capped
`history[]` appended in the same UPDATE), no version chain (edits bump `version` in place),
statuses `candidate | active | deprecated | deleted`, sources `admin | correction | feedback |
extracted`. Thumbs reinforce or vote against the memories recorded on the message
(`ai_counselor_messages.memory_ids`) with no extraction call. Tests: `test:institution-memory-
lifecycle`, `-retrieval`, `-learning`, `-chat-wiring`, `-publishers`. Portal routes and chat wiring: see
"Shipped state" above.

**Dry run (2026-09-25, `npm run test:institution-memory-dry-run`).** Ran end to end against the dev
database, OpenRouter embeddings and live Jev on institution 49: admin memories stored with vectors
and deduped on repeat; retrieval rendered pinned rules plus the relevant policy (cosine 0.42); a
counsellor correction became an active memory; a thumbs-down was attributed by Jev to the guidance
the reply actually applied; conversation learning yielded candidates and rejected a non-guidance
one; a contradicting correction was stored as a linked candidate; Jev scored a fee statement as
fact 0.97 / technique 0.07 and a technique as fact 0.02 / technique 0.95. Fixes that came out of
it: derived candidates from a correction carry the judged confidence rather than 1.0;
`RESPONSE_PREFERENCE` is pinned (style has no similarity to any question) and never listed twice;
the attribution question asks "actively applied", not "not violated", so avoidance rules stop
collecting a vote per complaint; extractor candidates are parsed one by one so a single malformed
entry no longer discards the batch. Environment note: the Gemini project returns a billing-hold
403, so every extraction currently runs on the OpenRouter fallback.

**Jev.** "JEV" in the original request is TypeSafe's Jev decision model (`@typesafe-ai/sdk`,
`TYPESAFE_API_KEY`), not a validation library; validation stays zod. It is used where a typed
yes/no decision with a probability is exactly what the pipeline needs (`lib/jev.ts`): (1) the
candidate gate re-decides "names a person", "states a fact", "is guidance", "would a counsellor
endorse it" independently of the extractor, and the stored confidence is the lower of the two
models; (2) each surviving candidate is checked against its five nearest active memories for
contradiction — a contradicting candidate is stored with `conflicts_with_id` (in the tenant
migration) and can never auto-promote, only a human approve() clears the link; (3) a
thumbs-down is attributed to the retrieved memories the reply actually followed, so unrelated
guidance is not voted against. Without a key every Jev call returns null and the regex filters,
the extractor's own flags, and vote-everything behaviour apply.
Scope: backend only (`backend/`), the embed-widget counsellor for institutions

---

## 0. Summary

The counsellor already has everything an institution layer needs except the layer itself:
a per-institution owner column and SQL isolation in the Knowledge Rack, a session-scoped
learned context, a thumbs-up/down column, a working pgvector + `embed()` pipeline, an AMQP
worker pattern, and a precedent for human-correction learning (extraction "Save and Learn").

The design adds **three tables, one SQL function, seven columns, one queue and one worker**, and
wires them into the existing `chat.service → rag.service → prompt.service` flow behind the
existing `EmbedContext.rackInstitutionId`. Nothing parallel is introduced: institution documents
go into the existing rack under `institution_id`; institution memories get their own small table
because they have a lifecycle the rack does not. Validation stays zod + `z.infer`.

One naming note. The request calls the project's type system "JEV". No such identifier exists in
the repo; the actual mechanism is zod schemas in `schemas/*.schema.ts`, `Schema.parse()` in
route handlers, `z.infer` types, and a central ZodError → 400 handler. This document treats
"JEV" as that pattern and follows it exactly.

---

## 1. Current architecture analysis

### 1.1 Module layout (`src/modules/ai-counsellor`)

| Layer | Files | Convention |
|---|---|---|
| routes | `chat.routes.ts`, `guest.routes.ts`, `embed.routes.ts`, `credits.routes.ts` | `Schema.parse(req.body)` inline; no type provider; responses untyped |
| schemas | `chat.schema.ts` | `export const XSchema = z.object(...)`, `export type X = z.infer<...>` |
| services | `chat.service.ts` (orchestrator), `rag.service.ts` (retrieval + context text), `prompt.service.ts` (system prompt), `embed.service.ts`, `site-index.service.ts`, `visitor.service.ts`, `session.service.ts`, `credit.service.ts` | plain exported async functions, `createChildLogger` per file |
| repositories | `knowledge.repository.ts` (all reads incl. profile + rack match), `sessions.repository.ts`, `messages.repository.ts`, `embed.repository.ts` | hand-written row interfaces, `masterKnex`, JSONB stringified on write and trusted on read |
| lib | `tools.ts` (Gemini tool loop), `gemini-stream.ts`, `card-parser.ts`, `profile-extract.ts`, `conversation-summary.ts` | pure helpers |
| workers | `chat-summary.worker.ts` | DB sweep, not a queue consumer |

Knowledge ingestion lives in `src/modules/superadmin/ai-knowledge` (rack CRUD, chunker,
`ingest.ts`, crawl + recrawl workers). The embedding client `embed()` and `extractJson<T>()` live
in `src/modules/superadmin/data-extraction/lib/llm-client.ts` and are already imported
cross-module by the counsellor.

### 1.2 Tenancy

One Postgres database. `public` (globalyapp) holds users, institutions, businesses, sessions,
messages, embed configs. `superadmin` holds extraction and the Knowledge Rack. Each institution
and business also has a UUID-named tenant schema (widget visitor rows live there). All counsellor
reads and the rack use `masterKnex`.

An institution is identified in a chat by `EmbedContext.rackInstitutionId` (resolved from the
`x-embed-key` header or guest `embed_key`). Platform (non-embed) chats have no institution.

---

## 2. Existing AI counselling flow

```
POST /ai-chat/messages  (x-embed-key optional)      POST /guest/messages (embed_key)
        │                                                     │
        ▼                                                     ▼
resolveActiveConfig(embedKey) → buildEmbedContext → { config, jobIds, rackInstitutionId }
        │
        ▼
chat.service.handleMessage
  1. initSSE
  2. getOrCreateSession (embed_config_id on the session)
  3. history = last 20 messages (text only)
  4. persist user message
  5. profileContext = getProfileContext(userId)   ← null for guests
  6. retrieval + stream
       platform:  counsellorBriefing (vector, profile-seeded) → streamChatWithTools (tool loop)
       embed:     rag.searchAll(jobIds, rackInstitutionId) → streamChat (no tools)
         └ searchAll: courses (scoped to jobIds), visas, owner profile, FAQs, guides
                      → embed FALLBACK: institution site index (rack, institution_id) only if DB found nothing
  7. parse cards / chips / blocks
  9. persist assistant message (sources, cards, blocks, tokens, latency)
 11. bill (embed: monthly quota; platform: credits)
 13. autoTitle
```

`buildSystemPrompt` sections, in order: identity (embed: display_name + sanitized
`custom_instructions`), privacy, tools, COUNSELLING APPROACH, BOUNDARIES, STUDENT PROFILE,
ELIGIBILITY, PROFILE COMPLETION, session counselling context, STAGE, REMEMBERING, response
rules, course-card format, chips, INTERACTIVE BLOCKS, USING CONTEXT, KNOWLEDGE BRIEFING, CONTEXT,
greeting / discovery turn.

Observations that shape the design:

- Embed mode never uses tools and never runs `counsellorBriefing`. The institution layer must
  therefore be injected on the `searchAll` + `streamChat` path.
- The only per-institution instruction surface today is `ai_embed_configs.custom_instructions`
  (2000 chars, per widget not per institution, injection-filtered by regex).
- The only learning surface is `ai_counselor_sessions.counselling_context` (per session, about
  the student, fixed keys, capped at 8 items) written by the `update_student_context` tool.
- `ai_counselor_messages.feedback` (positive/negative) is written by one PATCH route and read by
  nothing. That route does not check ownership of the message (pre-existing IDOR, see §13).

---

## 3. Existing embedding / RAG flow

- Model: `gemini-embedding-001`, 3072 dims, L2-normalised; OpenRouter `text-embedding-3-large`
  at 3072 as fallback. `EMBEDDING_DIMS = 3072` in `llm-client.ts`.
- Storage: `superadmin.ai_knowledge_chunks.embedding vector(3072)`, HNSW on
  `(embedding::halfvec(3072)) halfvec_cosine_ops`. Same pattern on `extraction_memory`.
- Ingest: `ingest.ts` → `chunkMarkdown` → `embed()` with concurrency 5 → batch insert.
  Both crawl and file upload end there.
- Retrieval: `superadmin.match_ai_knowledge_chunks(vec, count, kind, country, institution_id)`.
  `institution_id` is **exclusive**: set → only that institution's sources; null → only global
  sources (`institution_id IS NULL AND business_id IS NULL`). Isolation is enforced in SQL by the
  owner column, not by category.
- Post-processing: `capPerDocument` (2 chunks per document), trust-tier sort, `renderRackHits`.
- Institution site index: `site-index.service.ts` registers the institution website as an
  `ai_knowledge_sources` row with `institution_id`, category `embed-site-index`, and queues the
  existing crawl worker. This is already a per-institution embedding namespace.

---

## 4. Existing database / schema analysis

Relevant tables (full column detail in the migrations named):

| Table | Schema | Key facts |
|---|---|---|
| `ai_embed_configs` | public | owner = exactly one of `business_id` / `institution_id`; `custom_instructions`; quota |
| `ai_counselor_sessions` | public | owner = `platform_user_id` xor `visitor_key`; `embed_config_id`; `counselling_context jsonb` |
| `ai_counselor_messages` | public | `role`, `content`, `sources/cards/chips/blocks jsonb`, `feedback` (positive/negative), tokens, latency |
| `ai_knowledge_sources` | superadmin | `institution_id int → institutions`, `trust_tier`, `country_code`, `source_type url/file`, `last_verified_at`, `effective_until` |
| `ai_knowledge_documents` / `_chunks` | superadmin | chunk-level embeddings only; `match_ai_knowledge_documents` was dropped |
| `extraction_memory` / `extraction_lessons` | superadmin | precedent: raw correction record (`ai_output`, `final_output`, `diff`, embedding) → lesson after 2 corrections, `weight`, `is_active`, admin CRUD |
| `institutions` | public | `source_job_id` (its catalogue), `schema_name`, `website`, `meta jsonb` |
| `platform_user_profiles` + qualifications, language_tests, work_experiences, academic_tests | public | student profile read by `getProfileContext` |

Migration conventions: knex TS files `YYYYMMDD_NNN_name.ts` under
`database/migrations/{globalyapp,superadmin,business,institution}`; globalyapp runs before
superadmin; filename is identity (never edit an applied file); `down()` is real.
`CREATE EXTENSION vector` currently happens in a superadmin migration.

---

## 5. Existing type-safety patterns

- zod only. No typebox, ajv schemas, fastify type provider, or `route.schema`.
- Vocabularies as `as const` tuples fed to `z.enum` (`rack.schema.ts`), replacing CHECK constraints.
- Inputs: `Schema.parse()` in the handler; ZodError → 400 in `error-handler.plugin.ts`.
- Types: `z.infer<typeof Schema>` exported next to the schema.
- Rows: hand-written interfaces in repositories (`SessionRow`, `MessageRow`, `EmbedConfigRow`).
- Gaps: responses are never validated; JSONB is stringified on write and trusted on read.
  Because memory `structured_metadata` and settings are written by admins **and by the model**,
  this design parses those two JSONB shapes on read with the same zod schema used on write.
  That is the one deliberate addition to the convention.

---

## 6. Existing memory functionality

| Mechanism | Scope | Learns | Feeds back |
|---|---|---|---|
| `counselling_context` (session) | one session, one student | goals, interests, constraints, stage | prompt section "WHAT THIS CONVERSATION HAS ESTABLISHED" |
| `ai_widget_visitors.*` jsonb | one anonymous visitor | qualifications, tests, work | not fed into the prompt today |
| `custom_instructions` | one widget | admin-typed text | identity section |
| `extraction_memory` → `extraction_lessons` | extraction, per domain | admin corrections → rules after 2 hits | `buildSystemAddendum` in extraction prompts |
| `messages.feedback` | one message | thumbs | nothing |

There is no institution-level memory, no counsellor correction surface, and no retrieval-based
learning for the counsellor. The extraction module's shape (raw record → threshold → weighted,
deactivatable rule → prompt addendum, admin CRUD) is the model to follow.

---

## 7. Extension points

| Point | File | What plugs in |
|---|---|---|
| Institution identity | `embed.service.buildEmbedContext` | already yields `rackInstitutionId`; unchanged |
| Retrieval | `rag.service` | new `institutionBriefing({ institutionId, message, profile, counsellingContext })` next to `counsellorBriefing` |
| Prompt | `prompt.service.buildSystemPrompt` | new `institutionContext` option rendered as one section |
| Orchestration | `chat.service.handleMessage` step 6 (before `searchAll`) and step 9 (after persist) | briefing in; extraction job out |
| Vector store | `superadmin.match_ai_knowledge_chunks` (rack, unchanged) + new `match_ai_counselling_memories` | two namespaces, both keyed by `institution_id` |
| Ingestion | `ai-knowledge/lib/ingest.ts`, `rack.service.uploadSource` | institution guideline documents reuse the file path with `institution_id` set |
| Feedback | `chat.routes PATCH /messages/:id/feedback` | ownership fix + new institution review route |
| Async | `queueService` + `KNOWLEDGE_QUEUES`-style constant | new `ai_counselling_memory` queue and worker |
| Admin API | `embed.routes.ts` (`requireBusinessOrInstitutionContext`) | sibling `counselling.routes.ts` with `requireInstitutionContext` |

---

## 8. Proposed architecture

### 8.1 Concept map

```
Institution
  └── AI Counselling Configuration
        ├── Settings            → ai_counselling_settings   (one row, versioned jsonb)
        ├── Guidelines/policies → ai_counselling_memories    (source = institution_admin, authoritative)
        ├── Knowledge sources   → superadmin.ai_knowledge_sources (institution_id, category kind
        │                          counselling_guideline)  — existing rack, existing crawler/upload
        ├── Embedding namespace → institution_id column in BOTH vector tables; SQL requires it
        ├── Memory              → ai_counselling_memories    (typed, lifecycle, confidence)
        ├── Response patterns   → ai_counselling_memories    (type RESPONSE_PATTERN / SUCCESSFUL_RESPONSE_PATTERN)
        ├── Feedback            → ai_counselor_messages.review_* + feedback  → extraction worker
        └── Versioning          → settings.version; memories: version + supersedes_id chain
```

Configuration and memory are the same table on purpose. A guideline typed by an institution
admin and a technique the system learned from ten corrected conversations differ in `source`,
`confidence` and `status`, not in shape. One table means one retrieval, one renderer, one
admin list, and one isolation test.

### 8.2 Source-of-truth hierarchy (explicit priority)

| Rank | Source | Where | How the prompt treats it |
|---|---|---|---|
| 1 | Authoritative institutional knowledge | admin memories (`source ∈ institution_admin, counsellor_correction`, status active); institution rack documents (`trust_tier official`) | rules and facts; may override style rules; never overrides safety, privacy, or "facts only from CONTEXT" |
| 2 | Structured platform data | courses, fees, visas (DB) | the only source for specific claims (unchanged) |
| 3 | Global educational knowledge | global rack, curated FAQs/guides | guidance, qualified by authority (unchanged) |
| 4 | Student profile / session context | `getProfileContext`, `counselling_context` | known facts about this student (unchanged) |
| 5 | Learned memories | `source ∈ ai_extracted, student_feedback`, status active | advisory: "the institution's counsellors tend to…"; never a fact |
| 6 | Conversation-only context | history | this turn only |

Conflict rule: a lower rank never activates a memory that contradicts a higher rank. A learned
memory that contradicts an admin memory is stored as `candidate` with `conflicts_with` set and
surfaced for review; it is never injected. Rank 1 memories that contradict each other are the
admin's problem and are shown side by side in the admin list.

### 8.3 Data flow with the new layer

```
Student message (embed widget for institution I)
   │
   ├─ getProfileContext(userId)                       [existing]
   ├─ session.counselling_context                     [existing]
   │
   ├─ institutionBriefing(I, message, profile, ctx)   [NEW, parallel with searchAll]
   │     ├─ settings = ai_counselling_settings[I]                  (cached 60 s)
   │     ├─ vec = embed(message + situationText)                   (one embedding, shared)
   │     ├─ memories = match_ai_counselling_memories(vec, I, active, k=12) → rank → top 6 + 3 techniques
   │     └─ guidelineDocs = match_ai_knowledge_chunks(vec, 4, 'counselling_guideline', null, I)
   │
   ├─ searchAll(jobIds, rackInstitutionId)            [existing; reuses vec if available]
   │
   ├─ buildSystemPrompt({ ..., institutionContext })  [NEW section: INSTITUTION COUNSELLING GUIDANCE]
   ├─ streamChat                                      [existing]
   ├─ persist assistant message + retrieval_trace     [NEW column]
   │
   └─ (async, never awaited)
        ├─ touchMemoriesUsed(ids)                     last_used_at, use_count
        └─ on signal only: publish ai_counselling_memory job
              signals: feedback set, counsellor review saved, conversation end
              │
              ▼
        counselling-memory.worker
              ├─ load conversation (+ correction if any) and the institution's active memories nearest to it
              ├─ extractJson<ExtractionOutput>  (zod-parsed; techniques only; PII/one-off/unverified excluded by prompt AND by filters)
              ├─ for each candidate: dedupe by (institution_id, content_hash) → reinforce | insert candidate | flag conflict
              ├─ human-sourced (correction) → active immediately, version chain
              └─ one ai_counselling_memory_events row per outcome, with reason and confidence
```

### 8.4 Services (reusing where equivalents exist)

| Proposed name in the request | Decision |
|---|---|
| InstitutionCounsellingService | `services/counselling-settings.service.ts` (settings get/put, cached) |
| CounsellingEmbeddingService | **not created**; `embed()` from `llm-client.ts` is reused |
| CounsellingMemoryService | `services/counselling-memory.service.ts` (create, reinforce, supersede, deprecate, expire, delete, approve) |
| CounsellingMemoryRetrievalService | `rag.service.institutionBriefing` + `repositories/counselling-memory.repository.ts` (match + rank) |
| CounsellingContextBuilder | **not created**; `prompt.service.buildSystemPrompt` gains one option and one renderer `lib/institution-context.ts` |
| CounsellingFeedbackService | `services/counselling-review.service.ts` (student feedback ownership fix, counsellor review/correction, publishes the extraction job) |
| Extraction | `lib/memory-extract.ts` (pure: prompt + zod output + filters) and `workers/counselling-memory.worker.ts` (consumer + lifecycle sweep) |

---

## 9. Proposed database changes

All in `database/migrations/globalyapp/` (memories reference `institutions(id)` int and
`ai_counselor_messages(id)`, both in `public`).

### 9.1 `20260925_001_ai_counselling_memories.ts`

```sql
-- pgvector schema guard. SETUP.md installs the extension into public as a superuser step;
-- superadmin/20260814_001's CREATE EXTENSION IF NOT EXISTS is then a no-op. On a fresh DB
-- where that step was skipped, the superadmin connection's search_path is (superadmin, public)
-- and the extension lands in superadmin — unqualified vector(3072) in public then fails to
-- resolve, and so does the app's ?::vector cast on masterKnex (default search_path). So:
--   SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
--    WHERE e.extname = 'vector';
--   none      → CREATE EXTENSION vector WITH SCHEMA public
--   'public'  → continue
--   other     → throw: "pgvector is installed in <schema>; run ALTER EXTENSION vector SET SCHEMA public
--                as a superuser, then re-run migrate:globalyapp" (pgvector is relocatable; existing
--                columns keep their type OID, so superadmin tables are unaffected)
-- Types and operators below are then unqualified on purpose: public is on every search_path.

CREATE TABLE ai_counselling_settings (
  institution_id   int PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  settings         jsonb NOT NULL DEFAULT '{}',      -- CounsellingSettingsSchema
  version          int   NOT NULL DEFAULT 1,
  auto_learn       boolean NOT NULL DEFAULT false,   -- opt-in per institution
  updated_by       int NULL,                          -- platform_users.id (institution member)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_counselling_memories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      int NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  type                text NOT NULL,                  -- MEMORY_TYPES (zod)
  content             text NOT NULL,                  -- one atomic statement, ≤ 600 chars
  content_hash        text NOT NULL,                  -- sha256(normalised content) for dedupe
  structured_metadata jsonb NOT NULL DEFAULT '{}',    -- MemoryMetadataSchema (typed per type)
  source              text NOT NULL,                  -- MEMORY_SOURCES (zod)
  source_reference    jsonb NOT NULL DEFAULT '{}',    -- SourceReferenceSchema: { message_id, session_id, reviewer_id,
                                                      --   actors: string[] (hashed platform_user_id | visitor_key, cap 20),
                                                      --   positive_votes, negative_votes }
  confidence          real NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  importance          smallint NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  status              text NOT NULL DEFAULT 'candidate', -- MEMORY_STATUSES (zod)
  version             int NOT NULL DEFAULT 1,
  supersedes_id       uuid NULL REFERENCES ai_counselling_memories(id) ON DELETE SET NULL,
  conflicts_with_id   uuid NULL REFERENCES ai_counselling_memories(id) ON DELETE SET NULL,
  reinforce_count     int NOT NULL DEFAULT 0,
  use_count           int NOT NULL DEFAULT 0,
  embedding           vector(3072) NULL,
  flagged_for_review_at timestamptz NULL,             -- set by negative votes on human-authored rows; never deprecates them
  created_by          int NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  last_reinforced_at  timestamptz NULL,
  last_used_at        timestamptz NULL,
  expires_at          timestamptz NULL
);

-- Audit trail as rows, not a capped JSONB array: concurrent worker jobs append with plain
-- INSERTs instead of racing on a read-modify-write, and "why was this reinforced/deprecated"
-- is a query, not a JSON scan.
CREATE TABLE ai_counselling_memory_events (
  id              bigserial PRIMARY KEY,
  memory_id       uuid NOT NULL REFERENCES ai_counselling_memories(id) ON DELETE CASCADE,
  institution_id  int  NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  event           text NOT NULL,                      -- MEMORY_EVENTS (zod): created, reinforced, promoted, superseded,
                                                      --   conflict_flagged, deprecated, reactivated, expired, deleted,
                                                      --   flagged_for_review, rejected (with the candidate hash, no text)
  reason          text NULL,
  actor           jsonb NOT NULL DEFAULT '{}',        -- { kind: admin|counsellor|student|system|worker, id?: hashed }
  confidence      real NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_counselling_memory_events_memory ON ai_counselling_memory_events (memory_id, created_at DESC);

CREATE UNIQUE INDEX ai_counselling_memories_dedupe
  ON ai_counselling_memories (institution_id, content_hash) WHERE status <> 'deleted';
CREATE INDEX ai_counselling_memories_lookup
  ON ai_counselling_memories (institution_id, status, type);
CREATE INDEX ai_counselling_memories_expiry
  ON ai_counselling_memories (expires_at) WHERE expires_at IS NOT NULL AND status = 'active';
-- ponytail: no HNSW. Memories per institution are hundreds, not millions; a btree on
-- institution_id then an exact cosine sort is faster and cannot starve under a filter.
-- Add the halfvec HNSW (same DDL as idx_akc_embedding) when one institution passes ~50k rows.

CREATE FUNCTION match_ai_counselling_memories(
  query_embedding vector,
  p_institution_id integer,          -- the tenant boundary is the first argument, no default
  match_count integer DEFAULT 12,
  filter_types text[] DEFAULT NULL,
  filter_statuses text[] DEFAULT ARRAY['active']
) RETURNS TABLE (id uuid, type text, content text, structured_metadata jsonb, source text,
                 confidence real, importance smallint, status text, reinforce_count int,
                 use_count int, last_used_at timestamptz, created_at timestamptz,
                 similarity double precision)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  -- Not STRICT: STRICT would return nothing whenever filter_types is left at its NULL default.
  -- A missing institution is a caller bug and must fail loudly, never fall back to "everything".
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'match_ai_counselling_memories: institution_id is required';
  END IF;
  RETURN QUERY
  SELECT m.id, m.type, m.content, m.structured_metadata, m.source, m.confidence, m.importance,
         m.status, m.reinforce_count, m.use_count, m.last_used_at, m.created_at,
         1 - (m.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) AS similarity
  FROM ai_counselling_memories m
  WHERE m.institution_id = p_institution_id
    AND m.embedding IS NOT NULL
    AND m.status = ANY(filter_statuses)
    AND (filter_types IS NULL OR m.type = ANY(filter_types))
    AND (m.expires_at IS NULL OR m.expires_at > now())
  ORDER BY m.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
END
$$;
```

The institution boundary is enforced twice: the function raises on a null institution, and
the repository's TypeScript signature takes `institutionId: number`, not `number | null`. The
isolation test asserts both the exception path and that a two-institution fixture never crosses.

**Dedupe upsert.** The unique index is partial, so plain `ON CONFLICT (institution_id, content_hash)`
cannot infer it; the insert is raw SQL with the predicate spelled out (the repo already does this
in `staging-writer.ts` with `.onConflict(masterKnex.raw(...))`):

```sql
INSERT INTO ai_counselling_memories (...) VALUES (...)
ON CONFLICT (institution_id, content_hash) WHERE status <> 'deleted' DO NOTHING
RETURNING id
```

No row returned means an existing row holds that statement. What happens next depends on the
existing row's status and the new input's source:

| Existing status | New input is human-authored (admin, correction) | New input is learned |
|---|---|---|
| `candidate` | promote to active (human authority), event `promoted` | reinforce |
| `active` | reinforce (confidence +0.1), event `reinforced` | reinforce |
| `deprecated` / `expired` | reactivate via `supersede` (new version, active), event `reactivated` | ignored; event `rejected` with reason `previously_deprecated`. A dead statement stays dead until a human revives it |
| `superseded` | route to the head of the version chain and apply the rule above | same |

### 9.2 `20260925_002_ai_messages_review.ts`

```sql
ALTER TABLE ai_counselor_messages
  ADD COLUMN review_status  text NULL,        -- 'approved' | 'corrected' | 'flagged'
  ADD COLUMN correction     text NULL,        -- what the counsellor would have said
  ADD COLUMN review_note    text NULL,        -- why (free text, ≤ 1000)
  ADD COLUMN reviewed_by    int NULL,         -- platform_users.id
  ADD COLUMN reviewed_at    timestamptz NULL,
  ADD COLUMN retrieval_trace jsonb NULL,      -- RetrievalTraceSchema: memories used + scores, docs, settings version
  ADD COLUMN feedback_actor text NULL;        -- hashed platform_user_id | visitor_key that set `feedback` (for distinct-actor counts)
ALTER TABLE ai_counselor_messages
  ADD CONSTRAINT ai_messages_review_status_check
  CHECK (review_status IS NULL OR review_status IN ('approved','corrected','flagged'));
```

`retrieval_trace` is internal observability and is never returned by student-facing routes
(the message list select stays explicit).

### 9.3 Rack: one new category kind, no migration

`CATEGORY_KINDS` in `rack.schema.ts` gains `"counselling_guideline"`. `kind` has no CHECK
constraint, so this is a zod change. `site-index.service.ts`'s lazy category pattern is reused
to create `institution-counselling-guidelines` on first upload. The existing
`match_ai_knowledge_chunks` is **not modified** (avoids the overload trap noted in
`20260909_003`); `knowledge.repository.matchKnowledgeChunks` gains an optional `categoryKind`
argument in place of the hardcoded `NULL`.

---

## 10. Vector / embedding strategy

### What is embedded

| Content | Where | Unit | Metadata for deterministic filtering |
|---|---|---|---|
| Institution guideline / policy documents (PDF, MD, URL) | `superadmin.ai_knowledge_chunks` via existing ingest | section chunk | `sources.institution_id`, `category.kind = counselling_guideline`, `trust_tier`, `last_verified_at`, `effective_until`, `source_type`, timestamps |
| Institution website (already) | same | section chunk | `institution_id`, category `embed-site-index` |
| Memories: guidelines, preferences, patterns, policies, rules, corrections, avoidance | `ai_counselling_memories.embedding` | one atomic statement | `institution_id`, `type`, `source`, `status`, `confidence`, `importance`, `version`, timestamps |
| Global education knowledge (already) | rack, `institution_id IS NULL` | chunk | unchanged |

### What is not embedded

Conversations, individual messages, student profile data, one-off student statements, the
model's raw replies, thumbs alone. The extraction worker embeds only the **derived statement**
it produces, after filters.

### Embedding text

Memory embedding text is `"{TYPE label}: {content}"` so that type semantics participate in the
vector (same idea as `embedTextFor(content, heading_path, title)` in the chunker).

### Namespace and isolation

Both vector tables carry `institution_id`. The rack function's institution filter is exclusive
(already). The memory function takes the institution as a strict first argument. There is no
code path that searches memories without an institution. Cross-institution retrieval is
impossible by construction and asserted by tests that plant memories for two institutions and
check statements and results.

### Retrieval and ranking

1. Boundary: SQL filters `institution_id`, `status`, `type`, `expires_at`.
2. Semantics: cosine similarity, top 12.
3. Rank in app (`rankMemories`, one pure function):

```
score = 0.55·similarity
      + 0.20·confidence
      + 0.10·(importance / 5)
      + 0.10·authority(source)        institution_admin 1.0, counsellor_correction 1.0, student_feedback 0.5, ai_extracted 0.4
      + 0.05·recencyOrUsage           min(1, use_count/20) ⊕ decay(last_used_at, 90 d)
```
   Drop anything below similarity 0.35. Keep top 6 memories plus the top 3 whose type is a
   technique (`RESPONSE_PATTERN`, `SUCCESSFUL_RESPONSE_PATTERN`, `RESPONSE_PREFERENCE`).
4. Pinned rules: `AVOIDANCE_RULE` and `COUNSELLING_GUIDELINE` with `importance = 5` are
   fetched by a separate indexed query (`institution_id, status, type`), not by similarity, so
   institution-wide rules never depend on the student's phrasing. They have their own budget:
   800 chars, ordered by importance then `created_at`, and are **exempt** from the ranked
   budget below. Overflow is logged as a warning per institution so an admin can trim.
5. Ranked budget: 1700 chars for the similarity-ranked items; overflow drops lowest score
   first. Section total is therefore ≤ 2500 chars.

**Cost on the critical path.** Today an embed turn only computes an embedding in the site-index
fallback. Sharing one vector between the briefing and `searchAll` means `embed(query +
situation)` runs first, then both searches in parallel; that is one round-trip (~100–300 ms)
added to every embed turn. Two mitigations, both in the design: `searchAll` accepts an optional
`queryVector` so the fallback never embeds twice; and a 60-second cached per-institution count
of `active memories with embeddings + guideline documents` skips the embedding and the memory
search entirely when it is zero. That is the common case for every institution that has not
configured anything, so those widgets pay nothing.

`ponytail:` weights are constants in one place; tune after evals, do not build a config UI.

---

## 11. Memory model and lifecycle

### 11.1 Types (`MEMORY_TYPES`)

| Type | Meaning | Typical source | structured_metadata |
|---|---|---|---|
| `COUNSELLING_GUIDELINE` | how to counsel at this institution | admin | `{ applies_to?: stage[] }` |
| `RESPONSE_PREFERENCE` | tone, length, formatting, language | admin, learned | `{ tone?, detail_level?: brief/standard/detailed, language?, use_cards?: boolean }` |
| `RESPONSE_PATTERN` | a technique: when to ask first, how to compare, how to explain eligibility | learned, admin | `{ technique: enum, trigger: string, example?: string }` |
| `SUCCESSFUL_RESPONSE_PATTERN` | a technique confirmed by feedback | learned (thumbs-up + reinforcement) | same as above + `{ evidence_count }` |
| `INSTITUTION_POLICY` | refund, deferral, scholarship rules the counsellor may state | admin, correction | `{ effective_from?, effective_until?, url? }` |
| `COURSE_RECOMMENDATION_RULE` | preferred recommendation logic | admin, correction | `{ prefer?: string[], avoid?: string[], destinations?: string[] }` |
| `TERMINOLOGY` | institution-specific vocabulary | admin, correction | `{ term, meaning, use_instead_of?: string[] }` |
| `STUDENT_CONCERN_PATTERN` | common concern and how counsellors address it | learned, admin | `{ concern, approach }` |
| `COUNSELLOR_CORRECTION` | a human said the AI was wrong and how | review route | `{ message_id }` — no excerpts: metadata is not PII-filtered, so the message id is the pointer |
| `AVOIDANCE_RULE` | never recommend / never state | admin, correction | `{ severity: hard/soft }` |
| `GENERAL_CONTEXT` | anything durable with no better home | admin | `{}` |

`STUDENT_CONTEXT_PATTERN` from the request is renamed `STUDENT_CONCERN_PATTERN` to make clear it
is about **categories of students**, never a student. The zod schema for `structured_metadata`
is a discriminated union on `type`, so each type's metadata is typed and validated on write and
on read.

`technique` enum (drives future "Aly" behaviour too): `clarify_first`, `answer_then_ask`,
`compare_options`, `explain_eligibility`, `state_uncertainty`, `structure_recommendation`,
`use_profile_fact`, `show_course_cards`, `withhold_recommendation`, `request_missing_info`,
`escalate_to_human`.

### 11.2 Sources (`MEMORY_SOURCES`) and authority

`institution_admin` (1.0) · `counsellor_correction` (1.0) · `counsellor_feedback` (0.8) ·
`student_feedback` (0.5) · `ai_extracted` (0.4) · `system` (0.3, e.g. migrated
`custom_instructions`).

### 11.3 Statuses and transitions

```
                ┌──────────── approve (human) ───────────┐
                │                                         ▼
 extract ──► candidate ──reinforce ≥3 distinct students──► active ──► deprecated (human or sweep)
                │                                         │  ▲              │
                │ 90 d without reinforcement              │  │ reactivate    │
                ▼                                         │  └──────────────┘
             deprecated                                   ├──► superseded (new version active)
                                                          ├──► expired (expires_at passed; sweep)
                                                          └──► deleted (soft; admin)
 human-authored (admin, correction) ──────────────────────► active immediately
```

Operations in `counselling-memory.service.ts`. Every operation inserts one
`ai_counselling_memory_events` row and every counter change is a **single atomic UPDATE**
(`SET x = x + 1`, `SET source_reference = source_reference || $patch`), never a read-modify-write,
because the worker consumes jobs concurrently and `touchUsed` runs on every turn:

- `create(input, actor)`: validate, hash, embed (best-effort; a memory without a vector is still
  listable and pinned-eligible), raw upsert with the partial-index predicate (§9.1); on conflict
  apply the status × source table in §9.1.
- `reinforce(id, evidence)`: one UPDATE: `reinforce_count + 1`, `confidence = least(1, confidence + 0.1)`,
  `last_reinforced_at = now()`, `source_reference.actors = distinct(actors ∪ {actor})` capped at 20.
  Promote `candidate → active` when `reinforce_count ≥ 3` **and** `actors` holds ≥ 3 **distinct
  students** — hashed `platform_user_id` or `visitor_key`, never session ids, so one guest opening
  three sessions cannot promote a candidate alone. The promotion is a second conditional UPDATE
  (`WHERE status = 'candidate' AND jsonb_array_length(source_reference->'actors') >= 3`).
- `supersede(oldId, newInput, actor)`: new row `version = old.version + 1`, `supersedes_id`;
  old → `superseded`. Used for edits, for reactivating a dead statement with human authority,
  and for resolved contradictions where the new source's authority ≥ the old one's.
- `flagConflict(newCandidate, existingId)`: candidate stored with `conflicts_with_id`; never
  auto-activates; admin list shows the pair.
- `voteNegative(id, actor)`: `negative_votes + 1` in `source_reference`. Then, **only when
  `source ∈ {ai_extracted, student_feedback}`**: `≥ 5` negatives with `0` positives → `deprecated`,
  event `deprecated` with reason `negative_votes`. For human-authored sources (`institution_admin`,
  `counsellor_correction`, `counsellor_feedback`, `system`) the same threshold sets
  `flagged_for_review_at` and emits `flagged_for_review`; the memory stays active. Guest feedback is
  keyed on a client-supplied fingerprint and can be spoofed, so an anonymous visitor must never be
  able to vote an admin rule out of the prompt. Votes are counted per distinct actor
  (`feedback_actor` on the message), so repeat votes from one fingerprint count once.
- `deprecate(id, reason)`, `reactivate`, `expire` (sweep), `softDelete`.
- `touchUsed(ids)`: `UPDATE … SET use_count = use_count + 1, last_used_at = now() WHERE id = ANY($1)`,
  fire-and-forget after retrieval.

### 11.4 Extraction criteria (what may become memory)

Runs only on a signal, never per turn:

| Signal | Input to extractor | May produce | Initial status |
|---|---|---|---|
| Counsellor correction saved | the message, the correction, the note, nearest active memories | `COUNSELLOR_CORRECTION` (always), plus at most 2 derived rules (policy / avoidance / pattern) | correction: active; derived: active if the reviewer ticked "apply as rule", else candidate |
| Counsellor approve / flag | same | reinforce techniques used in the message (from `retrieval_trace`); flag → nothing new, deprecate-vote on the memories used | n/a |
| Student thumbs-up | the exchange + `retrieval_trace` | reinforce memories used; one `SUCCESSFUL_RESPONSE_PATTERN` candidate describing the technique | candidate |
| Student thumbs-down | the exchange | nothing new; `voteNegative` on the memories in `retrieval_trace` — deprecates learned memories at the threshold, only flags human-authored ones for review (§11.3) | n/a |
| Conversation end (`/guest/conversation-end` or authenticated session archive) | whole conversation, `auto_learn = true` only | `STUDENT_CONCERN_PATTERN`, `RESPONSE_PATTERN` candidates | candidate |

Hard exclusions, applied in code after the model call (not only in the prompt):
- PII, three checks in sequence, any hit rejects: (a) regex for emails, phone numbers, and
  passport/ID-shaped tokens; (b) a **known-names list** built for this job from concrete fields —
  the visitor's `name` on `ai_widget_visitors`, the platform user's first/last name and
  `institution_attended`, qualification `institution_name` values on the profile — matched
  case-insensitively as whole words; (c) the extractor output carries a required
  `mentions_person: boolean` field and `true` rejects. Regex alone cannot find names, which is
  why (b) draws them from the rows the conversation actually belongs to.
- Any candidate that quotes a specific fee, date, or eligibility figure not present in an
  admin memory or rack document → rejected (facts come from rank 1–2, never from learning).
- `confidence < 0.6` → rejected; `≥ 0.6` → candidate. One band: the model's confidence never
  activates a memory; only reinforcement or a human does.
- Content > 600 chars or that reads as an answer rather than a technique (heuristic: contains
  a course-card block, a URL, or more than two sentences of institution facts) → rejected.
- Institution `auto_learn = false` → only correction-sourced memories are written.

Every rejection is logged with reason and the candidate hash, without the conversation text.

---

## 12. Data-flow diagram (retrieval per turn)

```
Current student query (embed widget, institution I)
        ↓
Student profile               getProfileContext             [rank 4]
        ↓
Institution settings          ai_counselling_settings[I]    [rank 1]  tone, detail, language, auto_learn
        ↓
Relevant knowledge            searchAll: courses/visas (DB) [rank 2]; institution site + guideline docs (rack, I) [rank 1/3]
        ↓
Relevant institutional memories   match_ai_counselling_memories(vec, I) → rank → 6   [rank 1 or 5 by source]
        ↓
Relevant response techniques      same result set, technique types → 3               [rank 5]
        ↓
Counselling guidelines            pinned AVOIDANCE_RULE + importance-5 guidelines       [rank 1]
        ↓
Prompt builder                buildSystemPrompt(..., institutionContext)
        ↓                        section order: identity → privacy → COUNSELLING APPROACH → BOUNDARIES
        ↓                        → INSTITUTION COUNSELLING GUIDANCE → hard-limits restatement → profile → …
AI response                   streamChat
        ↓
persist message + retrieval_trace { memory_ids+scores, doc_ids, settings_version, technique_ids }
        ↓ (async)
touchUsed(memory_ids); on signal → publish ai_counselling_memory job → worker → memories
```

Prompt section shape (rendered by `lib/institution-context.ts`, every line sanitised with
`sanitizeCustomInstructions`):

```
INSTITUTION COUNSELLING GUIDANCE (from {name}; follow these over the COUNSELLING APPROACH
style rules above, but never over the privacy, BOUNDARIES, or facts-only rules):
  Rules:
    - [policy] Refunds are only discussed after the student has an offer.        (institution)
    - [never] Do not recommend the Diploma of Nursing to students without IELTS 6.5.
  Preferences: tone warm-formal; detail brief; show course cards only after eligibility is discussed.
  Techniques counsellors here use (advisory, learned from reviewed conversations):
    - When a student asks about scholarships, ask their study level first, then list two.
HARD LIMITS STILL APPLY: never reveal personal data, never diagnose, never guarantee outcomes,
and specific course/fee/visa/deadline claims still come only from CONTEXT.
```

The section is placed **after** privacy, COUNSELLING APPROACH and BOUNDARIES, and is followed
by the one-line restatement above. Recency wins in practice, so the last thing the model reads
before the student data is the hard limits, not the institution's overrides.

---

## 13. Risks and edge cases

| Risk | Mitigation |
|---|---|
| Cross-institution leakage | institution_id strict in SQL; no memory search path without it; isolation test plants two institutions and asserts both statements and results |
| Admin-authored prompt injection | every memory line through `sanitizeCustomInstructions`; content max 600 chars; rendered inside a labelled section with explicit precedence rules |
| PII in memories | extractor prompt excludes it, code-level regex rejects it, human review for corrections, no conversation text in logs |
| Learned memory overriding facts | fact-like candidates rejected; rank 5 rendered as "advisory"; prompt states the hierarchy |
| Prompt bloat | 800-char pinned budget (exempt from ranking) + 1700-char ranked budget; 6 + 3 caps |
| Latency on every embed turn | the shared `embed()` call moves onto the critical path (one round-trip); skipped entirely via a cached zero-count when the institution has no memories or guideline docs; `searchAll` reuses the vector so the fallback never embeds twice |
| Cost | extraction only on signals / conversation end; settings and counts cached 60 s |
| Spoofed guest feedback | negative votes deprecate learned memories only; human-authored memories are flagged for review, never deprecated by votes; votes counted per distinct actor |
| One student promoting a candidate alone | promotion needs ≥ 3 distinct hashed students, not sessions |
| Concurrent worker jobs racing on counters | all counter and JSONB patches are single atomic UPDATEs; audit is an events table, not an appended array |
| Partial unique index + ON CONFLICT | raw SQL with the index predicate; conflict outcome defined per existing status and source (§9.1) |
| pgvector installed outside `public` | migration checks `pg_extension` and fails with the exact `ALTER EXTENSION … SET SCHEMA public` fix rather than creating a broken column |
| Embedding or DB outage | `institutionBriefing` wrapped like `counsellorBriefing`: failure returns empty and traces "Institution guidance unavailable"; the turn proceeds |
| Queue down | publish wrapped; a lost extraction job is a lost learning opportunity, not a lost reply; conversation-end signal is re-derivable by the sweep |
| Duplicate memories | unique `(institution_id, content_hash)`; near-duplicates (cosine ≥ 0.92, same type) routed to reinforce |
| Contradictions | `conflicts_with_id` + never auto-activate against higher authority |
| HNSW filter starvation | no HNSW on memories until needed; rack call is unchanged |
| Function overload trap | new function only; `DROP FUNCTION IF EXISTS` with the exact signature in `down()` |
| `CREATE EXTENSION` privilege on fresh DBs | same superuser step SETUP.md already requires; the migration only creates when absent |
| Pre-existing IDOR: `PATCH /messages/:id/feedback` has no ownership check | fixed in the same phase: join session owner = `req.auth.sub` (or visitor key for the guest variant) |
| Guest widget has no feedback route | add `POST /guest/messages/:id/feedback` keyed on `(embed_key, fingerprint)` so thumbs exist where institutions actually run |
| `job:chat-summary` has no docker-compose service | flagged; the new worker gets a compose service from day one |
| Institution has multiple widgets | settings and memories are per institution; `custom_instructions` stays per widget and is rendered after the institution section |
| Business widgets | out of scope (no `institution_id`, rack column for business is unusable); the layer is a no-op when `rackInstitutionId` is null |

---

## 14. Migration and rollout strategy

1. Migrations are additive; existing widgets behave identically until an institution writes a
   memory or setting (empty briefing → no section rendered).
2. `auto_learn` defaults false. Correction-sourced memories are the only automatic writes until
   an institution opts in.
3. Optional one-time backfill: copy each institution widget's `custom_instructions` into a
   `GENERAL_CONTEXT` memory with `source = system`, active. Not run automatically; a script
   under `scripts/` with `--dry-run`.
4. Worker: `job:ai-counselling-memory` npm script and a profile-gated compose service
   `globalyapp-ai-counselling-memory` next to `globalyapp-ai-knowledge-crawl`.
5. Rollback: `down()` drops the function, the three tables, and the seven message columns.
   No data outside these objects is touched.

---

## 15. Testing strategy

Standalone tsx scripts, fake Postgres wire at `acquireConnection`, fake `fetch` for embeddings,
fake `extractJson` where a model is called — the `tests/embed-db-first.ts` harness. Each
script maps to the numbered requirements:

| Script | Covers |
|---|---|
| `tests/counselling-memory-schema.ts` | 17 JEV validation failures (bad type, confidence out of range, metadata mismatch per type, oversize content), 18 type safety (compile-time via `tsc --noEmit` in the script's run line) |
| `tests/counselling-memory-isolation.ts` | 1, 2, 3, 11: two institutions, one query; every `match_ai_counselling_memories` statement carries the right institution; rack call carries `counselling_guideline` + institution; a null institution is a TypeScript error and, at the wire, an exception rather than rows |
| `tests/counselling-memory-lifecycle.ts` | 4 create (raw upsert carries the partial-index predicate), 5 rejection (regex PII, known-name PII from visitor/profile fields, `mentions_person`, fact-like, low confidence, auto_learn off, re-learning a deprecated statement), 6 reinforce: three sessions from one actor do NOT promote, three distinct actors do; 7 conflict flagged never activated; 8 expiry sweep, vote-driven deprecation of a learned memory, vote-driven flag (not deprecation) of an admin memory; every mutation emits one event row and is a single UPDATE statement |
| `tests/counselling-memory-retrieval.ts` | 9 embedding text and fake vector, 10 ranking order (authority beats similarity within band), pinned rules survive a full ranked budget, zero-count skips the embed call, 12 profile + institution combination in `situationText`, section order after BOUNDARIES with the hard-limits line after it |
| `tests/counselling-memory-learning.ts` | 13 correction → active `COUNSELLOR_CORRECTION` + derived rule candidate, 14 thumbs-up → `SUCCESSFUL_RESPONSE_PATTERN` candidate + reinforcement of used memories, 15 low-confidence never active |
| `tests/counselling-memory-resilience.ts` | 16: `embed()` throws, memory query throws, queue publish throws → turn still streams, trace says why, no memory section |
| `tests/counselling-review-auth.ts` | feedback ownership fix; institution routes reject a member of another institution |

`npm run typecheck` (existing) covers the `any`/cast rule; the scripts grep the new files for
`as any` and `as unknown as` as a guard, mirroring the repo's other self-checks.

---

## 16. Implementation plan

Each phase is independently shippable and leaves the counsellor working.

### Phase 1 — Schema, migrations, repository, zod (no behaviour change)
- `schemas/counselling-memory.schema.ts`: `MEMORY_TYPES`, `MEMORY_SOURCES`, `MEMORY_STATUSES`,
  `TECHNIQUES`, `MemoryMetadataSchema` (discriminated union), `MemoryRowSchema`,
  `CreateMemorySchema`, `PatchMemorySchema`, `MemoryQuerySchema`, `CounsellingSettingsSchema`,
  `ReviewMessageSchema`, `RetrievalTraceSchema`, `ExtractionOutputSchema`; all `z.infer` types.
- Migrations `20260925_001`, `20260925_002` (above).
- `repositories/counselling-memory.repository.ts`: raw upsert with the partial-index predicate,
  match (function call, `institutionId: number`), pinned-rules query, list/find by institution,
  atomic counter UPDATEs, event inserts, `touchUsed`, settings get/upsert, cached
  active-count; JSONB parsed on read.
- `services/counselling-memory.service.ts`: create / reinforce / supersede / flagConflict /
  deprecate / reactivate / expire / softDelete; `services/counselling-settings.service.ts`.
- Tests: schema, lifecycle (unit-level, fake wire).

### Phase 2 — Retrieval and prompt
- `rag.service.institutionBriefing`; `knowledge.repository.matchKnowledgeChunks` gains
  `categoryKind`; `rankMemories` pure function; `lib/institution-context.ts` renderer.
- `prompt.service.buildSystemPrompt` gains `institutionContext`; section placed after BOUNDARIES
  with the hard-limits restatement line after it.
- `chat.service.handleMessage`: run briefing in parallel with `searchAll` when
  `opts.embed?.rackInstitutionId`; persist `retrieval_trace`; `touchUsed` fire-and-forget;
  trace steps "Institution guidance: N rules, M techniques".
- Tests: isolation, retrieval, resilience.

### Phase 3 — Institution API and feedback
- `routes/counselling.routes.ts` under `/api/v3/ai-chat/institution/counselling` with
  `requireInstitutionContext`: `GET/PUT settings`, `GET/POST/PATCH/DELETE memories`,
  `POST memories/:id/approve|deprecate|reactivate`, `GET conversations` (sessions whose
  `embed_config_id` belongs to this institution, with messages), `POST messages/:id/review`.
- Fix `PATCH /messages/:id/feedback` ownership; add guest feedback route.
- `services/counselling-review.service.ts` publishes extraction jobs.
- Tests: review auth.

### Phase 4 — Learning worker
- `shared/queues.ts` in ai-counsellor (`COUNSELLING_QUEUES.MEMORY = "ai_counselling_memory"`).
- `lib/memory-extract.ts` (pure: prompt builder, zod parse, exclusion filters, near-dup routing).
- `workers/counselling-memory.worker.ts`: consumer for `correction | feedback | conversation_end`
  jobs; `--sweep` mode for expiry / 90-day candidate deprecation / negative-vote deprecation.
- Publish points: review route, feedback routes, `/guest/conversation-end`, session archive.
- npm script, compose service.
- Tests: learning.

### Phase 5 — Institution guideline documents (optional, small)
- `CATEGORY_KINDS` + lazy category; institution upload route reusing `rack.service.uploadSource`
  with `institution_id`; listing/deleting own sources. Retrieval already works from Phase 2.

### Phase 6 — Docs and evals
- Update `docs/ai-counsellor` and the E2E testing guide; add 5 eval questions per institution
  fixture to `evals/`.

Estimated diff: roughly 1,800 lines including tests; no new dependencies.

---

## Appendix A — Open questions (defaults chosen; say if different)

1. Promotion threshold: 3 reinforcements from 3 distinct students (hashed user id or visitor key). Default chosen; tunable const.
2. Institution members allowed to review conversations: any `requireInstitutionContext` member.
   If a role is wanted, `requireInstitutionRole("owner","admin")` is a one-line change.
3. Conversation-end extraction for authenticated (non-guest) embed users: on session archive
   only. There is no explicit "end" for them today.
4. Business widgets: excluded until `ai_knowledge_sources.business_id` is fixed (uuid vs int).
