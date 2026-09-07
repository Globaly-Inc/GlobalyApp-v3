# Data Extraction Module — V3 Conventions

## Database

- **Schema:** `superadmin`. All extraction tables prefixed `extraction_`.
- **Knex instance:** `masterKnex` from `src/core/db/master-pool.ts`.
- **Table references:** `masterKnex("superadmin.extraction_jobs")`.
- **Migrations:** `database/migrations/superadmin/`, run via `npm run migrate:superadmin`.
- **IDs:** All PKs are `uuid DEFAULT gen_random_uuid()`.
- **Timestamps:** `created_at` and `updated_at` as `timestamptz NOT NULL DEFAULT now()`.
  Some child tables (job_events, agent_locations, junctions) have only `created_at`.
- **No RLS.** Access control is application-layer only.

## Module structure

```
data-extraction/
├── CLAUDE.md
├── index.ts               # Fastify plugin, registers route files
├── shared/
│   ├── require-super-admin.ts   # Auth guard hook
│   ├── audit.ts                 # logAudit() helper
│   └── queues.ts                # LavinMQ queue name constants
├── lib/                   # Pipeline core — scraping, LLM, DB writers
│   ├── scraper.ts               # Crawl4AI + Firecrawl cascade (returns markdown)
│   ├── llm-client.ts            # Gemini SDK wrapper (extractJson, complete, embed)
│   ├── extraction-prompts.ts    # LLM prompts per extraction phase
│   ├── html-utils.ts            # URL filtering, markdown utilities
│   └── staging-writer.ts        # Writes extracted data to all staging tables
├── workers/               # LavinMQ consumers (separate Node processes)
│   ├── extraction-job.worker.ts    # npm run job:extraction
│   ├── extraction-page.worker.ts   # npm run job:extraction-pages
│   └── extraction-verify.worker.ts # npm run job:extraction-verify
├── schemas/               # Zod schemas, one file per domain
│   ├── jobs.schema.ts
│   ├── queue.schema.ts
│   ├── courses.schema.ts
│   └── ...
├── repositories/          # Knex queries, one file per domain
│   ├── jobs.repository.ts
│   ├── queue.repository.ts
│   ├── courses.repository.ts
│   └── ...
├── services/              # Business logic, one file per domain
│   ├── jobs.service.ts
│   ├── queue.service.ts
│   ├── courses.service.ts
│   └── ...
└── routes/                # HTTP handlers, one file per domain
    ├── jobs.routes.ts
    ├── queue.routes.ts
    ├── courses.routes.ts
    └── ...
```

## Auth guard

All extraction endpoints require `super_admin` or `data_admin` role. Use the
shared `requireSuperAdmin` hook registered at the module level:

```typescript
// In index.ts
app.addHook("onRequest", requireSuperAdmin);
```

The hook checks `req.auth.role` is in `["super_admin", "data_admin"]` and
throws `ForbiddenError` otherwise. Individual routes do NOT re-check role.

## Audit logging

Every write endpoint calls `logAudit()`:

```typescript
await logAudit(adminId, "EXTRACTION_JOB_CREATE", {
  entityType: "extraction_jobs",
  entityId: job.id,
  details: { institution_url: input.institution_url },
});
```

## Zod placement

- Validation schemas live in `schemas/` directory, one file per domain.
- Route handlers call `Schema.parse(req.body)` or `Schema.parse(req.query)`.
- Services receive typed inputs, not raw request objects.

## Pagination

Use `PaginationSchema` from `src/shared/pagination.ts` for list endpoints.
V2 used per-endpoint `limit`/`offset` params — V3 normalizes to
`page`/`limit` via the shared schema.

Exception: some V2 endpoints accept higher limits (500). Use a local
schema that extends PaginationSchema with `max(500)` when needed.

## AppError

Throw error subclasses from `src/shared/errors.ts`:
- `NotFoundError` → 404
- `BadRequestError` → 400
- `ForbiddenError` → 403
- `ConflictError` → 409

The centralized error handler maps these to HTTP responses.

## Parity-first rules

1. **Match V2 endpoint paths.** Every V2 endpoint under
   `/admin/extraction/...` maps to `/api/v3/admin/data-extraction/...`.
2. **Match V2 response shapes.** The frontend expects specific keys
   (`{jobs: [...]}`, `{updated: true}`, `{id: string}`).
3. **Match V2 column names.** Repo queries use snake_case column names
   matching V2. No renames.
4. **Fix V2 bugs.** Documented bugs from `extraction-v2-endpoints.md`
   Section 6 are fixed (e.g. save-and-learn audit gap, missing 404
   checks on deletes).
