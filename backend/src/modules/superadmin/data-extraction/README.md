# Data Extraction Module

Crawls educational institution websites, uses AI to extract structured course data (fees, intakes, campuses, agents, eligibility), stages it for admin review, then promotes the cleaned data into the live business catalog.

## Architecture Overview

```
                        ┌──────────────────────────────┐
                        │      Admin UI (Frontend)      │
                        └──────────┬───────────────────┘
                                   │ HTTP
                        ┌──────────▼───────────────────┐
                        │    Fastify API (this repo)    │
                        │  /api/v3/admin/data-extraction│
                        └──────────┬───────────────────┘
                                   │
                    ┌──────────────┼──────────────────┐
                    │              │                  │
             Reads/Writes    Publishes to       Reads/Writes
             (masterKnex)     LavinMQ           (masterKnex)
                    │              │                  │
                    ▼              ▼                  ▼
             ┌───────────┐  ┌───────────┐    ┌──────────────┐
             │ PostgreSQL │  │  LavinMQ  │    │   Workers    │
             │ superadmin │  │  (AMQP)   │───▶│ (consumers)  │
             │   schema   │  └───────────┘    └──────┬───────┘
             └───────────┘                           │
                                              ┌──────┼──────┐
                                              │      │      │
                                              ▼      ▼      ▼
                                       Scrapling  Gemini  Crawl4AI /
                                       (scraper)  (LLM)   Firecrawl
                                                          (fallback)
```

**Two systems, one codebase:**

| System | What it does | How it runs |
|---|---|---|
| **API** (routes/services/repos) | CRUD, admin review, pipeline control, promote | `npm run dev` — Fastify server |
| **Workers** (workers/) | Site crawling, LLM extraction, verification | `npm run job:extraction`, `job:extraction-pages`, `job:extraction-verify` — separate Node processes |

Both share the same database (`masterKnex`), same repositories, same config. Workers communicate with the API layer via LavinMQ queues.

## Pipeline Flow

### Step 1: Admin Creates a Job

```
Admin → POST /jobs { institution_url: "https://unimelb.edu.au" }
         │
         ├── INSERT extraction_jobs (status: "pending")
         └── Publish to LavinMQ "extraction_jobs" queue
```

The API returns immediately with `{ id: "..." }`. The actual work happens asynchronously in the workers.

### Step 2: Job Worker — Admission

**Process:** `npm run job:extraction`
**Queue:** `extraction_jobs`

The job worker no longer scrapes or discovers anything. It marks the job `processing` and publishes
the first step of the chain, `site_map`, to the `extraction_steps` queue. Everything below runs on the
step worker (`npm run job:extraction-step`), one step at a time.

### Step 2b: Step Worker — The Chain (one step at a time)

Design: `docs/data-extraction/2026-09-18-one-step-at-a-time-scraping-plan.md`. Code: `lib/pipeline-steps.ts`.

Each step **runs to completion, writes its result to a table, and stops**. The next step reads only
that table. The gate between steps is one column, `extraction_jobs.step_mode`:

- `auto` (default) — each step publishes its successor, as the pipeline always has.
- `manual` — the pipeline stops after every step with the next one marked `waiting` in
  `pipeline_progress`; the admin presses **Run** on it (`POST /jobs/:id/run-step`).

```
site_map        discoverUrlsForCrawl → related domains → blocklist → guided URLs + homepage
                writes: extraction_site_urls (source per URL). Network: discovery only.
   │
site_snapshot   N concurrent batches of 100 (STEPS queue). For every non-excluded site URL:
                getPage() → extraction_pages row (+ one .md per page in GCS when configured).
                ★ THE ONLY STEP THAT SCRAPES PAGES. The last batch of a run hands off (once).
   │
site_analysis   homepage (full mode, a cache hit after step 2 or one fetch) → Gemini →
                extraction_institution_overview + extraction_site_intelligence.
                Also publishes the "institution" side step (or marks it waiting in manual mode).
   │
url_classify    heuristic (looksLikeCourseUrl) first; the model only NARROWS a list over 500 or
                CLASSIFIES when the heuristic found nothing — in batches of 200, each URL shown
                with the first 300 chars of its snapshot. Guided URLs are always `course`.
                writes: extraction_site_urls.role / role_source ('heuristic' | 'llm'; 'admin' is never overwritten)
   │
queue_pages     every non-excluded `role = 'course'` URL → extraction_queue + one PAGES message.
                Dedupes on (job_id, url); reports duplicates and page_cap discards apart.
```

