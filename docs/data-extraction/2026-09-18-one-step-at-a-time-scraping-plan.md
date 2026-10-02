# Scraping, One Step at a Time

> Status: **implemented 2026-09-18** (uncommitted; run `npm run migrate:superadmin` for `20260918_001`) · Date: 2026-09-18 · Scope mode: Hold Scope
> Goal, in the user's words: **a full plan for scraping data one step at a time.**
> Builds on `2026-09-15-extraction-cost-reduction-design.md` (page store + LLM cache, shipped) and the uncommitted scraper/snapshot changes in the working tree.

## 0. The one-paragraph version

Today one queue message does everything for a page: scrape, then Gemini, then write staging rows. The job worker fires the site snapshot and the page queue at the same moment, so the same URL is often scraped twice in parallel and an admin cannot look at what was fetched before money is spent on it. The plan splits the pipeline into seven discrete steps, each of which **runs to completion, writes its result to a table, and stops**. The next step reads only from that table, never from the live site. Scraping happens in exactly one step (step 2, plus the deliberate live re-fetch in verify) and the LLM is first called in step 3. Every step is re-runnable on its own, gated by a single `step_mode` flag on the job: `auto` chains steps the way the pipeline does today, `manual` stops after each step and waits for the admin to press Run. Nothing is rewritten. Each step is a thin wrapper around code that already exists, wired into the `extraction_steps` queue the admin Re-run buttons already use.

## 1. Problem

### 1.1 The current shape

`extraction-job.worker.ts` does steps 1 to 3 below in one process and then dispatches two things at once:

- `site_snapshot` batches to the STEPS queue (scrape only, through `getPage`, upload `.md` to GCS)
- one PAGES message per course URL (scrape **and** extract, in `extraction-page.worker.ts`)

Both call `getPage` on the same URLs within seconds of each other. The page store dedupes on a cache hit, but two workers scraping the same URL concurrently both miss the cache and both hit Scrapling. On a 500-page site that is up to 500 wasted scrapes and, worse, the LLM call in the page worker starts before the snapshot exists, so a Gemini call is never delayed by a cheap check of what the page actually contains.

### 1.2 What the admin cannot do today

- See the discovered URL list and prune it **before** anything is scraped.
- See the scraped markdown and prune junk pages **before** anything is sent to Gemini.
- Re-run "just the scraping" or "just the extraction" for a job. Re-run always re-does both.
- Stop between steps. `stop_requested` is checked mid-loop, but there is no "run to the end of this step, then wait".

### 1.3 Not the problem

- Scraper quality. The Scrapling cascade, the 404 short-circuit and the thin-page acceptance in the working tree are fine and are kept as is.
- LLM cost per call. That was the 09-15 design. This plan reduces the **number** of calls by never calling before a snapshot exists.
- The page store. `extraction_pages` and `getPage` are the foundation here, unchanged.

## 2. Outcome

- Exactly one code path scrapes a URL during extraction: step 2. Steps 3 to 6 read `extraction_pages` and never touch the network. Step 7 is the one intentional exception: verification re-fetches the live page because that is what it verifies against, and it refreshes the snapshot as a side effect.
- A job in `manual` mode pauses after every step with `pipeline_progress[step] = "done"` and the next step `"waiting"`. The admin presses Run on the next step. A job in `auto` mode behaves as today.
- Every step is idempotent. Running it twice produces the same rows, because each writes to its own table keyed on `(job_id, url)` or reuses the existing `insertQueueItemDetailed` dedupe.
- The admin sees, per step, what went in and what came out, on the existing timeline via `writeJobEvent`.

## 3. The seven steps

