# Eligibility & Intake Data Storage — Findings and Implementation Plan

> Status: **Phases 1-4 implemented 2026-09-04** · Date: 2026-09-04 · Scope mode: Hold Scope
>
> Shipped: F1-F7, F10, F14, F15-F16, F18 and the F4/F3 rerun fixes. Phase 5 deliberately not
> done (see §4). Still open: F8 (`min_score_grade` dead read), F9 (duplicate `language_tests`
> store), F11 (verification coverage), F13 (two intake access paths), F17 (no intake edit).
>
> Verification: `npm run test:eligibility-extraction` (29 assertions, pure logic, no DB).
> Repair for data already stored: `npm run eligibility:backfill` — dry-run by default.
> Migration: `20260904_001_extraction_requirement_intake_source_url.ts` (superadmin).

## 1. Problem

Reported: a GRE/GMAT score shows up in an eligibility requirement's **Notes / Remarks** but not in
the **Academic Tests** section, and "the GMAT section is in the degree level rather than academic test".

Reproduced from a live job (`3e4a6521-43d2-403a-a683-c8f033cf8efb`, "Master in Finance"). One requirement row:

| Field | Value |
|---|---|
| Requirement Name | `GMAT Quantitative Score (Optional)` |
| Min Degree Level | — Any — |
| Score Type | `Percentage (%)` |
| Percentage (%) | `95` |
| Notes / Remarks | `Average quantitative GMAT scores are 49.5 (95th percentile).` |
| English Tests | *(empty)* |
| Academic Tests | *(empty)* |

Three separate defects in one row:

1. **A test requirement was stored as a degree/grade requirement.** The LLM had nowhere else to put
   it, so it emitted a generic `eligibility[]` row whose *name* is a test name.
2. **`95` is fabricated.** Nothing on the page says "minimum 95%". `deriveScoreFromDescription`
   regex-matched `95th percentile` in the free text and wrote it to `min_score_percent`.
3. **The real number (49.5) was discarded**, and `(Optional)` was ignored — there is no column for
   optional-vs-required.

