# V3 Migration — Reconciliation Log

**Date:** 2026-08-17 · **Authority:** `2026-08-17-v3-migration-program-master-document.pdf` (senior eng + devops reviewed)
**Supersedes:** `2026-08-16-globalyapp-v3-implementation-migration-plan.md` — kept for history only; where the two disagree, the master document wins.

This log records what changed when the master document replaced the 2026-08-16 plan mid-flight, what work survived, and the decisions taken. It exists so the reasoning is not buried in a chat transcript.

---

## 1. Branch state — corrected

Work had been landing on `product-feat-amit-aichat-ui-landing-page`, which had **diverged from `staging`**: 69 commits behind, 61 overlapping files. The master document (§0.1) mandates a dedicated integration branch.

**Done:** `staging-mvp` cut from `origin/staging` at `078b744`. Fifteen commits replayed onto it. Safety tags on the abandoned line: `wave-abc-preplan`, `wave-c-preserved`.

## 2. `staging` did not boot — fixed first

`origin/staging` throws on startup:

```
FST_ERR_DUPLICATED_ROUTE: Method 'POST' already declared for route '/api/v3/auth/register'
```

A merge re-inserted an older module-registration block after the current one, registering auth, superadmin, platform-users, businesses, agents, feed and ai-counsellor **twice**. The duplicate block sat at root, **outside the `protectedApp` scope** that installs `authPlugin` and `tenantPlugin` — so superadmin, businesses, platform-users and agents were being registered with no auth and no tenant resolution. Fastify's duplicate-route error is the only reason that did not become an auth bypass.

Fixed in `54f9c39`, first commit on `staging-mvp`. Boot verified, `/healthz` 200.

## 3. Conflicts resolved during the replay

| File | Resolution | Why |
|---|---|---|
| `01_countries_seeder.ts` | took **staging's** | Seeds 194 sovereign states from mledoze/countries + GeoNames cities, upserting on iso2. Mine was a hardcoded 24. |
| `tests/auth.ts` | **kept staging's** | My commit deleted it; it is a working 294-line manual E2E script. Vitest coexists. |
| `backend/package.json` | **union** | Kept staging's `import:v2` and `job:ai-knowledge-crawl`; kept my test/typecheck/lint scripts. |
| frontend `countries` / `businesses` api files | took **staging's** | Full CRUD with image upload vs my read-only repair. |
| `frontend/package.json` tiptap | took **staging's** | staging's blog implementation is the one that shipped. |
| `check:api-contract` registration | **re-added** (`63062f9`) | Lost by resolving frontend package.json in staging's favour; script and allowlist live at repo-root `scripts/` and survived. |
| ai-knowledge frontend (7 files) | took **staging's** | PR #42 shipped the **real** console. My C4 agent had deferred it as unbacked — wrong against this base. |
| `server.ts`, `config.ts` | **both sides** | Additive. Note two Stripe consumers with deliberately different unset behaviour — see §5. |

## 4. Decisions taken 2026-08-17

| # | Decision | Choice | Rationale |
|---|---|---|---|
| A | Branch model | Cut `staging-mvp`, replay all work | Master document §0.1 |
| B | C1/C2 module placement | **Refactor into existing modules** | §7: C1 extends `businesses/routes/services.routes.ts` + `superadmin/platform/business-services`; C2 extends the existing `geo` + `search` modules. Agents had created new `services/` and `catalog/` modules. |
| C | Sequencing | Reconcile build-wave code onto `staging-mvp` **before** Stage 1 | Keeps feature work from rotting further behind staging |
| D | `credit_wallets` / `credit_transactions` collision | **One table matching V1, editing `20260816_004`/`005` in place** | §1.2.1 parity-first. See §5. |
| E | Dev database | **Rebuild from scratch** | §1.2.1 prescribes it after editing migrations in place; all loaded data is script-reproducible and cutover requires a fresh extract regardless |

## 5. The wallet collision (decision D, in full)

`credit_wallets` and `credit_transactions` were each created by two migrations, so migrations could not run at all. V1 is the authority and **both** V3 versions were wrong against it:

| | `owner_type` / `business_id` | `balance` | `lifetime_earned` / `lifetime_spent` | `free_balance` |
|---|---|---|---|---|
| **V1 (55 rows: 20 user-owned, 35 business-owned)** | ✅ polymorphic | ✅ | ✅ | ✗ |
| staging `20260816_004` (AI-counsellor) | ✗ user-only, NOT NULL UNIQUE | ✗ | ✗ | ✅ V3 addition |
| billing `20260817_002` | ✅ | ✅ | ✗ | ✗ |

`credit_transactions` likewise lacked V1's `subscription_amount`, `purchased_amount`, `reference_type`, `reference_id`, `performed_by`.

Resolution: one polymorphic wallet carrying V1's shape plus `free_balance` retained as a deliberate V3 addition; both the AI-counsellor credit path and the billing module read the same table. Load-bearing details that must survive: the `FOR UPDATE` CTE in `debitWallet` and the non-negative CHECK backstop — a test proves the **lock** rather than the constraint is what returns clean 402s under concurrency.

**Open, flagged in `config.ts`:** two Stripe consumers disagree on unset-key behaviour — `other-services/payments` selects a dev driver, `billing` fails closed with 503. Master document §15 decision 6 (same account/keys as V1, or fresh) must settle this before the C3→E2 rehearsal.

## 6. What survives the plan change

All four schema decisions the master document lists as blocking were already implemented and **match its recommendations**:

- #1 institutions claimable (nullable owner + `claim_status`) — unblocks 363 of 402 services
- #2 academic tests as a **discriminator column** on `platform_user_language_tests`
- #3 canonical reference tables in **`public`**
- #4 drop `scrape_smoke_results` entirely; keep `extraction_job_events` and skip only its V1 rows

Decision #5 ("is the W4 corpus already loaded? — check counts first") is answered: **97,939 rows loaded**, so W4 collapses to a delta upsert plus Gate 2, not a full load.

Also surviving: Wave A (vitest suite, eslint, CI gates, mock-flip, contract test), the cross-tenant-in-master placement rule, and the rejection of widening `extraction_memory.embedding` to 1536 — V3 deliberately uses Gemini `text-embedding-004` at 768 dims.

## 7. What must be rebuilt

**The data-migration mechanism.** My importers read the local Postgres restore at `:5455` directly. That restore is the **2026-07-16 snapshot and has drifted**, and live V1 has no direct Postgres or S3 access — the only way in is the `migration-export` edge function. Those scripts therefore **cannot run at cutover at all**; they are rehearsal artifacts that proved the transforms.

The master document's two-stage architecture replaces them:

- **Stage 1** — extract all 199 V1 tables byte-faithfully into a `v1_staging` schema using V2's tooling, verified by Gate 1 (V2's `verify-db.mjs`, unchanged).
- **Stage 2** — local TS transforms under `backend/scripts/migration/` reading **only** from `v1_staging`, driven by a single `mapping.json` that dispositions every one of the 199 tables as transform / drop(reason) / blocked(dependency). Coverage is arithmetic, not memory.
- **Gate 3** — read-parity, ported from V2's `read-parity.mjs`.

V2's tooling is present and verified at `globaly-app-v2/migration/`: 199-table census, `verify-db.mjs`, `export-import.mjs`, `storage-migrate.mjs`, `read-parity.mjs`, `db/migration/RUNBOOK.md`, `db/scripts/import-users.mjs`, and a copy of the export function at `db/migration/v1-export-function/`. Two completed rehearsals are in `migration/rehearsals/`.

My existing `verify-migration.mjs` + `migration-manifest.json` is a working Gate 2 skeleton — mapping-aware, with a coverage rule that already caught 24 silently-unwritten columns. It needs re-pointing at `mapping.json` and extending from 4 checks to the specified 6.

## 8. Convention changes to propagate to every agent

- **Migration files may now be edited in place** and the dev DBs rebuilt (§1.2.1). Previous instruction to every agent was the opposite — never edit an applied migration.
- **Worktree isolation reinstated** for code-writing agents (§1.7).
- Migration scripts live in **`backend/scripts/migration/`**, following `import-v2.ts` conventions — not `backend/database/scripts/`.
- Work ships on `staging-mvp`; short-lived `dev-feat-<scope>` branches PR into it; `staging` is rebased in at every wave boundary.

## 9. Still open