Preconditions are enforced in `services/step.service.ts` and return a 400 naming the step to run:
`site_snapshot` needs the site list; `url_classify` needs `site_map` and `site_analysis` done;
`queue_pages` needs `url_classify` done. Any step can be re-run from its tab: `site_map` upserts
(admin exclusions survive), `url_classify` never overwrites an admin-set role, `queue_pages` dedupes.

Admin surfaces: **Site URLs** tab (`GET /jobs/:id/site-urls`, `PATCH /site-urls/:id`,
`POST /jobs/:id/site-urls/bulk-exclude`) to prune or re-role URLs before scraping or Gemini;
**Snapshots** tab (`GET /jobs/:id/snapshots`, `GET /jobs/:id/snapshots/:pageId`) to read what was
fetched. Step mode is set with `PATCH /jobs/:id/context { step_mode }`.

### Step 3: Page Worker — Course Extraction

**Process:** `npm run job:extraction-pages`
**Queue:** `extraction_pages`
**Scaling:** 3 initial consumers, auto-scales up to 10 based on queue depth

```
extraction-page.worker.ts (runs N times in parallel)
  │
  ├── 1. Check job is still active (not paused/stopped)
  │
  ├── 2. Read the page from its snapshot .md file in GCS (page-store.getPage)
  │      ★ The file is the source of truth. No file (never snapshotted, or gone from the bucket),
  │        or a file that no longer hashes to its extraction_pages row → scrape live through
  │        Scrapling → Crawl4AI → Firecrawl and write the file. The retry ladder (forceFirecrawl)
  │        and an explicit admin Retry always fetch live.
  │
  ├── 3. Send markdown to Gemini
  │      Prompt: "Extract all courses from this page with fees, intakes, study options..."
  │      Returns: { courses: [...], campuses_found: [...] }
  │
  ├── 4. Write to staging tables (per course)
  │      extraction_courses                          ← the course itself
  │      extraction_course_fees                      ← fee rows
  │      extraction_course_fee_assignments           ← course ↔ fee junction
  │      extraction_intakes                          ← intake periods
  │      extraction_course_intake_assignments        ← course ↔ intake junction
  │      extraction_study_options                    ← study mode/load/duration
  │      extraction_course_study_option_assignments  ← course ↔ option junction
  │      extraction_eligibility_requirements         ← entry requirements
  │      extraction_course_eligibility_assignments   ← course ↔ eligibility junction
  │      extraction_english_requirements             ← language test scores
  │      extraction_campuses                         ← campus/branch (deduped by name)
  │      extraction_course_campuses                  ← course ↔ campus junction
  │
  ├── 5. Mark queue item completed
  │      extraction_queue.status → "completed"
  │      extraction_jobs.courses_extracted++, pages_scraped++
  │
  └── 6. If last page → publish to "extraction_verify" queue
```

### Step 4: Verify Worker — Data Verification

**Process:** `npm run job:extraction-verify`
**Queue:** `extraction_verify`

```
extraction-verify.worker.ts
  │
  ├── 1. Load up to 20 courses with source_url
  │
  ├── 2. For each course:
  │      ├── Re-scrape the source page
  │      ├── Send to Gemini: "Compare these extracted fields against the live page"
  │      └── Write extraction_verification_results (match/mismatch/not_found per field)
  │
  └── 3. Update job
         status → "review"
         verification_score = matches
         verification_total = total checks
         pipeline_progress = all "done"
```

### Step 5: Admin Review (Synchronous API — no queue)

The admin UI calls API endpoints to review and correct the extracted data:

```
READ:
  GET /jobs/:id                          → job details + institution overview
  GET /jobs/:id/courses                  → all extracted courses
  GET /jobs/:id/course-links             → 13-key bundle (all junctions)
  GET /jobs/:id/campuses                 → campuses found
  GET /jobs/:id/agents                   → agents found
  GET /jobs/:id/verification-results     → verification report

CORRECT:
  PATCH /courses/:id                     → fix course name/fees/description
  POST /courses/:id/approve              → mark as confirmed
  POST /courses/:id/reject               → mark as flagged
  PATCH /agents/:id                      → fix agent details
  POST /save-and-learn                   → patch + record correction in extraction_memory

MANAGE STAGING:
  POST /intakes                          → add missing intake
  POST /course-fees                      → add missing fee
  DELETE /intakes/:id                    → remove bad intake
  POST /junctions/:junction/assign       → link course ↔ entity
  DELETE /junctions/:junction/assign     → unlink

PIPELINE CONTROL:
  POST /jobs/:id/pause                   → pause pipeline
  POST /jobs/:id/resume                  → resume + re-dispatch to queue
  POST /jobs/:id/reset-pipeline          → delete all queue items, start over
  POST /jobs/:id/stop-all                → pause job + all processing queue items
```

