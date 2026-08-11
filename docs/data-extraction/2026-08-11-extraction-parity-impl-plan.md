# Implementation Plan: V2 Extraction Parity Port

Date: 2026-08-11
App: GlobalyApp-v3
Spec: Approved in conversation (2026-08-11)
Mode: NEW FEATURE (14 missing V2 functions + shared utilities)

## In scope

- Pipeline step runner (run-step endpoint + step worker)
- 6 step handlers: institution, branches, agents, discovery, enrichment, course_data
- 6 new LLM prompts for each step
- Shared utilities: address-parser, agent-normalizers, email-blocklist, agent-table-parser
- Agent sources: provider registry (AscentOne, StudyLink, iframe-generic)
- Agent enrichment pipeline (address parse, website derive, logo rehost)
- Document extractor (PDF via Gemini vision)
- Fee matcher + bulk fees step
- Memory client (recall/remember, no vector embedding yet)
- Aggregator support (Hotcourses, MastersPortal — others iterative)
- AgentCIS import (search + import endpoints + worker)
- Scheduled agent runs (cron worker)
- 3 new workers, 3 new queues, 7 new API endpoints

## Out of scope (explicit)

- push-to-globaly / promote flow (separate design)
- Live catalog tables (business_services, business_branches, etc.)
- ~~Vector embeddings~~ — pgvector WILL be used (install `postgresql-16-pgvector`, enable extension, add `embedding vector(768)` column)
- Frontend changes (backend-only)

---

## File Map

### CREATE

```
# Phase 1 — Shared utilities (pure functions)
backend/src/modules/superadmin/data-extraction/lib/address-parser.ts
backend/src/modules/superadmin/data-extraction/lib/address-parser-ai.ts
backend/src/modules/superadmin/data-extraction/lib/agent-normalizers.ts
backend/src/modules/superadmin/data-extraction/lib/agent-table-parser.ts
backend/src/modules/superadmin/data-extraction/lib/email-blocklist.ts

# Phase 2 — Memory client
backend/src/modules/superadmin/data-extraction/lib/memory-client.ts

# Phase 3 — Step worker + service + schema
backend/src/modules/superadmin/data-extraction/workers/extraction-step.worker.ts
backend/src/modules/superadmin/data-extraction/services/step.service.ts
backend/src/modules/superadmin/data-extraction/schemas/step.schema.ts

# Phase 4 — Agent sources + enrichment
backend/src/modules/superadmin/data-extraction/lib/agent-sources/index.ts
backend/src/modules/superadmin/data-extraction/lib/agent-sources/types.ts
backend/src/modules/superadmin/data-extraction/lib/agent-sources/ascentone.ts
backend/src/modules/superadmin/data-extraction/lib/agent-sources/studylink.ts
backend/src/modules/superadmin/data-extraction/lib/agent-sources/iframe-generic.ts
backend/src/modules/superadmin/data-extraction/lib/agent-enrichment.ts

# Phase 5 — Document extractor
backend/src/modules/superadmin/data-extraction/lib/document-extractor.ts

# Phase 6 — Fee matcher
backend/src/modules/superadmin/data-extraction/lib/fee-matcher.ts

# Phase 7 — Aggregator support
backend/src/modules/superadmin/data-extraction/lib/aggregator/index.ts
backend/src/modules/superadmin/data-extraction/lib/aggregator/types.ts
backend/src/modules/superadmin/data-extraction/lib/aggregator/hotcourses.ts
backend/src/modules/superadmin/data-extraction/lib/aggregator/masters-portal.ts
backend/src/modules/superadmin/data-extraction/routes/aggregator.routes.ts
backend/src/modules/superadmin/data-extraction/services/aggregator.service.ts
backend/src/modules/superadmin/data-extraction/schemas/aggregator.schema.ts

# Phase 8 — AgentCIS import
backend/src/modules/superadmin/data-extraction/workers/extraction-agentcis.worker.ts
backend/src/modules/superadmin/data-extraction/routes/agentcis.routes.ts
backend/src/modules/superadmin/data-extraction/services/agentcis.service.ts
backend/src/modules/superadmin/data-extraction/schemas/agentcis.schema.ts

# Phase 9 — Scheduled agent runs
backend/src/modules/superadmin/data-extraction/workers/extraction-schedule.worker.ts
```

