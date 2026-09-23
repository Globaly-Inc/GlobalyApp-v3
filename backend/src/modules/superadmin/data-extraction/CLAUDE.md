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
   direct inserts do not accumulate within one (superseded for intakes by (p) — a fresh job per
   import says nothing about duplication ACROSS courses inside one job, which is what that direct
   insert was actually causing); and `business/profile`'s intakes tab writes
   `service_intakes` in the business schema, NOT extraction data, despite looking identical.
   (p) AgentCIS intakes: read the array, and share the row (2026-09-10). An AgentCIS product
   states its intakes as `intake_month: [{ id: 3, value: "April" }, …]` — the months the partner
   ticked — and as `[]` when it ticked none (live: 2089 of 2269 products). `extractIntakes` read
   neither shape, and the two failures compounded: every stated month was dropped, and because `[]`
   is not `null` the "scalars present" fallback mapped the PRODUCT OBJECT as an intake, so
   `mapOneIntake` took `source.name` — the COURSE name — as the intake label. A 103-course
   institution imported as 103 dateless intakes, each named after its course, and not one real
   month. `extractRecurringIntakeMonths` now takes each ticked month off the entry's `value`, and
   an empty list produces nothing. The entry's `id` is a ZERO-based month index
   (`{id: 0, value: "January"}`) — never read it as a month number, it would file every intake a
   month early. `findIntakeArray`'s remaining scalar fallback maps the intake KEYS rather than the
   product object; no AgentCIS product carries `intake_year`/`start_date` today, so that branch is
   a guard against the day one does, not a live path — restoring `[source]` there restores the
   defect. `agentcis-product-staging.ts` no longer inserts into `extraction_intakes` directly
   either: it calls `upsertIntake` + the junction like both crawl workers, which is what makes one
   "February" row serve every course that offers it (see (g)), and the "fresh job per import" note
   under (m) does not cover duplication across courses inside one job.
   **This whole fix was written twice, in parallel, and the duplication cost two rebases.** Staging
   shipped the writer half as #263 ("Validate fees and intakes for duplication") and then the
   mapper half as #265 ("fetch available data for agentcis products"), while branch
   `dev-hotfix-agentcis-intake-fix-rojan` shipped both; staging's side won every conflict, and the
   branch kept only this note, the scalar-fallback narrowing, and the test. Third occurrence of
   this collision on this module (see the junction-read rebase under (g)). Before starting work on
   an extraction defect, check what is already in flight on staging.
   **AgentCIS states a month with no year**, so `start_date` stays NULL and the month lives in
   `intake_name` + `intake_month` — deriving a year would be exactly the fabrication (k) removed.
   Guarded by `npm run test:agentcis-intakes` (pure, real payloads copied from the live API).
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

## Site snapshot to GCS (2026-09-16)

Not a V2 behavior — explicitly requested. Right after URL discovery, the job worker publishes a
`site_snapshot` step (`extraction-step.worker.ts`, `lib/site-snapshot.ts`) carrying the same-site,
non-asset, blocklist-filtered URL list, capped at `page_cap`. The step fetches each URL through
`getPage` (so `extraction_pages` is warmed and the page worker later hits the cache instead of
re-scraping) and uploads one Markdown file PER PAGE, grouped per site, to GCS at
`extraction/www/<site domain>/<hostname>/<path slug>-<url digest>.md` with a small front-matter
header (url, job_id, scraped_at) and, when the page links to any, a trailing "Linked files" list of
its image/document URLs (`fileLinksOf`) — discovery drops asset URLs from the crawl list, so the
per-page file is where they are recorded. Paths are deterministic (`snapshotPathFor`, pure,
`npm run test:site-snapshot-path`), so a rerun overwrites.

**The slug alone is not an identity** (review fix, 2026-09-16). It lowercases, drops extensions,
collapses punctuation to `-` and truncates at 180 chars, so `/a-b` and `/a_b`, two `?page=`
variants and two paths differing only past the truncation all produced ONE object name — and an
upload overwrites, so one page's snapshot was silently lost. The name now carries an 8-char sha256
of the NORMALISED url (`page-store.normaliseUrl`, the same key `extraction_pages` uses), and the
hostname directory is normalised too, so `example.edu` and `www.example.edu` stop writing the same
page twice. The readable slug is kept purely so a human can find a page in the bucket. Snapshots
uploaded before this change keep their old, digest-less names and are orphaned until re-run or
purged. Runs on the STEPS queue (consumers are
concurrent, so it holds neither the JOBS consumer nor other steps) in batches of
`SNAPSHOT_BATCH_SIZE` (100) URLs per message, so a crash mid-step loses one batch and batches run in
parallel; one `site_snapshot_uploaded` job event per batch records counts.

