# V1 → V3 One-Off Data Migration — Implementation Plan

**Date:** 2026-08-17 · **Restored 2026-08-17** after the untracked file was lost in a repo update (§2 reconstructed from working notes; all other sections verbatim). **Supersedes:** §3 ("Data migration plan") of the 2026-08-16 implementation & migration plan. The build-plan waves (A–G) of that document stand; this document replaces only how the data moves.
**Invariant (unchanged):** V3's architecture is the target and is never compromised — Fastify 5 + Knex + Postgres, one database with `public` (globalyapp), `superadmin`, and UUID-named per-tenant schemas; serial integer PKs; GCS storage; OTP/JWT auth. All V1 data migrates *into* this shape.

---

## 0. What changed vs the previous plan, and why

The previous plan prescribed hand-written per-table migration scripts (waves M0–M6) that pull from V1 over HTTP, "extending the existing script family." Two findings force a redesign:

1. **The script family does not exist.** The only migration script in this repo is [import-v2.ts](../../backend/scripts/import-v2.ts) (V2 extraction dump → V3, 338 lines). There are no V1 identity-import scripts, no resolver-map code, and no occurrence of `v1_business_id` anywhere in this repo or its git history. The claim "identity is done, resolver maps exist" refers to *database state* (24 users / 16 businesses migrated at some point) whose producing scripts are not checked in. Anything not in the repo cannot be re-run at cutover — so for planning purposes the migration tooling is at zero, minus one good V2-import script whose conventions we keep.

2. **V2 already built and battle-tested the hard half.** `GlobalyApp-V2/migration/` contains a complete, live-rehearsed V1-extraction pipeline: HTTP source adapters against Lovable's `migration-export` edge function, an FK-topological manifest generator, a drift-safe loader, a four-check parity gate, a storage migrator, and an auth-user importer. Rehearsal #2 (2026-07-16) ran the whole thing end-to-end against real V1: **22 users + 138,140 rows across 195 tables + 13/13 storage buckets, all parity gates green, zero errors.** Rewriting per-table HTTP pullers by hand, as the old plan implied, would discard the most proven code in the whole program.

The V2 tooling can't be pointed at V3 directly — V2's target was column-compatible with V1 (uuid PKs, same table names, `columnStrategy: "intersect"`), while V3 renames tables, uses serial integer PKs, and splits data across master/superadmin/tenant schemas. So the new architecture splits the migration into **two stages with a staging schema in between**, reusing V2's tooling verbatim for stage 1 and confining all V3-specific work to stage 2, where it runs as local, transactional, re-runnable SQL/TS transforms.

---

## 1. Ground truth (verified 2026-08-17)

**V3 (this repo)**
- One Postgres database; knexfile envs `globalyapp` (public schema) and `superadmin` (searchPath `superadmin, public`); tenant schemas migrated by [migration-runner.ts](../../backend/src/workers/migration-runner.ts) from [database/migrations/business/](../../backend/database/migrations/business/) (currently: roles, agents, agent_invitations, permissions, schema_field_values, business_branches, business_activity_log, and a thin single-table `business_services` — **the fee/intake/eligibility/study-option family is still missing**; updated 2026-08-17 vs `staging` @ `64b3165`).
- `public` has: platform_users + auth tables + profiles, businesses (with `meta jsonb`), institutions (`platform_user_id`/`email`/`subdomain` all NOT NULL — the M0.3 decision is still required), countries **and cities** (both exist, from [20260722_001_countries.ts](../../backend/database/migrations/globalyapp/20260722_001_countries.ts)), uploaded_files, degree_levels, areas_of_study, fee_types, issuing_organizations, accreditations (+scope), schema_fields, feed, audit_logs, user_business_index; since the 2026-08 merges also business_representations, other_services (+categories), student_jobs.
- `superadmin` has: admin_users/invitations, reference_tables, admin_audit_logs, feature_flags, site_access_settings, the full `extraction_*` family, blog. (`ai_knowledge_*` is on the unmerged `dev-feat-ai-knowledge` branch.)
- Existing script conventions to keep (from import-v2.ts): `--dry-run` first, ON CONFLICT upserts keyed on stable ids ("rerunnable by construction"), column resolution by **introspecting both sides** rather than hardcoded maps, dropped columns **reported, never silently lost**, batch inserts, group ordering parents-before-children with junctions last.

**V1 (Lovable/Supabase, live)**
- No direct Postgres or S3 access. The only way in is the **`migration-export` edge function** + a super-admin-minted `gmig_` Bearer token (90-day cap, audited). The function is deployed on live V1 but is *not* in the V1 repo copy — treat V2's documented contract as authoritative: `GET /tables`, `GET /export?table=&limit=&offset=`, `GET /storage/buckets`, `GET /storage/list`, `GET /storage/signed-url`, `GET /auth-users?page=&limit=`.
- Authoritative live table census: [GlobalyApp-V2/migration/v1-tables.json](../../../GlobalyApp-V2/migration/v1-tables.json) — 199 live tables; V2 classified **195 load / 11 skip**, finalized against the live API.
- The local V1 restore is the **2026-07-16 snapshot**; live V1 has drifted. Every count below drifts until the cutover re-extract.