| # | Step name | Reads | Writes | Network | LLM | Existing code it wraps |
|---|---|---|---|---|---|---|
| 1 | `site_map` | `extraction_jobs.institution_url`, guided URLs, related domains, blocklist | `extraction_site_urls` (new) | discovery only (sitemap, Firecrawl map, homepage links) | none | job worker lines 156 to 231 (`discoverUrlsForCrawl`, `filterUrls`, blocklist, related domains) |
| 2 | `site_snapshot` | `extraction_site_urls` | `extraction_pages` rows + GCS `.md` per page | **yes, the only step that scrapes pages** | none | `lib/site-snapshot.ts` `snapshotSite`, already batched and concurrent |
| 3 | `site_analysis` | homepage row from `extraction_pages` | `extraction_institution_overview`, `extraction_site_intelligence` | none | 1 Flash call | job worker lines 87 to 130, minus the `getPage` |
| 4 | `url_classify` | `extraction_site_urls`, `extraction_pages.markdown` (first 500 chars per page), patterns from step 3 | `extraction_site_urls.role` (`course`, `fees`, `intakes`, `contact`, `agents`, `other`) | none | Lite calls in batches of 800, only when heuristic > 500 or = 0, as today | job worker lines 253 to 344 (`looksLikeCourseUrl`, `urlDiscoveryPrompt`, `classifierDistrusted`) |
| 5 | `queue_pages` | `extraction_site_urls where role = 'course'`, `page_cap`, prior `not_a_course` tags | `extraction_queue` + one PAGES message per row | none | none | job worker lines 347 to 421 (`insertQueueItemDetailed`, the cap and duplicate accounting) |
| 6 | `extract` | `extraction_pages` via `getPage` (always a cache hit now) | all staging tables | none, `getPage` hits the store | 1 Flash per page + secondaries, cached by `extraction_llm_cache` | `extraction-page.worker.ts` unchanged. (Revised 2026-09-21: the .md file in GCS is the source of truth and a missing file is a live Scrapling scrape inside `getPage`, not a `snapshot_missing` failure — see §3.2.) |
| 7 | `verify` | staging, live page via `getPage(..., { fresh: true })` | `extraction_verification_results`, refreshes the `extraction_pages` row | **yes, by design**: verification compares against the live site | Lite per course today; per **changed** course once it checks `page.changed` | `extraction-verify.worker.ts`. One added line: `if (!page.changed) continue;` before the LLM call, since `getPage` already computes `changed` against the stored hash |

Steps `institution`, `branches`, `agents`, `enrichment`, `course_data`, `visa_*` stay exactly where they are in `extraction-step.worker.ts`. They already read through `getPage`, so once step 2 has run they are cache hits. A Re-run on a job that was never snapshotted scrapes live through `getPage` and writes the file as it goes (revised 2026-09-21, §3.2).

### 3.2 The .md file is the source of truth (2026-09-21)

The user's spec, stated after seeing the first implementation: one `.md` file per endpoint, and
that file is what the data is inserted from. So `getPage` (`lib/page-store.ts`) now writes the
markdown to GCS at `snapshotPathFor(url, mode)` FIRST and stores an `extraction_pages` row with a
BLANK `markdown` column beside it — id, links, content_hash, scraper, scraped_at only. A read
downloads the file, strips the front-matter and "Linked files" tail (`parseSnapshotFile`), and
checks it still hashes to the row. A missing file, or a mismatched one, is a MISS: the page is
scraped live through Scrapling and both file and row are rewritten. No bucket configured → the row
carries the text, as before. Rows stored before this change keep their column text and are read
from it until their next scrape writes a file. Consequences: the `snapshot_missing` failure class
and the page worker's gate are gone (a missing file is a scrape, not an error), `url_classify`
reads its excerpts from the files (8 at a time), and the Snapshots tab's viewer downloads the file.
`tests/page-store.ts` §6.

### 3.1 Why `site_analysis` moves after the snapshot

Today the homepage is scraped once for analysis and then again inside the snapshot. Moving analysis to step 3 makes it a cache hit. It also means the URL classifier in step 4 can see the first few hundred characters of each page's actual markdown, not just its URL. A URL like `/study/2027/CS101` says nothing; the page's H1 says "Bachelor of Computer Science". That is a cheaper and more accurate classifier than URL patterns alone, and it needs the snapshot to exist first. This is the one place the plan changes behaviour rather than just ordering, and it is behind the same `classifierDistrusted` floor, so a bad batch falls back to the heuristic exactly as today.