**A batch does not speak for the step** (review fix, 2026-09-16). Batches are consumed
concurrently, and the step worker's dispatcher marks `pipeline_progress[step] = "done"` after every
message — so the FIRST batch home reported the whole step finished, and whichever batch finished
LAST set the final status, a later success erasing an earlier batch's failure. Each batch now asks
`snapshotRunOutcome` whether every batch of THIS run has reported — counted from the durable job
events each batch already writes (`site_snapshot_uploaded` on success, `step_error` on a throw)
rather than an incrementing counter, which concurrent batches would lose to a read-modify-write
race. Only the batch that completes the set writes the status, and it writes `failed` if any batch
of the run errored. The run is identified by a `runId` the batch message carries (see below), not
by any stored marker.
A batch whose worker dies writes neither event, so the step stays `processing` rather than falsely
reporting done; that is the stuck-worker case the reclaim sweep exists for. Verdict arithmetic and
event tallying are pure and tested (`snapshotVerdict` / `tallySnapshotEvents`,
`npm run test:site-snapshot-path`).

Follow-up review fixes on that same mechanism, worth not re-deriving:
**There is no stored run marker, and there should not be one.** Three review rounds landed on this.
It first lived in `extraction_jobs.pipeline_progress` — a blob the job worker rewrites as a WHOLE
literal at three points, one of them ~100 lines after the snapshot dispatch in the same function —
so it was destroyed on every run before any batch finished, leaving `snapshotRunOutcome` with no
boundary and counting a PREVIOUS run's events (the premature-completion bug straight back, and
invisible because a job's first-ever run still behaved). Moving it to `extraction_additional_info`
fixed that but not the next one: two overlapping dispatches for one job could both DELETE the row
before either inserted (no unique on `(job_id, key)`; a transaction gives atomicity, not mutual
exclusion), leaving two markers, one read arbitrarily — and since both runs number their batches
1..N, one run's events satisfied the other's count. **Overlapping dispatches are reachable by
design**: the job worker rejects only `paused/declined/failed/exported`, deliberately tolerating a
second message for a job already `processing` so redelivery works.
The batch message now carries `runId` (minted per dispatch, `SnapshotBatch`) alongside `index` and
`total`, and both event writes spread `...batch` into `data`, so every event names its run.
`tallySnapshotEvents(events, runId)` counts only this run's batches. No shared row to race over, no
timestamp window, and two runs' batch 3 no longer collapse onto one key — a unique constraint on the
marker would have fixed the duplicate rows and NOT that collision. Events and in-flight messages
predating `runId` both read as undefined, so they pair with each other and the deploy window needs
no special case.
The wholesale-rewrite hazard still applies to the step's DISPLAYED status for a site that finishes
before the job worker reaches that later `pipeline_progress` write — pre-existing for every step,
not fixed here.
**A halted batch is not a finished batch, and a paused job does not chain** (review fix,
2026-09-21). The snapshot's halt check runs every 25 pages and then still wrote `site_snapshot_uploaded`
(so the admin can see where it stopped) — which the tally counted as a success, so a run containing a
halted batch could report `done` and publish `site_analysis` over an incomplete snapshot. Two guards,
both needed: `tallySnapshotEvents` counts an event carrying `halted: true` as errored, and `gate()`
refuses a job whose status is paused/failed/declined (the same set `jobHalted` uses), because a batch
that finished clean AFTER the pause can be the one that completes the run. Tests:
`test:site-snapshot-path` ("a halted batch counts as errored") and `test:step-gate` §3b.
**Count distinct batches, not event rows.** Delivery is at-least-once, so a worker that dies
between writing its batch event and acking gets the batch redelivered and writes a SECOND event for
the same index; counting rows let that duplicate stand in for a batch still outstanding.
`tallySnapshotEvents` keys on the batch index (falling back to the event row id for an unbatched
admin re-run, so those don't collapse onto one key), and the step worker's `step_error` write now
carries `...batch` so a repeatedly-failing batch is deduped the same way. A batch that errored and
then succeeded on redelivery counts once in `reported` and still counts in `errored`, so the run
reports failed with both events on the timeline — conservative on purpose. Hardening (2026-09-16):
every 25 pages the step re-reads the job and halts on `stop_requested` / paused / failed / declined
(the event says so); the heartbeat is keyed on pages processed, not uploaded. No per-page retry: the
Scrapling path already walks get → stealthy_fetch → browser fetch, and a Firecrawl escalation was
removed because the deployment is Scrapling-only and Firecrawl credits may be absent. Skipped with a warning when
`GCS_BUCKET_NAME` is unset. Admin re-run of the step with no URL list falls back to the job's
queued URLs. `npm run sitemap:list -- <url> [--discover]` prints what discovery sees for a site.
Same pass: `edu.np` added to `MULTI_LABEL_SUFFIXES`, since `siteOf` was reducing `ku.edu.np` to
`edu.np`. **That list is gone** — see "Registrable domains come from the Public Suffix List" below.

## Scrapling gets the WHOLE body; `fresh` re-snapshots (2026-09-21)

`scrapeMarkdown`'s Scrapling call now passes `main_content_only: false` always. Scrapling's
"main content" is `<body>` minus script/style/svg minus every element hidden at load (inline
display:none, aria-hidden, template — `_sanitize_for_ai` in scrapling/core/shell.py, an
anti-prompt-injection measure). On a university site that is the collapsed module accordions and
the inactive fee tabs. UEL BEng Electrical: 45,847 chars, module headings with nothing under them
and no fee figure, versus 101,306 chars with a paragraph per module and "£9,790 per year" /
"£16,020 per year". `scrapeRenderedHtml` had already been passing false for the CourseLeaf tables;
the markdown path never got the same fix. Nav is NOT stripped by either setting; it stays in and
`truncateMarkdown` (120k) bounds it — add a nav stripper in html-utils only if the tail of a real
page starts getting cut. `onlyMainContent` still keys `extraction_pages.mode`; it no longer changes
what Scrapling returns. Snapshots taken before this are thin and cached for 30 days: the Snapshot
chip's Run on a finished step now sends `fresh: true` (`RunStepSchema.fresh`, carried on every
batch message through `dispatchSnapshotBatches` → `snapshotSite` → `getPage({ fresh })`), which
re-fetches and rewrites every page's file.