### MODIFY

```
# Phase 2 — pgvector migration + memory client
backend/database/migrations/superadmin/20260811_007_extraction_memory_embedding.ts

# Phase 3 — New prompts, new queue, new routes
backend/src/modules/superadmin/data-extraction/lib/extraction-prompts.ts    — add 6 new prompts
backend/src/modules/superadmin/data-extraction/shared/queues.ts             — add STEPS, AGENTCIS, SCHEDULE
backend/src/modules/superadmin/data-extraction/routes/jobs.routes.ts        — add POST /jobs/:id/run-step
backend/src/modules/superadmin/data-extraction/index.ts                     — register aggregator + agentcis routes
backend/src/modules/superadmin/data-extraction/lib/staging-writer.ts        — add agent/campus batch writers

# Phase 9
backend/src/modules/superadmin/data-extraction/routes/jobs.routes.ts        — add schedule-agents endpoints
backend/package.json                                                        — add 3 new npm scripts
```

---

## Phase 1 — Shared Utilities

Pure functions, no external deps, no DB. Port from V2 with V3 conventions.

### `address-parser.ts`

```typescript
export interface ParsedAddress {
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

export function parseAddress(raw: string | null, hintedCountry?: string | null): ParsedAddress;
```

Logic: Decode HTML → comma-split → peel from tail: country → postcode+state → state → city → street.
Handles UK/CA/US/AU/IN/EU postcode patterns.

### `agent-normalizers.ts`

```typescript
export function normalizeCountry(raw: unknown): string | null;
export function normalizeState(raw: unknown, country: string | null): string | null;
export function normalizePhone(raw: unknown, country: string | null): string | null;
export function normalizeEmail(raw: unknown): string | null;
export function normalizeWebsite(raw: unknown): string | null;
export function normalizePostcode(raw: unknown): string | null;
export function splitAddress(raw: unknown, ctx: { country?: string | null }): ParsedAddress;
export function normalizeAgentRow(row: AgentRowLike, existing?: AgentRowLike): NormalizedAgentRow;
```

Port V2 data tables: 50+ country aliases, AU/US/CA/IN state tables, 24 dial codes.

### `agent-table-parser.ts`

```typescript
export function parseAgentRowsFromHtml(html: string): AgentRow[];
```

Finds `<table>` blocks, detects header columns (name/email/phone/address/website), extracts rows.

### `email-blocklist.ts`

```typescript
export function isPersonalEmailDomain(domain: string | null): boolean;
export function emailDomain(email: string | null): string | null;
```

80+ personal domains (gmail, yahoo, outlook, qq, etc.) + suffix matching.

### Test criteria
- `parseAddress("123 Main St, Sydney, NSW 2000, Australia")` → correct split
- `normalizeCountry("AUS")` → `"Australia"`
- `normalizePhone("0412345678", "Australia")` → `"+61 412345678"`
- `isPersonalEmailDomain("gmail.com")` → `true`
- `parseAgentRowsFromHtml("<table><tr><th>Name</th><th>Email</th></tr><tr><td>Acme</td><td>a@b.com</td></tr></table>")` → 1 row

---

## Phase 2 — Memory Client + pgvector Migration

### Prerequisites

Install pgvector (requires sudo — run once):
```bash
sudo apt-get install -y postgresql-16-pgvector
```

### Schema migration (`20260811_007_extraction_memory_embedding.ts`)

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (768-dim for Gemini text-embedding-004)
ALTER TABLE superadmin.extraction_memory
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_extraction_memory_embedding
  ON superadmin.extraction_memory USING hnsw (embedding vector_cosine_ops);

-- Add updated_at to extraction_english_requirements and extraction_study_options (timestamp audit fix)
ALTER TABLE superadmin.extraction_english_requirements
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE superadmin.extraction_study_options
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
```

### `memory-client.ts`

```typescript
export interface RecalledMemory {
  siteProfile: SiteProfile | null;
  lessons: Lesson[];
  examples: Array<{ source_excerpt: string; ai_output: unknown; similarity: number }>;
}

