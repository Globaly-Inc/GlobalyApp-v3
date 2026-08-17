# GlobalyApp — Full Application Migration & Rebuild Plan (V1/V2 → V3)

**Date:** 2026-08-17 · **Re-verified against `staging` (2026-08-17, post-merge of PRs #49–#53, then #42 ai-knowledge + #48 ai-counsellor-p1)** · **Status:** awaiting approval — no implementation starts until this plan is signed off.
**Replaces:** the 2026-08-16 plan (`one-off-migration.pdf`) as the master plan. Its decisions are preserved except where repo inspection proved otherwise (each such change is flagged `CHANGED vs PDF`).
**Updated 2026-08-17 (extraction cross-audit):** §3.4 reworked after a full V1/V2/V3 extraction feature audit — extraction is no longer classified flat DONE; a verified gap table replaces the one-liner, and decision #4 is corrected (`extraction_job_events` is a live V3 table; only its V1 rows are skipped).
**Companion:** [2026-08-17-v1-v3-one-off-migration-plan.md](./2026-08-17-v1-v3-one-off-migration-plan.md) — the detailed **data**-migration annex (staging architecture, waves W0–W7, gates, cutover). This document is the whole-application plan; the annex remains the table-level authority for data movement.

---

## 0. Repository roles (CONFIRMED by owner, 2026-08-17)

The original task brief mislabeled `GlobalyApp` as the target; inspection showed it is the V1 Lovable/Supabase SPA (`src/pages/`, `supabase/functions/` with 106 edge functions). The owner has confirmed the roles below.

| Role | Repo |
|---|---|
| **V1 — production data source (read-only)** | `Globalyhub/GlobalyApp` |
| **V2 — design/tooling reference (read-only)** | `Globalyhub/GlobalyApp-V2` |
| **V3 — target, all implementation happens here** | `Globalyhub/GlobalyApp-v3` (this repo) |

### 0.1 Branching & delivery strategy (added 2026-08-17)

All migration + rebuild work for this program ships **on a dedicated integration branch cut from the current `staging` branch — `staging-mvp`** — because the features migrate all at once, not wave-by-wave into `staging`.

- `staging-mvp` is cut once from `staging` (at the re-verification point or later) and is the base for every wave.
- Each wave/agent works on a short-lived branch off `staging-mvp` (existing convention: `dev-feat-<scope>`), PRs back into `staging-mvp`. No cross-agent file overlap within a wave; full test suite green on `staging-mvp` after each wave integrates.
- `staging` continues to receive ordinary product work; **rebase/merge `staging` into `staging-mvp` at every wave boundary** so cutover never happens from a stale base.
- `staging-mvp` → `staging` → `main` merges happen once at program end (cutover rehearsal green), not per wave.
- In-flight branches that overlap program waves must land into `staging` or `staging-mvp` **before** their wave dispatches, so waves build on them, not beside them. ~~`dev-feat-ai-knowledge`, `dev-feat-ai-counsellor-p1`~~ **landed 2026-08-17** (PRs #42, #48). Remaining: `dev-feat-ai-counsellor-p2` (before E2), `dev-feat-personal-my-services` booking flow (before G3).
- Migration scripts, `mapping.json`, and the verify gates live on `staging-mvp` too — anything not on the branch can't be re-run at cutover.

---

## 1. Executive summary

**Current state** (re-verified on `staging`, 2026-08-17). V3 has a solid vertical slice: OTP/JWT auth, platform users + sub-profiles, businesses with tenant-schema provisioning, agents/roles/permissions, social feed (no comments), blog (public module + admin CMS), the full extraction console, and — new since the PDF — public geo/search/compare (`geo`, `search` modules + `(web)` pages), the student-services marketplace (`other-services` module, merged), business branches/representations/partners, a thin tenant `business_services` table, `student_jobs`, and soft-delete across modules. **Newly merged (PRs #42/#48):** the AI-knowledge console (`superadmin/ai-knowledge` module + crawl worker + `ai_knowledge_*` tables) and AI-counsellor phase 1 (`ai-counsellor` module: SSE chat, RAG over the knowledge base, sessions/messages tables, `personal/ai` real API). AI-counsellor phase 2 remains in flight on `dev-feat-ai-counsellor-p2`. The frontend still has **more pages than the backend has endpoints** — admin monitoring/revenue/marketing pages and parts of the personal portal render against `mock-data.ts` files. There are zero tests and no CI gates. Migration tooling in-repo is one script ([backend/scripts/import-v2.ts](../../backend/scripts/import-v2.ts)).

**Target state.** A clean V3 application at 100% V1 feature parity (per the 2026-08-16 decision), with all V1 production data migrated, verified by automated parity gates, and V1 decommissioned.

**Philosophy — three activities, never mixed:**
- **A. DATA MIGRATION** — V1 production rows → V3, via the two-stage staging pipeline in the annex (V2's proven extract/verify tooling → local transforms into V3 shape). One-off, idempotent, rehearsable, auditable.
- **B. FEATURE REBUILD** — missing functionality implemented natively in V3's existing patterns (module layout, tenant plugin, error classes, zod schemas, `real-api.ts` frontend clients). Never a port of V1/V2 files.
- **C. V2 DESIGN ADOPTION** — where V2 designed a feature better (RAG, AI metering, SSE messaging, typed route contracts, verify-db parity gate), the V2 **design** is the spec while the **implementation** is V3-native.

**Major risks:** zero-test quality floor (mitigated by Wave A before anything else); silent-wrong `country_id`s already in the DB; 19 live supabase.co URLs; V1 snapshot drift; the frontend's mock-by-default masking missing backends; an unmerged marketplace branch that could cause double-building (§3 note).

**Major decisions preserved from the PDF:** V3 architecture is inviolable; 100% parity (Wave G); institutions become claimable (nullable owner); academic tests via discriminator column; canonical reference tables in `public`; drop `scrape_smoke_results`, and skip V1 `extraction_job_events` **rows** only (the V3 table stays — workers write it and the job-detail UI reads it); messaging rebuilt not migrated.

---

## 2. Repository architecture comparison

| | V1 (`GlobalyApp`) | V2 (`GlobalyApp-V2`) | V3 (this repo) |
|---|---|---|---|
| Backend | 106 Supabase edge functions (`supabase/functions/`) | Fastify monolith, 65 route files (`apps/core-api/src/routes/`), Drizzle (206-table `schema.ts`), separate `apps/ai-service` | Fastify 5 + Knex, domain modules (`backend/src/modules/{auth,platform-users,businesses,agents,feed,superadmin}`), LavinMQ workers (`backend/src/workers/`) |
| Database | Supabase Postgres, 199 tables, single schema, uuid PKs | Single schema, uuid PKs, column-compatible with V1 | One DB, three schema tiers: `public` (master), `superadmin`, per-tenant UUID schemas; serial int PKs; migrations in [backend/database/migrations/](../../backend/database/migrations/) (`globalyapp/`, `superadmin/`, `business/`) |
| Frontend | Vite/Lovable SPA, `src/pages/{admin,business,personal,public,student,auth}` | Vite SPA (`apps/web`) | Next.js App Router, portal groups `frontend/src/app/{admin,business,personal,(web),auth,signup,geo}`, per-feature `apis/real-api.ts` + `apis/mock-data.ts` |
| Auth | Supabase auth + edge fns | Firebase auth (`firebase-auth.ts`) — **do not adopt** | OTP + JWT + refresh + switch-account — **authoritative** |
| Storage | Supabase storage (13 buckets) | GCS | GCS via storage service + `uploaded_files` |

**Carry forward:** V1 → data + behavioral truth only. V2 → migration tooling verbatim (stage 1), schema.ts as *schema spec* (transformed to V3 conventions), route files as *endpoint contracts*, RAG/metering/SSE designs, `route-auth.json` as the auth-tightening allowlist. **Never carried:** V1/V2 file structure, V2 Firebase auth, V2 Drizzle, uuid PKs, V1's single-schema tenancy.

---

## 3. Complete feature inventory & gap matrix

Classifications: **DONE** (exists in V3, works) · **PARTIAL** · **MOCK-ONLY** (V3 frontend page exists, no backend — the phantom-endpoint class) · **MISSING**. Activity codes: **[M]** data migration · **[R]** rebuild · **[V2]** V2 design adoption. Wave = build wave (A–G) / data wave (W1–W7 per annex).

### 3.1 Identity / Platform

| Feature | V1 evidence | V2 ref | V3 state | Activities | Wave |
|---|---|---|---|---|---|
| OTP auth, sessions, switch-account | `send-otp`, `verify-otp` fns | `firebase-auth.ts` (rejected) | **DONE** — [backend/src/modules/auth](../../backend/src/modules/auth) | [M] identity reconcile | W1 |
| Users, profiles, onboarding | prod: 22 users | `student-profile.ts`, `me-summary.ts` | **DONE** — [backend/src/modules/platform-users](../../backend/src/modules/platform-users) | [M] | W1 |
| Qualifications / language tests / work experience | 11+8+9 rows | `student-profile-details.ts` | **DONE** | [M] | W3 |
| Academic tests (SAT/GRE/GMAT) | 9 rows | — | **MISSING** (1 column) | [R] discriminator on `platform_user_language_tests` | B / W3 |
| Uploaded files (GCS) | 77 storage objects | `storage.ts` | **DONE** | [M] rehost + URL rewrite | W6 |

### 3.2 Businesses & tenancy

| Feature | V1 evidence | V2 ref | V3 state | Activities | Wave |
|---|---|---|---|---|---|
| Registration → tenant provisioning, team/agents/invitations/roles/permissions | 55 businesses | `business-team.ts`, `invites.ts`, `business-membership.ts` | **DONE** — [businesses](../../backend/src/modules/businesses), [agents](../../backend/src/modules/agents), tenant migrations in [database/migrations/business/](../../backend/database/migrations/business/) | [M] | W1 |
| Business profile | — | `business-profile.ts` | **DONE** | [M] | W1 |
| Business dashboard | `BusinessDashboard.tsx` | `business-dashboard.ts` | **MOCK-ONLY** (`app/business/portal`) | [R][V2] | C |
| Branches | 27 rows | — | **DONE** — tenant table [20260811_001_business_branches.ts](../../backend/database/migrations/business/20260811_001_business_branches.ts) + [branches.routes.ts](../../backend/src/modules/businesses/routes/branches.routes.ts). ⚠ `CHANGED vs PDF`: implemented tenant-scoped, not master — acceptable (a branch belongs to one business), but the cross-tenant *sharing* tables (`service_branch_sharing`, `service_study_option_branches`) must still be master | [M] | W7 |
| Representations (cross-tenant graph) | 10 rows | — | **DONE** — master table [20260812_001_business_representations.ts](../../backend/database/migrations/globalyapp/20260812_001_business_representations.ts) + partners/representations routes | [M] | W7 |
| Institutions claimable model | 39 unclaimed businesses hold 363/402 services | — | **BLOCKED** — `institutions.platform_user_id/email/subdomain` NOT NULL ([20260805_001_institutions.ts](../../backend/database/migrations/globalyapp/20260805_001_institutions.ts)) | [R] nullable owner + `claim_status`; `AdminClaimRequests.tsx` flow | B2 |

### 3.3 Catalog

| Feature | V1 evidence | V2 ref | V3 state | Activities | Wave |
|---|---|---|---|---|---|
| Tenant services CRUD (courses, fees, intakes, eligibility, study options) | 402 services, ~1,900 rows / 25 tables | `business-services.ts`, `admin-service-details.ts` (endpoint spec) | **PARTIAL** — thin tenant `business_services` listing table ([20260811_002](../../backend/database/migrations/business/20260811_002_business_services.ts), single table) + [services.routes.ts](../../backend/src/modules/businesses/routes/services.routes.ts) + admin oversight routes; the fee/intake/eligibility/study-option child+junction family is still missing | [R][V2][M] | C1 / W7 |
| Categories, catalog, schema fields | — | `admin-catalog.ts`, `admin-reference.ts` | **DONE** — [superadmin/platform/categories](../../backend/src/modules/superadmin/platform/categories) | [M] reference data | W2 |
| Countries / cities | 24→198, 332→2,078 | `geo.ts` | **DONE** (tables) — data incomplete, known-wrong FKs | [M] first transform | W1 |
| Reference data (degree levels, areas of study, fee types, issuing orgs, accreditations) | — | `admin-reference.ts` | **DONE** (tables, [20260811_*](../../backend/database/migrations/globalyapp/)) | [M] | W2 |
| Public catalog + search + facets (institutions, courses, agents) | V1's entire public surface (`SearchPage`, `InstitutionProfilePage`, `CountryPage`, `CityPage`…) | `search.ts`, `courses.ts`, `institutions.ts`, `agents.ts` | **PARTIAL** — [geo](../../backend/src/modules/geo) + [search](../../backend/src/modules/search) modules and `(web)/{search,compare,country/[slug],course/[slug],services}` pages shipped (PR #51); institution/agent public profiles, facet completeness, and SEO pages remain | [R][V2] | C2 |
| Publish pipeline (staging → live catalog) | implicit (`push-to-globaly`) | `admin-catalog-oversight.ts` | **PARTIAL** — [promote.routes.ts](../../backend/src/modules/superadmin/data-extraction/routes/promote.routes.ts) stubs | [R] | C2 |

### 3.4 Extraction (V3's strong suit — DONE core, gapped tail)

**Core DONE:** jobs/queue/staging/review/junctions (32+ tables, 87 endpoints, 6 LavinMQ workers), AgentCIS import, aggregators, agent sources, PDF extraction, AI memory (pgvector, better than V2's 768-vs-1536 embedding mismatch), full admin console — all under [superadmin/data-extraction](../../backend/src/modules/superadmin/data-extraction) with schemas in [migrations/superadmin/](../../backend/database/migrations/superadmin/). Data: **W4 = check-then-delta** — `import:v2` rehearsals may already have loaded the corpus (annex decision #5).

**Verified gaps** (V1/V2 cross-audit, 2026-08-17 — each confirmed in code, not inferred from docs):

| Gap | Reference implementation | V3 state | Wave |
|---|---|---|---|
| Promote staging → live catalog | V1 `push-to-globaly` (875 LOC, 5-phase transactional), V2 `extraction-promote.ts` + `promote-courses.ts` | **STUB** — [promote.service.ts](../../backend/src/modules/superadmin/data-extraction/services/promote.service.ts) marks job `exported`, writes nothing; blocked on C1 catalog tables. Port the content-hash idempotency keys (`feeKey`/`eligKey`/`intakeKey`, website/name normalization) | C2 |
| Visa/MARA promote | V1/V2 RPCs `promote_visa_to_service`, `promote_mara_to_business` → `visa_service_details`, `agent_mara_details` | **STUB** — immigration repository returns the input id; neither target table exists in any V3 migration. Fix V1's `full_name`→`agent_name` bug when porting (V1's MARA RPC raises on every promote) | G1 |
| Visa/MARA extract launch | V1 `extract-visas` (gemini-2.5-pro), `extract-mara-agents` (Firecrawl + MARN dedupe + confidence scoring) | **503 stub** (matches V2's dormant state). V1's own launch wiring is broken (param-name mismatches → always 400) — port the extractor logic, rewire the request contract | G1 |
| `merge-duplicates` | V1/V2 RPC `merge_extraction_job_duplicates(job, dry_run)` with preview→confirm flow | **STUB** returns empty. RPC lives only in the V1 database — V1 Supabase migrations are the source to port from | C2 |
| Quality validator | V1 final-batch LLM audit (`flag_quality_issues`: duplicates, fee anomalies, missing required fields, contradictions, nonsensical names → auto-flag courses) | **MISSING** — no equivalent anywhere in V3 | C2 |
| Context-ingest step | V1 `ingest-context`: supporting docs → "Job Context Bundle" feeding every downstream prompt | **MISSING** — `PIPELINE_STEPS` has no `context_ingest`; `document-extractor.ts` lib and `supporting_documents` schema exist, but nothing assembles the bundle | C2 |
| Scheduler trigger | V1 pg_cron (`reap-stalled-jobs` 1 min, `schedule-agent-runs` 15 min); V2 Cloud Scheduler | `extraction-schedule.worker.ts` is one-shot by design and **nothing invokes it** — no cron container in compose. Heartbeat/stall fields exist; only the periodic trigger is absent | C2 |
| Cross-app endpoints | V1 `export-courses` (Bearer-authed RAG feed for GlobalyAI), `receive-institution-data` (inbound webhook → staging) | **MISSING** — confirm still needed before building (V3's knowledge base is internal; the external consumer may be obsolete) | G5 |
| 8 service-vertical tables | — (V3-only addition: accommodation/insurance/banking/visa-services/test-prep/career/translation/transport) | Tables + jobs-repo whitelist exist; **no dedicated routes or UI tabs** | G |
| Extraction tests | V2 shipped ~170 tests (`extraction-review/control/staged/extras/immigration/promote/triggers`); V1 tested AgentCIS mappers | **Zero** — no coverage on scraper, LLM parsing, staging writer, fee matcher, junction assignment | A |
| Docs drift | — | `extraction-parity.md` predates the embedding migration, aggregator/AgentCIS/step/schedule routes, and the vertical tables; module README says `gemini-2.5-flash` vs `config.ts` default `gemini-3.5-flash` | A |

**Deliberate divergences (not gaps — do not "fix"):** all-Gemini instead of V1's gpt-5/gpt-5-mini-via-Lovable mix; polling instead of Supabase realtime (V2 made the same call); `scrape_smoke_results`/scrape-health dropped by decision #4; app-layer auth instead of RLS.

### 3.5 Engagement

| Feature | V1 evidence | V2 ref | V3 state | Activities | Wave |
|---|---|---|---|---|---|
| Enquiries (distance distribute, credit unlock, digest) | `distribute-enquiry`, `unlock-enquiry`, `send-enquiry-digest` fns — monetised | `enquiries.ts` | **MOCK-ONLY** (`admin/monitoring/enquiries` page) | [R][M] | D1 / W7 |
| Messaging | `start-chat`, `invite-chat-participant`; 9 rows | `messages.ts` (SSE) | **MOCK-ONLY** (`personal/messages`) | [R][V2] — rebuild, **no migration** (PDF decision kept) | D2 |
| Events + ticketing | `create-event-payment`, `verify-event-payment`; 8 events | `events.ts`, `business-events.ts` | **MOCK-ONLY** (`admin/monitoring/events`) | [R][M] | D3 / W7 |
| Notifications | 16 rows + UI | `user-prefs.ts`, `push-tokens.ts` | **MOCK-ONLY** (`personal/notifications`) | [R][V2] | D3 |
| Feed comments | `feed_comments` | `feed.ts` | **MISSING** (feed itself DONE) | [R][M] | D4 / W5 |
| Public student profiles | `StudentPublicProfilePage.tsx` | `students-public.ts` | **MISSING** | [R] | D4 |
| Referrals | `claim-referral-reward` | — | **MOCK-ONLY** (`admin/revenue/subscriptions/referrals`) | [R][M] | D / W7 |
| Eligibility checker | `check-eligibility` | — | **MISSING** | [R] | D |
| Compare tray | — | V2-native | **DONE** — `(web)/compare` (PR #51) | — | — |

### 3.6 Money

| Feature | V1 evidence | V2 ref | V3 state | Activities | Wave |
|---|---|---|---|---|---|
| Credits, wallets, ledger | `purchase-credits`, `verify-credit-purchase`, `purchase-coins`, `verify-coin-purchase`; 162 txns | `credits.ts`, `business-wallet.ts`, `business-ai-credits.ts` | **MOCK-ONLY** (`personal/credits`, `admin/revenue/…/credits`) | [R][V2][M] | C3 / W7 |
| Subscriptions, plans, coupons | `create-subscription-checkout`, `verify-subscription`, `subscription-portal`, `check-subscription-access`, `grant-subscription-credits`; 33 subs, 5 plans | `subscriptions.ts`, `admin-subscriptions.ts`, `pricing.ts` | **MOCK-ONLY** (`admin/revenue/subscriptions/*` pages) | [R][V2][M] | C3 / W7 |
| Stripe webhooks | implicit in verify-* fns | `stripe-webhook.ts` (idempotency design) | **MISSING** | [R][V2] | C3 |
| FX rates cache | — | `fx-rates.ts` | **MISSING** | [R][V2] | G5 |

### 3.7 Learning & counselling

| Feature | V1 evidence | V2 ref | V3 state | Activities | Wave |
|---|---|---|---|---|---|
| LMS / training | 36 programs, 341 chapters; `training-ai-tools`, `grade-assessment`, `lms2-ai`, `lms-course-invite`, `training-reminders` | `lms-enrollment.ts`, `lms-quiz.ts`, `lms-student.ts`, `lms-invitations.ts`, `training.ts`, `business-training.ts` | **MOCK-ONLY** (`personal/learning`) | [R][V2][M] | E4 / W7 |
| Scribe (transcription/coaching) | `scribe-consent/-save/-review/-coaching/-translate/-token` fns; 700 transcripts (3rd most-used) | — (no V2 route — **V1 is the reference**) | **MISSING** | [R][M] consent log verbatim (legal) | E3 / W7 |
| AI counsellor | `ai-counselor`, `business-ai-counselor`, `migrate-guest-chat`; 301 messages | `apps/ai-service` (ReAct, metering, fail-closed) | **PARTIAL** — phase 1 merged (PR #48): [ai-counsellor](../../backend/src/modules/ai-counsellor) module (SSE chat, RAG, sessions/messages), migrations [20260816_002/_003](../../backend/database/migrations/globalyapp/), `personal/ai` on real API. Remaining: phase 2 (`dev-feat-ai-counsellor-p2`, in flight — land before E2), business counsellor, guest-chat migration, metering | [R][V2][M] | E2 / W7 |
| Knowledge base + RAG | `ai-knowledge-crawl-source/-discover/-embed/-suggest-rows`; 207 docs, 58 sources | V2 RAG (`knowledge_chunks`, hybrid retrieval, recall@5 gate) | **DONE (core)** — merged (PR #42): [superadmin/ai-knowledge](../../backend/src/modules/superadmin/ai-knowledge) module (rack/content routes, crawl worker) + [20260814_001_ai_knowledge.ts](../../backend/database/migrations/superadmin/20260814_001_ai_knowledge.ts) (`ai_knowledge_{visa,faqs,country_guides,categories,sources,documents}` + `data_verification_queue`) + `admin/data/ai-knowledge` UI. E1 = extend + V2 quality gates (recall@5), not greenfield | [R][V2][M] | E1 / W7 |
| SOP generator | used in prod | V2 redesign (versioned docs) — UNVERIFIED exact V2 path | **MISSING** | [R][V2] | E |

### 3.8 Full-parity tail (Wave G — zero/near-zero V1 rows, schema-spec = V2 `schema.ts`)

| Feature | V1 fns | V2 route spec | V3 state | Wave |
|---|---|---|---|---|
| Ads (campaigns, impressions, leads) | `record-ad-impression`, `record-ad-lead` | `ads.ts` | MOCK-ONLY (`admin/marketing/ads`) | G3 |
| Jobs board | `job-ai-assist`, `job-match-score` | `jobs.ts`, `admin-jobs.ts` | **PARTIAL** — `student_jobs` table ([20260816_002](../../backend/database/migrations/globalyapp/20260816_002_student_jobs.ts)) + [search/student-jobs.routes.ts](../../backend/src/modules/search/routes/student-jobs.routes.ts); posting/applicants/AI-assist remain | G2 |
| Applications + charges | `charge-application` | `business-application-charges.ts` | MOCK-ONLY (`admin/revenue/…/application-charges`) | G2 |
| Scholarships | — | `scholarships.ts` | MOCK-ONLY (`admin/monitoring/scholarships`) | G1 |
| Student services marketplace | `create-service-payment`, `verify-service-payment`, `complete-service-order` | `student-services.ts` | **DONE (core)** — merged: [other-services](../../backend/src/modules/other-services) module (my-services + public-services routes), master tables `other_services`/`other_service_categories`, `personal/earn/{services,ambassadors,referrals}` + `(web)/service/[serviceId]` pages. Remaining: booking-request flow on unmerged `dev-feat-personal-my-services` — land into `staging-mvp` first | G3 (reduced) |
| Visas/MARA public directory | `usePublicVisas`, `usePublicMaraAgents`, `useVisaEligibilityMatch` hooks + `search_visas`/`get_visa_detail`/`search_mara_agents`/`get_mara_agent_detail` RPCs | `visas.ts` | Backend **staging** DONE (extraction); promote RPCs stubbed, `visa_service_details`/`agent_mara_details` tables missing, public API/pages MISSING (see §3.4 gap table) | G1 |
| Ambassador ops | 10 fns (`create-ambassador-connect`, `process-ambassador-payout`, `process-ambassador-timeout`, `send-ambassador-digest`, …) | `ambassador*.ts` (4 files) | MOCK-ONLY (`admin/monitoring/ambassador-programs`) | G4 |
| Training certificates/gamification | — | `training.ts` | MISSING | G4 |
| Favorites / saved filters | `StudentFavorites.tsx` | `student-activity.ts` (UNVERIFIED scope) | MISSING | G1 |
| AI-embed widget | `ai-embed-content`, `ai-embed-validate` | — | PARTIAL — `ai_embed_configs` table merged ([20260816_001](../../backend/database/migrations/globalyapp/20260816_001_ai_embed_configs.ts), rode in with PR #48); widget endpoints/embed script MISSING | G4 |
| Waitlist, push notifications | — | `waitlist.ts`, `push-tokens.ts` | MISSING | G5 |
| Admin monitoring endpoints (the 10 phantom backends) | — | `admin-ops.ts`, `admin-users.ts`, `admin-business.ts` | Frontend pages already exist (verified: `admin/monitoring/{enquiries,events,jobs,moderation,scholarships,training,ambassador-programs,monitoring-logs}`) | C4 |

---

## 4. V1 → V3 data mapping

Table-level detail lives in the annex; the mechanism in one paragraph: **stage 1** extracts all 199 V1 tables byte-faithfully into a `v1_staging` schema using V2's proven HTTP tooling (`GlobalyApp-V2/migration/{generate-manifest,export-import,verify-db,storage-migrate}.mjs` + `db/scripts/import-users.mjs`) and gates it with V2's four parity checks; **stage 2** transforms staging → V3 shape locally (uuid→serial via resolver maps, table renames/splits, master/superadmin/tenant placement) as idempotent, transactional, dry-run-default TS transforms driven by a `mapping.json` that dispositions **every one of the 199 tables** as `transform | drop(reason) | blocked(dependency)`. Coverage arithmetic (source rows = target rows + reason-coded skips) is Gate 2.

Key non-1:1 mappings (from the PDF, verified against V3 schema):

| V1 | V3 target | Schema | Notes |
|---|---|---|---|
| `profiles`/auth users | `platform_users` + auth tables | public | uuid→serial, resolver `mig.map_users` |
| `businesses` | `businesses` (+ `meta->>'v1_business_id'`) | public | resolver `mig.map_businesses` → tenant schema name |
| unclaimed businesses | `institutions` | public | needs claimable-model change (B2) |
| `student_academic_tests` | `platform_user_language_tests` + `category` col | public | merge, discriminator |
| `business_categories` | `fee_types` (partial) + `business_categories` | public | split |
| `core_field_settings` | `schema_fields` | public | rename+reshape |
| `admin_logs` / `audit_events` | `admin_audit_logs` / `audit_logs` | superadmin / public | rename |
| services + 24 child/junction tables | new tenant services family | **tenant** | W7, blocked on C1 schema |
| `business_branches`, `representations`, `service_branch_sharing`, `service_study_option_branches`, `business_allowed_categories` | same names | **public (master)** | cross-tenant FKs can't live in one tenant's schema |
| `messages`/`chat_messages` | — | — | drop (rebuild D2); defect D3 |
| `scrape_smoke_results` | — | — | drop with reason (feature not carried to V3) |
| `extraction_job_events` | `extraction_job_events` (table exists, live) | superadmin | **skip rows, keep table** — V1 telemetry has no value post-migration, but the V3 table is written by workers and read by `GET /jobs/:id/events` + the job-detail timeline UI |

**V3 tables with no V1 source** (seed/build only): ai_knowledge_*, extraction service verticals beyond V1's, schema_field_values, user_business_index, everything Wave G adds.

## 5. ID resolution strategy

Resolver maps materialized as `mig.*` views/tables during W1, then reused by every transform:

| Mapping | Key | Mechanism |
|---|---|---|
| V1 user uuid → `platform_users.id` | email (natural) | `mig.map_users`; upsert converges the 24 pre-migrated users |
| V1 business id → `businesses.id` + tenant schema | business natural key | `mig.map_businesses`, stamped in `businesses.meta->>'v1_business_id'` |
| V1 business (unclaimed) → `institutions.id` | name+country natural key | after B2 claimable model |
| V1 country code → `countries.id` | ISO-2 (normalizer handles ISO-3/name/case drift — defect D7) | pure helper under `--self-check` |
| V1 city → `cities.id` | (country_id, name) | after W1 load |
| V1 category/service/course → V3 ids | per-table natural keys in `mapping.json` | W2/W7 |

Rule (unchanged): **unresolved references land in a reason-coded report table, never silently NULL.** NULL is written only where the V3 schema declares it valid business state (e.g. institution owner).

---

## 6. Database change plan

**Placement rules:** shared/global + cross-tenant graph → `public` (master) · platform-operations + extraction + AI-knowledge → `superadmin` · business-owned operational data → tenant schema (provisioned by [migration-runner.ts](../../backend/src/workers/migration-runner.ts) from [database/migrations/business/](../../backend/database/migrations/business/)).

New migrations required, by wave (all follow existing file conventions, serial PKs, timestamps, soft-delete where the module family already uses it):

| Wave | Schema dir | Tables |
|---|---|---|
| B2 | `globalyapp/` | alter `institutions` (nullable owner, `claim_status`), `claim_requests`; `service_branch_sharing`, `service_study_option_branches`, `business_allowed_categories` (branches + representations already exist — see §3.2); alter `platform_user_language_tests` (+`category`) |
| C1 | `business/` | extend the existing thin `business_services` with the fees/intakes/eligibility/study-options children + junctions (mirror the proven `extraction_*` shapes) |
| C2 | `globalyapp/` | public catalog projections/slugs if needed (prefer serving from existing tables — no new table without proof) |
| C3 | `globalyapp/` + `business/` | plans, coupons, stripe_events (idempotency) in public; wallets, transactions per tenant |
| D | `globalyapp/` + `business/` | enquiries + unlocks; conversations/messages; events + tickets + registrations; notifications; feed_comments |
| E | `superadmin/`+`globalyapp/`+`business/` | ~~knowledge tables~~ shipped ([20260814_001_ai_knowledge.ts](../../backend/database/migrations/superadmin/20260814_001_ai_knowledge.ts), pgvector) · ~~counsellor sessions/messages~~ shipped in **public**, not superadmin ([20260816_002/_003](../../backend/database/migrations/globalyapp/)) — acceptable, they're platform-user-owned. Remaining: ai_usage_events (metering), scribe_* (incl. consent log), lms_*/training_* |
| G | per feature | from V2 `apps/core-api/src/db/schema/schema.ts`, transformed to V3 conventions. G1 explicitly includes `visa_service_details` (1:1 `service_id`) + `agent_mara_details` (1:1 `business_id`) — the visa/MARA promote targets that exist in V1 but in no V3 migration (§3.4) |

**Duplicate-table reconciliation:** reference tables exist in both `superadmin.reference_tables` and `public` (`degree_levels`, `fee_types`, `accreditations`) — canonical = **public** (decision #3); superadmin keeps only ops-owned copies if a real consumer exists, else drop.

## 7. Backend implementation plan

Every feature lands as a V3 module following the existing shape (`routes/` + services + zod schemas + tenant plugin where scoped). V2 route files are **contracts** (paths, payloads, rules), never source to copy.

| Wave | V3 location | Built from |
|---|---|---|
| C1 services | extend [businesses/routes/services.routes.ts](../../backend/src/modules/businesses/routes/services.routes.ts) + [superadmin/platform/business-services](../../backend/src/modules/superadmin/platform/business-services) (both exist) | V2 `business-services.ts`, `admin-service-details.ts` |
| C2 public catalog | extend the existing [geo](../../backend/src/modules/geo) and [search](../../backend/src/modules/search) modules (public institution/agent profiles, facets); promote flow completes [promote.routes.ts](../../backend/src/modules/superadmin/data-extraction/routes/promote.routes.ts) | V2 `search.ts`, `courses.ts`, `institutions.ts`, `agents.ts` |
| C3 billing | `backend/src/modules/billing/` *(NEW)* + Stripe webhook route | V2 `credits.ts`, `subscriptions.ts`, `stripe-webhook.ts`, `pricing.ts` |
| C4 admin monitoring | [superadmin](../../backend/src/modules/superadmin) submodules per existing pattern | V2 `admin-ops.ts` + frontend `real-api.ts` types as the contract |
| D1–D4 | `enquiries/`, `messaging/` (SSE), `events/`, feed comments in [feed](../../backend/src/modules/feed), `public-profiles` in platform-users | V2 `enquiries.ts`, `messages.ts`, `events.ts`, `feed.ts` |
| E1–E4 | extend [superadmin/ai-knowledge](../../backend/src/modules/superadmin/ai-knowledge) and [ai-counsellor](../../backend/src/modules/ai-counsellor) (both merged); `scribe/`, `lms/` modules *(NEW)* | V2 `apps/ai-service` designs; V1 scribe fns as behavioral spec |
| G | one module per feature, same pattern | V2 route files + `schema.ts` |
| Workers | [backend/src/workers/](../../backend/src/workers) — enquiry digest, training reminders, embedding jobs ride LavinMQ like `outbox-drainer` (which Wave A3 deletes/replaces per PDF) | V1 scheduled fns list |

**Auth tightening:** V2's `apps/core-api/src/route-auth.json` (documents every `v1WasPublic: true`) becomes the allowlist for the D2 route-table CI test.

## 8. Frontend implementation plan

Conventions (already established, keep): portal groups in `frontend/src/app/`, each feature folder owns `apis/real-api.ts` + `apis/mock-data.ts`, state via the existing store ([StoreProvider.tsx](../../frontend/src/app/StoreProvider.tsx), [lib/store.ts](../../frontend/src/lib/store.ts)), shared client in [frontend/src/lib/api](../../frontend/src/lib/api).

- **Wave A4 first:** flip mock default (mock only when explicitly `"true"`, loud banner), fix the `/admin/platform/*` prefix-bug clients, remove phantom calls. Every subsequent wave = write `real-api.ts` against the new backend and delete the mock as each page goes live.
- **Existing mock pages get backends, not new pages:** admin monitoring/revenue/marketing pages (verified in §3), `personal/{ai,credits,earn,explore,learning,messages,notifications}`, `business/portal`.
- **New surface to build:** public `(web)` catalog/search/SEO pages (institution/course/agent profiles, country/city guides — V1's `src/pages/public/` list is the sitemap); business portal features (services editor, enquiries, wallet, team already exists); student-facing D/E/G pages per wave.
- V2's Vite SPA is **not** a structural reference — V1's page inventory is the completeness checklist, V3's Next.js conventions are the how.

---

## 9. Migration engine, verification, waves, cutover

Authoritative in the annex; summary of what's binding:

- **Engine:** stage-1 extract (V2 tooling verbatim, read-only `gmig_` token, `migration-export` edge fn) → `v1_staging` → stage-2 transforms (`--dry-run` default, `--apply`, `--self-check`; single transaction per run; dry-run ⇔ apply same code path).
- **Verification:** Gate 1 staging parity (count/content/FK/sequence) · Gate 2 `verify-migration.mjs` (count reconciliation with reason-coded skips, content spot-parity via resolvers, FK orphans per schema, sequences, junction parent-guard) · Gate 3 read-parity once public APIs exist. Covers the brief's seven checks; **tenant leakage** is additionally tested in the Wave A/B isolation suite, and **storage completeness** by `storage-migrate verify` (count+bytes per bucket) + an `uploaded_files` row per object.
- **Data waves:** W0 tooling → W1 identity+geo (fixes wrong `country_id`s) → W2 reference → W3 sub-profiles → W4 extraction delta-check → W5 content/config → W6 storage rehost → W7 tenant data (blocked on C1 schema).
- **Cutover:** freeze V1 → fresh token → full re-extract → Gates 1–3 → storage sync → DNS → V1 read-only → same-day token revoke + export-fn delete → decommission after soak. Full rehearsal ×2 beforehand (journey 7.7-6).

## 10. Combined program order

```
A (foundations: tests/CI/hygiene/mock-flip)          — days
├─ B (B2 schema decisions + W0–W3 data + verify gate) — ~1 wk
├─ C (C1 services → C2 catalog+publish → C3 billing → C4 admin) + W7-services — 2-3 wks
├─ D (enquiries, messaging, events+notifications, comments+profiles) + W5 — 2 wks
├─ E (RAG → counsellor → scribe → LMS) + W7-ai/scribe/lms — 3-4 wks
├─ W4 check + W6 storage — anytime after B
├─ F (cutover) — after C+D+E rehearsed; does NOT wait for G
└─ G (parity tail, ≤5 agent tracks incl. marketplace-branch reconcile) — 4-6 wks, interleaves with F soak
```
Dispatch rules unchanged from the PDF (≤4 concurrent agents, worktree isolation, no file overlap, full suite green between waves). TDD per PDF §7 — those test tables remain the RED-phase inputs and are not repeated here.

## 11. Testing plan

PDF §7 stands in full (loop, per-wave test cases, defect register D1–D8, E2E journeys 1–6) plus annex §6 for migration machinery. Additions from this plan: contract test generates the allowed route table from `real-api.ts` files (kills phantom-endpoint class D6 permanently); tenant-leakage property test runs against **migrated** data, not just fixtures; marketplace-branch reconciliation gets its own regression suite before G3; extraction gets coverage seeded from V2's `extraction-*` suites (~170 tests: review/control/staged/extras/immigration/promote/triggers) — the promote path must be test-first before C2 touches live catalog tables.

## 12. Production cutover — annex §5 runbook, unchanged.

## 13. Rollback strategy

| Failure | Response |
|---|---|
| Migration run fails mid-wave | Transactional — nothing committed; fix, re-run (idempotent) |
| Gate 2/3 red at cutover | Halt before DNS; V1 untouched and still live; investigate on staging copies |
| V3 production defect post-DNS | V1 kept read-only through soak: flip DNS back for read-mostly continuity; V3 fixes roll forward (writes made in V3 during the window are the accepted loss/merge cost — keep the soak window short and monitored) |
| Storage migration fails | W6 is idempotent by object path; supabase URLs stay valid until V1 deletion — **never decommission V1 before W6 verify is green** |
| Stripe/payment breakage | Decision #6 (same keys vs fresh) gates this; webhooks are idempotent by event id; V1 remains the billing system until C3's E2E-5 journey is green in rehearsal |
| Tenant isolation breach discovered | Ship-stopper: freeze affected endpoints, isolation test suite must reproduce it, fix + full-suite green before traffic resumes |

## 14. Risks & mitigations

All PDF §6 + annex §8 risks carried forward (silent country FKs → W1; 19 supabase URLs → W6; snapshot drift → cutover re-extract + mapping diff; phantom endpoints → A4+D6 contract test; iCloud workspace hazard; `github-policies` rulesets referencing the wrong repo). From re-inspection of `staging`:
- **Unmerged in-flight branches** — ~~ai-knowledge, counsellor-p1~~ landed (PRs #42/#48). Remaining: `dev-feat-ai-counsellor-p2` (E2 base), `dev-feat-personal-my-services` booking flow (G3): each must land into `staging-mvp` before its wave dispatches, or the wave builds a competing implementation.
- **Long-lived `staging-mvp` drift** — `staging` keeps moving during the program; the wave-boundary rebase rule in §0.1 is the mitigation, and the full suite must be green after every sync.
- **Branch-placement deviation** — `business_branches` shipped tenant-scoped where the PDF said master; W7's cross-tenant sharing tables must not follow it into the tenant schema.
- **Frontend page inventory ≫ backend** — treat every mock page as a liability until its wave lands; the A4 banner keeps it honest.
- **SOP generator V2 path UNVERIFIED** — locate the V2 design (likely `apps/ai-service`) before Wave E scoping.

## 15. Decisions needed (blocking, in order)

| # | Decision | Recommendation |
|---|---|---|
| 1 | Institutions claimable model | **Yes** (unblocks 363/402 services) |
| 2 | Academic tests discriminator | **Column** |
| 3 | Canonical reference tables | **public** |
| 4 | Drop smoke-results + job-events | **Drop `scrape_smoke_results` entirely; `extraction_job_events` = skip V1 rows only** — the V3 table is live (workers write it, UI reads it); dropping it would break shipped code (`CHANGED vs PDF`) |
| 5 | W4 corpus already loaded? | **Check counts first** |
| 6 | Stripe account: V1's or fresh | — (gates C3/W7) |
| 7 | Fresh `gmig_` token mint timing | At rehearsal #1 |
| 8 | ~~Marketplace branch~~ **RESOLVED 2026-08-17** — `product-feat-personal-my-services` merged to `staging`; remaining: land the `dev-feat-personal-my-services` booking flow into `staging-mvp` | Land before G3 |
| 9 | D vs E ordering if team splits | Money-first (C→D) unless AI is the launch driver |