## The .md file in GCS is the page's source of truth (2026-09-21)

User spec: "scrape each endpoint in 1 md file each and that md file will be used to insert the
data". `getPage` (`lib/page-store.ts`) writes the file to `snapshotPathFor(url, mode)` before the
`extraction_pages` row and leaves the row's `markdown` column BLANK when the upload succeeded; the
row keeps id, links, content_hash, scraper, scraped_at. Every read downloads the file, parses it
(`parseSnapshotFile`) and re-hashes it against the row. A missing or mismatched file is a MISS →
live Scrapling scrape → file and row rewritten. Never an error, so the page worker's
`snapshot_missing` gate and failure class are deleted. With no bucket configured the column holds
the text (pre-2026-09-21 behaviour); rows stored before this change are read from the column until
their next scrape. `full` mode is `…<digest>.full.md`. `snapshotPathFor`/`fileLinksOf` moved here
from `site-snapshot.ts` (re-exported there). `test:page-store` §6 covers write, hit, missing file,
mismatched file, linked-files round-trip, PDF.

## Study options own a course's duration (2026-09-21)

User decision: "study options' duration is the single source of truth". The admin UI no longer shows
or edits `extraction_courses.duration_weeks` (courses list badge, detail picker and add-course input
removed). The column stays — search and public course pages read it — and is kept true by
`syncCourseDurationFromOptions` (`staging-writer.ts`, `weeksFromStudyOptions` over the course's
linked options) called from EVERY study-option write path: `staged.service` create / patch / delete /
assign / unassign for the `study-options` junction, and `supporting.service.saveAndLearn` for
`extraction_study_options`. When no linked option supplies a duration the column is CLEARED
(review fix the same day — an earlier cut kept the old figure, so the catalogue kept showing a
duration the reviewed options no longer stated). A pipeline-extracted course keeps its prose-derived
figure only until an admin first touches its options. Updates use `IS DISTINCT FROM` so an unchanged figure does not bump `updated_at` (which would
re-queue incremental verification). Manually created courses get their duration the moment their
first dated study option is added. Not a V2 behaviour; review follow-up to the UI removal.

## Site URLs carry a CATEGORY, not a course/other role (2026-09-21)

`extraction_site_urls.category` / `category_source` (migration `20260918_001`, which had not
reached staging, so the columns were renamed in place rather than by a follow-up migration).
The set is `lib/url-categories.ts` `SITE_URL_CATEGORIES`: overview, about_us, contact_us, course,
branches, agents, fees, study_units, study_options, intake, eligibility, accreditations, other —
the admin's words for the job's sub-tabs, plus `other` because a real site is mostly news, events
and staff pages and the classifier needs somewhere to put them. `url_classify` assigns one per URL
in this order: admin (never overwritten) > guided_urls key (`fees_urls` → fees, `team_urls` →
agents, …; the admin TOLD us) > course-classifier pick → course (unchanged heuristic + narrow/
classify logic) > path heuristic (`heuristicCategory`, free) > ONE lite-tier model pass over what
is still null (`urlCategoryPrompt`, 200 URLs + page excerpt per batch, capped at
`CLASSIFY_ALL_CAP`) > other. `queue_pages` reads `category = 'course'`; nothing else in the
pipeline consumes the other categories yet — they are labels on the Site tab and the hook for the
entity steps to stop re-discovering their pages. `category_source` is PER URL (guided / heuristic /
llm / admin — review fix 2026-09-21: an earlier cut stamped one job-wide source on every row, so a
single model call relabelled guided and heuristic rows as llm). **Behaviour change:** a guided `fees_urls` /
`contact_urls` / … page used to be pinned `course` and therefore queued for course extraction; it
now keeps its own category and is NOT queued — the entity steps already read those keys directly.
Guarded by `test:step-gate` §6.

