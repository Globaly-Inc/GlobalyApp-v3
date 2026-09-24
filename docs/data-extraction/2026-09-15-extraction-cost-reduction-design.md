# Extraction Cost Reduction — Accounting, Result Cache, Page Snapshots

> Status: Steps 1–3 implemented 2026-09-15 — 1–2: migration `superadmin/20260915_001_extraction_llm_usage_cache.ts`, `lib/llm-client.ts`, `lib/llm-store.ts`, `lib/llm-pricing.ts`, `npm run test:llm-usage-cache`; 3: migration `superadmin/20260915_002_extraction_pages.ts`, `lib/page-store.ts`, `npm run test:page-store`. Steps 4+ proposal · Date: 2026-09-15 · Stage: fuzzy plan → design · Scope mode: Hold Scope
> Goal, in the user's words: **minimise the cost of data extraction.**
> Supersedes the earlier "page snapshots" draft of the same date, which led with the wrong lever.

## 0. The one-paragraph version

Scraping is nearly free — Scrapling and Crawl4AI are self-hosted; Firecrawl is only the fallback.
The bill is **Gemini**: one Flash call per page with up to 120,000 characters of input, one or two
Lite calls per course for curriculum and fees pages, a Vision call per fees PDF, and a Lite call per
course at verify time. And every one of those calls is paid **again** on every re-run, retry, prompt
fix and verify pass, because we keep nothing of what the model was asked or what it answered. Three
changes, in this order: **(1)** record what each job spends, because today nothing does;
**(2)** cache the model's answer keyed on the exact input, so an unchanged page never pays twice
and a handbook page shared by forty course variants pays once; **(3)** store the scraped page, so
verify can skip pages that haven't changed and PDFs stop being re-read by Vision. Steps 1 and 2
live entirely inside `lib/llm-client.ts` and touch no worker. Step 3 is the plumbing the earlier
draft described; it is demoted here to the thing that makes verify cheap, not the thing that saves
money.

## 1. Problem

### 1.1 Where the money goes

Per job on a typical university site, from the code in `workers/` and `lib/`:

| Cost line | Where | Paid per | Notes |
|---|---|---|---|
| Course extraction | `extraction-page.worker.ts:511` `extractJson(courseDataPrompt…)` | **page**, Flash, ≤120k chars in, ≤16k out | **The main line item.** Fires once per queue message. |
| Curriculum / fees secondary | `extraction-page.worker.ts:203–221` `extractSecondaryPage` | **course**, Lite | 1–2 calls per course that lacks units/fees. Cached per URL *within one message only* (`curriculumCache`, `secondaryPageCache`). |
| Fees PDFs | `scrapeSecondaryPage` → `createDocumentExtractor()` | **PDF per message**, Vision | Same PDF re-read by Vision from every message that needs it. |
| Verify | `extraction-verify.worker.ts` | **course**, Lite | Re-scrapes and re-asks even when the page is byte-identical. |
| Memory recall | `recallMemory()` per page | page, embedding | Small. |
| URL re-ranking | job worker discovery | job, Lite | Small, once. |
| Scraping | Scrapling → Crawl4AI → Firecrawl | ~$0 until Firecrawl | Firecrawl only on fallback and the retry ladder. |

### 1.2 What we cannot see

`lib/llm-client.ts` writes one `"llm usage"` log line per call with prompt/output token counts.
**Nothing sums it.** There is no cost column on `extraction_jobs`, no per-model total, no
per-institution number — the only cost signal is the monthly invoice. Every statement in §1.1 is
"from the code", not "from the data", because the data doesn't exist. That is the first thing to fix:
you cannot minimise what you cannot measure, and we will otherwise argue about which lever mattered.

### 1.3 Why re-runs cost the same as first runs

A page is scraped, sent to the model, the answer is written to staging, and both the page and the
answer are gone at the end of the message — except `source_excerpt`, 500 characters. So:

- **"Re-run"** (per-step on the Context tab, or Reset Pipeline) → every page pays Flash again.
- **A Save-and-Learn correction** → the admin re-runs the step → every page pays again, including
  the ones the lesson doesn't touch.
- **Verify** → every course pays Lite, even inside an intake year when nothing on the site moved.
- **Forty variants of one subject** (BEng/MEng/BSc…) across forty queue messages that all link the
  same handbook page → forty Lite calls. The in-message caches only help when the variants land in
  the *same* page message.

### 1.4 Not the problem

The prompts, the staging schema, the scraper cascade and its retry ladder, discovery, queue
topology. All unchanged.

## 2. Outcome

- Every job shows what it cost, by model and by call kind, while it runs.
- An unchanged page with an unchanged prompt **never pays the model twice** — across retries,
  re-runs, steps, jobs and institutions.
- A shared handbook, fees or catalog page pays **once per distinct content**, however many courses
  point at it.
- A fees PDF is read by Vision **once**, not once per course.
- Verify pays the model **only for pages that actually changed**, which is also the only list an
  admin wanted from verification in the first place.
- First-run cost on a brand-new site is reduced by whatever share of its pages are shared content
  (handbooks, fee schedules, PDFs) — realistically 10–40% depending on the site — and everything
  after the first run is model-cost-only for changed content.

What this does **not** do: make the very first Flash call on a never-seen page cheaper. That is
§7's later work (input trimming, Lite for index pages) and it is gated on having the numbers from
step 1.

## 3. The three pieces

### 3.1 Usage accounting — `extraction_llm_usage`

One table, one write per model call, inside `extractJson` / `complete` / the document extractor.

```
superadmin.extraction_llm_usage
  id              uuid PK
  job_id          uuid NULL        → extraction_jobs (NULL for non-job calls, e.g. lookup service)
  kind            text NOT NULL    -- 'course_extraction' | 'secondary' | 'pdf_vision' | 'verify' |
                                   -- 'site_analysis' | 'url_rank' | 'campus' | ... (caller-supplied)
  model           text NOT NULL
  prompt_tokens   int  NOT NULL
  output_tokens   int  NOT NULL
  cached_tokens   int  NOT NULL DEFAULT 0
  cache_hit       bool NOT NULL DEFAULT false   -- §3.2 served it; tokens are 0
  created_at      timestamptz

INDEX (job_id, created_at)
```

No rollup column. The jobs list LEFT JOINs a `GROUP BY job_id` subquery over the indexed
`(job_id)` column and the job header runs one `GROUP BY model`; at this pipeline's call rate
that is an index scan per job. (`ponytail:` aggregated at read time — denormalise onto
`extraction_jobs` only if the list query measurably slows. As built, one fewer thing to drift.)

**How `jobId` and `kind` reach `extractJson` without touching every call site.** `extractJson`
knows neither today. Threading a `jobId` parameter through ~25 callers is the obvious change and
the wrong one — half of them are three layers below the message handler. Instead, a tiny
`AsyncLocalStorage` in `llm-client.ts`:

```ts
export function setLlmContext(ctx: { jobId?: string; kind: string }): void     // AsyncLocalStorage.enterWith
export function withLlmKind<T>(kind: string, fn: () => Promise<T>): Promise<T>  // scoped override, keeps jobId
```

Each worker's consume callback calls `setLlmContext({ jobId, kind })` as the first line after
parsing the message — `enterWith`, not `run()`, because the callbacks are 300-line bodies that
would otherwise be re-indented into a closure; it must run before any await that can reach the
model, and every callback sets its own so nothing inherits a previous message's job. Kinds as
built: `site_analysis` (job worker), `course_extraction` (page worker) with `secondary` via
`withLlmKind` around `extractSecondaryPage`, `pdf_vision` (document extractor, explicit),
`verify`, and `step:<name>` (step worker). Four one-line wrap sites, zero signature changes.
The OpenRouter fallback is **not** metered — `orExtractJson` reports no usage — and is not
cached; it is the rare path and the log line is its record.