### Step 6: Promote to Live Catalog

```
POST /:jobId/promote
  │
  ├── Validate job status ∈ [approved, verified, review, exported, done]
  │
  ├── (When catalog tables exist in V3:)
  │   extraction_institution_overview  →  businesses (upsert)
  │   extraction_campuses              →  business_branches
  │   extraction_courses               →  business_services
  │   extraction_course_fees           →  service_fees + assignments
  │   extraction_intakes               →  service_intakes
  │   extraction_eligibility_req       →  service_eligibility_requirements
  │   extraction_agents                →  businesses (type=agent) + representations
  │
  └── Set job status → "exported"
```

Currently a stub — marks job as exported but doesn't write to catalog tables because they don't exist in V3 yet.

## Scraping Strategy

Three-tier cascade, returning **markdown** (not raw HTML):

```
1. Scrapling (self-hosted, primary — via its own MCP server, not REST)
   MCP tools at {SCRAPLING_BASE_URL}/mcp: get → stealthy_fetch → fetch
   └── Same cheapest-first anti-bot escalation (plain HTTP → Cloudflare-
       solving stealthy browser → full Playwright), now driven by
       scraper.ts's MCP client instead of a custom wrapper service.
       Compose service: scrapling-mcp (pyd4vinci/scrapling image).

2. Crawl4AI (self-hosted, fallback)
   POST {CRAWL4AI_BASE_URL}/md
   ├── filter: "fit"  → clean main content (try first)
   └── filter: "raw"  → full page content (fallback if fit < 200 chars)

3. Firecrawl (SaaS, last resort)
   POST https://api.firecrawl.dev/v1/scrape
   └── Handles: bot protection, JS rendering, PDF parsing
```

Content threshold: if markdown < 200 characters, try next tier. Each tier is
optional — unset its env var and the cascade skips straight to the next one.

**URL discovery** cascades (Crawl4AI has no `/map` endpoint, so discovery uses different sources):

```
1. Firecrawl /map     → site-wide URL map (only used for discovery, not scraping)
2. sitemap.xml        → recursive sitemap index parsing (up to 25 nested)
3. robots.txt         → extract Sitemap: directives
4. Seed page links    → scrape homepage via Crawl4AI, extract URLs from markdown
5. Seed URL only      → last resort, just the homepage
```

Note: Firecrawl `/map` is used for URL discovery only because Crawl4AI cannot map an entire site. Actual **page scraping** always tries Crawl4AI first, Firecrawl is the fallback.

**Anti-bot measures:**
- 5 rotating User-Agents (Chrome, Firefox, Safari variants)
- Full browser header set (sec-ch-ua, Sec-Fetch-*, Accept-Language)
- Per-host throttle: minimum 1.5 seconds between requests to same domain
- Exponential backoff on 429/503 with Retry-After header support

## LLM Provider

**Google Gemini** via `@google/generative-ai` SDK.

| Function | Model | Purpose |
|---|---|---|
| Site analysis | `gemini-2.5-flash` | Extract institution overview, detect site structure |
| URL filtering | `gemini-2.5-flash` | Classify discovered URLs as course/non-course |
| Course extraction | `gemini-2.5-flash` | Extract structured course data from page markdown |
| Verification | `gemini-2.5-flash` | Compare extracted fields against live page |
| Embeddings | `gemini-embedding-001` | Extraction memory similarity search (3072 dims) |

All LLM calls use `responseMimeType: "application/json"` for structured output.

## Database Tables (32 tables)

### Orchestration
| Table | Purpose |
|---|---|
| `extraction_jobs` | One row per institution extraction |
| `extraction_job_events` | Timeline of pipeline events |
| `extraction_queue` | URLs to scrape (work items with status lifecycle) |
| `agent_extraction_runs` | History of agent extraction runs |
| `agent_extraction_schedule` | Cron-like scheduling |