## Inactive pages: `dead_reason` on the site list (2026-09-23)

User decision: "Inactive does mean dead — not-found and blocked URLs", counted on the Site Context tab
but never fed onward. `extraction_site_urls.dead_reason` (migration `20260918_002`; `not_found` |
`blocked` | `empty`) is stamped by `snapshotSite` from the pure `deadReasonOf(page)` — the same
three conditions the step already treated as a failed fetch — and CLEARED when a later snapshot of
that URL succeeds (`setSiteUrlLiveness`, one update per reason per batch). **Only a newer observation
may write** (review fix, 2026-09-23): batches of overlapping runs finish in any order, so a stale
failed fetch landing after a newer success used to re-mark the page dead. `liveness_checked_at`
(same migration `20260918_002`) holds the batch's start time and every liveness update is conditioned on
`liveness_checked_at IS NULL OR < observedAt`; `addSiteUrl` stamps `now()` so an admin re-add is not
undone by a batch already in flight. Rows migrated with a null stamp accept the first write. Distinct from `excluded`,
which is admin intent. `listActiveSiteUrls` / `listSiteUrlsByCategory` skip dead rows, so
`url_classify`, `queue_pages` and every entity step's `urlsForType` never see them; the ONE place a
dead page is retried is a `fresh` re-snapshot (`listActiveSiteUrls(jobId, { includeDead: true })`),
because liveness is only knowable by fetching. The exception is an admin re-adding the URL: `addSiteUrl`'s
merge clears `dead_reason` along with `excluded`, otherwise the UI reported the add as successful while
every active read still skipped the row (review fix, 2026-09-23). `siteUrlCounts.dead` feeds the tab's Inactive capsule;
Active there is `total − excluded − dead`. Dead pages have no `extraction_pages` row (`getPage` does
not store an unreadable result), so they are absent from the snapshots table by construction. The
snapshots list now also carries `site_url_id` + `category_source` so the visible table's Category
picker can PATCH the site-list row; the old Details sheet is commented out in `site-tab.tsx`, not
deleted, at the user's request. Guarded by `test:site-snapshot-path` (deadReasonOf cases).

## Registrable domains come from the Public Suffix List (2026-09-17)

`siteOf` decides crawl scope (`filterUrls`), the catalogue-subdomain probe, the crt.sh query and
the GCS snapshot path. It used to take "the last two labels, or three if the suffix is in
`MULTI_LABEL_SUFFIXES`" — a hand-kept list of ~22 education suffixes. Any suffix missing from it
collapsed an institution to its REGISTRY: `ui.ac.id` → `ac.id`, `example.co.uk` → `co.uk`. The
consequences were not cosmetic — `%.ac.id` asks a certificate log for every Indonesian university,
and `isSameSite` then accepts all of them into the crawl and into one job's extracted data.

Review caught this twice. A shape heuristic (`<registry-word>.<2-letter ccTLD>`) patched the
ccTLD cases and still missed PRIVATE suffixes — `blogspot.com`, `github.io`, `wixsite.com`,
`wordpress.com` — where separate tenants are unrelated organisations and small providers really do
host. Two failed hand-rolled attempts is the signal that a few lines cannot do this job, so it now
uses the real PSL via **`tldts`** (`getDomain(host, { allowPrivateDomains: true })`, data bundled,
no runtime fetch, one dependency).

- **Private suffixes are included on purpose:** `tenant.blogspot.com` is its OWN site, so a
  sibling tenant is correctly off-site rather than "the same institution".
- **`null` means the host IS a public suffix** (someone entered `https://ac.id`). `siteOf` falls
  back to the host itself rather than a truncation, and `isRegistrySuffix` — now an exact PSL
  question, not a word list — makes the outward-reaching callers refuse.
- **Nothing that was already correct moved.** Every suffix the old list carried resolves
  identically (`stanford.edu`, `mit.edu`, `ku.edu.np`, `torrens.edu.au`, `ox.ac.uk` all verified),
  so GCS snapshot paths change only for domains whose scope was wrong to begin with.
- This also closed the pre-existing half flagged in earlier rounds: `filterUrls` scoped crawls with
  the same too-broad value, and fixing `siteOf` fixed every call site at once instead of bolting a
  guard onto one caller at a time.