**Pricing.** Store tokens, not dollars. `LLM_MODEL_PRICES` (env, JSON, USD per 1M tokens:
`{"gemini-2.5-flash":{"input":0.30,"output":2.50}}`) turns tokens into `$` *at read time*
(`lib/llm-pricing.ts`). A job whose calls include any unpriced model shows tokens, not a partial
dollar total — never a wrong figure. Unset → tokens everywhere, which is the honest default until
someone types the prices in.

### 3.2 Extraction result cache — `extraction_llm_cache`

The model is (near enough) a pure function of its input. Cache the output keyed on the **exact**
input:

```
superadmin.extraction_llm_cache
  input_hash      text PK          -- sha256(model_id + '\0' + system + '\0' + prompt)
  model           text NOT NULL
  result          jsonb NOT NULL   -- the parsed JSON extractJson would have returned
  prompt_tokens   int, output_tokens int     -- what it cost the one time we paid
  hit_count       int  NOT NULL DEFAULT 0
  created_at, last_hit_at timestamptz
```

Inside `extractJson`, before the network:

```
hash = sha256(modelId, opts.system, opts.prompt)
row  = SELECT result FROM extraction_llm_cache WHERE input_hash = hash
if row → record usage {cache_hit: true, tokens 0}; UPDATE hit_count, last_hit_at; return row.result
… existing Gemini call …
if parsed OK and finishReason !== MAX_TOKENS → INSERT … ON CONFLICT DO NOTHING
```

**Why hash the whole input and not `(page content_hash, prompt_version)`.** The prompt string
already *contains* the truncated markdown, the job's `guidance_notes`, the site intelligence, the
lookup lists and the memory addendum from `recallMemory`. Hashing it:

- needs no `prompt_version` constant that someone forgets to bump — edit a template, the hash
  moves, affected results recompute, nothing else does;
- is automatically invalidated by a new Save-and-Learn lesson for that domain (the addendum
  changed), which is exactly when we *want* a re-run to pay;
- covers every caller — course extraction, secondary, verify, campus, site analysis — with **zero
  changes outside `llm-client.ts`**;
- costs microseconds: SHA-256 over 120 KB.

The page snapshot's `content_hash` (§3.3) is therefore **not** needed for the cache. Two identical
pages produce identical prompts produce one cache row, whether or not we ever stored the page.

**What is never cached:** parse failures, `MAX_TOKENS`-truncated answers, repaired-JSON answers
(the model didn't say that), OpenRouter-fallback answers (a degraded answer under this model's
key would be wrong), and `complete()` free-text calls. **Bypass:** `extractJson({ …, noCache: true })`
— the admin "re-extract" action (§4.4) will use it to overwrite a sticky bad answer. **Kill
switch:** `LLM_RESULT_CACHE=0` disables lookups and stores without a deploy.

**Sharing across jobs is a feature, not a leak.** Two institutions with an identical page
(franchised campuses, mirrored handbooks) legitimately share a result. Results contain only what
the model extracted from public pages; there is no tenant data in this pipeline.

**Size.** One row per distinct input. Results are small (a course object, some fee rows) —
kilobytes. Millions of rows before this is a conversation. Purge on `last_hit_at < now() - 1 year`.

### 3.3 Page snapshots — `extraction_pages`

Store what was scraped so that (a) verify can tell whether a page changed without paying the model,
(b) fees PDFs are read by Vision once, and (c) an admin can see what the model saw.