## 4. Data model

One new table and one new column. DDL only, in one new migration under `database/migrations/superadmin/`. Never edit an existing migration.

```sql
-- 20260918_001_extraction_site_urls_step_mode.ts (up)

CREATE TABLE superadmin.extraction_site_urls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES superadmin.extraction_jobs(id) ON DELETE CASCADE,
  url         text NOT NULL,          -- normaliseUrl() applied before insert
  source      text NOT NULL,          -- 'sitemap' | 'firecrawl_map' | 'homepage_links' | 'guided' | 'related_domain'
  role        text,                   -- NULL until step 4; then 'course' | 'fees' | 'intakes' | 'contact' | 'agents' | 'other'
  role_source text,                   -- 'heuristic' | 'llm' | 'admin'
  excluded    boolean NOT NULL DEFAULT false,   -- admin pruned it in the UI
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, url)
);
CREATE INDEX extraction_site_urls_job_role_idx ON superadmin.extraction_site_urls (job_id, role) WHERE NOT excluded;

ALTER TABLE superadmin.extraction_jobs
  ADD COLUMN step_mode text NOT NULL DEFAULT 'auto';   -- 'auto' | 'manual'
ALTER TABLE superadmin.extraction_jobs
  ADD CONSTRAINT extraction_jobs_step_mode_check CHECK (step_mode IN ('auto', 'manual'));
```

- `extraction_site_urls` replaces the in-memory `allUrls` array. It is what makes step 1 inspectable and steps 2, 4 and 5 re-runnable without re-discovering.
- `step_mode` is the only gate. No per-step approval table, no `awaiting_approval` status. `pipeline_progress` already carries the per-step state the UI reads; `manual` simply means the chain does not auto-publish the next step.
- `extraction_queue.page_id` already exists (migration `20260915_002`) and the page worker already writes it. The Snapshots tab links through it; nothing to add.
- `pipeline_progress` gains keys `site_map`, `site_snapshot`, `site_analysis`, `url_classify`, `queue_pages`. The old keys `site_mapping`, `course_discovery`, `data_extraction`, `verification` are kept and set by the same code, so `extraction-job-row.tsx` and the tab badges keep working untouched.

## 5. Orchestration

### 5.1 The chain

```
POST /jobs  →  JOBS queue  →  job worker publishes STEPS {step: "site_map"} and exits
                                       │
   step worker: site_map ─────────────►│ writes extraction_site_urls
                                       │ next("site_snapshot")
   step worker: site_snapshot (×N batches, concurrent, existing runId tally)
                                       │ last batch: next("site_analysis")
   step worker: site_analysis ────────►│ overview + intelligence; also publishes "institution" (as today)
                                       │ next("url_classify")
   step worker: url_classify ─────────►│ sets role on extraction_site_urls
                                       │ next("queue_pages")
   step worker: queue_pages ──────────►│ inserts extraction_queue, publishes PAGES ×M
                                       │ (page worker's "last page done" already publishes VERIFY — unchanged)
   page worker  ×M ───────────────────►│ staging tables
   verify worker ─────────────────────►│ status: review
```

`next(step)` is one helper in `extraction-step.worker.ts`:

```ts
// ponytail: the whole gate. Manual mode = do not publish; the admin's Run button publishes instead.
async function next(jobId: string, step: PipelineStep, payload: Record<string, unknown> = {}) {
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).select("step_mode", "stop_requested").first();
  if (job?.stop_requested || job?.step_mode === "manual") {
    await setProgress(jobId, { [step]: "waiting" });
    await writeJobEvent(jobId, "step_waiting", { phase: step, message: `Waiting for admin to run ${step}` });
    return;
  }
  await queueService.publish(EXTRACTION_QUEUES.STEPS, { jobId, step, ...payload });
}
```