Guarded by `npm run test:subdomain-cert-log`, which asserts the resolved registrable domain for
each shape (unchanged cases, previously-collapsed cases, private suffixes) rather than only the
guard downstream of it.

## AgentCIS product staging shares the resolveDurationWeeks resolver (2026-09-15)

`agentcis-product-staging.ts`'s `stageProduct` computed `duration_weeks` with a hand-rolled
`durationToWeeks(duration.value, duration.unit)` off the course-level duration field only,
bypassing `resolveDurationWeeks` (staging-writer.ts) that every other writer already goes
through. It now calls the same shared resolver, passing the AgentCIS-computed weeks as
`duration_weeks`, the raw `p.duration` string as `duration_text` (a second, independent parse
attempt if the first failed), the product's `study_options` (via `extractStudyOptions`, moved
earlier in the function so it's available here too), and `description`.

The study-options tier is currently a no-op for AgentCIS specifically: `extractStudyOptions`
derives every option's duration from the SAME `extractCourseDuration(p)` call as the course-level
figure, so if one is null the other is too — there's no independent signal there today. Wired in
anyway, both because it's the correct shared-resolver call (CLAUDE.md (h): no reimplementing
duration_weeks resolution per writer) and because it stops being a no-op the moment
`extractStudyOptions` ever gains a genuinely per-option duration source. The real, immediately
useful addition is the prose-description tier: an AgentCIS product whose `duration`/
`duration_value` fields are blank or unparseable but whose `description` states "a 3-year
full-time programme" now gets `duration_weeks` filled where it previously never could.

`weeksFromStudyOptions` itself (the general pipeline's tier, used by every writer including
AgentCIS through the above) is where the general-pipeline half of this actually bites: it only
ever preferred a **full-time** option over the shortest-of-everything fallback, silently missing
an **on-campus** option that states no load at all — a common real shape, since a school states a
mode without always repeating "full-time" next to it. `normaliseStudyMode` (mirrors
`normaliseStudyLoad`'s spelling tolerance: `on campus`/`on-campus`/`on_campus`/`campus`/
`classroom`/`in person`/`offline`) now makes on-campus a second, independent qualifying signal —
an option needs only ONE of (full-time, on-campus) to enter the preferred pool, matching how an
admin reads the Study Options tab: either signal alone marks the "normal" way to take a course,
as opposed to an extended part-time or remote variant that legitimately runs longer.

Tests: `npm run test:agentcis-product-duration-weeks` (DB integration — structured duration
unchanged, prose-description fallback fills what the old hand-rolled path couldn't, no duration
anywhere stays null rather than guessed) and `npm run test:duration-resolution` (pure, covers
`weeksFromStudyOptions`'s on-campus-or-full-time preference specifically — each case makes the
preferred option NOT the shortest of the set, so a fix that just widened the fallback pool
instead of actually preferring on-campus/full-time would still fail them).

**Never overwrite a course's EXISTING duration_weeks with a re-resolved one.** `writeCourse`'s
merge path already got this right (`existing.duration_weeks == null` gates the update, same as
every other merge field). `extraction-step.worker.ts`'s per-course "course" data-type
re-extraction step did not: it called `resolveDurationWeeks` and wrote the result whenever it
came back non-null, with no check on what the course already had — a re-scrape whose study
options resolve to a different figure than an AgentCIS import, or an admin's own manual
correction, would silently replace it. Now gated behind the identical
`course.duration_weeks == null || course.duration_weeks === ""` check (2026-09-15). No automated
test added for this one: `handleCourseDataStep` isn't exported and the worker file has a
top-level `queueService.consume()` side effect on import like every other worker here, so testing
it would mean building new mock/export infrastructure this file has never had — verified instead
by matching it to the identical, already-tested guard shape in `writeCourse`'s merge.