```
superadmin.extraction_pages
  id             uuid PK
  url            text NOT NULL        -- normalised: lowercase host, no fragment, no utm_*
  mode           text NOT NULL        -- 'main' | 'full'  (onlyMainContent true | false)
  domain         text NOT NULL
  markdown       text NOT NULL        -- FULL cleaned markdown; truncation moves to prompt time
  links          jsonb NOT NULL DEFAULT '[]'
  content_hash   text NOT NULL        -- sha256(markdown)
  scraper        text NOT NULL        -- 'scrapling' | 'crawl4ai' | 'firecrawl' | 'pdf-vision'
  scraped_at     timestamptz NOT NULL
  UNIQUE (url, mode); INDEX (domain, scraped_at DESC); INDEX (content_hash)

extraction_queue.page_id             uuid NULL → extraction_pages.id
```

As built, only `extraction_queue.page_id` was added. `extraction_courses.page_id` was dropped —
a course's `source_url` + job already reaches its queue row, and `writeCourse` would otherwise
have had to learn about pages. `last_verified_hash` moves to step 4's own migration, since
nothing writes it until then.

`mode` is part of the key because `onlyMainContent` genuinely changes the output for the same URL
(Crawl4AI "fit" vs "raw"; a homepage's footer *is* the data). `forceFirecrawl` / `mobile` /
`proxy` / `expandCollapsed` are ways of *obtaining* the page and are not in the key — they appear
only on the retry ladder, which always fetches fresh and overwrites.

Failures (blocked, 404, <50 chars) are never stored; the retry ladder is unchanged.

Access goes through one module, `lib/page-store.ts`:

```ts
getPage(url, opts: ScrapeOptions & { maxAgeDays?: number /* default 30 */; fresh?: boolean }): Promise<Page>
getDocument(url, opts): Promise<Page>       // PDFs: Vision text as the "markdown", scraper 'pdf-vision'
// Page = ScrapeResult & { pageId, contentHash, fromCache, changed }
```

As built, `getPage` returns the **same shape as `scrapeMarkdown`** (plus provenance) instead of
throwing — the callers all test `page.blocked || page.markdown.length < 50`, not `catch`, so
returning the failure unchanged left every retry branch byte-identical. Env: `PAGE_SNAPSHOTS=0`
kill switch, `PAGE_SNAPSHOT_MAX_AGE_DAYS` (default 30).

Workers swap `scrapeMarkdown(url, …)` → `getPage(url, …)`; the page worker's `secondaryPageCache`
Map is deleted (the table is the cache, and it works across messages). `unitsFromMarkup`'s
`markupCache` stays — it caches raw HTML, which this table does not hold. Full call-site list: `extraction-job.worker.ts:85`, `extraction-page.worker.ts:144/344`,
`extraction-step.worker.ts:111/127/676`, `extraction-verify.worker.ts:192`,
`services/institution-lookup.service.ts:56/66`, `services/aggregator.service.ts:56`.
`scrapeRenderedHtml` (raw HTML for footers) is out of scope.

**Why this is step 3 and not step 1.** On its own it saves Firecrawl retries and PDF Vision
duplicates — real, but small next to the Flash-per-page line, and the result cache already stops
the model being paid twice for an unchanged page *without* it. What only the snapshot can do is
tell verify "this page did not change, skip the model" — because the *verify* prompt embeds the
staged field values, which differ per course, so its input hash is never a cache hit. That, plus
Vision-once for PDFs, plus debuggability, is its earned keep.

## 4. The pipeline, before and after

### 4.1 Page worker, one message

```
BEFORE                                          AFTER
scrapeMarkdown(url)              $0*            getPage(url)                          $0*  (snapshot if ≤30d)
truncateMarkdown                                truncateMarkdown                       (unchanged)
extractJson(courseDataPrompt)    Flash $$$      extractJson(courseDataPrompt)
                                                  ├ hash(model+system+prompt)
                                                  ├ cache hit → $0, usage row (hit)
                                                  └ miss → Flash $$$, usage row, cache row
per course lacking units/fees:                  per course lacking units/fees:
  scrapeSecondaryPage (Map)      $0*              getPage / getDocument                $0* (Vision once ever)
  extractSecondaryPage           Lite $ ×N        extractSecondaryPage → cache          Lite $ ×(distinct pages)
writeStagedCourses                              writeStagedCourses(page_id)             (unchanged)
                                                UPDATE extraction_queue SET page_id
* Firecrawl only on fallback/retry
```

### 4.2 Re-run / per-step Re-run / Reset Pipeline (default mode)

```
BEFORE: every page → Flash again; every secondary → Lite again; every PDF → Vision again.
AFTER : getPage from snapshot → same markdown → same prompt → same hash → cache hit → $0.
        Only pages whose snapshot expired AND whose content actually changed pay anything.
        A prompt-template change moves the hash for every page → pays once each, then cached.
        A new Save-and-Learn lesson moves the hash for that DOMAIN only → that institution re-pays, others don't.
```

That last line is the behaviour Save-and-Learn always implied and never had.

### 4.3 Verify

```
BEFORE: scrape live → Lite compare per course → stamp verified/mismatch.
AFTER : getPage(source_url, { fresh: true })
        if page.contentHash === course.last_verified_hash → stamp verified, $0
        else → Lite compare (its own input hash; a repeat compare of the same page+fields is a cache hit)
        UPDATE last_verified_hash
```

### 4.4 Admin (small, and where the value shows up)

1. **Cost column on the jobs list and job header** — from `usage_summary` × `MODEL_PRICES`.
   Tokens when a price is unknown.
2. **Cache-hit rate per job** — the number that tells you whether a re-run cost anything.
3. **Re-extract page** — `POST /queue/:id/reextract`: re-publish the page message reading from
   snapshot (`maxAgeDays: Infinity`). With the cache, this is free unless the prompt changed —
   which is precisely when you'd click it.
4. **Reset Pipeline** gains *from snapshots* (default) vs *re-scrape everything* (`fresh`).
5. **View source page** — `GET /pages/:id` for the review drawer; retires squinting at
   `source_excerpt`.
6. **Purge** — `DELETE /pages?domain=` and `DELETE /llm-cache?domain=` for "the site was
   redesigned, forget it". (Cache rows don't carry a domain; derive via `extraction_pages` →
   prompts is not possible from the hash alone. `ponytail:` store `domain` nullable on cache rows
   from the LLM context in §3.1 so this purge is one `DELETE`.)