### Staging (AI-extracted data)
| Table | Purpose |
|---|---|
| `extraction_institution_overview` | Institution profile (name, address, contact) |
| `extraction_site_intelligence` | AI's analysis of site structure |
| `extraction_courses` | Courses found |
| `extraction_campuses` | Campus/branch locations |
| `extraction_agents` | Education agents |
| `extraction_agent_locations` | Agent office locations |
| `extraction_intakes` | Intake periods |
| `extraction_course_fees` | Fee structures |
| `extraction_eligibility_requirements` | Entry requirements |
| `extraction_english_requirements` | Language test scores |
| `extraction_study_options` | Study mode/load/duration |
| `extraction_study_units` | Individual units/subjects |
| `extraction_accreditations` | Staged accreditation bodies |
| `extraction_additional_info` | Catch-all key/value |
| `extraction_verification_results` | AI vs live-site comparison |

### Junctions (course ↔ entity links)
| Table | Links |
|---|---|
| `extraction_course_campuses` | course ↔ campus |
| `extraction_course_intake_assignments` | course ↔ intake |
| `extraction_course_fee_assignments` | course ↔ fee |
| `extraction_course_eligibility_assignments` | course ↔ eligibility |
| `extraction_course_study_option_assignments` | course ↔ study option |
| `extraction_course_study_unit_assignments` | course ↔ study unit |
| `extraction_course_accreditation_assignments` | course ↔ accreditation |

### Learning (improve future extractions)
| Table | Purpose |
|---|---|
| `extraction_memory` | Before/after diffs from admin corrections |
| `extraction_site_profiles` | Per-domain hints and locked facts |
| `extraction_lessons` | Admin-written and auto-learned rules for the AI |

### Immigration (separate vertical)
| Table | Purpose |
|---|---|
| `extraction_visas` | Staged visa subclass data |
| `extraction_mara_agents` | Staged migration agent data |

## Environment Variables

```bash
# Required for workers
GEMINI_API_KEY=...                    # Google AI API key

# Scrapers (at least one required for workers)
SCRAPLING_BASE_URL=https://...        # Scrapling's own MCP server base URL (primary) — /mcp appended automatically
SCRAPLING_API_KEY=...                 # Bearer token, must match the MCP server's SCRAPLING_MCP_AUTH_TOKEN
CRAWL4AI_BASE_URL=https://...         # Self-hosted Crawl4AI instance (fallback)
CRAWL4AI_API_KEY=...                  # Optional auth for Crawl4AI
FIRECRAWL_API_KEY=fc-...              # Firecrawl SaaS key (last resort)

# Optional overrides
GEMINI_MODEL=gemini-2.5-flash         # Default extraction model
GEMINI_EMBEDDING_MODEL=gemini-embedding-001  # Default embedding model
```

## Running Locally

```bash
# 1. Prerequisites
#    - PostgreSQL running
#    - LavinMQ running (docker run -d --name lavinmq -p 5672:5672 cloudamqp/lavinmq)
#    - .env configured with DB, LavinMQ, and GEMINI_API_KEY

# 2. Run migrations
npm run migrate:superadmin

# 3. Start the API server
npm run dev

# 4. Start workers (each in a separate terminal)
npm run job:extraction           # Job worker (site analysis + URL discovery)
npm run job:extraction-pages     # Page worker (course extraction, auto-scales)
npm run job:extraction-verify    # Verify worker (data verification)

# 5. Create a test job
curl -X POST http://localhost:3000/api/v3/admin/data-extraction/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-jwt>" \
  -d '{"institution_url": "https://www.example-university.edu"}'
```

## Job Status Lifecycle

```
pending ──────────┐
                  ▼
             processing ────── failed
                  │
                  ▼
             extracting ◄──── resume (from paused)
                  │
                  ├──────────► paused (admin pause)
                  │
                  ▼
              review ─────── declined (admin reject)
                  │
                  ▼
             verified
                  │
                  ▼
             approved
                  │
                  ▼
              exported (promoted to catalog)
                  │
                  ▼
               done
```

Pipeline workers set: `pending → processing → review → verified`
Admin actions set: `paused`, `extracting` (resume), `declined`, `failed`
Promote sets: `exported`

## Queue Item Status Lifecycle

```
pending ──► processing ──► completed
   │            │
   │            ├──────────► failed
   │            │
   ▼            ▼
 paused      stopped
   │
   ▼
 ignored
```

## API Endpoints

All under `/api/v3/admin/data-extraction/`. Requires `super_admin` or `data_admin` role.