The fabricated 95% is not cosmetic. It renders on the public course page as **"Minimum score: 95%"**
under *Academic Requirement*
([course-entry-requirements-card.tsx:75](../../frontend/src/app/(web)/course/[slug]/components/course-entry-requirements-card.tsx#L75)),
and it is compared against the student's GPA (scale-converted to a percentage) by the eligibility
verdict engine
([eligibility.ts:216-268](../../backend/src/modules/enquiries/shared/eligibility.ts#L216-L268)) —
so real students are shown a `fail` against a requirement the institution never stated.

## 2. How it works today

There is **no live courses table**. `superadmin.extraction_*` *is* the production store for courses —
the public search and course pages read it directly
([search/repositories/courses.repository.ts:1-3](../../backend/src/modules/search/repositories/courses.repository.ts#L1-L3)).
Improving "data storing" therefore means improving these tables, not a downstream promote step
(`promote.*` only publishes institutions/businesses, never courses).

### Write paths (two of them, and they disagree)

| | Page worker (first run) | Step worker (per-course re-extraction) |
|---|---|---|
| Entry | [extraction-page.worker.ts:409](../../backend/src/modules/superadmin/data-extraction/workers/extraction-page.worker.ts#L409) → `courseExtractionPrompt` | [extraction-step.worker.ts:1085-1170](../../backend/src/modules/superadmin/data-extraction/workers/extraction-step.worker.ts#L1085-L1170) → `courseDataPrompt` |
| Writer | [staging-writer.ts:411-478](../../backend/src/modules/superadmin/data-extraction/lib/staging-writer.ts#L411-L478) | inline in the worker |
| Date coercion | `coerceDate` / `coerceMonth` | **none — raw LLM strings** |
| Nameless intakes | kept | dropped |
| Rerun behaviour | duplicates children | orphans children |

### Read paths

| Store | Written by | Read by |
|---|---|---|
| `extraction_eligibility_requirements` (row) | both pipelines + admin | public card, verdict engine, ai-counsellor |
| `.academic_tests` jsonb | **admin form only** | public card "Academic Test Score", verdict engine `academic_test` |
| `.language_tests` jsonb | **admin form only** | verdict engine `language_test` — **never rendered publicly** |
| `extraction_english_requirements` (table) | both pipelines + admin | public card "Language Requirement", verdict engine `englishCriteria` |
| `extraction_intakes` | both pipelines + admin | public detail + search **by `course_id`**; ai-counsellor **by junction** |

## 3. Findings, ranked by damage

### Tier 1 — actively wrong data reaching students

**F1. `academic_tests` is never populated by the pipeline.** No prompt asks for it
([extraction-prompts.ts:138-146](../../backend/src/modules/superadmin/data-extraction/lib/extraction-prompts.ts#L138-L146),
[:711-714](../../backend/src/modules/superadmin/data-extraction/lib/extraction-prompts.ts#L711-L714))
and no writer sets it
([staging-writer.ts:451-478](../../backend/src/modules/superadmin/data-extraction/lib/staging-writer.ts#L451-L478),
[extraction-step.worker.ts:1128-1157](../../backend/src/modules/superadmin/data-extraction/workers/extraction-step.worker.ts#L1128-L1157)).
The only writers are the admin form and `createEligibility`
([staged.service.ts:75-76](../../backend/src/modules/superadmin/data-extraction/services/staged.service.ts#L75-L76)).
Two consumers already exist and always get `[]`. **The whole `academic_test` criterion in the
eligibility engine is dead**, and the student's own GRE/GMAT scores in
`platform_user_academic_tests` are never used for anything.

**F2. `deriveScoreFromDescription` fabricates minimums from any percentage-shaped text.**
[staging-writer.ts:134-148](../../backend/src/modules/superadmin/data-extraction/lib/staging-writer.ts#L134-L148).
Pattern `/(\d+(?:\.\d+)?)\s*(?:%|percent)/i` matches `95th percentile`, `top 10 percent`,
`85% of graduates are employed`, `acceptance rate 12%`. Called from both write paths
([staging-writer.ts:456](../../backend/src/modules/superadmin/data-extraction/lib/staging-writer.ts#L456),
[extraction-step.worker.ts:1136](../../backend/src/modules/superadmin/data-extraction/workers/extraction-step.worker.ts#L1136)).
This is the single most damaging line in the pipeline: it invents hard requirements out of marketing prose.

**F3. Rerunning the eligibility step turns one course's old requirements into institution-wide ones.**
The step worker deletes only the *assignment* rows
([extraction-step.worker.ts:1130](../../backend/src/modules/superadmin/data-extraction/workers/extraction-step.worker.ts#L1130)),
leaving requirement rows with no assignment. `findRequirementsForCourse` infers *institution-wide*
from exactly that condition — job-scoped rows with no assignment apply to every course that has none
of its own
([eligibility.repository.ts:44-58](../../backend/src/modules/enquiries/repositories/eligibility.repository.ts#L44-L58)).
So re-extracting eligibility for course A silently injects A's stale requirements into every other
course on the job.

**F4. First-run duplicates.** `writeCourse` dedupes the *course* by normalised name but then
unconditionally re-inserts every child
([staging-writer.ts:330-478](../../backend/src/modules/superadmin/data-extraction/lib/staging-writer.ts#L330-L478)).
The junction `unique(course_id, child_id)` constraints never fire because each child row is freshly
inserted with a new uuid. A course found on a listing page, its detail page and a catalog entry gets
**three copies** of every requirement, intake and fee. Only study units dedupe
(`upsertStudyUnit`, [staging-writer.ts:290-311](../../backend/src/modules/superadmin/data-extraction/lib/staging-writer.ts#L290-L311)) —
that is the pattern to copy.

### Tier 2 — data silently lost

**F5. `intake_month` / `intake_year` are the only intake columns search uses, and the prompt never
derives them.** They appear as bare `null` placeholders
([extraction-prompts.ts:120-127](../../backend/src/modules/superadmin/data-extraction/lib/extraction-prompts.ts#L120-L127),
[:706](../../backend/src/modules/superadmin/data-extraction/lib/extraction-prompts.ts#L706))
with no instruction to derive them from `intake_name` ("Semester 1 2027") or `start_date`. Every
intake feature keys off them:
intake-year filter ([courses.repository.ts:112-117](../../backend/src/modules/search/repositories/courses.repository.ts#L112-L117)),
"next intake" badge ([:153-163](../../backend/src/modules/search/repositories/courses.repository.ts#L153-L163)),
year facet ([:236-240](../../backend/src/modules/search/repositories/courses.repository.ts#L236-L240)),
institution search ([businesses.repository.ts:133,201](../../backend/src/modules/search/repositories/businesses.repository.ts#L133)).
An intake row carrying only a name is invisible to all of them.

**F6. The step worker skips coercion entirely.**
`start_date: intake.start_date ?? null`, `intake_month: intake.intake_month ?? null`
([extraction-step.worker.ts:1093-1099](../../backend/src/modules/superadmin/data-extraction/workers/extraction-step.worker.ts#L1093-L1099)).
The LLM demonstrably emits `"February 15"` and `"September"` (that is *why* `coerceDate`/`coerceMonth`
exist, per their own comments). Raw into a `date` / `integer` column → insert error or garbage.
The page worker coerces; the step worker does not. Same data, two behaviours.

**F7. `end_date` and `orientation_date` are never extracted.** Columns exist since
[20260805_004](../../backend/database/migrations/superadmin/20260805_004_extraction_staged_entities.ts);
no prompt asks for either. `end_date` is written only by the AgentCIS import,
`orientation_date` only by the admin form. Always null for scraped data.

**F8. `min_score_grade` is read but never written.** Consumed by the public card
([course-entry-requirements-card.tsx:75](../../frontend/src/app/(web)/course/[slug]/components/course-entry-requirements-card.tsx#L75))
and the verdict engine ([eligibility.ts:52](../../backend/src/modules/enquiries/shared/eligibility.ts#L52)).
No writer anywhere. Dead read — grade-based requirements ("Credit average", "Second Class Upper")
have nowhere to go and end up in Notes.

**F9. `language_tests` jsonb is written and matched but never shown.** The admin form's *English
Tests* section writes it
([eligibility-form.tsx:98](../../frontend/src/app/admin/data/all-extractions/components/eligibility-form.tsx#L98));
the verdict engine reads it
([eligibility.ts:384](../../backend/src/modules/enquiries/shared/eligibility.ts#L384));
the public card renders only `extraction_english_requirements`
([course-entry-requirements-card.tsx:88-127](../../frontend/src/app/(web)/course/[slug]/components/course-entry-requirements-card.tsx#L88-L127)).
Two stores for one fact: extraction fills one, admin fills the other, the page shows one, the verdict
engine shows both — producing duplicate English criteria whenever both are present.

### Tier 3 — cannot audit or verify

**F10. No provenance on requirements or intakes.** `extraction_eligibility_requirements` and
`extraction_intakes` have no `source_url` column at all.
`extraction_english_requirements` *has* one and no writer sets it
([staging-writer.ts:483-495](../../backend/src/modules/superadmin/data-extraction/lib/staging-writer.ts#L483-L495)).
You cannot answer "which page said this?" for the data most likely to be wrong.

**F11. Verification never touches eligibility or intakes.**
`FIELDS_TO_VERIFY = ["name","degree_level","duration_weeks","domestic_fee_total","international_fee_total"]`
([extraction-verify.worker.ts:22](../../backend/src/modules/superadmin/data-extraction/workers/extraction-verify.worker.ts#L22)).
The two things that drift most — intake dates and entry requirements — are the two things never re-checked.

**F12. Raw scraped markdown is not persisted.** No `markdown` column on `extraction_queue` or
`extraction_courses` (only the separate `ai_knowledge` crawler keeps page text). **Any prompt
improvement requires a full re-scrape and re-bill of every page.** This constrains the plan: prefer
deterministic code-side derivation and SQL backfills over prompt-only fixes wherever the information
is already in the database.

**F13. Two access paths for intakes.** Public detail + search read `extraction_intakes` by
`course_id` ([courses.repository.ts:314](../../backend/src/modules/search/repositories/courses.repository.ts#L314));
ai-counsellor reads through `extraction_course_intake_assignments`
([knowledge.repository.ts:577](../../backend/src/modules/ai-counsellor/repositories/knowledge.repository.ts#L577)).
Unassigning an intake does not hide it publicly. Combined with F4 the public page shows the duplicates.

**F14. "Next intake" is "earliest intake ever recorded".** No `>= today` filter
([courses.repository.ts:153-163](../../backend/src/modules/search/repositories/courses.repository.ts#L153-L163)).
A Feb 2024 row still renders as the next intake.

### Tier 4 — minor / latent

- **F15.** No dedupe constraint on `extraction_intakes` (the junction has one, the entity does not).
- **F16.** Year facet has no publish gate — `listCourseFilterOptions` reads every intake row with no
  `PUBLICLY_VISIBLE` predicate ([courses.repository.ts:236-240](../../backend/src/modules/search/repositories/courses.repository.ts#L236-L240)),
  offering years that return zero courses.
- **F17.** Admin can create and delete intakes but not edit them — `intakes` has no `update`
  ([staged.repository.ts:40-43](../../backend/src/modules/superadmin/data-extraction/repositories/staged.repository.ts#L40-L43)).
- **F18.** Latent: `patchEligibility` does not `JSON.stringify` the jsonb fields the way
  `createEligibility` does ([staged.service.ts:82-85](../../backend/src/modules/superadmin/data-extraction/services/staged.service.ts#L82-L85)).
  Currently unreachable — `updateEligibilityRequirement` has no frontend callers, and the edit form
  routes through `saveAndLearn` → `patchEntityRow`, which *does* serialise
  ([supporting.repository.ts:65-77](../../backend/src/modules/superadmin/data-extraction/repositories/supporting.repository.ts#L65-L77)).
  Breaks for the next caller.

### What already works and needs nothing

The correction/learning loop is complete and already covers both domains: `TABLE_TO_STEP` maps
`extraction_intakes` and `extraction_eligibility_requirements`
([supporting.service.ts:64-76](../../backend/src/modules/superadmin/data-extraction/services/supporting.service.ts#L64-L76)),
inline edits and the edit form both route through `saveAndLearn`, two corrections on the same
domain+step+field auto-create a lesson, and lessons are recalled into the prompt
([extraction-page.worker.ts:380](../../backend/src/modules/superadmin/data-extraction/workers/extraction-page.worker.ts#L380)).
Every admin correction made below already trains the extractor. **Do not build anything here.**

The `tests` catalogue is also already in place — `public.tests` with an academic/language split and
23 seeded rows including GRE, GMAT, LSAT, MCAT
([20260827_003_tests.ts](../../backend/database/migrations/globalyapp/20260827_003_tests.ts),
[tests-catalog.ts](../../frontend/src/lib/tests-catalog.ts)), plus a name-matcher (`testImage`)
already used to resolve free-text test names to catalogue rows. Reuse it; do not add a second list.

## 4. Plan

Phased by damage. Each phase is independently shippable and independently useful.

### Phase 1 — Stop fabricating requirements, start storing academic tests

Fixes F1, F2, and the reported bug. No migration.

1. **Kill the fabrication** — `deriveScoreFromDescription`
   ([staging-writer.ts:134-148](../../backend/src/modules/superadmin/data-extraction/lib/staging-writer.ts#L134-L148)).
   Add a context blocklist checked before any pattern runs: reject the description outright when the
   matched number sits next to `percentile`, `average`, `mean`, `median`, `top \d`, `of applicants`,
   `of graduates`, `acceptance rate`, or an ordinal (`\d+(st|nd|rd|th)`). Blocklist, not allowlist —
   an allowlist requiring "minimum"/"at least" would drop the cases it currently gets right
   ("requires 65% in a bachelor degree").

2. **Give the LLM somewhere to put a test.** Add `academic_tests` to both eligibility schemas
   ([extraction-prompts.ts:138-146](../../backend/src/modules/superadmin/data-extraction/lib/extraction-prompts.ts#L138-L146)
   and [:711-714](../../backend/src/modules/superadmin/data-extraction/lib/extraction-prompts.ts#L711-L714)):
   ```json
   "academic_tests": [
     { "test_name": "GRE|GMAT|SAT|ACT|LSAT|MCAT|…", "score": "the minimum stated, verbatim",
       "is_optional": false }
   ]
   ```
   Plus three rules next to the existing one at
   [:193](../../backend/src/modules/superadmin/data-extraction/lib/extraction-prompts.ts#L193):
   - A standardised-test requirement goes in `academic_tests`, **never** as an `eligibility[]` row
     named after the test.
   - `score_type`/`min_score`/`min_score_percent` describe a *prior-qualification* grade only. A
     percentile, an average, a cohort statistic or an acceptance rate is never a minimum score —
     leave both null and keep the sentence in `description`.
   - Set `is_optional: true` when the page says optional/recommended/waived.

3. **Persist it in both writers** —
   [staging-writer.ts:451-478](../../backend/src/modules/superadmin/data-extraction/lib/staging-writer.ts#L451-L478)
   and [extraction-step.worker.ts:1128-1157](../../backend/src/modules/superadmin/data-extraction/workers/extraction-step.worker.ts#L1128-L1157):
   `academic_tests: JSON.stringify(normaliseTests(elig.academic_tests))`. `normaliseTests` drops
   entries with no `test_name`, and resolves the name against `public.tests` using the same
   contains-match-longest-first rule as `testImage` so "GRE General Test" lands as "GRE".

4. **Render `is_optional`** — one `(optional)` suffix in `TestTile`
   ([course-entry-requirements-card.tsx:10-25](../../frontend/src/app/(web)/course/[slug]/components/course-entry-requirements-card.tsx#L10-L25)),
   and skip optional tests in `testCriteria` so the verdict engine never fails a student on a test
   the institution called optional
   ([eligibility.ts:272-296](../../backend/src/modules/enquiries/shared/eligibility.ts#L272-L296)).

5. **Backfill without re-scraping** (F12). One-off script: scan existing
   `extraction_eligibility_requirements.name` + `.description` for a `public.tests` name with a
   nearby number; write into `academic_tests`; and **null out `min_score_percent`/`min_score` on
   rows the new blocklist would now reject**. Rows land in the admin Eligibility tab for review, and
   every correction feeds the existing lesson loop. This recovers the GMAT 49.5 case and its
   ~1200 siblings for the price of one script run instead of a full re-crawl.

**Check:** a `test_*.ts` case asserting `deriveScoreFromDescription("Average quantitative GMAT scores
are 49.5 (95th percentile).") === null`, and one asserting a `academic_tests` round-trip through
`writeCourse`.

### Phase 2 — Stop losing intake month/year

Fixes F5, F6, F7. No migration.

1. **Derive deterministically, don't ask the LLM twice.** New `deriveIntakeMonthYear(intake_name,
   start_date)` in `staging-writer.ts` next to `coerceMonth`: month name or number from the name,
   4-digit year from the name, else both from `start_date`. Called by both writers only when the LLM
   left them null. ~12 lines, no LLM cost, and — crucially — **backfillable over existing rows by
   SQL**, which is the only affordable fix given F12.
2. **Route the step worker through the coercers** — replace the four raw assignments at
   [extraction-step.worker.ts:1093-1099](../../backend/src/modules/superadmin/data-extraction/workers/extraction-step.worker.ts#L1093-L1099)
   with `coerceDate`/`coerceMonth`/`coerceInt`, and drop the `if (!intake.intake_name) continue`
   guard at [:1090](../../backend/src/modules/superadmin/data-extraction/workers/extraction-step.worker.ts#L1090)
   so both paths keep a dated-but-unnamed intake. One shared helper, no second implementation.
3. **Ask for the missing dates** — add `end_date` and `orientation_date` to both intake schemas
   ([extraction-prompts.ts:120-127](../../backend/src/modules/superadmin/data-extraction/lib/extraction-prompts.ts#L120-L127),
   [:706](../../backend/src/modules/superadmin/data-extraction/lib/extraction-prompts.ts#L706)).
   `coerceDate` already handles them.
4. **Make "next intake" mean next** — add `(intake_year, intake_month) >= (current)` to the two
   correlated subqueries at
   [courses.repository.ts:153-163](../../backend/src/modules/search/repositories/courses.repository.ts#L153-L163),
   and a `PUBLICLY_VISIBLE` predicate to the year facet at
   [:236-240](../../backend/src/modules/search/repositories/courses.repository.ts#L236-L240) (F14, F16).

**Check:** `assert(deriveIntakeMonthYear("Semester 1 2027", null) === {month: null, year: 2027})`
and `deriveIntakeMonthYear("February 2026 intake", null) === {month: 2, year: 2026}`.
**Backfill:** `UPDATE superadmin.extraction_intakes SET intake_year = … WHERE intake_year IS NULL`
driven by the same helper.

### Phase 3 — Make reruns idempotent

Fixes F3, F4, F15. One migration.

1. **Dedupe children on write**, mirroring `upsertStudyUnit`:
   - `extraction_intakes`: unique on `(job_id, course_id, coalesce(intake_name,''), coalesce(intake_year,0), coalesce(intake_month,0))`, insert with `.onConflict(...).ignore()`.
   - `extraction_eligibility_requirements`: `upsertEligibility(jobId, elig)` finding by
     `(job_id, lower(trim(name)), applicable_to)` and merging nulls, exactly as `writeCourse`
     already merges the course row.
   - Once the child rows are stable, the existing junction `unique(course_id, child_id)`
     constraints start doing their job for free.
2. **Delete the orphans the step worker creates.** Capture the requirement ids the assignments
   pointed at *before* deleting them
   ([extraction-step.worker.ts:1130](../../backend/src/modules/superadmin/data-extraction/workers/extraction-step.worker.ts#L1130)),
   then delete those rows too. Precise — it cannot touch an admin's deliberately-unassigned
   institution-wide requirement.
   > `// ponytail: "no assignment = institution-wide" is an inference the admin UX depends on
   > // (eligibility-link-picker creates unassigned then links). Add an explicit scope column if
   > // this bites again.`
3. **Fix the double access path** (F13): point `findPublicCourseBySlug`
   ([courses.repository.ts:314](../../backend/src/modules/search/repositories/courses.repository.ts#L314))
   and the search subqueries at `extraction_course_intake_assignments`, matching ai-counsellor, so
   unassigning actually hides an intake.
4. **Cleanup migration** for the duplicates already in the database — keep the oldest row per
   dedupe key, repoint assignments, delete the rest. Required before the unique indexes can be added.

**Check:** an integration test that calls `writeCourse` twice with the same payload and asserts the
intake / requirement / fee counts are unchanged on the second call.

### Phase 4 — Provenance

Fixes F10, F11. One migration.

1. `source_url text` on `extraction_eligibility_requirements` and `extraction_intakes`; write it in
   both paths (the page worker already has `url` in scope; the step worker has the scraped URL).
   Start writing the `source_url` that `extraction_english_requirements` already has.
2. Surface it as a link in the admin Eligibility and Intakes tabs — the reviewer's most common
   question is "where did this come from?", and `saveAndLearn` already forwards `source_url` into
   `extraction_memory` when the row carries one
   ([editable-field.tsx:32](../../frontend/src/app/admin/data/all-extractions/components/editable-field.tsx#L32)),
   so this also improves the lesson data retroactively.
3. Extend `FIELDS_TO_VERIFY` to cover intake dates and requirement minimums
   ([extraction-verify.worker.ts:22](../../backend/src/modules/superadmin/data-extraction/workers/extraction-verify.worker.ts#L22)).
   Same incremental gate already in place, so cost is bounded.

### Phase 5 — Optional: converge the duplicate test stores

Fixes F9, F8. **Only worth doing if a real need appears** — a "courses accepting GRE ≥ 320" filter,
or verification of test requirements. Do not do it for tidiness; the jsonb works for display and
matching, and this touches four write sites and two read sites.

If it becomes necessary: keep `extraction_english_requirements` (it already has a nullable
`course_id` giving course-vs-institution scope, and it is what the public page renders), add
`category`, `test_id → public.tests`, `is_optional` and `eligibility_requirement_id`, migrate both
jsonbs into it, and retire them. Rename the table then — a table called
`extraction_english_requirements` holding GRE rows is a 3am problem. Also then write `min_score_grade`
(F8), or drop the column and the two reads of it.

## 5. Decisions needed

1. **Phase 1 backfill scope.** Nulling fabricated `min_score_percent` values (step 5) touches live
   public data on ~1200 rows. Do it in one pass, or flag rows for admin review first?
2. **Phase 5 at all?** Recommendation: no, until a filter or verification requirement forces it.
3. **F17** — is "admin cannot edit an intake, only delete and recreate" worth an `update` method and
   a PATCH route, or is delete-and-recreate acceptable? (One line each if wanted.)

## 6. Non-goals

- No new queue, worker or step type — everything above lives in existing prompts, writers and workers.
- No new dependency, no new abstraction layer.
- No re-crawl to fix historic data: Phase 1.5 and Phase 2 backfills recover what is already stored.
- No change to the promote path or to `verification_status` gating public visibility.

## 7. Verification, in order

```sql
-- Before: how bad is it?
SELECT count(*) FROM superadmin.extraction_eligibility_requirements
 WHERE academic_tests = '[]';                                        -- expect: all of them (F1)
SELECT count(*) FROM superadmin.extraction_eligibility_requirements
 WHERE description ~* 'percentile|average|top \d|acceptance rate'
   AND min_score_percent IS NOT NULL;                                -- fabricated minimums (F2)
SELECT count(*) FROM superadmin.extraction_intakes
 WHERE intake_year IS NULL;                                          -- invisible to search (F5)
SELECT count(*) FROM superadmin.extraction_intakes WHERE end_date IS NOT NULL
   OR orientation_date IS NOT NULL;                                  -- expect ~0 outside AgentCIS (F7)
-- Duplicates (F4): any count > 1 is a rerun artefact
SELECT course_id, intake_name, count(*) FROM superadmin.extraction_intakes
 GROUP BY 1,2 HAVING count(*) > 1 ORDER BY 3 DESC LIMIT 20;
-- Orphans that became institution-wide (F3)
SELECT count(*) FROM superadmin.extraction_eligibility_requirements er
 WHERE NOT EXISTS (SELECT 1 FROM superadmin.extraction_course_eligibility_assignments a
                    WHERE a.eligibility_requirement_id = er.id);
```

Then per phase: the unit check named in that phase, `npx tsc --noEmit` in both `backend/` and
`frontend/`, and one re-run of a single known job (Phase 3 must show unchanged child counts).