## 5. A worked example

UQ: 2,800 course pages, 12 faculty fee PDFs (each linked by ~230 courses), curriculum on a shared
handbook site where ~40 variants share each handbook page.

| Run | Flash calls | Lite (secondary) | Vision | Verify Lite |
|---|---|---|---|---|
| Today, first run | 2,800 | ~2,800 | ~2,760 (12 × 230, less in-message dedupe) | — |
| Today, "fixed fees prompt, re-run" | 2,800 | ~2,800 | ~2,760 | — |
| Today, verify one month later | — | — | — | 2,800 |
| **After**, first run | 2,800 | **~70** (2,800 ÷ 40 shared) | **12** | — |
| **After**, "fixed fees prompt, re-run" | 2,800 (template changed → new hashes) | ~70 | 0 | — |
| **After**, "learned a lesson for UQ, re-run" | 2,800 (addendum changed) | ~70 | 0 | — |
| **After**, "retry the 60 failed pages" | 60 | ~2 | 0 | — |
| **After**, verify one month later | — | — | — | **~200** (only changed pages) |
| **After**, Reset Pipeline, nothing changed | **0** | **0** | 0 | — |

The first-run Flash column does not move — see §7 for that. Everything else collapses.

## 6. What does not change

Prompts, staging tables and writers, scraper cascade and retry ladder, discovery, queue topology,
worker processes, AgentCIS import, the AI rack's separate crawl. Both new tables and the snapshot
table are additive; every worker keeps working if `page-store` is never called.

## 7. Rollout

Each step ships alone and is reversible by not calling the new thing.

