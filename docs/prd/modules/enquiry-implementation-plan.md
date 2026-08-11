# Enquiry Module — Implementation Plan

> Executes the design in [`enquiry-system.md`](./enquiry-system.md) (34 sections). This plan does not re-argue that design — it sequences it into reviewable phases against v3's actual codebase conventions, verified directly against `backend/src/modules/businesses/` and `backend/src/modules/superadmin/data-extraction/` (layering exemplar) and `frontend/src/app/admin/monitoring/*` (feature-folder exemplar). Confirmed during planning: `businesses` table has no `enquiry_enabled`/`is_suspended`/`enquiry_coin_cost`/`latitude`/`longitude` columns today (checked `backend/database/migrations/globalyapp/20260804_001_businesses.ts`), so the PRD's ALTER assumption holds. Only one real backend test file exists (`backend/tests/auth.ts`) — testing conventions for this module are new ground, not an established pattern to copy blindly.

## Phase breakdown

### Phase 1 — Schema & migrations
**Goal**: land every new table; add the enquiry-related `businesses` columns to the existing businesses migration rather than a separate ALTER.
**Files (new tables — one migration file each)**:
- `backend/database/migrations/globalyapp/2026XXXX_001_representations.ts`
- `backend/database/migrations/globalyapp/2026XXXX_002_enquiry_match_directory.ts`
- `backend/database/migrations/globalyapp/2026XXXX_003_enquiries.ts`
- `backend/database/migrations/globalyapp/2026XXXX_004_enquiry_distributions.ts`
- `backend/database/migrations/globalyapp/2026XXXX_005_credit_wallets_and_ledger.ts`
- `backend/database/migrations/globalyapp/2026XXXX_006_std_business_conversations.ts`
- `backend/database/migrations/globalyapp/2026XXXX_007_chat_messages.ts`
- `backend/database/migrations/globalyapp/2026XXXX_008_enquiry_email_queue.ts`
**Files (edit in place — no new migration)**:
- `backend/database/migrations/globalyapp/20260804_001_businesses.ts` — add `enquiry_enabled`, `is_suspended`, `enquiry_coin_cost`, `latitude`, `longitude` directly into the existing `createTable` block. Only safe if this migration has not already run against any shared/deployed DB — confirm with the team before editing; if it has already run anywhere, fall back to a small ALTER migration instead so existing databases aren't left behind.
- Seed new permission keys (`enquiries:view`, `enquiries:unlock`, `enquiries:respond`, `enquiries:assign`, `enquiries:convert`) — check `backend/database/seeders/business/roles_seeder.ts` for where permission keys are seeded and add there, not a new seeder file.
**Conventions to follow**: `t.uuid("id").primary().defaultTo(gen_random_uuid())`, `t.timestamps(true, true)` + `t.timestamp("deleted_at").nullable()`, raw `CREATE INDEX` after `createTable` (see `20260807_001_audit_logs.ts`).
**Depends on**: nothing. **Blocks**: everything else.
**Done when**: `npm run migrate` (or repo's equivalent script) applies cleanly against a fresh DB and down-migrations reverse cleanly; all FKs (`extraction_courses.id`, `superadmin.extraction_jobs.id`, `businesses.id`, `platform_users.id`) resolve against real tables.

### Phase 2 — Wallet subsystem
**Goal**: minimal `credit_wallets`/`business_ledger` read/write path, isolated from enquiry logic so the unlock transaction (Phase 5) can just call it.
**Files**:
- `backend/src/modules/enquiries/repositories/wallet.repository.ts`
- `backend/src/modules/enquiries/services/wallet.service.ts` (balance check, debit-with-ledger-insert as one function taking an existing Knex transaction)
**Migration**: none new (uses Phase 1's `credit_wallets`/`business_ledger`).
**Depends on**: Phase 1.
**Blocker gate**: PRD §33 flags wallet/ledger scope as an open decision — confirm before this phase starts whether this two-table shape is the permanent home or a full billing module is planned elsewhere. Do not start Phase 5 until resolved.
**Done when**: a unit/integration test debits a wallet, insufficient balance aborts with no partial write, and two concurrent debits against the same wallet don't over-debit (row-locked).

### Phase 3 — Representations & match directory
**Goal**: eligibility substrate the matcher reads.
**Files**:
- `backend/src/modules/enquiries/repositories/representations.repository.ts`
- `backend/src/modules/enquiries/repositories/match-directory.repository.ts`
- `backend/src/modules/enquiries/services/representations.service.ts` (CRUD + directory resync on create/update/suspend)
- `backend/src/modules/enquiries/routes/admin-representations.routes.ts` (`GET/POST /api/v3/admin/representations`)
- `backend/src/modules/enquiries/schemas/representations.schema.ts`
**Depends on**: Phase 1.
**Done when**: creating/suspending a representation correctly upserts/removes the corresponding `enquiry_match_directory` row; superadmin CRUD endpoints pass an `app.inject` smoke test.

### Phase 4 — Enquiry creation API
**Goal**: student can submit an enquiry; row lands as `pending`; queue publish happens post-commit.
**Files**:
- `backend/src/modules/enquiries/schemas/enquiries.schema.ts`
- `backend/src/modules/enquiries/repositories/enquiries.repository.ts`
- `backend/src/modules/enquiries/services/enquiries.service.ts` (profile-completion check → insert → audit row → post-commit queue publish)
- `backend/src/modules/enquiries/routes/enquiries.routes.ts` (`POST /api/v3/enquiries`, `GET /api/v3/enquiries`, `GET /api/v3/enquiries/:id`, `PATCH /api/v3/enquiries/:id/close`)
- `backend/src/modules/enquiries/shared/queues.ts` (queue name constants, pattern from `data-extraction/shared/queues.ts`)
- `backend/src/modules/enquiries/shared/audit.ts` (`logEnquiryAudit()` targeting `globalyapp.audit_logs`)
- `backend/src/modules/enquiries/index.ts` (route registration, `onRequest` auth hook)
- Register module in `backend/src/server.ts` (or wherever other modules are registered — verify exact file before editing)
**Depends on**: Phase 1.
**Done when**: profile-incomplete student gets 403 before any DB write; valid submission produces one `enquiries` row + one `audit_logs` row in the same transaction; `enquiry.created` is published only after commit.

### Phase 5 — Matching engine
**Goal**: pure ranking function + worker that turns `pending` enquiries into `enquiry_distributions` rows.
**Files**:
- `backend/src/modules/enquiries/shared/ranking.ts` (pure function: tiers 1–7, distance banding, country fallback — no DB access, unit-testable in isolation)
- `backend/src/modules/enquiries/repositories/distributions.repository.ts` (insert with `ON CONFLICT (enquiry_id, business_id) DO NOTHING`)
- `backend/src/modules/enquiries/services/matching.service.ts` (queries `enquiry_match_directory`, calls `ranking.ts`, writes distributions, flips enquiry to `distributed`/`no_match`)
- `backend/src/modules/enquiries/jobs/enquiry-match.worker.ts` (standalone `tsx` entrypoint, consumes `enquiry.created`, publishes `enquiry.distributed`)
- `npm run job:enquiry-match` script in `backend/package.json` (mirror `job:auth`/`job:extraction*`)
**Depends on**: Phase 3 (match directory), Phase 4 (enquiry exists, queue publishes).
**Done when**: unit tests on `ranking.ts` cover tier ordering, distance banding, and country-match skip-when-no-coords, without touching a DB; an end-to-end run against seeded representations produces ≤`MAX_DISTRIBUTIONS` rows and never mixes institution-fallback with matched agents.

### Phase 6 — Distribution lifecycle + unlock (wallet-gated)
**Goal**: business inbox actions — unlock, accept, reject, assign, convert.
**Files**:
- `backend/src/modules/enquiries/schemas/distributions.schema.ts`
- `backend/src/modules/enquiries/services/distributions.service.ts` (unlock debits wallet via Phase 2 in the same transaction; accept uses `SELECT ... FOR UPDATE` on `enquiries` before incrementing `accept_count`; reject checks all-rejected → publish redistribution event)
- `backend/src/modules/enquiries/routes/distributions.routes.ts` (`GET /api/v3/enquiry-distributions`, `POST .../:id/unlock`, `.../accept`, `.../reject`, `PATCH .../assign`, `.../convert`)
**Migration**: none new.
**Depends on**: Phase 2 (blocker: wallet/ledger decision must be resolved first, per PRD §33), Phase 5 (distributions exist).
**Done when**: idempotent re-unlock returns `{already_unlocked: true}` with no double charge; concurrent accept calls against `max_accepts=3` let exactly 3 through under load test; insufficient balance returns 402 with zero state change; every action writes one `audit_logs` row.

### Phase 7 — Conversations & chat
**Goal**: one conversation per accepted (enquiry, business), append-only messages.
**Files**:
- `backend/src/modules/enquiries/schemas/conversations.schema.ts`
- `backend/src/modules/enquiries/repositories/conversations.repository.ts`
- `backend/src/modules/enquiries/services/conversations.service.ts` (open-on-accept lives inside Phase 6's accept transaction; chat send allocates `seq` + increments `message_count` under a conversation row lock)
- `backend/src/modules/enquiries/routes/conversations.routes.ts` (`GET/POST /api/v3/conversations/:id/messages`, `PATCH .../close`)
**Depends on**: Phase 6 (accept opens the conversation).
**Done when**: `client_message_id` retried twice produces one message; concurrent sends into the same conversation get strictly increasing `seq` with no gaps/dupes; a business can never read another business's conversation (IDOR check).

### Phase 8 — Email queue + workers
**Goal**: durable outbox, immediate-if-idle-else-batched delivery.
**Files**:
- `backend/src/modules/enquiries/repositories/email-queue.repository.ts`
- `backend/src/modules/enquiries/services/email-queue.service.ts` (enqueue with `dedup_key`, immediate-send trigger when no other pending rows for recipient)
- `backend/src/modules/enquiries/jobs/enquiry-email.worker.ts` (consumes queued sends, calls existing `mailerService.sendMail`)
- `backend/src/modules/enquiries/jobs/enquiry-email-batch.worker.ts` (sweep script, cron-triggered)
- `backend/src/modules/enquiries/jobs/enquiry-expiry.worker.ts` (SLA sweep → `expired`, may trigger redistribution)
- `npm run job:enquiry-email`, `job:enquiry-email-batch`, `job:enquiry-expiry` scripts
**Depends on**: Phase 5 (distributions trigger the enqueue), reuses existing `nodemailer` path — no changes there.
**Done when**: same `dedup_key` enqueued twice never sends twice; idle recipient gets an immediate send; busy recipient's row waits for the batch sweep; expired distributions flip status and (if all rejected/expired) mark the enquiry redistribution-eligible.

### Phase 9 — Audit wiring pass
**Goal**: verify every lifecycle transition across Phases 4–8 actually calls `logEnquiryAudit()` — this is a review/completion pass, not new subsystem work (the helper itself ships in Phase 4).
**Files**: no new files; touches call sites in `enquiries.service.ts`, `distributions.service.ts`, `conversations.service.ts` if any transition is missing its audit row.
**Depends on**: Phases 4–8.
**Done when**: every vocabulary item listed in PRD §18 (`enquiry.created/.distributed/.no_match/.closed/.converted`, `distribution.*`, `conversation.opened/.closed`, `representation.*`) has at least one exercised code path writing it, and no audit row ever contains message body content.

### Phase 10 — Frontend: student side
**Goal**: `personal/enquiries` — list, create form, detail/conversation view.
**Files** (feature-folder convention from `frontend/src/app/admin/monitoring/enquiries/`):
- `frontend/src/app/personal/enquiries/page.tsx`
- `frontend/src/app/personal/enquiries/apis/{index.ts,real-api.ts,types.ts}`
- `frontend/src/app/personal/enquiries/store/enquiries-slice.ts` (thunks: create, fetch list, fetch detail, close)
- `frontend/src/app/personal/enquiries/components/` (list, new-enquiry form, detail/conversation panel)
**Depends on**: Phase 4 (create/list/detail/close API), Phase 7 (conversation view needs messages endpoint).
**Design-file inventory relevant here** (see Deliverable 1 below): old `StudentEnquiries.tsx` list+create-dialog pattern and the shared `SkeletonEnquiryCard` loading treatment are the direct visual/UX reference for this phase's list+form.
**Done when**: student can submit an enquiry through the form, see it in their list with correct status, and open a conversation once `in_conversation`.

### Phase 11 — Frontend: business side
**Goal**: `business/enquiries` — Locked/Unlocked/Accepted/Closed tabbed inbox, unlock/accept/reject/assign/convert actions, conversation panel.
**Files**:
- `frontend/src/app/business/enquiries/page.tsx`
- `frontend/src/app/business/enquiries/apis/{index.ts,real-api.ts,types.ts}`
- `frontend/src/app/business/enquiries/store/business-enquiries-slice.ts`
- `frontend/src/app/business/enquiries/components/` (inbox list, detail/action panel, conversation panel)
**Depends on**: Phase 6 (distribution actions), Phase 7 (chat).
**Design-file inventory relevant here**: old `BusinessEnquiries.tsx` (tabs, locked/unlocked cards, unlock/assign/convert/start-chat mutations, toasts) is the direct structural reference for this inbox — see notes below on what's portable vs. needs adaptation.
**Done when**: all five actions (unlock/accept/reject/assign/convert) work end to end against the real API, tabs correctly reflect `is_unlocked`/`status`, chat polls on an interval (no WebSocket).

### Phase 12 — Frontend: admin side
**Goal**: replace the `admin/monitoring/enquiries` stub with the real module — read-only ledger/audit view, per-business coin-cost/suspension controls.
**Files**:
- Delete/replace: `frontend/src/app/admin/monitoring/enquiries/{page.tsx,layout.tsx,components/enquiries-view.tsx,store/enquiries-slice.ts,const/index.ts,apis/*}` — the mock 5-field shape (`id, name, subject, channel, status`) must not survive alongside the real one (PRD §29).
- New: `frontend/src/app/admin/enquiries/{page.tsx,apis/,store/,components/}`
**Depends on**: Phase 6 (distributions to list), Phase 3 (representations admin CRUD already has its own routes in Phase 3, this just needs a UI).
**Done when**: the old stub route no longer exists, the new one reads real distribution data, and superadmin can edit `enquiry_coin_cost`/`enquiry_enabled`/`is_suspended` on a business.

### Phase 13 — Hardening & tests
**Goal**: close the gaps the PRD explicitly calls out as must-verify (§30, §32).
**Files**: `backend/tests/enquiries/*.ts` (new directory — no existing enquiry test dir; follow whatever pattern `backend/tests/auth.ts` uses for `app.inject`/DB setup, verify exact tooling first since this is the second real test file in the repo).
- Unit: `ranking.ts` tiering/distance/country-fallback (no DB).
- Service/integration: unlock idempotency, insufficient-balance abort, accept race under `max_accepts`, duplicate-distribution prevention.
- HTTP: full submit → match → unlock → accept → message flow via `app.inject`.
- IDOR suite: business A can never read/act on business B's distributions/conversations/messages.
- Email dedup under simulated retry.
**Depends on**: all prior phases.
**Done when**: every PRD §32 acceptance criterion has a corresponding passing test.

## Design file inventory (old GlobalyApp → v3)

| Old file | Renders | Portability note |
|---|---|---|
| `GlobalyApp/src/pages/student/StudentEnquiries.tsx` (183 lines) | Student "My Enquiries" list + inline new-enquiry dialog, toasts on send/error | Needs adaptation: rebuild against Redux Toolkit thunks (not React Query/Supabase calls), map to v3's `enquiries` status vocabulary (superset of old system's 5 states, §11). Layout/UX (list + dialog) is a reasonable direct visual reference for Phase 10. |
| `GlobalyApp/src/pages/business/BusinessEnquiries.tsx` (300 lines) | Business inbox: tabs, locked/unlocked cards, unlock/assign/convert/start-chat mutations, toasts | Needs adaptation: old tabs are Locked/Unlocked only, v3 needs Locked/Unlocked/Accepted/Closed (§14); "start-chat" mutation logic doesn't carry over since v3 opens the conversation transactionally on accept, not as a separate user action. Structural reference (tab bar, card layout, action buttons) is directly useful for Phase 11. |
| `GlobalyApp/src/pages/admin/AdminEnquiries.tsx` (118 lines) | Admin read-only oversight of all enquiries | Needs adaptation for v3's real distribution/audit shape; general read-only-table pattern is reusable for Phase 12. |
| `GlobalyApp/src/pages/business/BusinessMessages.tsx` (159 lines) | Business conversations-from-enquiries inbox | Needs adaptation: no realtime/socket layer in v3 (§16), must be rebuilt as polling. Layout reference only. |
| `GlobalyApp/src/pages/student/StudentAmbassadorInquiries.tsx`, `StudentAmbassadorChat.tsx`, `GlobalyApp/src/pages/business/BusinessAmbassadorConversations.tsx` | Structurally identical list/chat pattern for a *different* feature (ambassador program) | Obsolete for this module — different DB feature entirely, not a real dependency; only useful as a second structural example of the same list/chat shape if Phase 10/11 authors want a second reference point. |
| `GlobalyApp/src/assets/public/photos/enquiry-unlock-agent.jpg` | Marketing illustration for the unlock flow | Directly portable as a static asset if the same marketing framing is wanted; otherwise skip — not core UI. |
| `GlobalyApp/src/components/public/mockups/EnquiryUnlockMockup.tsx` (64 lines) | Animated locked→unlocked card mockup, public marketing page only | Not part of the app UI — marketing-site component, out of scope for this module's phases. Portable as-is if v3's marketing site wants the same illustration. |
| `GlobalyApp/src/components/ui/skeleton-cards.tsx` → `SkeletonEnquiryCard()` (line 86 of 103) | Loading skeleton shaped like a locked/unlocked enquiry row | Needs adaptation: v3 has its own `frontend/src/components/ui/` design-system folder (shadcn-style, same family as the old app's), so this skeleton should be re-implemented there against v3's actual card/skeleton primitives, not copy-pasted wholesale. Useful shape reference for Phase 10/11 loading states. |
| Old app's `enquiry-system.md` PRD (`GlobalyApp/docs/prd/modules/enquiry-system.md`, 246 lines) | Business-intent-only spec, no v3 architecture | Superseded by the current PRD (`enquiry-system.md` in this repo, 561 lines) — already folded in as §5–6 "OLD-REFERENCE" business context. No further action needed. |

**Design-system dependency**: every old enquiry screen imports from `GlobalyApp/src/components/ui/` (72 shadcn-style primitives — `card`, `button`, `badge`, `tabs`, `select`, `dialog`, `textarea`, `label`). v3 has its own equivalent at `frontend/src/app/../components/ui/` (Next.js app, same shadcn family per repo conventions) — Phases 10–12 should build against v3's own copy of these primitives, not the old app's.

Notification pattern: old app has no dedicated enquiry notification component — it reuses a shared `useToast()`/`use-toast.ts` hook inline in the list/inbox pages for action feedback ("Enquiry sent!", "Enquiry unlocked!"). v3's frontend should follow the same inline-toast-via-shared-hook pattern rather than building a bespoke notification component, consistent with PRD §4's explicit exclusion of an in-app notification center.

No matching-tier UI was found in the old frontend — the 7-tier logic was entirely server-side (`distribute-enquiry` edge function), so there is no obsolete matching UI to reference or discard.

## Open blockers (carried from PRD §33), and which phase they gate

- **Wallet/ledger scope** — is the minimal `credit_wallets`/`business_ledger` pair (Phase 2) the permanent home, or should this integrate with a planned billing module instead? **Gates Phase 6** (unlock debit must share the accept/unlock transaction) — do not start Phase 6 until resolved, per PRD's own instruction.
- **Superadmin chat read access** — no compliance stance decided; default is no read access without an explicit support flow. **Gates Phase 12** (admin UI must not expose message bodies unless this is resolved otherwise) and the IDOR test scope in Phase 13.
- **Redistribution trigger granularity** — immediate vs. scheduled when all distributions on an enquiry are rejected/expired. **Gates Phase 8** (the expiry/redistribution worker's trigger logic) — implementable either way but must be decided before that worker ships, not defaulted silently.
- **Direct-target enquiry pricing** — should `business_id`-direct enquiries cost differently than matched ones? **Gates Phase 6** (coin_cost calculation) — currently undecided in the PRD; default to the same flat cost unless told otherwise, but flag this explicitly in the PR for Phase 6.
- **`businesses` column-name collisions** (`enquiry_coin_cost`, `enquiry_enabled`, `is_suspended`, `latitude`, `longitude`) — confirmed no existing columns of these names in `20260804_001_businesses.ts`, so **Phase 1 is clear to add these columns directly into that migration file** as specified; no gate remains here, other than confirming that migration hasn't already run anywhere it can't be edited (see Phase 1 note).