5. **No new features.** Extraction module is a parity port. New
   capabilities go in separate PRs after parity is confirmed.
   Exception: Scrapling was added ahead of Crawl4AI in the scrape cascade
   (2026-08-20) as an explicit, approved deviation from parity — not a V2
   behavior.
   Exception: secondary curriculum-page discovery for study_units
   (2026-08-22) — the page worker now follows an LLM-flagged
   `curriculum_page_url` when a course's primary page yields no units, per
   `docs/data-extraction/2026-08-21-study-units-discovery-design.md`. Not a
   V2 behavior; approved to fix a real data-quality gap (study units either
   missing entirely or, on some national sites, individually miscategorized
   as standalone courses).
   Exception: visa-service extraction pipeline (2026-08-22) — a full
   `source_type: "visa_service"` branch through the SAME job/page workers
   (own site-analysis prompt, own URL heuristic `looksLikeVisaServiceUrl`,
   own entity prompt, writes `extraction_visa_services` via
   `writeVisaService`). `extraction_visa_services` existed in the schema
   since 2026-08-12 with zero code path writing to it — this is a genuinely
   new capability, explicitly requested and scoped by the team, not a V2
   port (V2 never had this table).
   Exception: secondary fees-page discovery for course fees (2026-08-31) — mirrors the
   curriculum-page-discovery exception above: the page worker follows an LLM-flagged
   `fees_page_url` (falling back to `curriculum_page_url` when unset, since a university
   catalog entry — e.g. Acalog — commonly bundles curriculum and fees on the same page,
   under an anchor like "degree requirements" that never gets flagged as fee-related) when
   a course's primary page has no fee figures at all, instead of the prior behavior of
   dropping the fee entirely (or, per the old prompt wording, stuffing the link text into
   a fee's `name` with no `total_amount`). Bounded by the same `SECONDARY_FETCH_CAP` as
   curriculum discovery. Only fires when the primary page found zero fees, to avoid
   duplicating a correct fee already extracted. Fixes a real gap: a course's own program
   page frequently has no tuition figures and links out to a catalog/tuition-schedule page
   instead (seen live: UK's Acalog catalog entries), which the pipeline previously never
   followed. Also fixed: `looksLikeCourseUrl`'s catalogueHost regex only matched the
   singular "catalog." host, silently excluding real catalog hosts like catalogs.uky.edu
   (plural) from ever being treated as course URLs during discovery.
   Cost controls (2026-09-01): secondary pages are scraped at most once per page
   message (shared markdown cache across the curriculum and fees paths — the fees
   fallback usually resolves to the very page curriculum discovery just scraped), and
   when a course needs units AND fees from the same page, ONE combined Gemini call
   (`curriculumAndFeesPrompt`) extracts both instead of two calls over identical content.
   Exception: incremental verification (2026-09-01) — the verify worker skips courses
   unchanged since their last verification (`last_verified_at` set and `updated_at` not
   newer), so the automatic post-run dispatch no longer re-scrapes and re-bills Gemini
   for the same first-20 courses on every rerun cycle. The Context tab's manual
   verification step passes `force: true` to re-check everything. Incremental passes
   add to `verification_score`/`verification_total`; forced passes overwrite them.
   No V2 equivalent — cost fix, same family as the rerun-resume exception below.
   Exception: per-job page cap + Deep Scrape (2026-09-01) — every job carries
   `extraction_jobs.page_cap` (default 500, migration `20260901_002`) and
   `insertQueueItem` refuses to queue past it; the discovery step also stops
   crawling list pages once the job is full, since each list page costs a scrape
   + a Gemini call. 500 pages covers the course catalogue on most sites, and the
   institution's email/phone/logo come from the homepage overview phase, which
   uses no queue slots. `POST /jobs/:id/deep-scrape` (admin "Deep Scrape" button
   in the job header) raises the cap by 500 and re-dispatches the job worker —
   dedupe skips everything already queued, so only newly discovered pages bill.
   No V2 equivalent — cost guardrail, explicitly requested (V2 had no page cap).
   Exception: eligibility + intake storage repair (2026-09-04) — six changes to how
   entry requirements and intakes are stored, none a V2 behavior, all data-correctness
   fixes. See `docs/data-extraction/2026-09-04-eligibility-intake-storage-plan.md` for
   the findings behind each.
   (a) `deriveScoreFromDescription` no longer reads a number out of statistical prose.
   It used to match "95th percentile" and store 95 as a minimum percentage grade — a
   requirement no institution stated, rendered on the public course page as "Minimum
   score: 95%" and compared against real students' GPAs. Guarded by `NOT_A_MINIMUM`
   (percentile/average/median/top-N/acceptance-rate/ordinals); regression-tested in
   `tests/eligibility-extraction.ts`.
   (b) `academic_tests` is now written by the pipeline. Both eligibility prompts gained
   an `academic_tests` array (GRE/GMAT/SAT/… with `score` and `is_optional`) and both
   writers persist it. The column existed since 20260805_004 and only the admin form
   ever wrote it, so the public card's "Academic Test Score" section and the eligibility
   engine's `academic_test` criterion were permanently empty — every student's stored
   GRE/GMAT score went unused. `is_optional` is honoured end to end: an optional test
   can never make a verdict `fail`. A test entry carries `score` (a stated minimum, which
   gates the verdict) and `typical_score` (an average/median/percentile the page reports
   about admitted students, which is displayed as "avg 49.5" and gates nothing) — kept
   apart because a page stating only a cohort average is stating no requirement, and the
   two are never stored together.
   (c) Reruns are idempotent. `writeCourse` deduped the course by name but re-inserted
   every child unconditionally, and the junction unique constraints never fired because
   each child row was freshly inserted — so a course found on a listing page, its detail
   page and a catalog entry accumulated three copies of every intake, requirement and
   fee. `upsertIntake` / `upsertEligibility` / `upsertCourseFee` mirror the existing
   `upsertStudyUnit` find-then-write pattern.
   (d) The step worker's `eligibility` step now deletes the requirement ROWS it
   unassigns, not just the assignments. Orphaned rows matched
   `findRequirementsForCourse`'s institution-wide fallback (job-scoped, assigned to no
   course), so re-extracting one course's eligibility silently applied its stale
   requirements to every other course on the job.
   (e) Intake `intake_month`/`intake_year` are derived from the intake name or start
   date (`deriveIntakeMonthYear`), and the step worker's intake writes now go through
   `coerceDate`/`coerceMonth` like the page worker's always have. Those two columns are
   the only ones the year filter, "next intake" badge, year facet and institution search
   read, and the LLM routinely left both null while naming the intake "Semester 1 2027".
   `end_date`/`orientation_date` are now asked for too. Derivation is deterministic
   rather than prompt-only specifically so it can backfill stored rows — the pipeline
   persists no scraped markdown, so a prompt fix alone helps only future crawls.
   (g) Intakes are SHARED across courses (2026-09-04, second pass). `upsertIntake` is
   scoped by `job_id` alone, so one "Semester 1 2027" row is linked to every course
   offering it via `extraction_course_intake_assignments` — matching how eligibility
   requirements and fees already work, what the junction's `unique(course_id, intake_id)`
   has allowed since 20260805_005, and what the admin Intakes tab's course link/unlink
   picker always implied. Identity is name + month + year with the four date columns
   required merely not to CONTRADICT (null on either side is unknown, not a difference),
   so a page adding a deadline enriches the shared row instead of forking a duplicate.
   `extraction_intakes.course_id` is now LEGACY and left NULL on write — a shared intake
   cannot name one course in a scalar column. **Every public read moved to the junction**:
   the intake-year filter, both `nextIntake()` subqueries, the year facet and the course
   detail query in `search/repositories/courses.repository.ts`, plus two in
   `businesses.repository.ts` that were only joining through `extraction_courses` to reach
   `job_id` — a column `extraction_intakes` already has, so that join is gone. The step
   worker's intake branch now calls `upsertIntake` rather than keeping its own copy (it had
   already drifted once — see (e)). **Deploy hazard:** any legacy row reachable only via
   `course_id`, with no assignment row, disappears from course pages when those reads
   switch. `npm run eligibility:backfill` pass 5 rescues those FIRST, then collapses
   duplicates; run it with the deploy, not after. Do not read or reintroduce `course_id`.
   (h) Both workers now call the SAME upsert helpers (2026-09-07). The step worker's
   `case "eligibility"` was still doing a direct insert, so requirement rows were shared
   across courses on a first crawl but a fresh row was minted on any per-course
   re-extraction. It now calls the exported `upsertEligibility`, and its assignment
   insert gained the missing `.onConflict([...]).ignore()`. That branch had drifted from
   the page worker three times (raw dates at date/integer columns; dropping
   dated-but-unnamed intakes; this direct insert) — so any future change to extraction
   write behaviour belongs in a shared helper in `staging-writer.ts` called from BOTH
   workers, never reimplemented in the step worker's switch. Sharing dedupes on name, so
   "Fall 2027" and "Fall Semester 2027" stay separate by design, and is per-job — two
   institutions never share a row. `agentcis-product-staging.ts` is a third writer
   (structured import, pre-coerced mappers, no LLM) that does not share rows; left as is.
   (f) `source_url` added to `extraction_eligibility_requirements` and
   `extraction_intakes` (migration `20260904_001`) and now written by both paths;
   `extraction_english_requirements.source_url` existed and was never populated.
   Also: "next intake" now means the soonest intake that hasn't started
   (`nextIntake()` in search/repositories/courses.repository.ts) rather than the earliest
   ever scraped, and the intake-year facet gained the `PUBLICLY_VISIBLE` gate every
   other facet already had.
   Repair for data already stored: `npm run eligibility:backfill` (dry-run by default,
   `--apply` to write).
   Exception: `/jobs-filtered` search/sort/category-filter (2026-08-24) —
   added `q` (institution name/URL search), `sort`, and
   `business_category_id` params to `FilteredJobsQuerySchema`, plus a matching
   `exclude_statuses` param. V2's ExtractionDashboard had none of these; it
   fetched the whole filtered set and searched/sorted/paginated client-side.
   The all-extractions dashboard moved to true server-side pagination
   (page/limit only, fetched per click instead of walking every page on every
   load), which meant search and sort had to move server-side too or they'd
   silently stop covering anything past the current page. Explicitly
   requested and scoped by the team, not a V2 port.
   Exception: manual attribution on staged rows (2026-09-08) — migration `20260908_001`
   gives `extraction_jobs` both `created_by_platform_user_id` (who started the extraction)
   and `updated_by_platform_user_id` (the last admin to act on the job — pause/resume/
   decline/fail, context edit, rerun, reset-pipeline, deep-scrape). Worker writes
   (heartbeats, counters, status advances) use other queries and leave updated_by alone,
   so it stays an admin-action trail rather than worker noise.
   Migration `20260908_002` adds, to the job sub-tab tables:
   `created_by_platform_user_id` on the nine an admin can insert into (courses,
   course_fees, study_units, study_options, intakes, eligibility_requirements,
   accreditations, agents, campuses) and `updated_by_platform_user_id` on those nine plus
   `extraction_institution_overview` and `extraction_visa_services` — both pipeline-created
   but hand-corrected, so created_by would sit null on them forever while updated_by is
   what answers "who changed this field". **Null created_by means scraped, non-null means
   hand-added** — no separate `is_manual` flag. updated_by holds the LAST editor only;
   `extraction_memory` already keeps the per-edit diff trail for save-and-learn.
   Every write funnel takes `adminId` as a REQUIRED argument and stamps it, so a table
   added there cannot silently skip attribution: `insertEntity`/`updateEntity`
   (staged.repository), `patchEntityRow` (save-and-learn, all 11 tables), `updateCourse`,
   `updateCoursesByIds`, `updateVisaService`, `updateAgent`, `updateCampus`.
   `staging-writer.ts` (the pipeline) sets neither.
   Read side: `shared/actor-names.ts` — `withActorNames(rows)` / `withActorNamesOne(row)`
   resolve both ids into `created_by_name`/`created_by_email`/`updated_by_name`/
   `updated_by_email` with ONE `platform_users` lookup per page, and every list and detail
   service calls it (jobs, courses, review, visa-services, staged). Deliberately not a
   LEFT JOIN: the list queries all rely on `select *` plus unqualified `where`/`order by`,
   which joining `platform_users` (its own id/created_at/updated_at) breaks one call site
   at a time — the earlier `withExtractor` join in jobs.repository.ts did exactly that and
   was removed in favour of the helper. Rows missing the columns resolve to all-null, so
   the read path is safe before the migrations are applied. The UI renders it through
   `components/row-actors.tsx` (`<RowActors row={…} />`) on every sub-tab card, the job
   header and the job list row; a row with no creator shows "Extracted automatically".
   Guarded by
   `npm run test:extraction-created-by`, a static check that the migration's table lists
   cover every write path. No V2 equivalent — V2 could not tell a hand-typed fee from a
   scraped one, or say who corrected an overview field.
   Exception: `POST /jobs/:id/rerun` resumes instead of always restarting
   (2026-09-01) — if the job has pending/failed queue items, rerun retries
   just those via the "courses" step instead of `resetPipeline` wiping the
   whole queue and re-crawling from scratch. A full-job rerun used to
   re-scrape and re-extract (re-billing Gemini for) every page every time,
   including ones already successfully extracted; this was a real driver of
   an August Gemini cost spike. `resetPipeline` (full wipe) is still used
   when a job has nothing queued yet to resume from — no V2 equivalent to
   port, this is a cost fix.