| # | Step | Touches | Saves | Enables |
|---|---|---|---|---|
| 1 | **Usage accounting** — table, `withLlmContext`, `usage_summary`, cost column | `llm-client.ts`, `document-extractor.ts`, 5 worker wrap sites, 1 migration, admin column | nothing yet | seeing everything below actually work |
| 2 | **Result cache** — table, hash-before-call in `extractJson` | `llm-client.ts`, 1 migration | re-runs, retries, steps, shared pages: model cost → $0 for unchanged input | — |
| 3 | **Page snapshots** — table, `page-store.ts`, swap ~12 call sites, delete two Maps | `lib/`, 4 workers, 2 services, 1 migration | Firecrawl retries, PDF Vision → once | verify hash-skip, view-source |
| 4 | **Verify hash-skip** | `extraction-verify.worker.ts`, 1 column | verify: model cost → changed pages only | — |
| 5 | **Admin** — re-extract, reset mode, view source, purge, cache-hit rate | routes + 1 drawer, 1 toggle, 2 buttons | operator time | — |
| 6 | **First-run Flash cost** — *only after step 1 shows where the tokens are*: cap course-page input below 120k where the data shows the tail is navigation; route index/listing pages (`not_a_course`-adjacent) to Lite; skip `recallMemory` when the domain has no memories | prompts, `truncateMarkdown` call sites | the one column §5 doesn't move | — |
| 7 | Later, separate design: point `site-index.service.ts` at `extraction_pages` so the widget rack stops crawling sites we already hold | ai-counsellor | rack crawl | — |

Steps 1–2 are two files and two migrations and deliver most of the recurring savings.
Stop after 2 and measure before deciding whether 3–4 earn their keep on *your* sites.

Every step leaves one runnable check: step 1 — a stub call records a usage row with the right
`job_id`/`kind`; step 2 — identical input twice = one Gemini call, one hit row, and a truncated
answer is *not* cached; step 3 — hit within window, miss past it, `fresh` bypass, failure not
stored, `mode` isolation; step 4 — unchanged hash skips the model. Break each and watch it go red
before trusting it.

## 8. Risks and honest caveats

- **A cache hit is only as good as the one time we paid.** A bad extraction (model had an off day)
  is now *sticky* for that exact input. Mitigation: `noCache` on the admin "Re-extract" action
  (force one fresh call, overwrite the row); the Save-and-Learn flow already changes the input and
  so bypasses naturally. Don't add TTL-based expiry to "fix" this — a wrong answer doesn't get
  righter with age, and expiring good answers is the cost we're removing.
- **Hash must include the model id.** Switching `GEMINI_MODEL` must not serve Flash answers as if
  they came from the new model. It's in the key; keep it there.
- **The prompt must be fully deterministic for identical content.** Any `Date.now()`, random
  ordering of lookup lists, or unordered `Set` iteration in a prompt builder silently destroys hit
  rates. Audit `extraction-prompts.ts` builders once; add a test that builds the same prompt twice
  and asserts equality.
- **Staleness now exists (snapshots).** 30-day window, verify always fresh, retry ladder always
  fresh, purge on demand. Fees change yearly; 30 days is conservative.
- **URL normalisation** must be single-sourced and tested or the snapshot cache is useless.
- **Two tables grow linearly.** ~40 KB per page; kilobytes per cache row. Yearly purge on
  `last_hit_at` / `scraped_at`. Not a day-one concern.
- **Usage rows are one INSERT per model call.** At the pipeline's own rate (throttled 500 ms per
  call) that is nothing. Don't batch it.

## 9. Open questions (answer before step 1)

1. `MODEL_PRICES` — maintain in config, or show tokens only and let finance multiply? (Proposal:
   config map; tokens shown when a model is missing.)
2. Cache scope — global across all institutions (proposal: yes, results are public-page derived) or
   per job?
3. Should Context-tab "Re-run" default to snapshots (proposal: yes — it's the action after changing
   *our* side) with an explicit "re-scrape" toggle?
4. `source_excerpt` — keep (proposal: for now) or derive from `page_id` in the review query?
