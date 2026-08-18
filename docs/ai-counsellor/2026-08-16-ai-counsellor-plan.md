# AI Counsellor -- Implementation Plan

> **Date:** 2026-08-16 | **Status:** APPROVED

---

## Phase 1: Core Chat Engine + Sessions

The minimum viable AI counsellor: send a message, get a streamed Gemini response grounded in extracted course data, manage sessions. No credits, no guests, no embed -- those are Phase 2+.

### Backend

- [ ] **Migration: `20260816_001_ai_embed_configs`** -- Create `ai_embed_configs` table. References `businesses(id)`. UUID `embed_key` with unique constraint. Includes `display_name`, `logo_url`, `brand_color`, `custom_instructions`, `monthly_credit_limit`, `credits_used_this_month`, `month_reset_at`, `is_active`. Created first because sessions and guest sessions will FK to it later.
- [ ] **Migration: `20260816_002_ai_counselor_sessions`** -- Create `ai_counselor_sessions` table. References `platform_users(id)`, optional FK to `ai_embed_configs(id)`. Columns: `title`, `message_count`, `credits_used`, `is_archived`, `created_at`, `updated_at`, `deleted_at`. Index on `(platform_user_id, deleted_at, created_at DESC)`.
- [ ] **Migration: `20260816_003_ai_counselor_messages`** -- Create `ai_counselor_messages` table. References `ai_counselor_sessions(id) ON DELETE CASCADE`. Columns: `role` (CHECK: user/assistant), `content`, `sources` (JSONB), `cards` (JSONB), `chips` (JSONB), `attachments` (JSONB), `feedback` (CHECK: positive/negative), `prompt_tokens`, `completion_tokens`, `total_tokens`, `latency_ms`, `created_at`. Index on `(session_id, created_at)`.
- [ ] **Module scaffold: `ai-chat/index.ts`** -- Fastify plugin with `prefix: /api/v3/ai-chat`. Register `chatRoutes`. Follow the `feedModule` pattern from `backend/src/modules/feed/index.ts`.
- [ ] **`lib/sse-writer.ts`** -- SSE helper functions: `writeEvent(reply: FastifyReply, event: string, data: unknown)` writes `event: <type>\ndata: <json>\n\n` to `reply.raw`. `writeDone(reply, data)` writes the `done` event and calls `reply.raw.end()`. Sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive` headers on first call.
- [ ] **`lib/gemini-stream.ts`** -- Streaming wrapper extending `shared/ai/gemini.ts`. Exports `streamChat(opts: { system: string, history: Array<{role, content}>, onChunk: (text: string) => void }): Promise<{ fullText: string, usage: { promptTokens, completionTokens, totalTokens } }>`. Uses `model.generateContentStream()` from `@google/generative-ai`. Includes the same retry logic (3 attempts for transient errors) as the existing `generateText`. Instantiates the Gemini client via `getClient()` from `shared/ai/gemini.ts` (or duplicates the lazy singleton pattern if the existing module doesn't export it).
- [ ] **`lib/card-parser.ts`** -- Parse `COURSE_CARD ... END_COURSE_CARD` and `CHIPS ... END_CHIPS` blocks from Gemini output text. Exports `parseCards(text: string): CourseCard[]` and `parseChips(text: string): string[]`. Uses regex extraction, not a full parser. Returns empty arrays if no blocks found. Strips the blocks from the display text (they're emitted as separate SSE events, not shown inline).
- [ ] **`repositories/sessions.repository.ts`** -- CRUD on `ai_counselor_sessions`. Functions: `create(userId, embedConfigId?)`, `findById(id)`, `findByUser(userId, { includeArchived, limit, offset })`, `update(id, { title?, is_archived?, deleted_at?, message_count?, credits_used? })`, `incrementMessageCount(id)`. All queries use `knex('ai_counselor_sessions')` from the globalyapp connection.
- [ ] **`repositories/messages.repository.ts`** -- CRUD on `ai_counselor_messages`. Functions: `create(sessionId, { role, content, sources?, cards?, chips?, attachments?, promptTokens?, completionTokens?, totalTokens?, latencyMs? })`, `findBySession(sessionId, { limit, beforeId? })`, `updateFeedback(id, feedback)`. Paginated with cursor-based pagination using `beforeId`.
- [ ] **`repositories/knowledge.repository.ts`** -- Read-only queries on `superadmin.extraction_*` tables. Functions:
  - `searchCourses({ keywords, country?, degreeLevel?, limit? })` -- `ILIKE` on `name`, `subject_area`, `degree_level` in `superadmin.extraction_courses`. Joins to `extraction_institution_overview` via `job_id` for institution name. Returns course + institution + fees + intakes.
  - `searchVisas({ country?, keywords? })` -- `ILIKE` on `superadmin.extraction_visas` columns `name`, `country_code`, `visa_stream`.
  - `getCourseFees(courseIds: string[])` -- Join `extraction_course_fee_assignments` to `extraction_course_fees`.
  - `getCourseEligibility(courseIds: string[])` -- Join `extraction_course_eligibility_assignments` to `extraction_eligibility_requirements`.
  - `getCourseEnglishRequirements(courseIds: string[])` -- Direct query on `extraction_english_requirements` via `course_id`.
  - `getCourseIntakes(courseIds: string[])` -- Join `extraction_course_intake_assignments` to `extraction_intakes`.
  - `getCourseStudyOptions(courseIds: string[])` -- Join `extraction_course_study_option_assignments` to `extraction_study_options`.
  - `getCourseCampuses(courseIds: string[])` -- Join `extraction_course_campuses` to `extraction_campuses`.
  - `searchKnowledgeVisa({ country?, keywords? })` -- Query `globalyapp.ai_knowledge_visa` WHERE `is_active = true`.
  - `searchKnowledgeFaqs({ keywords? })` -- Query `globalyapp.ai_knowledge_faqs` WHERE `is_active = true`.
  - `searchKnowledgeCountryGuides({ countryId? })` -- Query `globalyapp.ai_knowledge_country_guides` WHERE `is_active = true`.
  All superadmin queries use explicit schema prefix: `knex('superadmin.extraction_courses')`.
- [ ] **`services/prompt.service.ts`** -- System prompt assembly. Exports `buildSystemPrompt(opts: { profile, ragResults, embedConfig? }): string`. Concatenates: identity block, privacy rules, profile-first rules (with user data interpolated), RAG results (serialised course/visa/FAQ data), COURSE_CARD format rules, CHIPS format rules, response format rules. If `embedConfig` is provided, adds business scoping instructions and custom instructions (sanitised).
- [ ] **`services/rag.service.ts`** -- Multi-source keyword search orchestrator. Exports `searchAll(opts: { query: string, userId: number, embedConfigId?: number }): Promise<RagResults>`. Extracts keywords from the user's query (simple tokenisation + stopword removal). Calls `knowledge.repository` functions in parallel. Aggregates results into a typed `RagResults` object with `courses`, `visas`, `faqs`, `countryGuides`, `institutions` arrays. Each result includes a `source` field for the `sources` SSE event.
- [ ] **`services/session.service.ts`** -- Session lifecycle. Functions: `getOrCreateSession(userId, sessionId?, embedConfigId?)`, `listSessions(userId, includeArchived)`, `updateSession(id, userId, patch)`, `autoTitle(sessionId, userMessage, aiResponse)`. The `autoTitle` function calls `generateText` from `shared/ai/gemini.ts` with a short prompt: `"Generate a concise 3-6 word title for this conversation: User: {msg} Assistant: {response}"`.
- [ ] **`services/chat.service.ts`** -- Main orchestrator. Exports `handleMessage(opts: { userId, sessionId?, content, attachments?, embedKey?, reply }): Promise<void>`. Steps:
  1. Resolve session (create or load).
  2. Persist user message.
  3. Aggregate profile context (parallel queries).
  4. RAG search (emit `trace` events via SSE writer).
  5. Emit `sources` event.
  6. Build system prompt.
  7. Stream Gemini response (emit `delta` events).
  8. Parse cards and chips from full response.
  9. Emit `cards`, `chips` events.
  10. Persist AI message with token metrics.
  11. Emit `usage` and `done` events.
  12. Auto-title if first message in session.
  Error handling: if Gemini fails after retries, emit an error `delta` with the fallback message and `done`. No credit deduction on failure.
- [ ] **`schemas/chat.schema.ts`** -- Zod schemas. `SendMessageSchema` (body: `{ session_id?: number, content: string, attachments?: string[] }`), `SessionIdParamSchema`, `MessageIdParamSchema`, `UpdateSessionSchema` (body: `{ title?: string, is_archived?: boolean, deleted_at?: string }`), `FeedbackSchema` (body: `{ feedback: 'positive' | 'negative' }`), `ListSessionsQuerySchema` (query: `{ include_archived?: boolean }`), `ListMessagesQuerySchema` (query: `{ limit?: number, before_id?: number }`).
- [ ] **`routes/chat.routes.ts`** -- Route handler registration:
  - `POST /messages` -- SSE endpoint. Parses body with `SendMessageSchema`. Sets SSE headers. Calls `chat.service.handleMessage()`. Rate limited to 10/min via Fastify `rateLimit` config.
  - `GET /sessions` -- Parses query with `ListSessionsQuerySchema`. Returns `session.service.listSessions()`.
  - `GET /sessions/:id/messages` -- Parses params + query. Returns paginated messages.
  - `PATCH /sessions/:id` -- Parses body with `UpdateSessionSchema`. Calls `session.service.updateSession()`.
  - `PATCH /messages/:id/feedback` -- Parses body with `FeedbackSchema`. Calls `messages.repository.updateFeedback()`.
- [ ] **Register module in `server.ts`** -- Import `aiChatModule` from `./modules/ai-chat/index.js` and `app.register(aiChatModule)`.

### Frontend

- [ ] **`apis/types.ts`** -- Wire types:
  ```typescript
  interface Session { id: number; title: string | null; message_count: number; credits_used: number; is_archived: boolean; created_at: string; updated_at: string; }
  interface Message { id: number; session_id: number; role: 'user' | 'assistant'; content: string; sources: Source[]; cards: CourseCard[]; chips: string[]; attachments: string[]; feedback: 'positive' | 'negative' | null; created_at: string; }
  interface CourseCard { id: string; name: string; institution: string; degree_level: string; duration: string; fees: number; currency: string; country: string; intakes: string[]; study_modes: string[]; source_url: string; }
  interface Source { type: string; id: string; title: string; relevance: number; }
  interface CreditBalance { free: number; subscription: number; purchased: number; total: number; }
  interface SendMessageReq { session_id?: number; content: string; attachments?: string[]; }
  interface SendMessageRes { session_id: number; message_id: number; }
  ```
- [ ] **`apis/real-api.ts`** -- SSE fetch using `fetch()` with `ReadableStream` reader for `POST /messages`. Parses SSE events by splitting on `\n\n`, extracting `event:` and `data:` lines, JSON-parsing data. REST endpoints: `getSessions()`, `getMessages(sessionId, params)`, `updateSession(id, patch)`, `setFeedback(messageId, feedback)`. Uses `httpGet`, `httpPost`, `httpPatch` from `@/lib/api/http`.
- [ ] **`apis/mock-data.ts`** -- `aiChatMockApi` matching the real API interface. `sendMessage()` simulates SSE streaming by emitting mock events via a callback with delays (50ms per delta). Returns mock course cards and chips. `getSessions()` returns 3-5 mock sessions. `getMessages()` returns mock conversation history. All mock functions log `[mock] ai-chat: <method>`.
- [ ] **`apis/index.ts`** -- `export const aiChatApi = createApi({ mock: aiChatMockApi, real: aiChatRealApi })`. Re-export types.
- [ ] **`store/ai-chat-slice.ts`** -- Redux Toolkit slice. State shape:
  ```typescript
  { sessions: Session[]; activeSessionId: number | null; messages: Record<number, Message[]>;
    sessionListStatus: 'idle' | 'loading' | 'failed'; messagesStatus: 'idle' | 'loading' | 'failed';
    sendStatus: 'idle' | 'streaming' | 'failed'; streamingContent: string; streamingCards: CourseCard[];
    streamingChips: string[]; traceSteps: string[]; error: string | null; }
  ```
  Thunks: `fetchSessions`, `fetchMessages(sessionId)`, `sendMessage(req)` (handles SSE event dispatching), `updateSession`, `setFeedback`. The `sendMessage` thunk manages the SSE connection lifecycle, dispatching `appendDelta`, `setCards`, `setChips`, `addTrace`, `messageSent` actions as events arrive.
- [ ] **Register slice in `store.ts`** -- Add `aiChat: aiChatReducer` to the root reducer.
- [ ] **`components/ai-chat-view.tsx`** -- Main layout component. Dispatches `fetchSessions` on mount (guarded with `fetchedRef` per AGENTS.md). Renders `ChatSidebar` (left), chat area (center: `ChatMessages` + `ChatInput`). When no active session, shows `SuggestedStarters`. Composes the full chat experience.
- [ ] **`components/chat-sidebar.tsx`** -- Session list. Groups sessions by recency: Today, Yesterday, This Week, This Month, Older. Each session item shows title (or "New conversation"), message count, last updated. Click selects session and dispatches `fetchMessages`. Inline rename via double-click. "New chat" button at top.
- [ ] **`components/chat-message.tsx`** -- Single message rendering. User messages: right-aligned, styled differently. AI messages: left-aligned, renders markdown content (using a simple markdown renderer or `dangerouslySetInnerHTML` with sanitisation). Renders `CourseCard` components for any cards. Renders `FeedbackButtons` on AI messages. Shows `chips` as tappable buttons below the message.
- [ ] **`components/chat-messages.tsx`** -- Scrollable message list. Maps over `messages[activeSessionId]`. Auto-scrolls to bottom on new messages. Shows `ThinkingIndicator` when `sendStatus === 'streaming'`. Shows streaming content as it arrives.
- [ ] **`components/chat-input.tsx`** -- Composer. Text input (textarea, auto-expanding). Send button (disabled when empty or `sendStatus === 'streaming'`). Enter to send, Shift+Enter for newline. Dispatches `sendMessage` thunk on submit.
- [ ] **`components/course-card.tsx`** -- Renders a single course recommendation card. Shows: institution name (with logo placeholder), course name, degree level, duration, fees (formatted with currency), country flag, intakes (comma-separated), study modes. "View Details" link (to `source_url`). "Compare" button (adds to compare tray).
- [ ] **`components/thinking-indicator.tsx`** -- Animated indicator during AI response generation. Shows trace steps from `traceSteps` state array: "Searching 847 courses...", "Checking visa requirements...". Animated dots after the last step. Clears when `sendStatus` returns to `idle`.
- [ ] **`components/suggested-starters.tsx`** -- Category-organised question chips for empty sessions. Categories: Courses, Visas, Scholarships, General. Each category has 3-4 starter questions. Clicking a starter dispatches `sendMessage` with that text.
- [ ] **`components/feedback-buttons.tsx`** -- Thumbs up / thumbs down buttons on each AI message. Dispatches `setFeedback` thunk. Shows selected state (filled icon vs outline). Only one can be active at a time.
- [ ] **`page.tsx`** -- Replace `<ComingSoon title="AI Counsellor" />` with `<AiChatView />`. Import from `./components/ai-chat-view`.

---

## Phase 2: Credits + Guest Mode

Monetisation layer and anonymous lead capture. Depends on Phase 1 being complete.

### Backend

- [ ] **Migration: `20260816_004_credit_wallets`** -- Create `credit_wallets` table. `platform_user_id UNIQUE` FK to `platform_users(id) ON DELETE CASCADE`. Three balance columns: `free_balance`, `subscription_balance`, `purchased_balance` (all `INTEGER NOT NULL DEFAULT 0`). `timestamps(true, true)`.
- [ ] **Migration: `20260816_005_credit_transactions`** -- Create `credit_transactions` table. FK to `credit_wallets(id) ON DELETE CASCADE`. Columns: `amount` (INTEGER, positive=grant, negative=deduct), `balance_type` (CHECK: free/subscription/purchased), `reason` (CHECK: signup_grant/message/purchase/admin_grant/subscription_grant), `reference_type` (CHECK: ai_message/purchase), `reference_id`, `created_at`. Index on `(wallet_id, created_at)`.
- [ ] **Migration: `20260816_006_ai_guest_chat_sessions`** -- Create `ai_guest_chat_sessions` table. Columns: `fingerprint_hash` (TEXT NOT NULL), `message_content`, `response_content`, `response_sources` (JSONB), `embed_config_id` FK to `ai_embed_configs(id)`, `migrated_to_session_id` FK to `ai_counselor_sessions(id)`, `expires_at` (TIMESTAMPTZ NOT NULL), `created_at`. Index on `(fingerprint_hash, expires_at)`.
- [ ] **`repositories/credits.repository.ts`** -- Functions: `findByUserId(userId)`, `createWallet(userId, freeBalance)`, `getForUpdate(userId, trx)` (SELECT FOR UPDATE within transaction), `updateBalance(walletId, balanceType, delta, trx)`, `recordTransaction(walletId, { amount, balanceType, reason, referenceType?, referenceId? }, trx)`.
- [ ] **`repositories/guest.repository.ts`** -- Functions: `findByFingerprint(hash)` (WHERE `expires_at > now()`), `create({ fingerprintHash, messageContent, responseContent, responseSources, embedConfigId?, expiresAt })`, `markMigrated(id, sessionId)`.
- [ ] **`services/credit.service.ts`** -- Core credit operations:
  - `ensureWallet(userId)` -- Upsert with 10 free credits. Uses `INSERT ... ON CONFLICT DO NOTHING`.
  - `getBalance(userId)` -- Returns `{ free, subscription, purchased, total }`.
  - `checkBalance(userId)` -- Returns boolean. True if total > 0.
  - `deductCredit(userId, messageId)` -- Within a transaction: `SELECT FOR UPDATE` the wallet. Waterfall deduction: try free first, then subscription, then purchased. Insert `credit_transactions` row. Returns the `balance_type` that was deducted from.
  - `grantCredits(userId, amount, balanceType, reason)` -- Admin grant. Adds to the specified balance. Records transaction.
- [ ] **`services/guest.service.ts`** -- Guest gate logic:
  - `checkGuestGate(fingerprintHash)` -- Returns `{ allowed: boolean, existingSession?: GuestSession }`.
  - `createGuestSession(data)` -- Persists guest message + response after streaming.
  - `migrateTranscript(fingerprintHash, userId)` -- Finds guest session, creates authenticated session + messages, marks guest session as migrated. Returns new session ID.
- [ ] **`routes/credits.routes.ts`** -- Route handlers:
  - `GET /credits/balance` -- Auth required. Returns `credit.service.getBalance(userId)`.
  - `POST /credits/grant` -- Admin required (check `req.auth.type === 'admin'`). Body: `{ user_id, amount, balance_type, reason }`. Calls `credit.service.grantCredits()`.
- [ ] **`routes/guest.routes.ts`** -- Route handlers:
  - `POST /guest/messages` -- No auth. Body: `{ content, fingerprint, ip? }`. Computes `SHA-256(fingerprint + IP)`. Checks guest gate. If allowed, runs the same chat pipeline as authenticated (profile context skipped for guests). Persists to `ai_guest_chat_sessions`. SSE stream.
  - `POST /guest/migrate` -- Auth required. Body: `{ fingerprint_hash }`. Calls `guest.service.migrateTranscript()`. Returns `{ session_id }`.
- [ ] **Add credit check to `chat.routes.ts` `POST /messages`** -- Before calling `chat.service.handleMessage()`, call `credit.service.checkBalance(userId)`. If false, return 402 with `{ code: 'INSUFFICIENT_CREDITS', message: 'Purchase credits to continue' }`.
- [ ] **Add credit deduction to `chat.service.ts` after successful response** -- After persisting the AI message (step 10), call `credit.service.deductCredit(userId, messageId)`. Increment `ai_counselor_sessions.credits_used`. If deduction fails (race condition, wallet deleted), log warning but don't fail the response -- the user already received it.

### Frontend

- [ ] **`components/credit-banner.tsx`** -- Dismissible banner in the chat area. Shows when `credits.total <= 3`: "You have {n} credits remaining." Shows when `credits.total === 0`: "You've used all your credits. Purchase more to continue chatting." with a link to the credits page. Fetches balance via `GET /credits/balance` on mount.
- [ ] **`components/signup-wall.tsx`** -- Overlay shown after a guest receives their free reply. "Create a free account to continue chatting." Two CTAs: "Sign Up" (to `/auth/register`), "Log In" (to `/auth/login`). Shows the AI response visible but blurred behind the wall. Passes `fingerprint_hash` as a query param so post-signup migration can happen automatically.
- [ ] **`components/compare-tray.tsx`** -- Sticky bottom bar for course comparison. Shows when 2+ courses are selected via "Compare" on course cards. Max 4 courses. Each course shows a mini card with name + remove button. "Compare" button expands to a full comparison table (side-by-side: institution, fees, duration, intakes, requirements). "Clear" button removes all.
- [ ] **`ai-widget/ai-launcher.tsx`** -- Floating action button (bottom-right). Sparkle icon. Click opens `AiPopover` (desktop) or `AiBottomSheet` (mobile, detected via media query). Badge shows unread indicator if AI responded in the background.
- [ ] **`ai-widget/ai-popover.tsx`** -- Desktop popover chat (400x600px). Renders the same `ChatMessages` + `ChatInput` components as the full page but in a compact layout. "Expand" button navigates to `/personal/ai` with the active session. "Close" button hides the popover. Shares Redux state with the full page.
- [ ] **`ai-widget/ai-bottom-sheet.tsx`** -- Mobile bottom sheet (slides up from bottom, 90% viewport height). Same components as popover. Swipe-down to dismiss. Hardware back button closes it.
- [ ] **Render widget in `PersonalShell`** -- Add `<AiLauncher />` to the personal shell layout so it appears on all personal routes. Conditionally render based on a feature flag or route (don't show on `/personal/ai` itself -- user is already on the full page).

---

## Phase 3: Embed Mode — ✅ DONE 2026-08-17

Business-scoped AI widget for partner websites. Implemented in the `ai-counsellor`
module (the plan's `ai-chat` name predates the module). Deviations flagged inline.

### Backend

- [x] **`repositories/embed.repository.ts`** -- CRUD on `ai_embed_configs`: `create`, `findByEmbedKey`, `findByBusinessId`, `deactivate`, `incrementMonthlyUsage`, `resetMonthlyUsage`, plus `businessWebsite` (RAG scoping key).
- [x] **`routes/embed.routes.ts`** -- `POST/GET /embed/configs`, `DELETE /embed/configs/:id` behind `requireBusinessContext`; plus public `GET /embed/resolve?key=` (branding subset only) for the widget page.
- [x] **`services/embed.service.ts`** *(added)* -- shared by both chat flows: `resolveActiveConfig` (active + lazy monthly reset + limit check → 404/403/429), `buildEmbedContext` (business website domain → `extraction_jobs` ids; no match = empty scope, never competitor leakage), `sanitizeCustomInstructions`.
- [x] **`rag.service.ts`** -- `jobIds` option scopes course search; visas stay unscoped; institution/agent/MARA sources are skipped entirely in embed mode (competitor data must not surface under a business's brand).
- [x] **`prompt.service.ts`** -- embed identity + only-recommend-{display_name} scoping + sanitised custom instructions (injection patterns rejected).
- [x] **`chat.routes.ts` `POST /messages`** -- `x-embed-key` header resolves the config; embed messages bill the business's monthly quota instead of the user's wallet; sessions stamped with `embed_config_id`.
- [x] **`guest.routes.ts` `POST /guest/messages`** -- optional `embed_key` in body (anonymous widget visitors); embed visitors are gated by the business quota, not the one-reply fingerprint wall.
- [x] **`server.ts` fix** *(bug found during phase 3)* -- a merge had registered every module twice (boot crash) and left all AI routes unauthenticated; now split like other-services: authed routes in the protected scope, `publicAiCounsellorModule` (guest messages + embed resolve) public.

### Frontend

- [x] **`/embed/[key]` public page** -- full-page branded chat (no sidebar/history), feature module at `frontend/src/app/embed/[key]/`, plain-fetch SSE client (no auth session), reuses `ChatInput`/`ChatMessage`/`ThinkingIndicator`. Branding via public `GET /embed/resolve`.
- [x] **Business AI-widget page** -- `frontend/src/app/business/ai-widget/` (linked from the business menu): config list with monthly usage, create dialog (display name, logo **URL** -- file upload rides Phase 4's attachment endpoint, brand colour, custom instructions, monthly limit), copyable `<iframe>` embed snippet, deactivate with confirm.

---

## Phase 4: Knowledge Rack + Admin Tools — ✅ DONE 2026-08-18

Vector search and admin knowledge management. **Major deviation:** the knowledge
corpus, admin CRUD, crawling, and embedding pipeline had already been built in the
separate AI Knowledge track (`superadmin/ai-knowledge` module + `superadmin/20260814_001_ai_knowledge.ts`
migration + `/admin/data/ai-knowledge` console). Phase 4 therefore did NOT create the
planned `globalyapp` knowledge tables — it wired the counsellor's RAG into the existing
superadmin corpus instead.

### Superseded by the AI Knowledge track (already live before Phase 4)

- [x] **pgvector** -- enabled in `superadmin/20260814_001_ai_knowledge.ts` (plus pg_trgm). Embeddings are `vector(3072)` (`gemini-embedding-001`), HNSW-indexed via halfvec cast — not the planned 768-dim IVFFlat.
- [x] **Knowledge tables** -- `superadmin.ai_knowledge_visa / _faqs / _country_guides / _categories / _sources / _documents` + `data_verification_queue`. Different (richer) columns than planned; `active` flag instead of `is_active`.
- [x] **Embedding pipeline** -- `data-extraction/lib/llm-client.ts` `embed()` + the knowledge-crawl worker (`job:ai-knowledge-crawl`) embed whole documents (first 8k chars). No chunking service — revisit only if long-document recall proves poor.
- [x] **Admin CRUD routes** -- `/api/v3/admin/ai-knowledge/*` (superadmin-guarded), including verification queue, rack categories/sources/documents, and crawl dispatch.
- [x] **Admin knowledge management UI** -- `/admin/data/ai-knowledge` console (visa / FAQs / guides / queue / rack tabs).

### Built in Phase 4

- [x] **RAG wiring** (`rag.service.ts`, `knowledge.repository.ts`) -- three keyword searches over curated content (`searchKnowledgeVisas`, `searchKnowledgeFaqs`, `searchCountryGuides`, per-keyword `ILIKE` OR-matching) plus semantic Rack search: query → `embed()` → `superadmin.match_ai_knowledge_documents()` (top 4, markdown capped at 1500 chars each). New context blocks: VISA KNOWLEDGE, FAQs, COUNTRY GUIDES, KNOWLEDGE ARTICLES. Rack search is skipped in embed mode (crawled institution updates must not surface under another business's brand) and when `GEMINI_API_KEY` is missing; curated content stays available everywhere.
- [x] **`POST /api/v3/ai-chat/attachments`** -- multipart upload via `shared/storage` (shared MIME allowlist + `GCS_MAX_FILE_SIZE_MB`), path `ai-chat/{userId}/attachments/…`, returns `{ storage_path, filename, mime_type, size }`. *Attachment contents are stored with the message but not yet fed to Gemini — multimodal input is a follow-up.*
- [x] **Attachment UI in composer** -- paperclip + hidden file input + removable chips (max 3) inside `ChatInput` behind an `allowAttachments` prop (off for the unauthenticated embed widget). Files upload on send, storage paths ride in the message's `attachments` array; `ChatMessage` renders attachment chips. Skipped the planned dropdown `ComposerToolsMenu` — one button, one action.
- [x] **Feedback can be cleared** -- `PATCH /messages/:id/feedback` now accepts `null` (toggle-off), matching the UI.
- [x] **`done` SSE event** -- authed chat now emits `event: done` with `{ message_id, session_id }` before `data: [DONE]`, so the frontend can attach feedback to the streamed message.
- [x] **Frontend real-api realignment** *(bug found during phase 4)* -- `personal/ai/apis/real-api.ts` still targeted the pre-implementation contract (`POST /ai/chat`, `/ai/sessions`, form-style SSE events, `up/down` feedback on the wire) and only worked in mock mode. Rewritten against the real backend: `/ai-chat/*` paths, embed-widget SSE protocol (named events + OpenAI-format deltas + `[DONE]`), wire-card → `CourseCard` mapping, `positive/negative` ↔ `up/down` feedback mapping.

---

## Dependencies

| Dependency | Phase needed | Owner | Status | Fallback if missing |
|---|---|---|---|---|
| `GEMINI_API_KEY` configured per environment | Phase 1 | DevOps | Config key exists in `config.ts` | AI features return 400 "not configured" (graceful, same as feed AI) |
| Extracted data populated in `superadmin` schema | Phase 1 | Data Extraction module | Tables exist, data being populated | RAG returns no course cards; AI still answers conversationally |
| `countries` table populated | Phase 1 | Existing migration `20260722_001_countries.ts` | Done | Country-based filters return empty |
| `platform_user_profiles` + sub-resource tables | Phase 1 | Existing migrations | Done | Profile context is empty; AI asks qualifying questions |
| `businesses` table populated | Phase 3 | Existing migration `20260804_001_businesses.ts` | Done | Embed configs cannot be created |
| `pgvector` Postgres extension | Phase 4 only | DBA / DevOps | Enabled by `superadmin/20260814_001_ai_knowledge.ts` | Knowledge Rack and vector search blocked; keyword search covers everything else |
| GCS storage configured | Phase 4 (attachments) | DevOps | Config keys exist | File uploads return 400; chat works without attachments |
| Chargebee webhook integration | Future (credit purchases) | Billing epic | Config keys exist, integration not built | Credit purchases blocked; free + admin-granted credits work |

---

## Migration Sequence (respecting FK dependencies)

### Phase 1

```
20260816_001_ai_embed_configs       ← references businesses(id)
20260816_002_ai_counselor_sessions  ← references platform_users(id), ai_embed_configs(id)
20260816_003_ai_counselor_messages  ← references ai_counselor_sessions(id)
```

Note: `ai_embed_configs` is created in Phase 1 even though embed mode is Phase 3. This avoids an ALTER TABLE to add the FK to `ai_counselor_sessions` later. The table simply has no rows until Phase 3.

### Phase 2

```
20260816_004_credit_wallets             ← references platform_users(id)
20260816_005_credit_transactions        ← references credit_wallets(id)
20260816_006_ai_guest_chat_sessions     ← references ai_embed_configs(id), ai_counselor_sessions(id)
```

### Phase 3

No new migrations. Phase 3 uses `ai_embed_configs` (created in Phase 1) and `ai_counselor_sessions` (Phase 1) + `ai_guest_chat_sessions` (Phase 2). Only backend routes and service logic are added.

### Phase 4

```
(pgvector extension)
20260816_007_ai_knowledge_visa            ← references countries(id)
20260816_008_ai_knowledge_faqs            ← standalone
20260816_009_ai_knowledge_country_guides  ← references countries(id)
20260816_010_ai_knowledge_documents       ← references platform_users(id), requires pgvector
```

Note: Knowledge tables (`ai_knowledge_visa`, `ai_knowledge_faqs`, `ai_knowledge_country_guides`) can be created in Phase 1 if admin-curated data should be available earlier. Move migrations up and keyword-search these tables in `rag.service.ts` from Phase 1. The migration numbering allows this reordering.