export function recallMemory(domain: string, step: string, sourceExcerpt?: string): Promise<RecalledMemory>;
export function rememberMemory(opts: {
  job_id: string; domain: string; step: string;
  entity_type: string; entity_ref?: string;
  source_url?: string; source_excerpt?: string;
  ai_output: unknown;
}): Promise<void>;
export function buildSystemAddendum(recalled: RecalledMemory): string;
```

Logic:
- `recallMemory`: reads `extraction_site_profiles` by domain + `extraction_lessons` by domain+step (active only, ordered by weight) + top-3 similar examples via cosine similarity on `embedding` column (if sourceExcerpt provided, embed it and query `ORDER BY embedding <=> $1 LIMIT 3`)
- `rememberMemory`: embeds `source_excerpt` via `llmClient.embed()`, inserts into `extraction_memory` with embedding vector
- `buildSystemAddendum`: formats locked facts + lesson rules + similar examples into a system prompt appendix

### File Map addition

```
CREATE  backend/database/migrations/superadmin/20260811_007_extraction_memory_embedding.ts
CREATE  backend/src/modules/superadmin/data-extraction/lib/memory-client.ts
```

### Test criteria
- `buildSystemAddendum` with site profile + 2 lessons + 1 example produces a non-empty string
- `rememberMemory` writes to DB with embedding vector without error
- `recallMemory` with sourceExcerpt returns top-3 similar examples by cosine similarity
- `recallMemory` without sourceExcerpt still returns siteProfile + lessons (no examples)

---

## Phase 3 — Step Worker + Run-Step Endpoint

### Queue addition (`shared/queues.ts`)

```typescript
export const EXTRACTION_QUEUES = {
  JOBS: "extraction_jobs",
  PAGES: "extraction_pages",
  VERIFY: "extraction_verify",
  STEPS: "extraction_steps",       // ← NEW
  AGENTCIS: "extraction_agentcis", // ← NEW (Phase 8)
  SCHEDULE: "extraction_schedule", // ← NEW (Phase 9)
} as const;
```

### Schema (`schemas/step.schema.ts`)

```typescript
export const PIPELINE_STEPS = [
  "institution", "branches", "agents", "discovery",
  "courses", "enrichment", "verification", "course_data",
] as const;