## Subject area & degree level are CLOSED lists (2026-09-08)

`public.areas_of_study` and `public.degree_levels` are the only values a course may be linked to.
Extraction links to a seeded row and never adds one.

- **The lists live in the seeders and nowhere else** —
  `database/seeders/globalyapp/{areas_of_study,degree_levels}_seeder.ts`. Extraction reads the
  active rows from the database at runtime (`loadLookupLists()`, cached per process) and the
  extraction prompt's enums are built from them, so adding/renaming/retiring an entry is a seed
  edit plus `knex seed:run` — no code change, and no second copy to keep in sync.
- **The MODEL classifies; code validates and, failing a pick, places.** The prompt gives it the
  live area and level names and asks which one the course belongs under; `resolveAreaOfStudy` /
  `resolveDegreeLevel` check the answer against the list so a hallucinated or stale value links to
  nothing instead of inventing a category. Neither can invent: every path ends on a seeded slug or
  on null. Because a pick is often absent — rows staged before the prompt asked for an area, a
  re-run during a model outage, an admin edit — each resolver also maps the page's own wording onto
  the list, and tries the course NAME after the subject wording. Measured over the 2,365 staged
  courses: 98% area, 95% level, and the residue is genuinely unplaceable ("Various", "Graduate
  Studies", department index pages staged as courses), not a matching gap.
- **What code still carries** (mapping, not list data — every target must be a slug that exists in
  the seeded table, and `lookupListsHealth()` reports any that doesn't): the platform's own subject
  taxonomy keyed by area slug, so "Nursing" reaches Health and Medicine and placement follows the
  PLATFORM (Psychology → Health and Medicine, Economics → Social Studies and Media) rather than
  intuition; the platform's own "Course Level → Degree Level" folds (Associate Degree / Bachelor Honours / Undergraduate Higher Diploma → Bachelor,
  Graduate Certificate → Graduate Diploma, Masters (Extended) → Master, every school stage →
  School, Other/short course → Non AQF Award) and the qualification-in-the-name reader
  (BSc/MBChB → Bachelor, MPhil → research master, JD/EdD → doctoral). The name wins over the
  model's pick — it is verbatim from the page and was the most reliable signal across 1,918
  courses. `loadLookupLists()` warns if a rename leaves a fold pointing at a level that no longer
  exists.
- **The link is the `_code` column:** `extraction_courses.degree_level_code` =
  `degree_levels.slug`, `subject_area_code` = `areas_of_study.slug`. `degree_level` holds the
  row's display name; `subject_area` stays free description — the AREA is what a course links to.
  Nothing matched → code null, i.e. UNLINKED and visible, never guessed.
- **Written by:** `writeCourse` (insert and merge), the course_data step, and the admin
  PATCH/save-and-learn path — an admin edit obeys the same lists, and the pickers can't create.
- **The log:** every course write emits one `lookup-link` line — `info "linked"` or
  `warn "unlinked"` with the text that failed. The per-job total is part of VERIFICATION, not a
  script: `extraction-verify.worker.ts` ends with `verifyLookupLinks()`, which writes a
  `lookup_links_verified` job event (level `warn` unless every course is linked) carrying the
  linked counts and a sample of the wording that didn't match, so it shows on the job timeline
  next to the other verification results. Pure counting — no scrape, no model call.
  The same pass first checks the CONFIGURATION and raises `lookup_lists_unhealthy` when the lists
  aren't seeded or a seeder rename left a Course Level fold pointing at a level that no longer
  exists — that is the root cause behind a job full of unlinked courses, which the counts alone
  can't explain (`lookupListsHealth()`).
  This work adds NO npm scripts. Two files are run directly when needed:
  `node --import tsx scripts/backfill-lookup-links.ts [--apply] [--job <id>]` re-binds
  already-staged rows — no model call, no scrape, free and repeatable — and
  `node --import tsx tests/lookup-catalog.ts` is the offline check on the matcher itself.
- **Slugs and ids never move.** Degree-level slugs are a de-facto enum across the app (frontend
  scholarship filters, personal-profile onboarding, the search `DEGREE_LABEL` map,
  `lib/agentcis-mappers.ts`) and business services store level ids as field values. So "PHD"
  keeps the slug `doctoral`, and a level the list drops (Associate Degree, Graduate Certificate,
  Other) is deactivated, never deleted.

## External FK columns

7 columns reference tables that may not exist yet in V3. These are plain
`uuid` columns with no FK constraint. See `docs/extraction-v3-decisions.md`
for the full list.

## Status values

Status fields are `text` columns with no CHECK constraints (matching V2).
Validation is in Zod schemas. See `docs/extraction-v3-decisions.md`
Section 3 for canonical value lists.