- Master document §15: #6 Stripe account/keys (same as V1 or fresh), #7 who mints the fresh 90-day `gmig_` token and when, #9 D-vs-E ordering (money-first vs AI-first).
- Whether a tenant schema per scraped, unclaimed institution is the right long-run model. Today: 147 schemas / 3,386 tables, every one populated (median 76 services, max 687). At extraction scale — thousands of institutions — that becomes tens of thousands of tables, a connection-pool entry each, and a `migrate:tenants` sweep per schema. Not a problem at current volume; a design question before the extraction pipeline is opened up.

## 10. Owner decisions — 2026-08-17 (round 2)

| # | Question | Decision | Consequence |
|---|---|---|---|
| F | `core_field_settings` (42 rows) → `schema_fields` | **Migrate only the jsonb definitions that fit.** Drop `core_field_settings` (reason: platform-global, no V3 entity to attach to); migrate the `schema_fields` jsonb already on categories — 2 on `business_categories`, 10 on `service_categories` | Those have real entity ids so they fit `UNIQUE(entity_id, entity_type, key)` with nothing invented. 19 of V1's 42 rows had `entity_type` of `user`/`qualification`, which V3 has no entity for at all |
| G | §4's `business_categories` → `fee_types` split | **Plan erratum — the split does not exist.** That jsonb holds form-field definitions (`marn_number`, a stray "Facebook"), not fees | Real fee types come from `v1_staging.fee_types` (11 rows), already migrated green by W2. Recorded so nobody "restores" the missing split |
| H | ISO-3 for 4 countries V1 has and the seeder lacks | **XK→XKX, PS→PSE, TW→TWN, EH→ESH.** XKX is user-assigned, not ISO-official, and is reported on every run | Unblocks 4 countries + 40 cities (EH 8, PS 10, TW 11, XK 11); `unresolved_country` drops by 44. Names taken from V1 verbatim, so no naming position is taken |
| I | W0's 5 blocked tables | **Drop the 4 empty** (`ai_content_jobs` 0, `business_locations` 0, `service_orders`/`service_reviews`/`student_services` 0 each); **`test_provider_logos` (10 rows) migrates** as a small reference table with images rehosted in W6 | **Unblocks W7.** The service-orders family is the ordering side of the course catalog; V3's `other_service_*` tables model a different peer-to-peer product, so whichever wave needs course ordering designs it fresh rather than inheriting an unused schema |
| J | Host-side event management UI | **Build now** as a D3 follow-up | D3 shipped and tested the API because cross-tenant isolation is meaningless without it, but no screen existed, so the endpoints were unreachable |
| K | Next wave ordering | **Finish D, then start E** | D4 (feed comments + public student profiles) and the W4–W5 data waves run now; Wave E follows. Keeps the money-first sequence chosen earlier |

## 11. Defects found by running the plan (2026-08-17)

Each of these blocked something and none were anticipated by the document:

- **`origin/staging` did not boot.** A merge duplicated the module-registration block, and the duplicate sat *outside* the auth scope — superadmin, businesses, platform-users and agents were registered with no `authPlugin`. Fastify's duplicate-route error was the only thing preventing an auth bypass.
- **Four duplicate-table collisions**, each of which made `migrate:latest` fail from an empty database and none visible against an already-migrated one: `credit_wallets`, `credit_transactions`, `business_services`, and (caught pre-merge) `events` vs `messaging` sharing a migration number.
- **The API-contract checker was blind to 23 real routes** — it only understood quoted literal prefixes, so route files using `const prefix = "/services"` registered as nothing. It also compared allowlist entries by exact string equality while matching routes by glob, so a call with an interpolated query string could never be allowlisted.
- **The AI counsellor frontend called `/api/v3/ai/*` while the module serves `/api/v3/ai-chat/*`** — all five endpoints existed; sessions, history, rename, feedback and credit balance were simply 404 on staging.
- **The countries seeder omitted JSON import attributes**, which Node 25 requires — invisible under vitest (which transforms them away) and fatal under `node --import tsx`, i.e. exactly during the from-scratch rebuild the runbook prescribes.
- **A test that passed alone and failed in the suite**: three assertions did `SELECT ... FROM public.businesses` unscoped, assuming the fixture owned the table, while three other suites write businesses to the same database.
- **`v1_staging` lives in the V3 database**, so Gate 2's *source* URL is the V3 one. The earlier command only passed because pre-Stage-2 mappings read the V1 restore directly.

## 12. Standing hazards for agents

- **npm rewrites `yarn.lock` destructively** (~1,100 lines, registry URLs swapped) and leaves a `package-lock.json`. This repo uses yarn. Three agents hit it.
- **Agent worktrees have no `node_modules`.** Hard-link them (`cp -al`); a symlink fails with *"Symlink [project]/node_modules is invalid, it points out of the filesystem root"*.
- **A test failure observed while a sibling agent is running is not a finding** until re-run in isolation on a dedicated database — but a test that fails in the suite and passes alone *is* a real isolation defect, not contention. Both have occurred.

## 13. Correction — embedding dimension (2026-08-17)

I told several agents that V3 uses Gemini `text-embedding-004` at `vector(768)`, and
the earlier commit messages say so. **That is stale.** Verified in the repo:
`GEMINI_EMBEDDING_MODEL` now defaults to **`gemini-embedding-001`** and the superadmin
migrations declare **`vector(3072)`** on `extraction_memory` and all four
`ai_knowledge_*` tables. Staging changed it after the earlier note was written.

The conclusion is unchanged: V1 stages embeddings at 1536 dims, so they are **not**
copied under any of these numbers — vectors from a different model are not comparable
under cosine distance. What changes is the **E1 re-embed spec**: it must target
3072-dim `gemini-embedding-001`, not 768-dim `text-embedding-004`.

## 14. Security regression caught by review (2026-08-17)

Fixing agent D3b's silent-data-loss report, I added `contact_email` and
`contact_phone` to `serializeEvent` — which the **unauthenticated** browse and detail
routes share with the host and admin paths. That published every organiser's email
and phone number. The commit security review caught it.

Contact details are now opt-in (`includeContact`), passed by the host and admin
callers only. The regression test asserts the values appear nowhere in the public
JSON and that the keys are absent from the payload, and it is mutation-verified —
making the fields unconditional again turns it red.

Worth noting as a pattern: a serializer shared between an authenticated and an
unauthenticated route is a standing information-disclosure hazard. `online_url` is
still returned publicly for every event, including `private`/`targeted` ones — a
pre-existing issue, not introduced here, but the same shape of bug.

## 15. GCP reconciliation — 2026-08-17 (gcloud re-authed by owner)

`backend/.env` had **placeholders, never values**, for every Google setting:
`GEMINI_API_KEY=your-gemini-key`, `GCS_BUCKET_NAME=your-bucket`,
`GCS_PROJECT_ID=your-project-id`, `GCS_KEY_FILE=path/to/service-account.json`.

This is a bigger finding than "no Gemini key". It means **W6's storage rehost had no
destination configured either** — the blocker was never only the missing `gmig_`
source token.

### 15.1 W6's destination is confirmed, not guessed

`gs://storage-globalyapp-staging/` already contains V3's own prefixes —
`businesses/`, `cities/`, `countries/`, `platform-users/`, `public/`. That is exactly
the single-bucket, relative-path model `w6-storage-map.ts` was written against
(`storageService.ts: toStoragePath / resolvePreviewUrl`). W6's `v1/<bucket>/<path>`
objects land alongside those prefixes.

    GCS_PROJECT_ID  = globalyapp-staging
    GCS_BUCKET_NAME = storage-globalyapp-staging
    GCS_KEY_FILE    = (leave unset — optional at every call site, so the client
                       falls back to ADC, which is now valid)

`GCS_KEY_FILE` is `.optional()` in `config.ts:67` and spread conditionally in
`storageService.ts:40`, `document-extractor.ts:54` and `w6-objects.ts:243`. No
service-account JSON needs to be minted or stored.

### 15.2 Independent corroboration of the 13-migrate / 3-drop reconciliation

`globalyapp-production` holds 13 buckets named `globalyapp-production-globaly-<name>`.
Stripped of the prefix they match `MIGRATED_BUCKETS` in `w6-storage-map.ts`
**exactly — zero drift in either direction**:

    ai-attachments · avatars · blog-images · business-assets · chat-attachments
    course-brochures · email-assets · extraction-documents · lms-assignments
    service-images · service-media · student-documents · verification-docs

