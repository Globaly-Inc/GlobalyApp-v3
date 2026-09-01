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
   Exception: `POST /jobs/:id/rerun` resumes instead of always restarting
   (2026-09-01) — if the job has pending/failed queue items, rerun retries
   just those via the "courses" step instead of `resetPipeline` wiping the
   whole queue and re-crawling from scratch. A full-job rerun used to
   re-scrape and re-extract (re-billing Gemini for) every page every time,
   including ones already successfully extracted; this was a real driver of
   an August Gemini cost spike. `resetPipeline` (full wipe) is still used
   when a job has nothing queued yet to resume from — no V2 equivalent to
   port, this is a cost fix.

## External FK columns

7 columns reference tables that may not exist yet in V3. These are plain
`uuid` columns with no FK constraint. See `docs/extraction-v3-decisions.md`
for the full list.

## Status values

Status fields are `text` columns with no CHECK constraints (matching V2).
Validation is in Zod schemas. See `docs/extraction-v3-decisions.md`
Section 3 for canonical value lists.