The job worker shrinks to: load job, check config, mark processing, publish `site_map`. Roughly 380 lines of it move into three step handlers. It is a move, not a rewrite, and `git diff --color-moved` should show it as such.

### 5.2 Concurrency inside a step

Only step 2 fans out. It keeps the existing batch messages, `runId` and `snapshotRunOutcome` tally. The **last** batch to report `done` for its run calls `next("site_analysis")`. `snapshotRunOutcome` already returns `done | failed | pending` for exactly this purpose; today its result only updates `pipeline_progress`.

Step 6 fans out via the PAGES queue, as today. Nothing changes there.

### 5.3 Preconditions, enforced in `step.service.ts` and the step worker

| Step | Refuses unless |
|---|---|
| `site_snapshot` | `extraction_site_urls` has rows for the job |
| `site_analysis` | `extraction_pages` has the homepage row |
| `url_classify` | steps 1 and 3 are `done` |
| `queue_pages` | step 4 is `done` |
| `extract` (page worker) | none: `getPage` reads the .md file, or scrapes live and writes it when the file is missing (revised 2026-09-21) |
| any `Re-run` on `institution`, `branches`, `agents`, `enrichment` | step 2 is `done`; else 400 "Run site_snapshot first" |

The service already validates per-step prerequisites for `agents`, `course_data` and `visa_*`. These are five more `if` blocks in the same function.

### 5.4 Re-runs

| Admin action | What re-runs | What it reads |
|---|---|---|
| Run `site_map` again | discovery | live sitemap / map. Upserts into `extraction_site_urls`, never deletes admin-excluded rows |
| Run `site_snapshot` again | scrape | `extraction_site_urls`. Cache hits unless `fresh: true` is passed, which is the existing "Deep Scrape" button |
| Run `url_classify` again | classifier | snapshots. Rows with `role_source = 'admin'` are never overwritten |
| Run `queue_pages` again | queueing | roles. Duplicates are skipped by the existing unique on `(job_id, url)` |
| Run `courses` (existing) | re-dispatch pending/failed pages | unchanged |
| Reset Pipeline (existing) | deletes queue + staging | now also truncates `extraction_site_urls` for the job. Snapshots in `extraction_pages` are **kept**, they are the cache |

## 6. Admin UI

Minimal. Two additions to what exists, no new page.

1. **Step mode toggle** on the job header next to Pause: `Auto | Manual`. Writes `step_mode` via a new `PATCH /jobs/:id` field. Default `auto`, so existing jobs are unaffected.
2. **Two new tabs** on the job detail, both reusing `step-action-bar.tsx` for the Run button and badge:
   - **Site URLs**: table of `extraction_site_urls` with `url`, `source`, `role`, `excluded` checkbox, snapshot link if a page row exists. Bulk "Exclude" and a role dropdown per row (sets `role_source = 'admin'`). This is where the admin prunes before scraping and before Gemini.
   - **Snapshots**: table of `extraction_pages` for the job's site with `url`, `scraped_at`, `chars`, `content_hash`, link to the GCS `.md`. Read-only.

The existing five pipeline badges in `extraction-job-row.tsx` gain nothing. Manual-mode jobs show the existing "Not run" badge on the waiting step, and the admin already knows that badge means "press Run".

## 7. Rollout, one step at a time

Each item below is one PR, ships alone, and leaves the pipeline working in `auto` mode exactly as before. Do them in order. Stop after any of them and the system is still consistent.