**V2 (design library + proven tooling)** — all in `GlobalyApp-V2/`:
- `migration/generate-manifest.mjs` → `tables.json` (Kahn topological `loadOrder`, `columnStrategy: "intersect"`, exits non-zero on FK cycle).
- `migration/export-import.mjs` — paginated HTTP `/export` → `json_populate_recordset(NULL::"<t>", $1)` (Postgres coerces uuid/jsonb/array/timestamp for free), `session_replication_role = replica` during load, truncate-first idempotency, `setval` all sequences after. Source adapter is ~10 isolated lines.
- `migration/verify-db.mjs` — four checks per table: count parity (HTTP `count` vs `count(*)`), content parity (all rows by PK, normalized deep-equal over the column intersection), FK-orphan anti-joins from `pg_constraint`, sequence ≥ max(pk). Exit 0/1. Self-check: point both sides at the same DB → all green.
- `migration/storage-migrate.mjs sync|verify` — recursive `/storage/list`, **always fetch via signed-url** (rehearsal #2 lesson: picking public-vs-signed by target visibility 400s when scopes differ), upload via `gcloud storage cp`, verify = per-bucket count + total bytes.
- `db/scripts/import-users.mjs` — HTTP `/auth-users` source, preserves UUIDs, idempotent, runs **before** the row load so `*.user_id` FKs resolve.
- `db/migration/RUNBOOK.md` — cutover-day sequencing (freeze → mint token → extract → verify → **revoke token + delete export function same day**).
- `apps/core-api/src/db/schema/schema.ts` (206 tables) — the schema *spec* for every V3 feature still to be built (Waves B–G), transformed to V3 conventions.

---

## 2. Two-stage architecture *(reconstructed section)*

**Stage 1 — extract (V2 tooling verbatim).** A `v1_staging` schema in the V3 database receives all 199 V1 tables **byte-faithfully**: same table names, same columns, uuid PKs intact. `generate-manifest.mjs` + `export-import.mjs` run unmodified except for the connection targets; `import-users.mjs` lands auth users into staging first so FKs resolve. Truncate-and-reload = idempotent by construction. **Gate 1** (`verify-db.mjs`, unchanged) proves staging ≡ V1.

**Stage 2 — transform (all V3-specific work, local).** TS transforms under `backend/scripts/migration/` (extending import-v2.ts conventions) read only from `v1_staging` and write into `public` / `superadmin` / tenant schemas: uuid→serial via resolver maps, renames/splits/merges, master-vs-tenant placement. Driven by a single **`mapping.json`** that dispositions every staging table as `transform | drop(reason) | blocked(dependency)` — coverage is arithmetic, not memory. Each transform: single transaction, `--dry-run` default / `--apply` / `--self-check`, natural-key idempotent upserts, unresolved rows to reason-coded report tables.

Why the split wins: extraction bugs and transform bugs can't hide behind each other (Gate 1 isolates one, Gate 2 the other); the expensive HTTP extract runs once per rehearsal while transforms re-run locally in seconds; and the cutover-day critical path shrinks to extract + verified replay.

---

## 3. Verification gates

**Gate 1 — staging parity** (V2 `verify-db.mjs`, checks unchanged): count parity per table, content parity by PK over the column intersection, FK orphans, sequence ≥ max(pk). Green means extraction is beyond doubt; every later discrepancy is a transform bug by elimination.

**Gate 2 — `verify-migration.mjs`** (new, driven by `mapping.json`), per `transform` mapping:
1. **Count reconciliation:** `staging source rows = V3 target rows attributable to this migration + rows in the skip-report`, exact. No silent drops, by arithmetic.
2. **Content spot-parity:** join staging→target via the resolver on the natural key, deep-compare the mapped columns (reusing verify-db's normalizer) over full table for <10k rows, deterministic sample above.
3. **FK orphans** across all touched V3 schemas (same `pg_constraint` scan as V2's, run per schema).
4. **Sequences ≥ max(pk)** on every touched serial.
5. **Junction guard:** every junction mapping declares its two parent mappings; both must reconcile before the junction loads (defect D8: `ON CONFLICT DO NOTHING` turns ordering bugs into silent orphans).
6. **Report must be explained:** every report row carries a reason code from a closed enum; unknown reason = gate red.

Seeded-mismatch fixtures for Gate 2 (drifted row, orphaned FK, lagging sequence, unexplained skip) are the Wave-B4 tests from the build plan, unchanged.

**Gate 3 — read-parity** (deferred until Wave C public APIs exist): port V2's `read-parity.mjs` + corpus — every item a V3 public endpoint returns traces to a migrated source row. Rehearsal-2 lesson kept: per-item trace, no brittle exact counts on filtered endpoints.

---

## 4. Transform waves

Same dependency logic as the old M-waves, renumbered W1–W7, each now a transform over `v1_staging`. Conventions for every wave: idempotent natural-key upsert · unresolved → report table with reason code · dry-run default · `--self-check` on pure helpers · Gate 2 for the wave's mappings green before the next dependent wave.

**W0 — tooling bootstrap** *(everything depends on this)*
Staging DDL + `extract.mjs` + `verify-staging.mjs` + transform runner (`lib.ts`: transaction/dry-run/report/resolvers) + `mapping.json` with all 199 tables dispositioned + `verify-migration.mjs` + the seeded-mismatch test fixtures. Also the **iCloud check** from the old plan §6 if any of this runs on the Mac workspace: live Postgres data dirs and git repos under iCloud sync are a corruption hazard — move or `.nosync` first.
*First runnable milestone:* extract from the 2026-07-16 local restore → Gate 1 green against the restore itself.

**W1 — identity reconcile & geo** *(old M0; unblocks every resolver)*
1. `countries` 24 → 198 (V1 `code`→iso2), `cities` 332 → 2,078 — tables already exist, pure data.
2. **Identity reconcile:** `import-auth-users.mjs` (from V2's, retargeted at `platform_users` + auth tables) and business/tenant upserts, keyed on email / business natural key, stamping `businesses.meta->>'v1_business_id'` and `platform_users` provenance. Because it upserts on natural keys, it *converges* the pre-existing 24 users/16 businesses instead of duplicating them — repairing the undocumented-prior-run problem — and re-resolves the known **silent-wrong `country_id`s** (the old resolver NULLed ~174 countries).
3. Resolver views created: `mig.map_users (v1_uuid → platform_user_id)`, `mig.map_businesses (v1_id → business_id, schema_name)`.
4. **Schema decisions implemented** (build-plan Wave B2, but they gate this migration): institutions nullable-owner + `claim_status` (39 unclaimed V1 businesses carry **363 of 402 services** — without this they have no V3 home); `category` discriminator column on `platform_user_language_tests` for SAT/GRE/GMAT.

**W2 — reference data** *(old M1)*
degree_levels, areas_of_study, issuing_organizations, service_categories, business_categories → fee_types, business_category_default_services, core_field_settings → schema_fields. Then accreditations + scope junction (25 rows referencing never-migrated businesses → NULL to global scope, reason-coded in the report). Canonical home for the superadmin/public duplicates: **public** (recommended; decision #3).

**W3 — student sub-profiles** *(old M2; parallel with W2)*
student_qualifications (11), student_work_experiences (9), student_language_tests (8), student_academic_tests (9, via the W1 discriminator). Exact column parity, text→date coercion helpers under `--self-check`, resolved via `mig.map_users`.

**W4 — extraction corpus ≈100k rows** *(old M3; parallel with W2/W3 after fee_types/degree_levels)*
**First: check whether it's already there.** Rehearsal-loaded V2 dumps fed `import:v2`, so `superadmin.extraction_*` may already hold this corpus. Compare staging vs V3 counts per table; if populated, W4 collapses to a delta upsert + Gate 2, not a load.
Otherwise: extraction_jobs (130) → standalone entities (courses 17k, fees 8.5k, eligibility 8.1k, agents 3k, …) → extraction_agent_locations → **all 7 junctions strictly last**, parent counts asserted first (Gate 2 check 5). Drops (decision #4, recommended): `scrape_smoke_results` (32k rows of smoke-test junk), `extraction_job_events` (log spool) — as `drop` entries in `mapping.json` with reasons.

**W5 — content & config** *(old M4)*
feature_flags, site_access_settings, admin_logs → admin_audit_logs, audit_events → audit_logs, blog_keywords, blog_posts, feed_posts (users + businesses resolved). `feed_comments` stays `blocked` on the Wave-B comments table.

**W6 — storage rehost (~77 objects)** *(old M5)*
V2's `storage-migrate.mjs` retargeted: walk `/storage/list` per bucket (V2's 13-migrate/3-drop bucket reconciliation carries over), **always signed-url** fetch, upload through V3's storage service so each object gets an `uploaded_files` row, then rewrite referring columns (businesses.logo_url/cover_url, platform_users.photo_url, …). Kills the **19 live supabase.co URLs** that break the day V1's project is deleted. URL-rewriter is pure and `--self-check`ed. Idempotent by object path.

**W7 — tenant-scoped data** *(old M6; `blocked` until build-plan Waves B/C ship the tenant services schema)*
Per tenant schema via `mig.map_businesses`: services core → fee/intake/eligibility/study-option children → junctions; then training_*, scribe_* (**consent log verbatim — legal record**), events*, ai_counselor_*, credits/subscriptions (plans + coupons in public, wallets per business). Cross-tenant graph (representations — already master; service_branch_sharing, service_study_option_branches, business_allowed_categories) lands in **master (public), never tenant** — cross-tenant FKs cannot live inside one tenant's schema. (`business_branches` shipped tenant-scoped in 2026-08 — branch rows of one business are tenant-local; only the *sharing* tables are cross-tenant.) Messaging is *not* migrated (9 rows; rebuild per V2 design) — `drop` with reason.

Every `blocked` mapping flips to `transform` the moment its target schema merges; Gate 2's coverage check keeps the ledger honest until "100% migrated" is a green script, not a claim.

---

## 5. Cutover runbook (V2's RUNBOOK sequencing, V3 targets)

Precondition: a full **rehearsal** — fresh DB → all migrations → extract → Gate 1 → all unblocked waves → Gate 2 → E2E suite on migrated data (old plan §7.7 journey 6). Rehearse twice, timed, like V2 did.

1. Freeze V1 (coming-soon gate / write-freeze), announce window.
2. Mint a **fresh `gmig_` token** (the old one is past its 90-day cap); verify `/tables` responds.
3. `migrate:v1:extract` (fresh full extract — truncate-and-reload staging) → diff live table list against `mapping.json`; any new/renamed table is a stop-and-classify.
4. `migrate:v1:verify-staging` → Gate 1 green.
5. Run all `transform` waves in order (W1→W7) with `--apply` → `migrate:v1:verify` → Gate 2 green; review report tables (every row reason-coded).
6. `migrate:v1:storage sync` → `verify` (count + bytes per bucket) → URL rewrite.
7. Gate 3 read-parity + E2E smoke against the loaded V3.
8. DNS flip → V1 read-only.
9. **Same day:** revoke the `gmig_` token and delete the `migration-export` function on V1 (V2's DEPLOY.md §4 discipline). Decommission V1 after soak.

Rollback at any step before DNS: nothing on V1 changed; V3 restores from pre-cutover snapshot; staging re-extracts at will.

---

## 6. Test plan for the migration machinery

Kept verbatim from the old plan §7.2 (they were right, they just had nothing to attach to):
- every pure helper (country resolver ISO-2/ISO-3/name + drift cases `INDIA/India/VIET NAM` (D7), email normalize, name split, subdomain DNS-label rules, URL rewriter) under `--self-check`;
- idempotency: second `--apply` = 0 inserts, per wave;
- dry-run ⇔ apply equivalence (same transaction, ROLLBACK vs COMMIT);
- junction parent-count assertions (D8) with a seeded-orphan fixture that must go red;
- Gate 2 seeded-mismatch fixtures (count drift, content drift, FK orphan, sequence lag, unexplained skip) each caught;
- Gate 1 self-parity (both URLs at one DB → green) as the CI smoke;
- vitest, wired into CI from build-plan Wave A2.

---

## 7. Decisions needed (blocking, in order)

| # | Decision | Recommendation | Unblocks |
|---|----------|----------------|----------|
| 1 | Institutions nullable-owner + `claim_status` (M0.3) | **Yes** | 363/402 services (W1→W7) |
| 2 | Academic tests: discriminator column vs new table | **Column** | W3 |
| 3 | Canonical home for duplicated reference tables | **public** | W2 |
| 4 | Drop `scrape_smoke_results` + `extraction_job_events` | **Drop both** | W4 ledger |
| 5 | Confirm extraction corpus already in V3 via `import:v2` (count check) | *Check first — it changes W4's size from 100k rows to a delta* | W4 |
| 6 | Stripe: same account/keys as V1, or fresh | — | W7 billing |
| 7 | Who mints the fresh `gmig_` token + when (90-day clock starts) | Mint at rehearsal #1 | W0 |

## 8. Risks carried forward

- **Silent-wrong `country_id`s** in already-migrated rows until W1 re-resolves them (first transform, by design).
- **19 supabase.co URLs live in V3** — breaks on V1 project deletion; W6 is the fix, don't decommission V1 before it runs.
- **Snapshot drift:** all counts are 2026-07-16; the cutover extract re-derives them and the `mapping.json` diff catches new tables.
- **`migration-export` is deployed but not in any repo** — before rehearsal, pull its source from the Lovable dashboard into version control (V2 kept a copy of its own generation at `db/migration/v1-export-function/`); if V1's deploy drifts from the documented contract, Gate 1 catches it, but you want the source, not archaeology.
- **iCloud-synced workspace** (Mac): live Postgres bind-mounts + git under sync = corruption hazard. Resolve before W0 runs there.
