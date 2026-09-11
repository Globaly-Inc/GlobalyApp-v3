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
   (structured import, pre-coerced mappers, no LLM) that now shares rows too (2026-09-11): its
   fees, intakes and eligibility go through `upsertFee` / `upsertIntake` / `upsertEligibility`
   instead of three direct inserts, because the import was minting an identical row per product —
   one fee or intake offered by two courses landed as two rows rather than one row with two
   assignment rows. Notes: currency is resolved to a code (AUD fallback) BEFORE `upsertFee`,
   since it is part of that dedupe key and the feed usually states none; the intake insert's
   legacy `course_id` is gone, per (g); and every product's requirement carries the same generic
   "Entry Requirements" name, so it is `eligibilityRowsAgree`'s non-contradiction check — not the
   name — that keeps products demanding different thresholds on separate rows. Study options are
   still inserted per product, which matches what `writeCourse` does (no upsert helper exists for
   that table on either path).
   (f) `source_url` added to `extraction_eligibility_requirements` and
   `extraction_intakes` (migration `20260904_001`) and now written by both paths;
   `extraction_english_requirements.source_url` existed and was never populated.
   Also: "next intake" now means the soonest intake that hasn't started
   (`nextIntake()` in search/repositories/courses.repository.ts) rather than the earliest
   ever scraped, and the intake-year facet gained the `PUBLICLY_VISIBLE` gate every
   other facet already had.
   (i) English requirements are deduped and re-extraction replaces them (2026-09-08).
   `extraction_english_requirements` was the last extracted child table still written with a
   bare insert by BOTH workers — the one table (c) missed. A course found on a listing page,
   its detail page and a catalog entry accumulated an IELTS row per page, and the step
   worker's `eligibility` case deleted the requirement rows but not the English ones, so
   every per-course re-extraction appended another full set, unbounded. Duplicates are not
   cosmetic: the public card renders one tile per row, and `evaluateEligibility`'s percentage
   is a share of the criteria it emitted, so three IELTS rows weighted English three times in
   a real student's verdict. Worse, the row a reader saw was usually the THINNEST — a listing
   page states "IELTS 6.5" and only the detail page carries the bands — which is why per-band
   minimums looked like they were never extracted. Now `upsertEnglishRequirement` in
   `staging-writer.ts` (called from both workers, per (h)) dedupes on (course_id, test name),
   fills blanks and never overwrites a stated value; the step worker deletes the course's rows
   first, so a re-extraction reflects the page as it reads now. Course-scoped with no junction,
   so unlike (g) there is nothing to repoint. An entry naming NO test is dropped rather than
   stored — `sameTest` can match nothing against a null name, so it could only ever emit a
   permanently-`unknown` criterion capping the verdict percentage below 100, and render as a
   tile labelled "Test". Both prompts now also name Duolingo/OET, ask for one entry PER
   ACCEPTED TEST ("IELTS 6.5, TOEFL 79 or PTE 58" is three entries, not one), and ask for a
   blanket band floor ("no band below 6.0") to be spread across all four columns.
   Repair for rows already stored: `eligibility:backfill` pass 6.
   (j) A requirement must state something, and can no longer speak for a course by stating
   nothing (2026-09-08). Both eligibility prompts had `"description": "details"` and no
   NAME vs DESCRIPTION rule, so the LLM routinely returned a scraped section heading with
   every other field null — a live example: `{name: "Target Audience Requirements"}`, nothing
   else. `description` is now specified as the page's own wording, verbatim where possible,
   carrying every condition, exception, equivalency, subject prerequisite and alternative
   pathway (the spec's "Requirement Description"), with the same NAME vs DESCRIPTION split the
   fee prompt already had and an explicit ban on name-only rows. English WAIVER/EQUIVALENT
   wording ("waived if your previous degree was taught in English", "or an approved
   equivalent") goes in that description too — `extraction_english_requirements` holds SCORES
   ONLY and deliberately gained no description column of its own; the requirement's
   `description` (the admin form's "Notes / Remarks") is the single place that prose lives.
   The engine side is fixed independently, because an empty row is equally reachable from an
   admin-created one: `evaluateEligibility` now ignores pathways that produced no criteria at
   all unless they are all there is. `rollup([])` is "unknown", which OUTRANKS not_eligible,
   so one content-free row reported "unknown" for a student who genuinely failed the course's
   real requirement — the failure hidden behind a row stating nothing. Regression-tested in
   `tests/eligibility-extraction.ts` (verified failing without the fix).
   Repair for data already stored: `npm run eligibility:backfill` (dry-run by default,
   `--apply` to write).
   (k) Intake dates keep the precision the source published (2026-09-09). `coerceDate` turned
   "September 2026" into "2026-09-01" — a day the institution never stated, afterwards
   indistinguishable from a real 1 September, and on a deadline that is a date a student can miss
   by weeks. The four date columns are now `text` holding ISO 8601 reduced precision, "2026-09-21"
   or "2026-09" (migration `20260909_001`, with a CHECK per column); both sort correctly as text
   and nothing compares them as dates in SQL — every filter, facet and "next intake" ordering reads
   the separate intake_month/intake_year integers. `lib/partial-date.ts` owns coercion, comparison
   and formatting; `coerceDate` is DELETED rather than left exported, because reaching for it is
   how the fabrication comes back. Precision is DERIVED from the value's shape, not stored beside
   it — a second column could disagree with the value it describes. `upsertIntake` now also
   SHARPENS on match (a row holding "2026-09" is upgraded by a later page's "2026-09-21", never
   blurred back), which is the same "thinnest row wins" failure as (i). Two day-1 fabrications were
   hiding outside the writers and are fixed too: `saveAndLearn` ran start_date through
   `new Date(...).toISOString()`, and the public course card through `toLocaleDateString`. The
   admin patch path is validated (`saveAndLearn` takes `patch: z.record(z.unknown())`, so a bad
   date would otherwise hit the new CHECK as a 500 rather than a 400). `custom_dates` is now
   EXTRACTED as well as admin-authored, so the prompts ask for named milestones; it stays in
   `NON_TEACHABLE_FIELDS` regardless, because a lesson mints `example_good` from the corrected
   value and these values are institution-specific live dates. Frontend: one Full date / Month
   selector, `<input type="month">` doing the work natively. Regression-tested in
   `tests/partial-date.ts` (38 assertions, including the gwu.edu year-0000 case inherited from the
   deleted `tests/coerce-date.ts`).
   (l) A page filed under Context -> Intakes is extracted as INTAKES, not as courses (2026-09-09).
   The reported symptom was "intake dates are extracted but not persisted" for a Stanford job; the
   actual cause was that nothing extracted them. `intakes` sits INSIDE each `courses[]` object in
   the course prompt, so an academic calendar — which states term dates for the whole institution
   and lists no courses at all — returned an empty courses array and every date on it was dropped.
   The courses step already queued these guided URLs (COURSES_STEP_GUIDED_CATEGORIES) but nothing
   told the page worker they were anything but a course page. It now checks `guided_urls.
   intakes_urls` and uses the FLAT `courseDataPrompt(..., "intakes")` for them, writing through
   `upsertIntake` at job level with no course assignment: keyed on job + name + month + year, a
   calendar's "Autumn 2026-2027" lands on the row the courses are already linked to and fills its
   empty dates, so no term-to-intake name matching of its own is needed. **That holds only while
   the two pages spell the term identically** — the key is `LOWER(TRIM(name))`, so a calendar
   saying "Semester 1, 2026" against a catalogue saying "Semester 1 2026" forks a second row
   carrying the dates and no courses, beside the original carrying courses and no dates
   (sydney.edu.au/students/key-dates.html is exactly this shape). Deliberately not loosened: a
   fuzzier term key is how two genuinely different sittings get merged, which is the failure (g)
   and the backfill's pass 4 exist to prevent. An open decision, not an oversight.
   Also note neither page shape is discovered on its own — `looksLikeCourseUrl` skips both the
   Sydney and Stanford calendars, so the operator must add the URL under Context -> Intakes. A term the catalogue never
   mentioned becomes an unlinked intake — visible in the admin tab to link, and excluded from public
   reads until then, since those go through the assignment junction. Note the Intakes tab's "Run
   Intakes Extraction" button runs `step="courses"`; it is the crawl that had to learn this, not a
   new step.
   (o) Review follow-ups to (k) (2026-09-09). Three, all "never silently choose between two stated
   values" — the same principle as (b)'s score/typical_score split and (g)'s non-contradiction rule.
   `normaliseCustomDates` keyed milestones on the lowercased name and broke ties by string LENGTH,
   so two "Scholarship Deadline" months tied and the second was dropped — and because the intake row
   is shared, the survivor became the only deadline every linked course displayed. It now separates
   enrichment from contradiction with `partialDatesAgree`: two precisions of one milestone merge to
   the sharper, two genuinely different dates are BOTH kept for an admin to resolve. A guessed
   deadline is one a student can miss.
   `coercePartialDate` accepted impossible days. Its ISO fast-path returned on shape alone, so
   "2026-02-31" was stored verbatim by every writer — only the prose path ran `isRealDate`, which is
   why the "31 February 2026" test looked like coverage of the rule and was not. The `date` column
   used to reject these; text with a shape-only CHECK does not, and a CHECK cannot know February has
   no 31st (no way to attempt a cast inside one), so calendar validity is enforced in the
   application by the single new predicate `isValidPartialDate`. Two behaviours on purpose: WRITERS
   coerce ("2026-02-31" -> "2026-02", keeping the half that can be true), API validators REJECT, so
   an admin who typed an impossible day is told rather than quietly given a different value.
   The backfill's pass 5 merged duplicate intakes and deleted the copies without carrying their
   `custom_dates` across, losing every milestone on a dropped row permanently. It now unions them
   with the same rule. Low impact while the column is new; fixed now because that pass deletes.
   (n) YEAR gates an intake's visibility; MONTH only orders it (2026-09-09). Worth stating
   separately because (e) says "intake_month/intake_year are the only columns any feature reads",
   which is true and misleading: all three public reads gate on `ei.intake_year is not null`, while
   a null `intake_month` is `coalesce(intake_month, 1)` — the intake still shows, treated as
   January. So a row named "Fall" with no year is invisible everywhere, and a row named "Fall 2019"
   with no month is merely ordered as January. Nothing derives a year the page never stated and the
   pipeline keeps no markdown, so those rows are fixable only by re-extraction (both prompts now
   demand a year on every intake) or a hand edit — never by the backfill, whose pass 3 lists them
   as a diagnosis rather than repairing them. Confirmed on live data: 8 of 12 incomplete intakes on
   job 19024311 carry no year at all.
   The same dry run surfaced three intakes named "Day 1", "Day 2", "Day 3", scraped from an
   orientation timetable. An intake is a term you ENROL in; a timetable row, exam sitting, payment
   due date or holiday is not, and a dated one belongs in that intake's `custom_dates`. Both intake
   prompts now say so, naming this exact failure.
   (m) Audit of the intake + eligibility paths after (k)/(l) (2026-09-09). Six defects, five of
   them created or exposed by (k)'s column type change — the pattern being that `date` and the
   `score_type` CHECK had been doing validation the application never had to, and converting the
   columns moved that burden onto every writer at once.
   `scripts/eligibility-backfill.ts` had three: it re-fabricated a day via
   `new Date(start_date).toISOString()`; its intake clustering compared `String(v).slice(0, 10)`,
   so "2026-09" and "2026-09-21" read as different dates and two rows describing ONE sitting were
   never merged; and the survivor-fill only looked at nulls, so a survivor holding a month kept it
   while a copy held the exact date — the thinnest-row-wins defect of (i), third occurrence. All
   three now call `partialDatesAgree`/`morePrecise`/`normaliseStored`, so the destructive pass and
   the writer cannot disagree about what one intake is.
   `agentcis-product-mappers.ts` had its own `toDateStr`, safe only because Postgres validated the
   column: it passed the LLM's unknown-year sentinel "0000-01-07" through (the gwu.edu value the
   `date` type used to reject), and a Date.parse fallback could emit a five-digit year that now
   violates the CHECK and aborts an entire import. It is `coercePartialDate` now, so that feed also
   gains month precision.
   `staged.schema.ts` typed `academic_tests`/`language_tests` as `z.array(z.unknown())` and
   `score_type` as a free string, and `saveAndLearn`'s `patch` is only `z.record(z.unknown())` — so
   the admin and API paths could store a test with NO NAME. That is not cosmetic: `sameTest` matches
   on name, so a nameless entry never matches a student's test and instead emits a permanently
   `unknown` criterion, capping a real student's percentage below 100 and rendering as a tile
   labelled "Test" — (i)'s defect still open on the hand-edit path. `AcademicTestSchema` /
   `LanguageTestSchema` / `SCORE_TYPES` now guard both, and `normaliseEligibilityPatch` applies them
   to save-and-learn.
   Verified clean in the same pass, worth not re-deriving: every child-entity helper is reached from
   BOTH writers; `custom_dates` flows because `writeCourse` passes the whole intake object; no reader
   parses an intake date through `Date()` any more; AgentCIS creates a fresh job per import so its
   direct inserts do not accumulate within one; and `business/profile`'s intakes tab writes
   `service_intakes` in the business schema, NOT extraction data, despite looking identical.
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
   Exception: curriculum from the MARKUP before the model (2026-09-09) —
   `lib/courselist-parser.ts` reads a programme's curriculum straight out of
   `table.sc_courselist`, the CourseLeaf (Leepfrog) shape used by Johns Hopkins,
   Georgia Tech and much of the US sector: code, title, credit hours, and the
   requirement block each row sits under. The page worker tries it BEFORE any
   Gemini call on a curriculum page, and on the primary page when the model left a
   course without units. Where it hits, the model is not called for units at all —
   cheaper AND exact.
   Why: Johns Hopkins renders its whole catalogue navigation tree inline, so one
   programme page comes out of the scraper as ~155,000 characters of school and
   department links, the curriculum sits past `truncateMarkdown`'s 120,000-character
   cut, and the tables do not survive the HTML→markdown conversion at all (one pipe
   character in the file). Every JHU course was staged with zero study units while
   42 rows of real curriculum sat in the page. Even where the model does read a
   curriculum it loses what only the markup carries: Georgia Tech's tables give 31
   units per course with codes and credits, a prose read of Harvard gave 10 per
   course, bare lowercase, no code, no credits.
   Same file also carries `courseLinksByName(html, baseUrl)`: every programme a page
   links to, keyed by the anchor's own text on the same normalisation `writeCourse`
   dedupes course names by. The page worker uses it to fill `curriculum_page_url`
   when the model flagged none — on JHU's `/programs/` index the model flagged
   nothing and 18 of 19 courses were staged with the index as their source_url,
   while that index carried an exact-name link to every one of them (1,202 anchors).
   Recovering the link from the markup is cheaper and far more reliable than asking
   the model to emit fifteen URLs. Bounded by the same `SECONDARY_FETCH_CAP`, cached
   per URL like the markdown path, and only tried for a course that still has no
   units. Guarded by `npm run test:courselist`.
   Exception: study-unit plausibility gate + unit_type/description (2026-09-09) —
   `filterStudyUnits` in `staging-writer.ts` rejects a "unit" that is the course's own
   name, that carries a degree word, or that is another course of the same job; and
   when most of a batch of 3+ collides with the job's own course names it drops the
   WHOLE batch, because that is a model reading a programme INDEX page rather than a
   curriculum (seen live: University of Chicago courses whose units were
   "Business Administration (Evening)", "Biomedical Informatics"). `ExtractedStudyUnit`
   also gained `description` and `unit_type`, which `search/repositories/courses.repository.ts`
   and the AI counsellor already SELECT and the writer never wrote. `unit_type` is
   `NOT NULL DEFAULT 'compulsory'`, so `normaliseUnitType` returns null when the page
   says nothing and the insert OMITS the column rather than asserting "compulsory" for
   an elective — 13,856 of 13,866 staged units carried that false assertion.
   Guarded by `npm run test:study-units`.
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