| # | PR | Files | Test that must fail first |
|---|---|---|---|
| 1 | Migration + `step_mode` + `next()` helper, wired only for `site_snapshot → nothing`. No behaviour change. | migration, `extraction-step.worker.ts`, `step.schema.ts` | `tests/step-gate.ts`: `next()` publishes in `auto`, writes `waiting` in `manual` |
| 2 | Move discovery into `site_map`, persist to `extraction_site_urls`. Job worker reads the table instead of `allUrls`. | `extraction-job.worker.ts`, `extraction-step.worker.ts`, new `repositories/site-urls.repository.ts` | `tests/site-map-step.ts`: two runs produce the same row set; admin-excluded row survives a re-run |
| 3 | Snapshot completion calls `next("site_analysis")`. Move homepage analysis to the step worker, reading from the store. | `extraction-step.worker.ts`, `site-snapshot.ts` | extend `tests/site-snapshot.ts`: last batch of a run publishes exactly one `site_analysis` |
| 4 | `url_classify` step, writing `role`. Feed first 500 chars of markdown into the prompt. | `extraction-step.worker.ts`, `extraction-prompts.ts` | `tests/url-classify.ts`: distrusted batch keeps heuristic roles; `role_source='admin'` never overwritten |
| 5 | `queue_pages` step. Page worker reads the .md file first. **Step 2 is the only step that scrapes on purpose; a missing file falls back to a live scrape (revised 2026-09-21).** | `extraction-step.worker.ts`, `extraction-page.worker.ts`, `classify-failure.ts` | extend `tests/page-store.ts` §6: a hit reads the file with zero scrape calls; a missing or mismatched file scrapes once and rewrites the file |
| 6 | Preconditions in `step.service.ts`, Reset Pipeline truncates site URLs. | `step.service.ts`, `queue.service.ts` | `tests/step-preconditions.ts` |
| 7 | Frontend: mode toggle, Site URLs tab, Snapshots tab. | `frontend/src/app/admin/data/all-extractions/...` | manual QA against a `manual` job on a small site (a 30-page TAFE, not UQ) |
| 8 | README pipeline section rewritten to the seven steps. Delete the "Phase 1/2/3" comments from the job worker. | `README.md` | none |

PR 5 has no failure-mode change for `auto` jobs any more (revised 2026-09-21): a page whose snapshot failed or whose file has gone from the bucket is scraped live by the page worker through `getPage`, which writes the file. The Run button on `site_snapshot` remains the way to pre-fetch a site before the model is called.

## 8. What does not change

- `getPage`, `extraction_pages`, `stripMarkdownJunk`, `content_hash`, the GCS per-page layout.
- The Scrapling cascade and everything in the current working-tree diff.
- `extraction_llm_cache`, `extraction_llm_usage`.
- All staging tables and `staging-writer.ts`.
- The PAGES, VERIFY, SCHEDULE, AGENTCIS and IMPORT_V2 queues and their workers' message shapes.
- `pipeline_progress` legacy keys, so the current UI keeps rendering.
- `page_cap`. It still bounds step 2 and step 5 identically.

## 9. Risks

- **Two dispatches of `site_snapshot` for one job** overlap. Already handled by `runId`; `next()` fires once per run because only the batch that observes `done` for its own `runId` publishes. A stale message from a previous run sees `pending` or `done` for a different run and publishes nothing.
- **A site with zero discovered URLs** never reaches step 3. Step 1 falls back to `[institution_url]` exactly as the job worker does today, so the homepage is always snapshotted.
- **Manual mode on a scheduled re-crawl** (`extraction-schedule.worker.ts`) would stall silently. The schedule worker forces `step_mode = 'auto'` for the jobs it creates, one line.
- **Snapshot then classify means Gemini sees 500 chars per URL times up to 3200 URLs.** That is at most 1.6M input characters on Lite, roughly the cost of fifteen course-page extractions. It replaces a classifier that today sees URLs only and gets Yale wrong. Acceptable, and the heuristic-only path still runs first when the list is under 500.
- **Job worker becomes nearly empty.** That is fine. It stays as the JOBS consumer so `POST /jobs` and the schedule worker are untouched.

## 10. Open questions, answer before PR 2

1. Should `manual` be per job or a platform default in `extraction_additional_info`? Plan assumes per job, default `auto`.
2. Does the Site URLs tab need "Add URL" as well as exclude and re-role? Plan says no; guided URLs already cover it.
3. Keep the 800-URL classifier batch size when markdown excerpts are added, or drop to 200 so the prompt stays under the Lite context comfortably? Plan says 200.