export const RunStepSchema = z.object({
  step: z.enum(PIPELINE_STEPS),
  course_id: z.string().uuid().optional(),  // for course_data step
  data_type: z.enum(["fees", "intakes", "units", "eligibility", "accreditations", "course"]).optional(),
});
```

### Endpoint (add to `routes/jobs.routes.ts`)

```
POST /jobs/:id/run-step
Body: RunStepSchema
Response: { dispatched: true, step: "agents" }
```

### Service (`services/step.service.ts`)

```typescript
export async function dispatchStep(jobId: string, input: RunStepInput, adminId: number): Promise<void>;
```

Logic:
1. Validate job exists and is actionable
2. Validate step has required context (e.g., agents needs agents_urls in guided_urls)
3. Update `pipeline_progress.{step}` → `"running"`
4. Publish to `EXTRACTION_QUEUES.STEPS` with `{ jobId, step, course_id?, data_type? }`
5. Log audit

### Worker (`workers/extraction-step.worker.ts`)

```typescript
await queueService.consume(EXTRACTION_QUEUES.STEPS, async (msg) => {
  const { jobId, step, course_id, data_type } = JSON.parse(msg.content.toString());
  // Route to step handler
  switch (step) {
    case "institution": return handleInstitutionStep(jobId);
    case "branches":    return handleBranchesStep(jobId);
    case "agents":      return handleAgentsStep(jobId);
    case "discovery":   return handleDiscoveryStep(jobId);
    case "courses":     return handleCoursesStep(jobId);
    case "enrichment":  return handleEnrichmentStep(jobId);
    case "verification": return handleVerificationStep(jobId);
    case "course_data": return handleCourseDataStep(jobId, course_id!, data_type!);
  }
});
```

Each handler:
1. Load job context
2. `recallMemory(domain, step)` → build system addendum
3. Execute step-specific logic (scrape, LLM, write)
4. `rememberMemory()` for each LLM output
5. Update `pipeline_progress.{step}` → `"done"` or `"failed"`
6. Write job event

### New prompts (add to `extraction-prompts.ts`)

| Prompt function | Phase | Key differences from existing |
|----------------|-------|-------------------------------|
| `institutionExtractionPrompt(url, pageText, guidanceNotes)` | institution | Extracts full overview: name, logo, website, email, phone, description, address, socials |
| `campusExtractionPrompt(url, pageText, singleCampusMode)` | branches | Strict address validation rules, dedup, single-campus mode flag |
| `agentExtractionPrompt(url, pageText, institutionName)` | agents | Extract agent rows: name, country, email, phone, website, address, location_count |
| `courseListPrompt(url, pageText)` | discovery | Classify: real courses vs. category listing. Return course URLs or category URLs |
| `bulkFeePrompt(courseNames, feePageText, siteHints)` | enrichment | Map fee table rows to course names with fuzzy matching |
| `courseDataPrompt(url, pageText, dataType, guidanceNotes)` | course_data | Type-specific: extract only fees/intakes/units/eligibility/accreditations |

### Step handler logic (summarised)

**`handleInstitutionStep(jobId)`:**
- URLs: institution_url + contact_urls + `/contact` guess
- Scrape all → LLM per page → merge (first non-null per field)
- Preserve existing manual edits → upsert `extraction_institution_overview`

**`handleBranchesStep(jobId)`:**
- Phase 1: Scrape branches_urls → LLM multi-campus mode
- Phase 2: If empty, try sub-pages (`/campuses/*`)
- Phase 3: Fallback homepage + `/about`
- `parseAddress()` + AI fallback on each result
- Dedup by name + by address key
- Delete + re-insert (preserve course-campus links by name matching)

**`handleAgentsStep(jobId)`:**
- Provider detection → fast-path API fetch → LLM fallback
- Pagination (detect `?page=N`, DataTables)
- `enrichAgents()` pipeline
- Upsert on `(job_id, external_id)` → preserve user edits
- Write `extraction_agent_locations` + `agent_extraction_runs`

**`handleDiscoveryStep(jobId)`:**
- Scrape course_list_urls → LLM courseListPrompt per page
- Real courses: insert into extraction_queue + publish to PAGES
- Category listings: recursively scrape category URLs (depth 2)
- Dedup: skip already-queued URLs

**`handleCoursesStep(jobId)`:**
- Re-dispatch all pending queue items to PAGES queue
- Existing page worker handles extraction

**`handleEnrichmentStep(jobId)`:**
- Find fee page from site_intelligence or common paths
- Scrape → LLM bulkFeePrompt → fuzzy match to courses
- Delete old fee assignments, re-create with dedup

**`handleCourseDataStep(jobId, courseId, dataType)`:**
- Load course source_url, scrape
- Type-specific LLM prompt → extract only requested type
- Delete + re-insert for that type on that course

### Staging writer additions (`staging-writer.ts`)

```typescript
// Batch writers for agent step
export async function upsertAgent(jobId: string, agent: AgentRow, existingAgents: any[]): Promise<string>;
export async function writeAgentLocations(agentId: string, jobId: string, locations: AgentLocation[]): Promise<void>;

// Campus batch replace
export async function replaceCampuses(jobId: string, campuses: ExtractedCampus[]): Promise<Map<string, string>>;
```

### Test criteria
- `POST /jobs/:id/run-step { step: "institution" }` returns 200 with `{ dispatched: true }`
- Step worker picks up message and routes to correct handler
- Institution step: scrapes, writes overview, updates pipeline_progress
- Invalid step returns 400
- Missing context (e.g., no agents_urls for agents step) returns 400 with reason

### npm script
```
"job:extraction-step": "node --import tsx src/modules/superadmin/data-extraction/workers/extraction-step.worker.ts"
```

---

## Phase 4 — Agent Sources + Enrichment

### `agent-sources/types.ts`

```typescript
export interface AgentLocation { external_id, is_head_office, street1, street2, city, state, country, postcode, address, email, phone, website }
export interface AgentRow { name, country, email, phone, website, website_source?, street1?, city?, state?, postcode?, address?, logo_url?, external_id?, location_count?, locations? }
export interface ProviderDetection { providerId, providerName, resolvedUrl, meta? }
export interface ProviderResult { agents: AgentRow[], rawCount, sourceUrl, meta? }
export interface AgentSourceProvider { id, name, detect(seedUrl, html?), fetch(detection) }
```

### `agent-sources/index.ts`

```typescript
export function detectAgentSource(seedUrl: string, html?: string | null): { provider: AgentSourceProvider, detection: ProviderDetection } | null;
export function getProviderById(id: string): AgentSourceProvider | null;
```

Registry order: AscentOne → StudyLink → iframe-generic.

### Provider files

Each exports an `AgentSourceProvider`:
- **ascentone.ts**: Detects AscentOne agent directory URLs, fetches via their JSON API
- **studylink.ts**: Detects StudyLink format, parses structured HTML
- **iframe-generic.ts**: Detects iframes embedding agent lists, scrapes iframe src

### `agent-enrichment.ts`

```typescript
export interface EnrichOpts { aiAddressFallback?: boolean; aiAddressMaxCalls?: number; rehostLogos?: boolean; }

export function enrichAgents(rows: AgentRow[], opts?: EnrichOpts): Promise<{ addressesParsed, addressesAiFilled, websitesDerived, logosRehosted }>;
export function mergeAgentRows(primary: AgentRow[], secondary: AgentRow[]): AgentRow[];
```

Stages: heuristic address → AI address fallback → website from email → logo rehost (GCS).

### `address-parser-ai.ts`

```typescript
export function parseAddressesAi(batch: { raw: string; country?: string }[]): Promise<(ParsedAddress | null)[]>;
```

Uses `extractJson()` from existing llm-client. Batch limit 20.

### Test criteria
- `detectAgentSource("https://agents.ascentone.com/...")` returns ascentone provider
- `enrichAgents([{name: "Acme", email: "info@acme.com.au", address: "123 Main St Sydney NSW 2000"}])` fills city/state/postcode/website
- `mergeAgentRows(apiRows, llmRows)` fills null fields from secondary

---

## Phase 5 — Document Extractor

### `document-extractor.ts`

```typescript
export function createDocumentExtractor(): { extract: (doc: DocInput) => Promise<DocResult> };
export function buildDocumentContext(extractor: ReturnType<typeof createDocumentExtractor>, docs: DocInput[], maxTotalChars?: number): Promise<string>;

interface DocInput { file_url: string; file_name: string; guidance?: string; }
interface DocResult { text: string; source: string; error?: string; }
```

Logic:
- PDF: Download → base64 → Gemini vision (Flash model) → markdown text
- Text formats (.txt, .md, .html, .csv): read raw
- Unsupported (.docx, .xlsx): skip with reason
- Cache by file_url per instance
- Adapt file downloads: GCS bucket via signed URL (use existing GCS config)

### Test criteria
- Text file extraction returns raw content
- PDF extraction calls Gemini vision and returns markdown
- Cache prevents re-downloading same file
- Unsupported format returns error, not crash

---

## Phase 6 — Fee Matcher + Bulk Fees

### `fee-matcher.ts`

```typescript
export function fuzzyMatchCourseToFee(courseName: string, feeCourseName: string): number; // 0-1 score
export function matchFeesToCourses(
  fees: { course_name: string; student_type: string; amount: number; currency: string; period: string }[],
  courses: { id: string; name: string }[],
): { courseId: string; fee: typeof fees[0] }[];
```

Logic:
- Normalize: lowercase, strip "bachelor of"/"master of"/"diploma of" prefixes
- Token overlap scoring + Levenshtein distance
- Threshold: 0.6 match score required

Enrichment step handler in step worker uses this to link LLM-extracted fee table rows to courses.

### Test criteria
- `fuzzyMatchCourseToFee("Bachelor of Science", "BSc Science")` → score > 0.6
- `matchFeesToCourses` links matching courses, skips unmatched

---

## Phase 7 — Aggregator Support

### `aggregator/index.ts`

```typescript
export function detectAggregator(url: string): AggregatorProvider | null;
```

### `aggregator/types.ts`

```typescript
export interface AggregatorProvider {
  id: string; name: string;
  detect(url: string): boolean;
  extractListing(url: string, scraper: typeof scrapeMarkdown): Promise<AggregatorResult>;
}
export interface AggregatorResult {
  institution: { name, description, website, city, state, country };
  courseUrls: string[];
}
```

### `aggregator/hotcourses.ts`, `aggregator/masters-portal.ts`

Each implements `AggregatorProvider`:
- `detect`: match domain
- `extractListing`: paginate, extract course links, scrape institution overview

### Routes (`routes/aggregator.routes.ts`)

```
POST /aggregator/extract
Body: { url: string }
Response: { job_id, aggregator, institution, courses_queued }
```

### Service (`services/aggregator.service.ts`)

```typescript
export async function extractFromAggregator(url: string, adminId: number): Promise<{ jobId, aggregator, coursesQueued }>;
```

Logic:
1. `detectAggregator(url)` → provider
2. `provider.extractListing(url, scrapeMarkdown)` → institution + courseUrls
3. Create `extraction_jobs` with source_type=aggregator
4. Save `extraction_institution_overview`
5. Queue course URLs → existing page worker

### Register in `index.ts`

```typescript
import { aggregatorRoutes } from "./routes/aggregator.routes.js";
// ...
app.register(aggregatorRoutes);
```

### Test criteria
- `detectAggregator("https://www.hotcoursesabroad.com/...")` returns hotcourses provider
- `POST /aggregator/extract` with valid URL creates job + queues courses
- Unknown aggregator URL returns 400

---

## Phase 8 — AgentCIS Import

### Routes (`routes/agentcis.routes.ts`)

```
POST /agentcis/search     Body: { query }          → { results: [{id, name, website, country}] }
POST /agentcis/import      Body: { institution_ids } → { dispatched: true, job_count }
```

### Service (`services/agentcis.service.ts`)

```typescript
export async function searchAgentCIS(query: string): Promise<AgentCISResult[]>;
export async function importAgentCIS(ids: string[], adminId: number): Promise<{ jobCount: number }>;
```

### Worker (`workers/extraction-agentcis.worker.ts`)

Consumes `EXTRACTION_QUEUES.AGENTCIS`. Per institution ID:
1. Fetch from AgentCIS API (nested record with branches, products)
2. Create `extraction_jobs` (status: processing)
3. Stage overview, campuses, courses, fees, intakes, eligibility, study options
4. Mark job done

### npm script
```
"job:extraction-agentcis": "node --import tsx src/modules/superadmin/data-extraction/workers/extraction-agentcis.worker.ts"
```

### Test criteria
- Search returns results from AgentCIS API
- Import creates jobs and stages data correctly
- Network failure on API returns error, not crash

---

## Phase 9 — Scheduled Agent Runs

### Worker (`workers/extraction-schedule.worker.ts`)

```typescript
// Triggered by cron or manual API call
// Queries agent_extraction_schedule for due rows
// Publishes to STEPS queue with step: "agents"
```

### Endpoints (add to `routes/jobs.routes.ts`)

```
POST   /jobs/:id/schedule-agents   Body: { cadence, enabled }  → { schedule_id }
GET    /jobs/:id/schedule-agents                                → { schedule }
DELETE /jobs/:id/schedule-agents                                → { deleted: true }
```

### npm script
```
"job:extraction-schedule": "node --import tsx src/modules/superadmin/data-extraction/workers/extraction-schedule.worker.ts"
```

### Test criteria
- Creating a schedule writes to `agent_extraction_schedule`
- Worker picks up due schedules and dispatches step
- Cadence advances correctly (daily/weekly/monthly)

---

## Risk & Rollback

| Risk | Mitigation |
|------|------------|
| Gemini quota exhaustion during agent/campus/fee extraction | Retry logic respects server retryDelay; steps are re-runnable |
| AgentCIS API unavailable or changed | Stub responses; fail gracefully with error message |
| Address parser false positives (wrong country/state) | Heuristic first, AI fallback; admin can correct via save-and-learn |
| Large institutions (500+ agent pages) | max_pages cap on agent step; pagination timeout |
| Concurrent step runs on same job | Pipeline_progress tracks per-step status; second dispatch skips if already running |

**Rollback:** Each phase is independently deployable. Workers are separate processes — stop the process to disable. One migration in Phase 2 (pgvector extension + embedding column + timestamp audit fixes) — reversible via `ALTER TABLE DROP COLUMN`.

---

## Open Questions

- [ ] AgentCIS API credentials and base URL — needed for Phase 8. Can stub without them.
- [ ] GCS bucket name for logo rehosting — or should logos go to a different storage?
- [ ] Aggregator platform priority — confirmed Hotcourses + MastersPortal first. Others when?

---

**Plan saved** to `docs/data-extraction/2026-08-11-extraction-parity-impl-plan.md`

Open questions above can be resolved during implementation (all have stubs as fallback).

Type **"approved"** to hand off to implementation, or tell me what to change.