**Study options are shared, not duplicated per course — including the admin's manual "Add study
option" form** (2026-09-15). The pipeline (`writeCourse`, `agentcis-product-staging.ts`) always
went through `upsertStudyOption`, so it never created a duplicate for an identical tuple. The
admin form (`staged.service.ts`'s `createStudyOption`) did NOT — it called the generic
`insertEntity` raw insert used by every other staged entity type. Before the study-options unique
index (migration `20260911_001`), that meant it silently created a genuine duplicate ROW whenever
an admin added an option matching one another course already had. After that migration, it got
WORSE: the raw insert started throwing a raw `duplicate key value violates unique constraint`
error straight to the admin instead. `createStudyOption` now calls the same `upsertStudyOption`
(which gained an optional `adminId` param, stamped only on a genuine insert via
`COALESCE(existing.created_by, ...)`-style logic so reusing an existing row never claims someone
else's attribution) — an admin adding "on-campus, full-time, 3 years" to a second course now
correctly LINKS to the same shared row instead of erroring or duplicating.

A second, related gap surfaced once study options started sharing rows: `staged.repository.ts`'s
generic `assignJunction` (used by every "link this course to that entity" action — study options,
fees, intakes, eligibility, study units, accreditations, campuses) did a raw junction insert with
no conflict handling. This was mostly latent before (each entity type's own row-creation rarely
handed back an id another course was already linked to), but reusing a shared study-option row
makes a double-submit (or "link existing" clicked twice) hit the junction's own
`unique(course_id, entity_col)` constraint. Fixed generically: `assignJunction` now targets that
constraint with `.onConflict(...).ignore()` and falls back to reading the existing link's id, for
every junction table that has one — all six except `extraction_course_campuses`, which has no
such constraint (pre-existing, unrelated) and is left as a plain insert.

Verified live (not just by reading the code): reproduced both failures against the real dev DB
before fixing — a second course's manual "Add study option" throwing the unique-constraint error,
and a same-course double-submit throwing the junction's own duplicate-key error — confirmed both
are silent no-ops after the fix, then reverted the fix and confirmed the test genuinely crashes
again before restoring it. Tests: `npm run test:study-option-dedup`'s new admin-path assertions.

## Three further review fixes on the above (2026-09-15)

**Prose duration can't tell a course's length from a component's.** `durationFromProse`'s
"duration:"/"lasts"/"X full-time" cues (unlike its course-word-anchored first cue) have no
requirement that the figure describes the WHOLE course — "Placement duration: 6 months" or "each
module lasts 10 weeks" satisfies them just as well as a real course-length statement, and AgentCIS
descriptions state exactly this kind of component duration often. `COMPONENT_DURATION_CUE` (a word
list: placement, internship, practicum, module, project, dissertation, thesis, …) now vetoes a
match with one of those words in a NARROW window (25 chars) around the matched figure — narrow,
not the whole sentence, because a genuine course-length statement often mentions a component
elsewhere in the same sentence ("a four-year programme with a 10-week placement in year 3") and a
sentence-wide veto wrongly rejected that real case during development. Guarded by
`test:duration-resolution`'s new component-duration cases.

**A populated duration_weeks isn't permanently immutable, but it's not free-for-all either.** The
per-course rerun guard added earlier this session (never overwrite an existing value) was too
strict: it also blocked a legitimate LATER correction of a stale machine-derived figure, with no
way to ever fix it short of clearing the column by hand. Now protected only when there's a reason
to trust the existing value over a fresh crawl: the job is `source_type: "agentcis"` (AgentCIS's
own figure stays authoritative, matching every other category's additive-only guard) or the course
row has a non-null `updated_by_platform_user_id` (an admin touched this row at some point — there's
no field-level provenance to know if duration_weeks specifically was hand-corrected, so a non-null
row-level `updated_by` is the closest available signal and errs toward not discarding a possible
manual fix). A plain machine-derived value from an earlier crawl, never hand-touched, non-AgentCIS,
can still be corrected by a rerun. No automated test for this specific branch, same reason as
before — `handleCourseDataStep` isn't exported and the worker has the same top-level side effect
on import as every worker file here.

**Reusing a shared study option must not log a fabricated creation.** `upsertStudyOption` now
returns `{ id, created }` — `created` comes from Postgres's `xmax = 0` (the standard tell for "this
row came from THIS statement's INSERT branch", not the ON CONFLICT UPDATE one) rather than a
separate check-then-act query. `staged.repository.ts`'s `assignJunction` similarly returns
`{ id, linked }`, `linked` false when the row already existed. `createStudyOption` (and the generic
`assignJunction` service function used by every other entity type) now logs `STUDY_OPTION_CREATE`
only on a genuine insert, `STUDY_OPTION_LINK` when an existing option is newly linked to a course,
and nothing at all for a true no-op (already linked) — instead of always claiming a creation.
Verified via a real audit-log row count in `test:study-option-dedup`, and via the same
break-it-then-fix-it method as the two bugs above: reverted to unconditional logging, confirmed the
no-op case's assertion genuinely failed, then restored.

## Fee scope is tuition + application fee, enforced in the writer (2026-09-11)

`FEE_SCOPE_RULE` says only two kinds of fee are wanted, and two prompts CONTRADICTED it in the
same request: `FEES_FROM_PAGE_SYSTEM` and `CURRICULUM_AND_FEES_SYSTEM` both asked for "the tuition
AND every other charge stated alongside it", and the `name` field's own examples in three schemas
offered 'Enrolment Fee', 'Material Fee', 'Student Services Fee' and 'Health Cover' — the exact
charges the rule tells the model to leave out. A model following the broader wording had its answer
staged verbatim, because nothing downstream re-checked the kind.

Both wordings now match the rule, and `isExtractableFee(name)` in `staging-writer.ts` drops an
out-of-scope fee at the two LLM write paths: `writeCourse` and the step worker's `fees` branch.
Deliberately NOT inside `upsertFee` — the AgentCIS import writes the institution's own structured
fee list, where a material or insurance fee is real data rather than a model overreaching.

`feeTypeFor` alone was not enough to express the rule: it answers "which of the fee form's 8 types
is this", and anything it does not recognise falls through to `Tuition Fee`. Five of the ten kinds
FEE_SCOPE_RULE excludes have a keyword entry; accommodation, transport, graduation and deposits do
not, so they passed the guard AND were staged as TUITION — a $400 accommodation deposit reading as
the course's headline price. `OUT_OF_SCOPE_FEE` names those four plus the ancillary charges a
university fee table puts beside tuition (library, technology, lab, activity, sports, orientation,
ID card, alumni, admin). An explicit tuition/application marker overrides it, so
"Travel & Tourism Tuition Fee" and "Graduate Tuition Fee" stay in scope — hence "graduation", never
"graduat". Still NOT an allow-list: an unlabelled fee, or one labelled "Standard Rate 2027", is the
page's headline tuition and dropping it would lose the number the fee tab exists to show.
Guarded by `npm run test:fee-scope`.

Same pass: the bulk-fees step's INSTITUTION-WIDE APPLICATION FEE is now CORRECTED IN PLACE instead
of duplicated. Amount, currency and student type are all part of `upsertFee`'s dedupe key, so a
rerun reading a corrected figure minted a new row while the old one stayed linked to every course
(`.onConflict([course_id, course_fee_id]).ignore()` only skips an identical pair) — each course
then showing two application fees. `findSharedApplicationFee` locates the existing row — an
application fee this pipeline created (`created_by` null) that is linked to MORE THAN ONE course,
the shape only this step produces — and updates its figures; a course page's own program-specific
application fee (one course, one fee, which FEE_SCOPE_RULE asks for) is not that and is untouched.
A row an admin has edited (`updated_by` non-null) is left exactly as they left it, and no second
row is added beside it.

**Nothing is unlinked**, and that is the point: `assignJunction` records no provenance, so a link
an admin curated in the Fees tab is indistinguishable from one this block wrote. An earlier version
of this fix deleted "stale" assignments and would have silently discarded reviewed links. Correcting
the row keeps every assignment valid and pointing at the new figure. The per-course `fees` step
needs none of this — it already deletes the course's assignments before re-extracting.

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

## AgentCIS "Enrich from Website" (2026-09-11)

Not a V2 behavior — explicitly requested and scoped by the team, not a parity port.

AgentCIS imports (`lib/agentcis-staging.ts`) never crawl the institution's own site — every
course/campus/fee comes structured from the AgentCIS API. AgentCIS's own schema has no
curriculum/study-unit concept at all (confirmed against the real API response and the
`agentcis-app` source), so an AgentCIS-imported course can never have study units through that
path. `POST /jobs/:id/enrich-from-web` (`services/agentcis-enrichment.service.ts`, its own file
so this AgentCIS-specific trigger stays easy to find and change independently of the general
job-queue actions it reuses) re-runs the SAME site-discovery/crawl pipeline every other job
already uses — `extraction-job.worker.ts` unchanged — over the SAME `job_id`, pointed at the
institution's real website, so `writeCourse`'s existing job-scoped course-name match naturally
attaches whatever it finds onto the AgentCIS course rows instead of creating duplicates. Guarded:
only a `source_type: "agentcis"` job, only once its import finished (`status: "done"`), only when
AgentCIS gave a real website (not its own synthetic `agentcis.com/institution/{id}` fallback).
The "done" check and the flip to "processing" are ONE atomic update (`claimDoneJob`,
`queue.repository.ts`), not a prior read — two concurrent requests both reading "done" would
otherwise both pass and both publish, dispatching two full crawls for the same job, since the
worker itself tolerates a message for a job already "processing" (needed elsewhere for message
redelivery) and so wouldn't reject the second one either (review finding, 2026-09-15). Everything
between the claim and the publish — `logAudit` included — is inside the same guard: any failure
there rolls the status back to "done" rather than stranding it at "processing" with nothing
queued (a second review finding the same day caught `logAudit` sitting outside the rollback).

**Never removes or overwrites AgentCIS's own data** — the explicit requirement this was scoped
to. `writeCourse` (`staging-writer.ts`) gained a per-category, per-course guard: for a
`source_type: "agentcis"` job, each of fees/intakes/study-options/eligibility/English-
requirements is written ONLY when that specific course currently has NONE of that type
(`courseHasExisting`, one query per category against the assignment junction table, or
`extraction_english_requirements` directly). A course AgentCIS already gave a fee to keeps that
fee untouched even if the website scrape finds a different one; a course with no fee at all is
free to gain one. Completely inert for every non-AgentCIS job — `isAgentcisSourcedJob` short-
circuits false, so this changes nothing about the pipeline's existing behavior anywhere else.
Institution-overview fields need no equivalent guard: `writeInstitutionOverview` was already
fill-blanks-only (`COALESCE(NULLIF(new, ''), existing)`), so re-running site analysis against the
same job safely fills only what AgentCIS left null.

Study units are deliberately NOT behind `courseHasExisting` — AgentCIS never has any to protect
(no curriculum concept at all), so "has existing" there only ever means an earlier enrichment
page already added some, and gating the whole category on that made a later page's different
units depend on crawl/page order (review finding, 2026-09-11: one page's unit blocked every
other page's units for the same course). `upsertStudyUnit` plus the assignment junction's
`onConflict().ignore()` already dedupe an identical unit on their own, so nothing is lost by
leaving this category unguarded.

Course-name matching is exact/normalized only in v1 (the same match `writeCourse` already does)
— a scraped course whose name doesn't match an existing AgentCIS course lands as a new, separate
row rather than being fuzzy-matched or dropped. Deliberately deferred, not built until real usage
shows AgentCIS's course names diverge too much from what institutions call them on their own
sites.

Manual, opt-in per job (an "Enrich from Website" button, shown only for AgentCIS-sourced jobs) —
not automatic on every AgentCIS import — to avoid multiplying Gemini/Scrapling spend across
institutions nobody asked to enrich.

Tests: `npm run test:agentcis-writecourse-guardrail` (the per-category add-only-if-missing rule,
DB integration) and `npm run test:agentcis-enrich-from-web` (the trigger's guard rails and queue
dispatch, DB integration with `queueService.publish` mocked).

## Stale queue-item reclaim (2026-09-15)

Root cause of jobs found stuck at `status: "processing"` forever (seen live, both local and
staging, some for 5+ days): a page's worker process can die mid-scrape (crash, OOM, deploy
restart, manual kill) or hang on a network/model call with no timeout, while its
`extraction_queue` row is still `"processing"`. Nothing else ever revisits that row —
`checkAllPagesDone` (`lib/queue-completion.ts`) only runs REACTIVELY when another page finishes —
so if the stuck item is the last one left, the whole job (and its frozen
`processing_heartbeat_at`) is stuck forever with nothing to unstick it. No item-level
timeout/lease existed anywhere in the pipeline.

`workers/extraction-queue-reclaim.worker.ts` (`npm run job:extraction-queue-reclaim`, long-running
poll every 5 minutes, or `--once` for a one-shot manual/cron fix) sweeps `extraction_queue` for
`"processing"` rows whose `updated_at` is more than 20 minutes stale: resets them to `"pending"`
and re-publishes to PAGES (a healthy worker's own normal completion path then calls
`checkAllPagesDone` when it finishes, same as any other page), up to 3 reclaim attempts, after
which the item is marked `"failed"` and `checkAllPagesDone` is called directly (nothing else
would call it for a failure this worker caused itself). As defense in depth, it also re-runs
`checkAllPagesDone` for every `"processing"` job whose heartbeat has gone stale — cheap and safe,
since that function already no-ops unless the queue is genuinely fully resolved — covering the
rarer case where the LAST item's own worker died after updating queue status but before calling it.

`checkAllPagesDone`/`deduplicateCampuses` were moved out of `extraction-page.worker.ts` into
`lib/queue-completion.ts` so this worker can call the exact same transition logic without
importing a file that starts a second PAGES consumer as a side effect of import (every `workers/`
file here has a top-level `queueService.consume(...)` call) — reimplementing the transition a
second time was rejected as the same "drifts between two copies" failure this module has hit
before (see (h) above).

Verified live against a real stuck job (not just by reading the code): seeded a stale
"processing" queue item, ran the reclaim worker, confirmed it correctly reset the item and
re-published it — a live page worker then picked it up and ran it through the normal
scrape/retry/fail path, proving the whole pipeline reconnects correctly rather than just the
reclaim step in isolation.

For staging: run `npm run job:extraction-queue-reclaim -- --once` once to clear whatever's
currently stuck there, then deploy the reclaim worker as a standing process (or cron) alongside
the existing `job:extraction*` workers so this doesn't recur.

## External FK columns

7 columns reference tables that may not exist yet in V3. These are plain
`uuid` columns with no FK constraint. See `docs/extraction-v3-decisions.md`
for the full list.

## Status values

Status fields are `text` columns with no CHECK constraints (matching V2).
Validation is in Zod schemas. See `docs/extraction-v3-decisions.md`
Section 3 for canonical value lists.