### Jobs (jobs.routes.ts)
| Method | Path | Description |
|---|---|---|
| GET | /jobs | List jobs with status counts |
| GET | /jobs-filtered | List with CSV status filter |
| GET | /jobs/:id | Job detail + institution overview |
| POST | /jobs | Create job → dispatches to pipeline |
| POST | /jobs/:id/pause | Pause pipeline |
| POST | /jobs/:id/resume | Resume → re-dispatch |
| POST | /jobs/:id/decline | Decline job |
| POST | /jobs/:id/fail | Mark failed |
| PATCH | /jobs/:id/context | Update guided URLs/notes |
| DELETE | /jobs/:id | Delete job (CASCADE) |
| POST | /jobs/:id/merge-duplicates | Merge duplicate courses (stub) |
| GET | /jobs/:id/events | Pipeline event timeline |
| GET | /jobs/:id/agent-runs | Agent extraction run history |

### Queue (queue.routes.ts)
| Method | Path | Description |
|---|---|---|
| GET | /jobs/:id/queue | List queue items for job |
| POST | /queue/:id/ignore | Ignore queue item |
| POST | /queue/:id/retry | Retry failed item |
| POST | /queue/:id/pause | Pause item |
| POST | /queue/:id/stop | Stop item |
| POST | /queue/:id/resume | Resume item |
| DELETE | /queue/:id | Delete item |
| POST | /jobs/:id/queue/pause-all | Pause all pending+processing |
| POST | /jobs/:id/stop-all | Pause job + processing items |
| POST | /jobs/:id/reset-pipeline | Delete all queue, reset counters |

### Courses (courses.routes.ts)
| Method | Path | Description |
|---|---|---|
| GET | /jobs/:id/courses | List courses for job |
| GET | /jobs/:id/course-links | 13-key bundle (all junctions) |
| POST | /jobs/:jobId/courses | Create manual course |
| PATCH | /courses/:id | Patch course fields |
| POST | /courses/:id/approve | Verify as confirmed |
| POST | /courses/:id/reject | Flag as problematic |
| GET | /courses/:courseId/accreditation-links | List accreditation links |
| POST | /courses/:courseId/accreditation-links | Link accreditation |
| DELETE | /courses/:courseId/accreditation-links/:id | Unlink |

### Review (review.routes.ts)
| Method | Path | Description |
|---|---|---|
| GET | /jobs/:id/agents | Agents + locations |
| GET | /jobs/:id/mara-agents | MARA agents for job |
| PATCH | /agents/:id | Patch agent fields |
| POST | /agents/:id/approve | Approve agent |
| POST | /agents/:id/reject | Reject agent |
| GET | /jobs/:id/campuses | Campuses for job |
| PATCH | /campuses/:id | Patch campus fields |
| GET | /jobs/:id/visas | Visas for job |
| GET | /jobs/:id/verification-results | Verification report |

### Staged Entities (staged.routes.ts)
| Method | Path | Description |
|---|---|---|
| POST/PATCH/DELETE | /study-options[/:id] | CRUD study options |
| POST/DELETE | /course-fees[/:id] | Create/delete fees |
| POST/DELETE | /intakes[/:id] | Create/delete intakes |
| POST/DELETE | /eligibility-requirements[/:id] | Create/delete eligibility |
| POST/DELETE | /study-units[/:id] | Create/delete study units |
| POST/DELETE | /staged-accreditations[/:id] | Create/delete accreditations |
| POST/DELETE | /agents[/:id] | Create/delete agents |
| POST/DELETE | /campuses[/:id] | Create/delete campuses |
| POST/DELETE | /junctions/:junction/assign | Assign/unassign junction |
| PATCH | /accreditation-mappings | Map extraction → library accreditation |

### Immigration (immigration.routes.ts)
| Method | Path | Description |
|---|---|---|
| GET | /visas | List all visas |
| GET | /mara-agents | List all MARA agents |
| POST | /visas/:id/discard | Discard visa |
| POST | /mara-agents/:id/discard | Discard MARA agent |
| POST | /visas/:id/promote | Promote to service (stub) |
| POST | /mara-agents/:id/promote | Promote to business (stub) |
| POST | /visas/extract | Extract visas (503 stub) |
| POST | /mara-agents/extract | Extract MARA (503 stub) |

### Supporting (supporting.routes.ts)
| Method | Path | Description |
|---|---|---|
| GET | /site-profiles | List site profiles |
| GET | /jobs/:id/site-profile | Profile for job's domain |
| PUT | /site-profiles | Upsert site profile |
| GET | /lessons | List lessons |
| PATCH | /lessons/:id | Toggle lesson active |
| DELETE | /lessons/:id | Delete lesson |
| POST | /save-and-learn | Patch row + record in memory |

### Promote (promote.routes.ts)
| Method | Path | Description |
|---|---|---|
| POST | /:jobId/promote | Promote to live catalog (stub) |