That list was carried over from V2 and established against live V1 at rehearsal #2
(2026-07-16). Infrastructure provisioned independently agrees with it. This is the
first corroboration of that reconciliation from a source that is not the plan.

**But those 13 buckets are the V2 model, and they are empty** (`-avatars` lists
nothing). V3 consolidates to one bucket. They are provisioned-but-unused infra.
Not deleted — flagged for the owner. See §15.4.

### 15.3 A Gemini key exists but was never wired

`globalyapp-staging` already holds an API key named `gemini-staging (ai-service)`
(uid `a4468808-…`), plus `supabase-gemini-api-key` (V1's) and `supabase-map-key`.
Nothing needs to be minted. Retrieving the key string and probing the embedding
endpoint was **blocked by the permission classifier** — correctly, since it reads a
credential and posts it to an external service. Left to the owner (§15.5).

**Do not write a live `GEMINI_API_KEY` into `backend/.env` while agents are running.**
`testEnv()` in `tests/setup/db-url.ts` does not pin `GEMINI_API_KEY`, and vitest's
`test.env` merges into `process.env` rather than replacing it. A real key can
therefore reach the suite and flip the fail-closed 503 assertions that the AI paths
depend on. Apply it at a wave boundary, then re-run the full suite.

### 15.4 Open for the owner

  * The 13 empty `globalyapp-production-globaly-*` buckets — V2's model, unused by
    V3. Keep as fallback, or decommission?
  * `gs://storage-globalyapp-production/` contains `.env` and
    `gcp-service-account-key.json`. Secrets in a bucket. Worth an access review
    independently of this migration.
  * ADC quota project is `globalyos-staging` — a different product. Harmless for
    reads, but it bills the wrong project.

### 15.5 Commands the owner must run (need a human)

    gcloud services api-keys get-key-string a4468808-cc3c-4460-a95c-5c0348ce2b88 \
      --project=globalyapp-staging --format='value(keyString)'

Then, once Wave G has merged, set `GEMINI_API_KEY` in `backend/.env`, re-run the
suite, and re-embed the 207 knowledge documents with `job:ai-knowledge-embed`
(`gemini-embedding-001`, `vector(3072)` — see §13).

## 16. Why staging.globalyapp.com does not show the work — 2026-08-17

Owner reported student and other pages broken on staging.globalyapp.com while the
plan calls them done. Both statements are true; they describe different things.

**"Done" in this program means merged to `devops-staging-mvp`. Nothing has ever been
deployed.**

`.github/workflows/build-push-frontend.yml` and `build-push-backend.yml` both trigger
on exactly four branches:

    main · production · staging · develop

`devops-staging-mvp` is referenced by **no workflow in the repository**. So no image
has ever been built from this program's work, and staging.globalyapp.com is serving
`origin/staging`.

### 16.1 The gap, measured

    origin/staging..origin/devops-staging-mvp   122 commits   (ours, undeployed)
    origin/devops-staging-mvp..origin/staging     0 commits   (nothing to pull)
    diff                                        451 files, +75,026 / -2,537

The merge-base is `078b744`, which is the current tip of `origin/staging` — the branch
was cut from the latest team state and no teammate commit has landed since. **There is
nothing to pull.** The team is not ahead of us anywhere.

Compare view:
https://github.com/Globaly-Inc/GlobalyApp-v3/compare/staging...devops-staging-mvp

### 16.2 The ironic consequence

The branch name was forced by the repo's `branch-name-convention` ruleset, which
blocked `staging-mvp` and made us fall back to the excluded `devops**` prefix
(reconciliation log §2). That rename is precisely what took the branch out of the
deploy trigger list. The workaround for one guard rail disabled another.

### 16.3 Teammate PRs that overlap Wave G — COLLISION

Three PRs are open against `staging`. Two touch our ground:

  * **#57** `dev-feat-header-footer-pages` (Sunita, WIP, 93 files) — already implements
    `backend/src/modules/scholarships/` and
    `backend/src/modules/superadmin/monitoring/scholarships/` plus migration
    `20260817_001_scholarships.ts`. **This is the exact module path Wave G1 was told to
    create.** G1 was messaged mid-flight to adopt their layout and build only the
    genuine gap (moderation), not a rival module. My dispatch error: I scoped Wave G
    from the master document without first checking open PRs.
  * **#60** `dev-feat-claim-request` (Likhita) — business claim flow, adjacent to owner
    decision #1 (institutions claimable). No running agent conflicts, but W1/B2 own
    that model and should be diffed against it before merge.

**Process fix for every future wave: enumerate open PRs before dispatching agents.**
The master document is not a complete picture of what is being built concurrently.

## 17. Gate 3 — built, run, RED (2026-08-17)

Harness ported to `backend/scripts/migration/read-parity.mjs`; corpus of 23 entries
(18 tracing). **13 green, 5 red.** Three things V3 needed that V2's version did not
have: schema-per-tenant resolution via `mig.*` (never a guessed `business_*` prefix),
a required provenance expression (a V3-native row cannot satisfy a trace by merely
existing), and `minItems` (V2's harness passed an endpoint returning `[]` — three of
the five failures are caught only by this). The rehearsal-2 lesson is now structural:
`validateEntry` **throws** on `count` + `filtered: true`.

Seeded-mismatch fixture: 9 tests invoking the real CLI, proving it goes red on drift,
deletion, nulled provenance, missing resolver and empty response. A gate never
observed failing is not a gate.

**I verified all four checkable claims by SQL before acting on any of them:**

    v1_staging.countries is_featured        8   ->  public.countries        0
    v1_staging.profiles published          16
    superadmin.extraction_courses    16,909 pending + 128 unverified, 0 verified

### 17.1 The five gaps

1. **Geo detail 500s.** `withImagePreviews` signs `hero_image_url` etc. via
   `resolvePreviewUrl`; V1's URLs are absolute external (pexels/unsplash/supabase),
   which `toStoragePath` passes through and signing hard-throws on. **191 of 198
   countries, 338 cities.** Dispatched for fix at the shared chokepoint.
2. **Featured countries 8 -> 0.** `w1-geo.ts` drops `is_featured` + `sort_order`. The
   public destinations shelf is empty as a direct result. Dispatched.
3. **Student profiles 500 + stale disposition.** Two causes: the dev DB is 3
   migrations behind, AND `mapping.json` still drops `profile_slug` /
   `public_visibility` with reason *"V3 has no public individual profile pages"* —
   **false since Wave D4 shipped exactly those pages.** 16 rows silently lost even
   after the migrations run. NOT yet dispatched — see §17.2.
4. **`/search/courses` empty.** All 17,037 migrated courses are `pending`/`unverified`;
   the endpoint gates on `verified`. NOT yet dispatched — see §17.2.

Also recorded, not failures: `catalog-filters-countries` returns exactly one country
and `search-institutions` 6 of 16 businesses — both correct under `is_published`, but
they show how thin the live public surface currently is.

### 17.2 Two open owner decisions

  * **`profile_slug` / `public_visibility` disposition.** (a) Re-disposition as W3
    transform mappings — recommended, the columns now exist and 16 rows depend on
    them; or (b) leave dropped and accept public student profiles starting empty,
    which contradicts D4 having shipped the feature.
  * **`extraction_courses.verification_status`.** (a) Carry V1's verification state
    through W4 so the pre-promote search surface is not blank; or (b) treat `pending`
    as correct and accept an empty `/search/courses` until verification runs in V3.
    A W4 owner's call, not an agent's.

### 17.3 Deferred by decision

The dev DB on 5432 is 3 migrations behind. Applying them fixes 3(a) in one command,
but the DB is shared with live agents. **Deferred to the wave boundary**, not skipped.

## 18. Stored XSS across every URL field — found, fixed repo-wide (2026-08-17)

The background security review flagged `application_url` / `source_url` in the
scholarships schema G1 adopted from PR #57. The finding was real and **not specific to
scholarships**.

`z.string().url()` delegates to the URL constructor, which accepts **any** scheme.
Verified directly:

    ACCEPTED  javascript:alert(document.cookie)
    ACCEPTED  data:text/html,<script>alert(1)</script>
    ACCEPTED  vbscript:msgbox(1)

The frontend renders these straight into anchor hrefs — `course-card.tsx`,
`visas-view.tsx`, `mara-agents-view.tsx`, `course-detail-panel.tsx`, `context-tab.tsx`
all do `href={row.some_url}`. A `javascript:` value stored through an admin API is
stored XSS firing on click. `rel="noopener noreferrer"` does not help: it governs the
new browsing context, not whether the scheme executes.

**25 call sites across 10 schema files were already live with this** — businesses,
events, blog, billing, categories, platform-users and three extraction schemas. The
teammate PR was the messenger, not the cause.

Fixed at the root (`2a97355`): `backend/src/shared/url.ts` exports `webUrl()` with a
closed http/https allowlist; all 25 sites converted. Rejects rather than sanitises — a
link the user cannot click is a visible bug, a link that runs script is an invisible
one. `webUrl({ max })` exists because `.refine()` returns a `ZodEffects` and
`ZodString`'s chainable methods are gone after it; two events fields chained `.max()`,
and **the typecheck caught that, not review.**

Mutation-tested: re-adding `javascript:` to the allowlist fails 4 tests; reverting
restores all 15. 406 unit tests green, typecheck clean, 0 lint errors.

All three live agents were told to rebase and to use `webUrl()` for every URL field in
their new schemas — jobs, visas/MARA and certificate/ambassador links are all exactly
this hazard.

## 19. Session-limit kill #3 — the incremental-commit rule paid for itself

All four agents died at a session limit mid-flight. **Nothing was lost**: G1 had 4
commits, G2 2 commits, G4 2 commits, Gate 3 2 commits + pushed. Only G1 (2 files) and
G2 (4 files) had uncommitted work, and both were told to commit it first on resume.
The three survivors were resumed with their context intact rather than restarted.

## 20. Owner decisions on the two Gate 3 questions — 2026-08-17 (round 3)

**Decision A — re-disposition `profile_slug` / `public_visibility`.** ACCEPTED, dispatched.
Both were dropped in `mapping.json` on the reason *"V3 has no public individual profile
pages"*, which Wave D4 falsified. 16 rows depend on it.

Verifying the data before dispatch changed what the transform has to do. The D4
migration states that NULL `public_visibility` means "the defaults, resolved at read
time", and that storing the defaults would freeze them at publish time. Of the 16
published profiles:

  * **14 hold a value byte-identical to `DEFAULT_VISIBILITY`** (same eight keys and
    values; only JSON key order differs)
  * **2 are genuinely customised**

A verbatim copy would therefore have frozen the defaults for 14 of 16 profiles and
quietly defeated the design — a correct-looking migration that breaks a feature. The
transform imports NULL where the value equals the default (compared key-by-key, since
key order differs) and the explicit jsonb only for the 2 that differ.

Assigned to the Gate 3 remediation agent rather than a new one: it already owns
`mapping.json` this round, and §1.7 forbids two agents editing one file in a wave.

**Decision B — carry `extraction_courses.verification_status` through W4. ALREADY
DONE — no work required.** The premise was wrong, mine included. Measured both sides:

    V1  pending 16,909 | unverified 128        V3  pending 16,909 | unverified 128

W4 already migrated the column byte-faithfully. **V1 itself contains zero verified
courses.** `/search/courses` returns 0 because the source data has nothing verified,
not because anything was lost. Gate 3's gap #4 is **not a migration defect** and no
transform should change.

What remains is a product question, not a migration one: the public endpoint gates on
`verified` while nothing in production has ever been verified, so that surface is
empty by construction until verification runs in V3. Recorded for the owner; no code
change made, because changing the gate would be a product decision disguised as a
migration fix.

## 21. Gemini key wired, and the trap it exposed (2026-08-17)

Owner supplied a key. It is **not** the usual `AIza…` shape (`AQ.` prefix), so it was
verified against all three paths before being trusted:

    x-goog-api-key header   200, 3072 dims
    Authorization: Bearer   401 (not an OAuth token)
    ?key= query param       200, 3072 dims   <- the path llm-client.ts:235 actually uses

3072 dims confirms `gemini-embedding-001` against V3's `vector(3072)` column —
independent corroboration of §13.

`.env` now carries the live Gemini key plus the §15 GCP settings. It is gitignored;
verified before committing anything.

**The trap:** `src/config.ts:4` is `import "dotenv/config"`, so a real key in `.env`
reaches everything that imports config — including the integration suite, whose AI
paths are specified to fail closed with 503. Those tests would keep passing while
proving the opposite of what they claim, and some would make live billable calls.
`testEnv()` now pins `GEMINI_API_KEY: ""`.

Honest scope, because the mutation test said so: removing the pin fails **nothing** in
the unit project. Those tests set and delete `config.GEMINI_API_KEY` directly rather
than reading the ambient env, so they were already hermetic by construction. The pin
is belt-and-braces for the integration project, which has no such indirection. Claimed
as defensive, not as proven.

**The key is in the chat transcript. Rotate it after cutover.**

## 22. Wave G batch 1 integrated — G1, G2, G4, Gate 3 (2026-08-17)

All four merged to `devops-staging-mvp`, plus nine teammate commits from `staging`.
State: **485 unit tests**, backend + frontend tsc clean, 0 lint errors, API contract
**335 matched / 0 missing / 0 allowlisted**, full `check:migration` chain green
including Gate 3's self-check.

### 22.1 My own errors this round

  * **I never merged the Gate 3 harness branch.** I merged only `dev-feat-gate3-fixes`
    (the remediation) and reported "Gate 3 harness merged", which was false. Caught
    because `verify:read-parity` was missing from `package.json` after the staging
    merge; chasing that absence revealed `read-parity.mjs`, its corpus and its
    fixtures had never landed. Now merged (1,002 lines) and self-check green.
  * **I told every agent "the repo uses yarn, never npm". Wrong for the backend.**
    `backend/package-lock.json` is git-tracked; only `frontend/yarn.lock` is yarn.
    The backend legitimately uses npm. Correct guidance: **npm in `backend/`, yarn in
    `frontend/`.**
  * `backend/node_modules` was found replaced by a **symlink pointing at itself**,
    created 22:12 during an agent's cleanup, which destroyed the real directory.
    Restored with `npm ci`; lockfile untouched.

### 22.2 The plan's V3-state column is wrong in a consistent direction

Every agent this wave contradicted §3.8, and always the same way — **pessimistic about
what exists, optimistic about what is wired**:

  * Scholarships were NOT "MOCK-ONLY": PR #57 shipped a real table, routes and public
    pages.
  * Jobs and ambassador/training admin pages were NOT mock-backed: they were
    `AdminNotAvailableView` placeholders with no API layer at all. "Delete its mock
    path" was a no-op three times over; the real work was building the API layer.
  * "10 ambassador edge functions" — there are exactly **6** (counted in V1).
  * `other-services` does NOT already model ambassadors; `personal/earn/ambassadors`
    is a `ComingSoon` stub.

For the remaining Wave G rows, read "MOCK-ONLY" as "unknown — go look".

### 22.3 A leak caught before it existed

PR #57's public scholarship reads are `.where({slug, is_published: true}).first()` with
no `.select()`, so Knex returns every column. Harmless on their flat schema — and a
real leak the instant moderation adds `review_status` / `review_note` / `reviewed_by`,
which would have shipped to anonymous visitors. G1 replaced it with an explicit
`PUBLIC_COLUMNS` list asserted from outside.

**This is the second serializer-shaped leak this program has caught** (see §14's
`serializeEvent`). A read path shared between an authenticated and an anonymous caller
is a standing hazard; `select *` on a table whose columns will grow is the mechanism
both times.

### 22.4 Merge decisions worth recording

  * **`url.ts`: took G4's over my own 2a97355.** G4 wrote its own because its rebase
    predated my push by twelve minutes — its report honestly described what it saw. Its
    version is a strict superset (`DEFAULT_MAX` 2000 so every URL field is bounded,
    plus `.min(1)`). All 15 of my original tests pass against it unchanged. G4 said
    "take yours"; taking theirs was the better call.
  * **`package.json`: kept our `lint`**, not staging's. Theirs narrows to `eslint src/`,
    which would silently stop linting `tests/`.
  * **Backend scholarships: took ours**, after verifying the teammate made no change
    after `c63de17` — so staging's copy is exactly G1's base and ours loses nothing.
  * Sunita's `cb6470e` removes the duplicated module-registration block that sat
    outside the auth scope — **the same defect this program fixed independently**. Two
    people found it separately, which says the duplication was genuinely confusing.

### 22.5 Two V1 defects fixed rather than reproduced (G1)

  * The MARA promote RPC referenced `full_name` and **raised on every promote**.
  * The extract launch had a param-name mismatch — the frontend posted `{urls}`, the
    schema demanded `{source_url}` — so **every launch 400'd and the fail-closed 503
    was unreachable**.

Running total of V1 behaviours that turned out to be defects rather than spec: the
double-sold event seats (D3), the blanked event columns (D3b), `job-match-score`
fabricating a 200 and charging before the call (G2), `ambassador_earnings` never being
credited (G4), and these two. §1.6's "legacy bugs are not the spec" has earned its
place six times over.

### 22.6 Still open

  * **G1 asks for a ruling on `visa_service_details` placement.** V2 made it a child of
    the global `business_services`; V3's services are per-tenant, so §1.2 would put it
    in `migrations/business/` and make cross-tenant visa search an N-schema fan-out. G1
    put it in master keyed on the service uuid with an app-level FK, following the
    `catalog_services` precedent, as a plain table because it has exactly one writer
    (promote). **If tenant-side visa CRUD is ever added this must become a projection
    or route through the promote service.** Documented in the migration header.
  * PR #57's migration is `20260817_001_scholarships.ts`, colliding by number with the
    existing `20260817_001_billing_catalogue.ts`. Knex tolerates it; renumbering is
    cosmetic and would rewrite a teammate's merged file, so left alone.
  * Repo-wide branch coverage sits at ~75% against an 80% gate. Pre-existing (baseline
    73.7%); every Wave G agent's own code is above the bar. `npm test` is green; only
    `test:coverage` fails.

## 23. Wave boundary executed — all three gates green (2026-08-17)

Run while batch-2 agents were down on a transient API `529`, since none of it needed
the API. Sequence per §17.3, in the order the data forced:

    1. apply pending migrations   15 globalyapp (batch 3) + 1 superadmin
    2. re-run W1-geo --apply      8 featured countries written
    3. re-run W1-identity --apply 16 slugs, 2 non-null visibility
    4. Gate 2                     GREEN, after the counter fix below
    5. Gate 3                     GREEN

**It was 15 pending migrations, not the 3 I had been saying.** The other 12 were Wave
G's own, merged earlier the same evening. `student_jobs` was empty, so G2's destructive
reshape (`is_published` → `status`, `closing_date` → `closing_at`) had no data to lose
— checked before applying, not after.

### 23.1 Both owner decisions verified live

    countries WHERE is_featured    China/Nepal/NZ/Singapore/UK @0, AU/CA @1, US @2
    profiles WHERE profile_slug    16
    profiles WHERE public_visibility IS NOT NULL    2

Featured order matches V1 exactly. And **decision A's subtlety held**: 20 of the 22
visibility blobs were byte-equal to `DEFAULT_VISIBILITY` and collapsed to NULL, so only
the 2 genuinely customised rows store a value. The defaults stay resolved at read time
instead of frozen at publish time, which is what D4's design requires.

Idempotency proven live, not just asserted: a second `--apply` of W1-geo wrote **0**
featured rows.

### 23.2 Gate 2 went red on three checks, and none was a migration defect

    blog_posts.views        V1=0  V3=3
    events.views_count      V1=0  V3=2

**Live runtime counters.** `posts.repository.ts` and `events.repository.ts` increment
them on every read — and **Gate 3's own read-parity run against this database is what
incremented them**. One gate's normal operation made another gate red. Comparing a
value that any read mutates would have recurred forever.

Moved to `dropped` with a reason. The initial value still migrates; only the
*comparison* is dropped. This matches how every other denormalised counter in
`mapping.json` was already dispositioned — *"Analytics counter; not carried into V3"*,
*"Denormalised counter; V3 recomputes"*. **These two were mapped by oversight, not by
design**, so this is a consistency fix rather than a weakening of the gate.

The third failure — `event_registrations_master` loading over an unreconciled parent —
was a **cascade** of the events mismatch and cleared with it. That is defect D8's
junction guard working as designed: it refused to certify a child while its parent was
in doubt.

Worth recording as a general lesson: **a mutable counter is not migration-comparable
data.** Any column the application writes after import will drift from its source by
definition, and a parity gate that compares it reports usage as corruption.

### 23.3 Gate 3: 5 failures → 0

Three cleared from real fixes: the featured shelf now returns 8, and both geo detail
endpoints return 200 instead of 500 (191 countries / 338 cities had been failing).

Two were corpus calibration, not read-layer defects:

  * **`student-public-profile`** pointed at `globaly-student-u1`, a `-u<id>` slug
    convention the agent had inferred and which **never existed in the data**. Real V1
    slugs are names (`ivya-harati`). Recalibrated — and the entry's own note had
    predicted exactly this: *"recalibrate it once profiles are published."*
  * **`search-courses`** `minItems` 1 → 0 **by measurement, not to make the gate pass**:
    V1 holds 16,909 pending + 128 unverified and **zero** verified, V3 matches exactly,
    so W4 carried the column faithfully and the endpoint is correctly empty. The note
    says to raise it the day verification runs in V3, when an empty result would be a
    real regression.

**Final: Gate 2 GREEN (104 mappings, 6/6) · Gate 3 GREEN (23 endpoints, 161 items, every
one tracing to a migrated source row).** Gate 1's inputs are untouched by this work —
nothing here wrote to `v1_staging` — and it was last verified green at 200 tables /
140,159 rows.

### 23.4 Batch-2 agents: transient 529, no work lost

All four batch-2 agents died on `529 Overloaded` (server-side, not session limits), G7
twice. Every one had committed at least once. G7 had 10 uncommitted files and could not
reach its own commit, so **the orchestrator committed them from its worktree** as a
`wip(g7)` commit to protect them. All four resumed with context intact.

## 24. Three security findings in batch-2 agent work (2026-08-18)

All four batch-2 agents hit a session limit (resets 02:20). 18 commits survived across
them, so nothing was lost. Two of the three findings I fixed directly rather than wait,
because both were unambiguous; the third is a money-semantics decision and went back to
its agent.

### 24.1 Audit-trail bypass — the same defect, for the third time (FIXED, `550eb67`)

`data-extraction/routes/quality.routes.ts` derived the audit actor as:

    const adminId = (req) => Number(req.auth.sub);

`sub` is the **platform_user_id**, not `superadmin.admin_users.id`. The id spaces do not
overlap — `shared/admin-id.ts` records the measured ranges: `admin_users.id` 9..16
against `platform_user_id` 27..44. So the write either violated
`admin_audit_logs.admin_id`'s FK (a 500 on the very action being audited) or, on a
numeric collision, **attributed the action to a different admin**.

`shared/admin-id.ts` exists *specifically* to prevent this. It was introduced once
before and fixed across **65 call sites in ten route files** (§reconciliation earlier).
Every sibling route in the same module already imports `resolveAdminId as adminId`;
this new one did not.

**This is now the third appearance of the same class of bug.** The helper is correct and
well documented, and agents still reach for `req.auth.sub` because it is the obvious
thing. That is a signal about the shape of the code, not about the agents: a raw
`req.auth.sub` is too easy to reach in a module where it is always wrong. Worth
considering a lint rule banning `req.auth.sub` inside `data-extraction/` — the fix that
stops the fourth occurrence.

### 24.2 Fail-open billing in the ads settle path (FIXED, `2ce9ba1`)

`settleImpressionBlock` had a bare `catch {}` that paused the campaign. Only a 402 means
"out of credits". A deadlock, a serialization failure, or a bug inside `spendCredits`
read identically: the impression block silently stayed **unbilled** — revenue lost with
no error surfaced anywhere — and the advertiser was paused for a reason that was never
true. Now only `InsufficientCreditsError` pauses and everything else propagates;
`billing/errors.js` already exported the class, so no new error type was needed.

### 24.3 `cpc` campaigns never charge — LEFT TO THE AGENT, deliberately

`AD_COST_MODELS` is `["cpv", "cpl", "cpc", "flat"]`. Tracing every charge path:

    cpv   charged on impression (perView)     OK
    cpl   charged on lead (perLead)           OK
    flat  plausibly intentional, fee up front
    cpc   charged NOWHERE

A cost-per-click campaign records `is_click: true`, increments `clicks_count`, and never
touches `spent_amount` or `budget_amount`. It serves and clicks indefinitely, free.

**I did not fix this, and the reason matters:** V1's `record-ad-impression` also only
tests `cost_model === "cpv"`, so the omission is faithful V1 parity. Silently starting
to charge money for clicks is a product decision, not a bug fix. Handed back with three
options (charge on click symmetrically with cpv; keep parity but reject `cpc` at
campaign creation so an unbillable campaign cannot exist; keep parity and document),
a recommendation, and an instruction to follow V2's `ads.ts` if it settles the question.

### 24.4 A pre-existing compile error, also left to its agent

`applications/services/charges.service.ts:130` sets `transaction_type:
"application_charge"`, which is not in the credits union. Whether an application charge
spends **credits** (extend the vocabulary) or is a **Stripe payment** (so it does not
belong in that union at all) is a design decision the agent owns.

### 24.5 Standing note

I created a symlinked `node_modules` in two worktrees to typecheck them and **removed
both immediately**. A stray self-referential symlink destroyed the main repo's
`node_modules` earlier (§22.1); the safe pattern is `ln -sfn <absolute path>` then `rm`
the link the moment the check is done, never `-r` into it.

## 25. Two node_modules symlinks were committed to git (2026-08-18)

Found while typechecking a stalled agent's branch. **Both** package trees were tracked
in git as **self-referential symlinks**:

    frontend/node_modules -> /…/GlobalyApp-V3/frontend/node_modules
    backend/node_modules  -> /…/GlobalyApp-V3/backend/node_modules

They point at themselves, so the real dependency trees were gone and any resolver
following them hit ELOOP. Both entered the repository in **`3a1e2b1`** — an agent commit
that used `git add -A` after symlinking to share the parent repo's dependencies with its
worktree. A broken symlink would have shipped to anyone who cloned.

### 25.1 Why .gitignore did not stop it

Both files already listed `node_modules/`. **The trailing slash makes the pattern
directory-only, and a symlink is a file** — so the rule never applied. Added a bare
`node_modules` line to both `.gitignore`s and verified the new pattern matches a symlink
before committing (`git check-ignore -v` against a deliberately created test symlink).

This is the whole mechanism of the earlier `backend/node_modules` destruction (§22.1),
and it recurred because only the symptom was fixed the first time, not the ignore gap.

### 25.2 A correction to something I reported

I previously reported "frontend tsc green". **That was wrong.** The run produced no
output because `npx` could not resolve its own compiler through the broken symlink, and
I read empty output as success. Re-checked by **exit code** this time: `tsc` first
reported six errors, all inside the generated `.next/dev/types` cache and all naming
routes that had since been renamed (`admin/data/ai-extraction` →
`all-extractions`). Clearing that stale, gitignored cache leaves `tsc --noEmit` at
**exit 0**. The frontend does typecheck clean — but it is verified now rather than
assumed.

**Standing lesson: check exit codes, not empty output.** A tool that cannot start prints
nothing, which is indistinguishable from a tool that found nothing wrong.

Restored `frontend/` with `yarn install --frozen-lockfile` (lockfile untouched);
`backend/` had been restored earlier with `npm ci`.

## 26. Batch 2 — three interruption modes, all work preserved

Each of the four branches was interrupted three times, across three distinct failure
modes: **session limit** (reset 02:20), **API 529 Overloaded**, and a **stream watchdog
stall** (no progress for 600s). None was a fault in the agents' work.

Every interruption was survivable because of the standing commit-incrementally rule, and
where an agent could not reach its own commit the orchestrator committed from its
worktree — G5, G6, G7 and G8 all now sit clean:

    G5 10 commits · G6 8 · G7 9 · G8 9      (36 total, 0 uncommitted)

All four were resumed with priorities inverted for the conditions: **push a green branch
first, polish second.**

### 26.1 Work the agents did that is worth keeping visible

  * **G7 `94e099a`** — the shared error handler was converting **Fastify-native 4xx into
    500s**, so every rate-limited request in the app reported a server fault instead of
    a client one. A client that retries on 500 but backs off on 429 would have behaved
    wrongly across the whole API. Cross-cutting; asked for the list of routes whose
    behaviour changes.
  * **G8 `ebe26d5`** — `auto_flagged` counts were being lost by a second persist pass.
    Its own discovery, unprompted.
  * **G8 `33863a8`** — added a regression guard for the audit-actor bypass immediately
    after I fixed it, which is the right instinct: the bug had already recurred twice.

## 27. Wave G complete — all seven agents merged (2026-08-18)

    G1 scholarships+visas · G2 jobs · G4 ambassador+training · G5 ads+charges
    G6 favourites/waitlist (API) · G6-FE (frontend) · G7 embed/FX/cross-app
    G8 extraction tail

State: **623 backend unit tests · 28 frontend unit tests · backend+frontend tsc exit 0
· 0 lint errors either side · contract 348 matched / 0 missing / 0 allowlisted · Gates
2 and 3 green.**

### 27.1 The best verification result of the program (G8)

Removing the D8 orphan guard did not merely fail tests — it **produced a real orphan**:
service `c` reached **1** fee before the merge and **0** after, with the transaction
**committed**. The mechanism is exactly what D8 predicted: a soft-deleted junction row
still occupies `UNIQUE(service_id, service_fee_id)`, so the re-point's `ON CONFLICT DO
NOTHING` swallows it — **an insert that reports success while achieving nothing**.
Counting parents before and after is the only check that can see it. No mocking.

### 27.2 A gate I have been over-citing

`scripts/check-api-contract.mjs` scans **only** `frontend/src/**/apis/real-api.ts`
(line 271) and, within those files, only paths that are string literals or templates.
A **bare identifier** argument is invisible to it — G6-FE proved this by breaking one
and seeing 2 of its 3 calls reported. It also **never scans the public `(web)` portal**,
which fetches through 7 separate `<feature>/api.ts` files.

"0 missing, 0 allowlisted" therefore means: no MISSING route among the calls the
checker can see. **It is not whole-frontend coverage, and I have been reporting it with
more weight than it carries.** Widening it (scan `(web)/**/api.ts`, resolve
single-assignment identifiers) is a genuine follow-up.

### 27.3 V2 is not a clean contract either

Until G6 every defect found had been V1's. G6 found two in **V2**:
  * V2 pinned `organization_id IS NULL` on every saved-filter query, so `shared = true`
    published a filter to **every authenticated caller on the platform** — its own
    comment concedes the RLS policy had no `USING` clause.
  * V2's `user_default_filters` was UNIQUE on a key containing a **nullable** column,
    so `ON CONFLICT` could never match and two concurrent PUTs raced into two rows.

§1.7 calls V2 "contracts to read, never code to copy". That was framed as an
architecture rule; it turns out to be a correctness rule too.

### 27.4 My own errors this wave, for the record

  * Told G5 its commit introduced the `node_modules` symlinks — it was a **G1** commit;
    G5's commits removed them.
  * Escalated a "cpc billing product decision" to the owner that **did not exist**: V1's
    own trigger allows only `cpv`/`cpl`, so `cpc` was an agent invention, not parity.
  * Told G6-FE the backend was on its branch; its worktree was on a **stale** branch
    with no `modules/favorites` at all. It cut a clean branch itself.
  * Described merge-duplicates to G8 as deduping institutions/courses; V1's RPC actually
    dedupes `service_fees` **within one business, post-promote**. It ported the real
    semantic.
  * Reported "frontend tsc green" from **empty output** when the tool could not start
    (§25.2). Standing rule now: **check exit codes, not silence.**

Four of five were caught by the agents themselves, from the primary sources, which is
the strongest argument for the "verify, don't trust the brief" instruction being in
every prompt.

### 27.5 Honest remaining gaps

  * **8 service-vertical tables** — tables and jobs-repo whitelist exist; no routes, no
    UI. Untouched.
  * **~170 V2 extraction tests** — reduced, not closed: 109 added; scraper, LLM parsing,
    staging writer, fee matcher and junction assignment remain uncovered.
  * **Saved filters** — 6 endpoints shipped and deliberately unconsumed; they need a host
    admin list page that does not exist.
  * **4 of 7 favourite types have no public detail route** (`institution`, `business`,
    `job`, `event`), so those cards render as text. Filling `route` in the const map is
    the whole change once a wave adds the page.
  * **Suite-wide branch coverage ~77%** against an 80% gate — pre-existing; every Wave G
    module is individually above the bar.

## 28. E1 embedding run — the case for running the real thing (2026-08-18)

The module had passing unit tests, an injectable provider, a documented fail-closed
design and a 3072-dim column that matched its model. Running it for real found **five
defects**, two of which are production data-loss bugs, and **none of them was reachable
from the test suite**.

### 28.1 BLOCKER: the key is free tier

    quotaId    EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier
    quotaValue 1000 requests/day
    corpus     8,075 calls needed

Nine days of free quota. **Billing must be enabled on the key** — then the run is ~10
minutes and **~$0.27** (8,075 calls, 1,775,434 input tokens, 220-300 ms warm latency,
`LLM_THROTTLE_MS=25` at Tier-1 3,000 RPM). Today's ~1,000 calls are spent; the API is
backing off 776 s.

**This is now the second credential blocker for cutover, alongside the `gmig_` token.**

### 28.2 Verified corpus state (my own SQL, not the agent's)

    chunks               8,075   (all persisted — DB writes precede the provider, as designed)
    chunks with a vector    76   (0.94%)
    documents              207   active

The plan's 207 documents / 58 sources figures are correct — the first wave where a plan
figure needed no correction. An offline pre-count predicted 8,075 and the run wrote
exactly 8,075, so the chunker is deterministic.

**Idempotency proven without spending quota:** 36 fully-embedded documents re-delivered
gave 36/36 `already_current`, 0 chunks embedded, 0 `embedded_at` moved. The
`(document_id, content_hash, embedding_model)` triple is checked before the network is
touched.

### 28.3 Two production bugs, fixed

  * **429s dropped documents permanently.** Publishing 207 documents at once made the
    consumer run them concurrently; Gemini rejected 184 with a 429; `queueService` nacks
    with `requeue=false` (verified at `queueService.ts:247` and `:321`). **39 of 8,075
    chunks embedded and 184 documents lost, with nothing louder than a log line.** Now
    routed through `withRetry()` — the helper `generateContent()` always used. The error
    slice widened 200→500 chars because Gemini puts `retryDelay` at the *end* of the
    body, so the old slice cut off the one hint `parseRetryDelay()` exists to read.
  * **The throttle was not concurrency-safe.** It compared `now` against `lastLlmCall`
    per caller, so N waiters woke together and burst — 21 chunks in 5 minutes against a
    budget that should have carried ~400. Now a promise-chain gate. The provider's own
    per-chunk sleep is deleted: it double-counted the same wait and, being per-batch,
    did nothing about calls from a concurrent message.

### 28.4 The RRF is not hybrid — verified empirically

`websearch_to_tsquery` joins every lexeme with `&`. Confirmed directly in Postgres:

    'english' & 'languag' & 'requir' & 'australian' & 'student' & 'visa'

so the text arm only matches a chunk containing the **whole question**. Over 20
natural-language questions it returned **zero rows for 20 of 20** (recall 0.000); an OR
variant scored 0.550. **On realistic input the hybrid retrieval degrades to vector-only
100% of the time.**

The fixture never caught it because all 12 fixture queries are keyword-shaped — and its
vector leg is `stubEmbed()`, a SHA1-bucketed bag of words. **The passing hybrid 1.000
measures RRF plumbing, not semantic recall.** A green quality gate over a synthetic
corpus was reporting the opposite of the truth.

Deliberately not fixed, and the reasoning is sound: OR unconditionally drops fused
fixture recall 1.000 → 0.833, because unweighted RRF lets a broad arm dilute rather than
lose politely; strict-then-loose holds the fixture but lets the text leg answer all 12
questions alone, **disarming the "fails when nothing has been embedded" canary**. A
correct fix needs real vectors and a re-derived question set. Pinned as a
characterisation test with both dead ends recorded in the comment.

### 28.5 The HNSW index is dead for production queries

`idx_akc_embedding` exists and pgvector is **0.8.6** (both verified). The bare ANN shape
uses it; the shipped shape with three visibility joins does **not** — it `Sort`s even
with `enable_seqscan=off`. Every query full-scans. Fine at 8k chunks, not at 10×. Fix is
index-driven ANN on the base table first, then join for visibility, or pgvector 0.8
iterative scans. Also `llm-client.ts` still claims *"pgvector 0.6 can't index >2000 dims
— we skip the index and use sequential scan"*: stale on both counts.

### 28.6 Operational lesson for the rehearsal

Use the `{limit: N}` sweep for backfills, not 207 individual `{documentId}` messages:
207 handlers in flight interleave every document's chunks and writes batch at
25/document, so almost nothing lands. Killing a worker mid-flight requeues unacked
messages with no dedupe (301 unacked from 207 published) — harmless **only** because
idempotency holds.

## 29. Interruption taxonomy, and why incremental commits are the load-bearing rule

Four distinct interruption modes have now hit agents in this program, none of them a
fault in the agents' work:

| Mode | Cause | Recovery |
|---|---|---|
| Session limit | account cap, resets at a fixed hour | resume after reset; context intact |
| `API Error: 529 Overloaded` | server-side, transient | resume immediately |
| Stream watchdog stall | no progress for 600 s, stream unrecovered | resume; commit first |
| **Machine sleep** | `pmset sleep 1` — idle sleep after **1 minute** | resume; hold sleep off |

**Total work lost across every one of these: zero.** Every agent had committed, and where
one could not reach its own commit the orchestrator committed from its worktree. The
"commit incrementally, a partial commit beats none" instruction in every prompt is the
single highest-value line in the dispatch template.

### 29.1 The sleep setting

`pmset -g custom` reports `sleep 1` and `displaysleep 2`. A one-minute idle-sleep timer
will interrupt any agent whose run outlasts a quiet minute, which is most of them —
recent agents have run 15–65 minutes. Held off with a bounded, self-expiring assertion
rather than changing the owner's power configuration:

    caffeinate -i -m -t 14400 &     # 4 hours, then releases itself

Verified with `pmset -g assertions` (`PreventUserIdleSystemSleep 1`). Nothing persistent
was modified. **If long agent runs are going to continue, the owner may want
`displaysleep` kept short but `sleep` raised** — that is a machine-configuration
preference, not something to change on their behalf.

### 29.2 Orchestrator practice that has proven worth keeping

  * **Commit an agent's in-flight files from its worktree** when it dies before it can,
    with a `wip(<agent>)` message that says who committed it and why. Done for G5, G6,
    G7, G8, E34 and G9.
  * **Spot-check the protected work against the module's standing rules before
    committing it** — for G9 that meant confirming the new route imported
    `resolveAdminId` rather than reading `req.auth.sub` (three prior occurrences) and
    that the repository had no `select *`. Both were already right.
  * **Keep scratch out of the repo.** E1's seven `e1-*.ts` measurement scripts were
    preserved outside the tree rather than committed to the backend root.

## 30. All build waves complete — every quality gate green (2026-08-18)

    98 files / 2113 tests / 0 failures
    Statements 93.75%   Branches 82.91%   Functions 95.41%   Lines 96.30%
    coverage exit 0  ·  tsc 0  ·  eslint 0  ·  contract 352 matched / 0 missing / 0 allowlisted
    Gate 1 green · Gate 2 green (104 mappings) · Gate 3 green (23 endpoints, 161 items)

**The 80% branch gate has never passed before in this program.** It does now, honestly:
`coverage.include`, `exclude` and all three thresholds are byte-identical to the base,
no test was deleted or weakened, and no file was added to inflate an average.

### 30.1 The W6 test failure was a real leak, not flake — twice

Two agents reported `w6-storage-rewrite.test.ts` as flaky infrastructure. It was
neither. `buildInventory` scans every schema and every text-ish column — that breadth
is the point of the storage sweep, since a V1 URL can hide anywhere — and tenant
provisioning **never drops its schema**:

    accumulated across runs   588 schemas   57,900 columns
    created by ONE suite run  516 schemas   52,290 columns

The test went from 1.5s to a 30s timeout on a file no branch had touched. Fixed in two
places: global setup drops orphans before migrations (across-run growth), and the test
clears debris before scanning (the larger, within-run effect).

**Raising the timeout was the wrong fix and was rejected deliberately** — the test
asserts what the inventory *finds*, and a bigger number would have hidden a 20x
slowdown instead of revealing it. Safe because the integration project runs files
serially and the UUID pattern cannot match `public`/`superadmin`/`mig`/`v1_staging`.

### 30.2 Two money bugs found by writing tests against untested code

  * **COV2-1, ungrouped OR** (`billing.repository.ts`). `.where(A).orWhere(B).whereNull(C)`
    emits `A OR B AND C`, and SQL binds AND tighter — so `deleted_at IS NULL` applied to
    the **annual branch only**. Proven against Postgres: the ungrouped form matches a
    soft-deleted plan (1 row), the grouped form excludes it (0). On the webhook
    settlement path, so a **withdrawn plan's `monthly_credit_grant` was granted on every
    delivery**. Every `orWhere` in `src/` was grepped: this was the only ungrouped one.
  * **Fee money was floored** (`staging-writer.ts`). `coerceInt` on a NUMERIC column, and
    I verified the corpus: **971 of 8,541 fee rows are fractional** (20938.50, 16462.75)
    — up to 99c lost per fee. An ATAR of 72.5 became 72 the same way.

### 30.3 Other verified corpus evidence

    intakes orphaned (course_id IS NULL)   64      ON DELETE SET NULL vs a cascading junction
    duplicate course name groups           26 vs 21  5 groups exist purely from a normalisation mismatch
    SOP tables in the 199-table V1 census   0      §3.7's "used in prod" is false

### 30.4 Mutation testing, cumulative verdict

Across the program: guards proven load-bearing by producing **real** damage (G8's orphan
— a service reached 1 fee before a merge and 0 after, committed), and **four** separate
cases of two guards masking each other where the fix was a test per mechanism rather
than a stronger route test (G7's provider assert, E3/E4's transcription assert, E5's SOP
provider, and A-COV's dedup probe where the mutation was killed *by the wrong tests*).

COV-2's 7-for-7 is the shape to aim for: **six of seven mutants were killed by exactly
one test** — the test that claims to protect a mechanism is the test that fails.

### 30.5 Two remaining owner blockers

  * **Gemini billing.** Free tier caps `embedContent` at 1,000/day; the corpus needs
    8,075. ~$0.27 and ~10 minutes once enabled. Until then RAG runs on 0.94% coverage
    and recall@5 cannot be measured honestly.
  * **The `gmig_` token** for W6's object copy and rehearsal #1.

### 30.6 Known non-blocking gaps

  * **The RRF text arm ANDs every lexeme**, so hybrid retrieval degrades to vector-only
    on any natural-language question (0/20). Pinned as a characterisation test; a correct
    fix needs real vectors, so it waits on billing.
  * **The HNSW index is unused** by the shipped 3-join query shape.
  * **No extractor** writes to the 8 service-vertical tables; the review surface is real
    but will stay empty until one does.
  * **`check-api-contract` is narrower than it looks** — it scans only
    `apis/real-api.ts` for literal/template paths, and never the public `(web)` portal.
  * Frontend absent for favourites-adjacent SOP and scribe surfaces (APIs complete).

## 31. PR #73 opened, and the enquiries collision resolved (2026-08-18)

**https://github.com/Globaly-Inc/GlobalyApp-v3/pull/73** — `staging` ← `devops-staging-mvp`,
827 files, +128,041/−7,850, MERGEABLE.

    99 files · 2154 tests · 0 failures
    Statements 93.42%  Branches 82.43%  Functions 94.99%  Lines 95.99%   (coverage rc=0)
    contract 372 matched · 0 missing · 0 allowlisted
    backend tsc/eslint rc=0 · frontend tsc/eslint/build rc=0

### 31.1 A false regression I nearly reported

The first post-merge run showed **12 auth failures** — `column "cover_url" does not exist` —
which read as the merge breaking authentication. It was not: those columns are in *our own*
base migrations, which were **edited in place** (§1.2.1 allows and prefers this), while my
test database was never rebuilt. Dropping and recreating it gave 2137/2137 green.

**§1.2.1's "rebuild dev DBs after" is not optional advice.** Editing a migration in place
means every database that already ran it is silently behind, and the symptom looks exactly
like a code regression in whatever merged last.

### 31.2 Two live defects found in `staging` while merging

Neither caused by this PR; both are on `staging` today.

  * **`CREDIT_GATE_ENABLED = false`** in `ai-counsellor/routes/chat.routes.ts`, with the
    comment *"gate disabled while testing RAG results — re-enable before launch"*.
    **Unlimited paid Gemini calls on an empty wallet.**
  * **Course visibility relaxed to job level** (`job exported, minus flagged`), so promoting
    one job publishes every course in it including rows a reviewer never saw. Their own
    `knowledge.repository.ts` ANDs both gates and its comment claims *"same gate as the
    search module"* — so the relaxed version contradicts its author's stated intent.

### 31.3 The enquiries collision — owner decision, then reconciliation

Two independent enquiries modules, same table names, incompatible PKs (theirs uuid, ours
`increments()`). `enquiries`, `enquiry_distributions`, `enquiry_email_queue` and
`representations` each created twice, so `migrate:globalyapp` failed outright.

**Owner ruled: keep D1, wire their inbox to it.** Their frontend was repointed to our
canonical paths — no alias routes, because two paths for one resource is the debt the
collision came from. Two endpoints built:

  * `POST /business/enquiries/:distributionId/close` — `closed` was **already** in
    `DISTRIBUTION_STATUSES` and CHECK-enforced, so this exposed a transition we modelled and
    never routed. Closable from every status except `closed`; deliberately **not** blocking
    `responded`, since that is the status a lead reaches by going well and blocking there
    would strand those rows permanently. Idempotent by predicate (`WHERE status <> 'closed'`),
    with the test asserting an unchanged `updated_at` as the witness that no second write
    happened.
  * `GET /business/enquiries/credits` — delegates to `billing`'s wallet read. One balance
    calculation, not two.

`close_reason` stored (owner recommendation) with `closed_at` beside it, because `updated_at`
cannot answer "when was this closed" once any later write moves it.

### 31.4 Their UI described a backend that no longer existed

More than the four endpoint mismatches: uuid ids, `tier`/`match_rank`, a per-enquiry unlock
cap we do not have, joins to columns that do not exist — and **flat nullable
`student_name`/`_email`/`_phone`**.

That last one mattered most. D1 **omits** the contact keys on a locked row rather than
nulling them, so `InboxItem` became a discriminated union on `unlocked`: **the paywall is now
a compile error rather than a convention.** The mock omits the keys too, so a component
cannot pass in mock mode and leak in production.

### 31.5 One more money bug, found while building the close route

`unlockEnquiry` ended its transaction with an **unconditional**
`setDistributionStatus(id, 'viewed')`. Paying for an already-closed lead dragged the row out
of `closed` while leaving `closed_at`/`close_reason` set — a row asserting both states — **and
billed the business for a lead it had declared finished with.** Now a 409 before anything is
claimed or charged.

The detail worth keeping: the comment on the very next line reads *"Only ever an upgrade: an
enquiry the student already converted must not be dragged back to 'viewed' by a late unlock"*.
The author guarded the **enquiry** against exactly this hazard and left the **distribution**
unguarded one line above. Being right about a hazard in one place is not the same as being
right about it everywhere it applies.

### 31.6 A mutation that survived, and why that was the useful answer

Dropping `business_id` from the close route's **UPDATE** predicate killed nothing — the
service lookup 404s before the UPDATE ever runs. Dropping it from the **lookup** killed
exactly the cross-business test. Both were kept: the guard that holds is the lookup, and the
repository predicate is a second line no test can currently distinguish. Reported as
defence-in-depth rather than as a 2-for-2.

### 31.7 Still open for the owner

  * **Gemini billing** (~$0.27) and the **`gmig_` token** — unchanged.
  * **`staging` has no branch protection** and both workflows trigger on a push to it, so
    **merging PR #73 is the deploy**. This branch has never been built by CI.
  * An orphaned `business_enquiries` tenant table from the removed backend; reclaiming it
    means a migration against every tenant schema.
  * A `personal/enquiries` UI gate that is stricter than the server (100% profile completion,
    which our route never checks). Comment corrected; loosening the gate is a product call.
