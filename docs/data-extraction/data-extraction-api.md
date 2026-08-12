# Data Extraction API Reference

Base URL: `http://localhost:3000/api/v3/admin/data-extraction`

Auth: All endpoints require JWT with `type: "admin"` and `role: "super_admin"` or `"data_admin"`.
Pass as `Authorization: Bearer <access_token>`.

---

## Pipeline Flow (End to End)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. ADMIN CREATES JOB                                                │
│    POST /jobs                                                       │
│    - Selects business_category, service_category, source_type       │
│    - Provides main URL + optional guided URLs + guidance notes      │
│    → Creates row in extraction_jobs (status: pending)               │
│    → Dispatches message to LavinMQ "extraction_jobs" queue          │
├─────────────────────────────────────────────────────────────────────┤
│ 2. JOB WORKER (npm run job:extraction)                              │
│    Consumes from "extraction_jobs" queue                            │
│    a) Scrape homepage → markdown (Crawl4AI → Firecrawl fallback)   │
│    b) Gemini LLM → extract institution overview + site intelligence │
│    c) Discover course URLs (sitemap, robots.txt, page links)       │
│    d) Filter URLs (heuristic + LLM ranking)                        │
│    e) Insert each URL into extraction_queue                        │
│    f) Publish each to LavinMQ "extraction_pages" queue             │
│    → Writes: extraction_institution_overview,                      │
│              extraction_site_intelligence,                          │
│              extraction_queue rows                                  │
│    → Updates: extraction_jobs (total_pages_found, pipeline_progress)│
├─────────────────────────────────────────────────────────────────────┤
│ 3. PAGE WORKER (npm run job:extraction-pages)                       │
│    Consumes from "extraction_pages" queue (3-10 parallel consumers) │
│    Per page:                                                        │
│    a) Scrape page → markdown                                       │
│    b) Gemini LLM → structured course + campus + fee data           │
│    c) Write to staging tables (dedup campuses)                     │
│    d) Mark extraction_queue item completed                         │
│    e) Increment extraction_jobs.courses_extracted                   │
│    f) If last page → publish to "extraction_verify" queue          │
│    → Writes: extraction_courses, extraction_campuses,              │
│              extraction_course_fees, extraction_intakes,            │
│              extraction_eligibility_requirements,                   │
│              extraction_english_requirements,                       │
│              extraction_study_options, extraction_study_units,      │
│              + all junction tables                                  │
├─────────────────────────────────────────────────────────────────────┤
│ 4. VERIFY WORKER (npm run job:extraction-verify)                    │
│    Consumes from "extraction_verify" queue                         │
│    a) Load up to 20 courses with source_url                        │
│    b) Re-scrape each source page                                   │
│    c) Gemini: compare extracted vs live values                     │
│    d) Write match/mismatch/not_found results                      │
│    → Writes: extraction_verification_results                       │
│    → Updates: extraction_jobs (status→review, verification_score)  │
├─────────────────────────────────────────────────────────────────────┤
│ 5. ADMIN REVIEW (via API)                                           │
│    - View courses, agents, campuses, verification results          │
│    - Approve/reject individual courses                             │
│    - Patch fields, add/remove junctions                            │
│    - Save corrections (save-and-learn for AI improvement)          │
├─────────────────────────────────────────────────────────────────────┤
│ 6. PROMOTE (stub)                                                   │
│    POST /:jobId/promote                                             │
│    → Marks job status as "exported" (live catalog push TBD)        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Tables (superadmin schema)

### Core

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `extraction_jobs` | Master job record | `id`, `institution_url`, `status`, `business_category_id` (int FK→business_categories), `service_category_id` (int FK→service_categories), `source_type`, `guided_urls` (jsonb), `guidance_notes`, `sample_course_url`, `supporting_documents` (jsonb), `pipeline_progress` (jsonb), `courses_extracted`, `pages_scraped`, `pages_failed`, `pages_total`, `error_message`, `worker_id`, `attempts` |
| `extraction_job_events` | Pipeline event timeline | `job_id`, `kind` (created/status/phase/progress/error), `level` (info/warn/error/success), `phase`, `message`, `data` (jsonb) |
| `extraction_queue` | URL work queue | `job_id`, `url`, `status`, `kind`, `error`, `extracted_data` (jsonb), `retry_count` |

### Extracted Data (per job)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `extraction_institution_overview` | Institution profile | `job_id`, `name`, `website`, `phone`, `email`, `address`, `city`, `state`, `country`, `description`, `logo_url`, socials |
| `extraction_site_intelligence` | AI site analysis | `job_id`, `institution_name`, `institution_type`, `country`, `currency`, `fee_structure` (jsonb), `extraction_hints` (text[]), `navigation_patterns` (jsonb) |
| `extraction_courses` | Staged courses | `job_id`, `name`, `degree_level`, `subject_area`, `duration_weeks`, `study_mode`, `description`, fees (domestic/international), `career_paths` (text[]), `source_url`, `verification_status` |
| `extraction_campuses` | Campus locations | `job_id`, `name`, `address`, `city`, `state`, `country`, `phone`, `email`, `map_link`, `postcode` |
| `extraction_agents` | Education agents | `job_id`, `name`, `country`, `email`, `phone`, `website`, `external_id`, `location_count`, `logo_url` |
| `extraction_course_fees` | Fee structures | `job_id`, `name`, `student_type`, `period_type`, `currency`, `total_amount`, `installments` (jsonb) |
| `extraction_intakes` | Intake periods | `job_id`, `intake_name`, `start_date`, `end_date`, `admission_deadline`, `intake_month`, `intake_year` |
| `extraction_eligibility_requirements` | Entry requirements | `job_id`, `name`, `applicable_to`, `min_degree_level`, `min_score_percent`, `academic_tests` (jsonb), `language_tests` (jsonb) |
| `extraction_english_requirements` | Language scores | `job_id`, `course_id`, `test_type_name`, `overall_score`, listening/reading/writing/speaking scores |
| `extraction_study_options` | Study modes | `job_id`, `name`, `study_mode`, `study_load`, `duration_value`, `duration_unit`, `applicable_to` |
| `extraction_study_units` | Course units | `job_id`, `unit_code`, `unit_name`, `credit_points`, `description` |
| `extraction_additional_info` | Key-value extras | `job_id`, `key`, `value`, `source_url` |
| `extraction_verification_results` | AI vs live comparison | `job_id`, `course_id`, `field_name`, `extracted_value`, `live_value`, `status` (match/mismatch/not_found) |
| `extraction_accreditations` | Accreditation bodies | `name`, `issuing_organization`, `website`, `description` |

### Junction Tables (course ↔ entity)

| Table | Links |
|-------|-------|
| `extraction_course_campuses` | course ↔ campus |
| `extraction_course_intake_assignments` | course ↔ intake |
| `extraction_course_fee_assignments` | course ↔ fee |
| `extraction_course_eligibility_assignments` | course ↔ eligibility |
| `extraction_course_study_option_assignments` | course ↔ study option |
| `extraction_course_study_unit_assignments` | course ↔ study unit |
| `extraction_course_accreditation_assignments` | course ↔ accreditation |

### Supporting / Learning

| Table | Purpose |
|-------|---------|
| `extraction_memory` | Before/after diffs from admin corrections |
| `extraction_site_profiles` | Per-domain hints, success rates |
| `extraction_lessons` | Admin-curated rules for AI (global or domain-scoped) |
| `extraction_agent_locations` | Agent office locations |

### Immigration

| Table | Purpose |
|-------|---------|
| `extraction_visas` | Staged visa subclass data |
| `extraction_mara_agents` | MARA agents |
| `agent_extraction_runs` | Run history |
| `agent_extraction_schedule` | Cron scheduling |

---

## API Endpoints

### 1. Jobs

#### `POST /jobs` — Create extraction job

This is the main entry point. Creates a job and dispatches it to the pipeline.

```json
// Request body
{
  "institution_url": "https://www.university.edu.au",        // required
  "institution_name": "University of Example",               // optional
  "source_type": "institution",                              // "institution" | "aggregator"
  "business_category_id": 1,                                 // integer, optional
  "service_category_id": 2,                                  // integer, optional
  "sample_course_url": "https://www.university.edu.au/courses/bachelor-of-science",
  "guidance_notes": "Fees are shown per semester, multiply by 2 for annual",
  "guided_urls": {
    "course_list_urls": [
      "https://www.university.edu.au/courses"
    ],
    "contact_urls": [
      "https://www.university.edu.au/contact"
    ],
    "branches_urls": [
      "https://www.university.edu.au/campuses"
    ],
    "agents_urls": [
      "https://www.university.edu.au/agents"
    ],
    "extract_fields": [
      "description", "fees", "intakes", "eligibility",
      "accreditations", "study_units", "study_mode",
      "duration", "campus_locations"
    ],
    "resources": [
      {
        "id": "uuid",
        "type": "url",
        "url": "https://extra-source.com/fees",
        "file_path": "",
        "file_name": "",
        "data_types": ["Fee Information", "Intake Dates"],
        "guidance": "Fee tables for international students on page 3"
      }
    ]
  },
  "supporting_documents": [
    {
      "file_url": "uploads/temp/abc123/fees.pdf",
      "file_name": "fees.pdf",
      "guidance": "Contains detailed fee breakdown"
    }
  ],
  "pipeline_progress": {
    "mapping": { "status": "pending", "total": 0, "done": 0 },
    "intelligence": { "status": "pending", "total": 0, "done": 0 },
    "scraping": { "status": "pending", "total": 0, "done": 0 },
    "extracting": { "status": "pending", "total": 0, "done": 0 },
    "verifying": { "status": "pending", "total": 0, "done": 0 }
  }
}

// Response 201
{ "id": "uuid-of-created-job" }
```

**Two modes:**
1. **URL-only** — provide just `institution_url`. The scraper auto-discovers all pages.
2. **Guided** — provide `guided_urls` with specific page URLs. The scraper prioritizes these.

#### `GET /jobs` — List jobs

```
GET /jobs?status=pending&q=university&limit=100
```

```json
// Response
{
  "jobs": [
    {
      "id": "uuid",
      "institution_name": "University of Example",
      "institution_url": "https://www.university.edu.au",
      "status": "review",
      "source_type": "institution",
      "total_pages_found": 45,
      "courses_extracted": 32,
      "verification_score": 28,
      "verification_total": 32,
      "pages_scraped": 45,
      "pages_failed": 2,
      "business_category_id": 1,
      "service_category_id": 2,
      "guided_urls": {},
      "guidance_notes": null,
      "pipeline_progress": { ... },
      "created_at": "2026-08-11T04:00:00Z",
      "updated_at": "2026-08-11T04:30:00Z"
    }
  ],
  "counts": {
    "pending": 3,
    "processing": 1,
    "review": 5,
    "failed": 2
  }
}
```

#### `GET /jobs-filtered` — Filter jobs (dashboard view)

```
GET /jobs-filtered?statuses=pending,processing,review&source_type=institution&exclude_source_type=agentcis&limit=100
```

```json
// Response — same as /jobs but with campus_count and agent_count per job
{
  "jobs": [
    { "...all job fields...", "campus_count": 3, "agent_count": 12 }
  ]
}
```

#### `GET /jobs/:id` — Job detail

```json
// Response
{
  "job": { "...all job fields..." },
  "overview": {
    "id": "uuid",
    "job_id": "uuid",
    "name": "University of Example",
    "website": "https://...",
    "phone": "+61...",
    "email": "info@...",
    "address": "123 Main St",
    "city": "Sydney",
    "state": "NSW",
    "country": "Australia",
    "description": "...",
    "logo_url": "...",
    "facebook_url": "...",
    "linkedin_url": "..."
  }
}
```

#### `GET /jobs/:id/events` — Pipeline event timeline

```
GET /jobs/:id/events?limit=200
```

```json
{
  "events": [
    {
      "id": "uuid",
      "job_id": "uuid",
      "kind": "status",
      "level": "info",
      "phase": "scraping",
      "message": "Status: pending → processing",
      "data": { "from": "pending", "to": "processing" },
      "created_at": "2026-08-11T04:01:00Z"
    }
  ]
}
```

#### `GET /jobs/:id/agent-runs` — Agent extraction run history

```json
{ "runs": [{ "id": "uuid", "job_id": "uuid", "provider": "...", "started_at": "...", "status": "..." }] }
```

#### `POST /jobs/:id/pause` — Pause pipeline

```json
// Response
{ "updated": true }
```

#### `POST /jobs/:id/resume` — Resume pipeline

Re-dispatches to the extraction queue.

```json
{ "updated": true }
```

#### `POST /jobs/:id/decline` — Decline job

```json
{ "updated": true }
```

#### `POST /jobs/:id/fail` — Mark failed

```json
// Request body
{ "error": "Scraper timeout after 3 retries", "phase": "scraping" }

// Response
{ "updated": true }
```

#### `PATCH /jobs/:id/context` — Update guided URLs / guidance

```json
// Request body
{
  "guided_urls": { "course_list_urls": ["https://..."] },
  "guidance_notes": "Updated guidance"
}

// Response
{ "updated": true }
```

#### `DELETE /jobs/:id` — Delete job (cascades all child data)

```json
{ "updated": true }
```

#### `POST /jobs/:id/merge-duplicates` — Merge duplicate courses (stub)

```json
// Request body
{ "dry_run": true }
```

---

### 2. Queue

#### `GET /jobs/:id/queue` — List queue items

```
GET /jobs/:id/queue?status=pending
```

```json
{
  "queue": [
    {
      "id": "uuid",
      "job_id": "uuid",
      "url": "https://www.university.edu.au/courses/bachelor-of-science",
      "status": "completed",
      "kind": "institution",
      "error": null,
      "retry_count": 0,
      "extracted_data": { "...AI output..." },
      "created_at": "..."
    }
  ]
}
```

#### `POST /queue/:id/ignore` — Skip item

#### `POST /queue/:id/retry` — Reset to pending

#### `POST /queue/:id/pause` — Pause item

#### `POST /queue/:id/stop` — Stop item

#### `POST /queue/:id/resume` — Resume item

#### `DELETE /queue/:id` — Delete item

All return: `{ "updated": true }`

#### `POST /jobs/:id/queue/pause-all` — Pause all pending/processing items

#### `POST /jobs/:id/stop-all` — Stop entire job + processing items

#### `POST /jobs/:id/reset-pipeline` — Delete all queue items, reset counters

---

### 3. Courses

#### `GET /jobs/:id/courses` — List courses for job

```json
{
  "courses": [
    {
      "id": "uuid",
      "job_id": "uuid",
      "name": "Bachelor of Science",
      "degree_level": "Bachelor",
      "subject_area": "Science",
      "duration_weeks": 156,
      "study_mode": "Full-time",
      "description": "...",
      "domestic_fee_total": 32000,
      "domestic_currency": "AUD",
      "international_fee_total": 45000,
      "international_currency": "AUD",
      "source_url": "https://...",
      "verification_status": "unverified",
      "career_paths": ["Research Scientist", "Data Analyst"]
    }
  ]
}
```

#### `GET /jobs/:id/course-links` — Full bundle with all junctions

Returns 13 keys — courses plus all linked entities for the job.

```json
{
  "courses": [...],
  "campuses": [...],
  "course_campuses": [...],
  "intakes": [...],
  "course_intake_assignments": [...],
  "course_fees": [...],
  "course_fee_assignments": [...],
  "eligibility_requirements": [...],
  "course_eligibility_assignments": [...],
  "study_options": [...],
  "course_study_option_assignments": [...],
  "study_units": [...],
  "course_study_unit_assignments": [...]
}
```

#### `POST /jobs/:jobId/courses` — Add manual course

```json
// Request body
{
  "name": "Master of IT",
  "source_url": "https://...",
  "degree_level": "Masters",
  "subject_area": "IT",
  "duration_weeks": 104,
  "study_mode": "Full-time",
  "description": "..."
}

// Response
{ "id": "uuid" }
```

#### `PATCH /courses/:id` — Edit course fields

```json
// Request body (all optional)
{
  "name": "Bachelor of Science (Updated)",
  "degree_level": "Bachelor",
  "domestic_fee_total": 33000,
  "career_paths": ["Data Scientist"]
}

// Response
{ "updated": true }
```

#### `POST /courses/:id/approve`

#### `POST /courses/:id/reject`

Both return: `{ "updated": true }`

#### `GET /courses/:courseId/accreditation-links`

```json
{ "links": [{ "id": "uuid", "course_id": "uuid", "accreditation_id": "uuid", "...accreditation fields" }] }
```

#### `POST /courses/:courseId/accreditation-links`

```json
// Request body
{ "job_id": "uuid", "accreditation_id": "uuid" }

// Response 201
{ "id": "uuid" }
```

#### `DELETE /courses/:courseId/accreditation-links/:accreditationId`

```json
{ "updated": true }
```

---

### 4. Review (Agents, Campuses, Visas, Verification)

#### `GET /jobs/:id/agents`

```json
{
  "agents": [
    {
      "id": "uuid", "job_id": "uuid", "name": "Agent Co",
      "country": "Australia", "email": "...", "phone": "...",
      "website": "...", "location_count": 3, "logo_url": "..."
    }
  ],
  "locations": [
    { "id": "uuid", "agent_id": "uuid", "label": "Head Office", "city": "Sydney", "..." }
  ]
}
```

#### `GET /jobs/:id/mara-agents`

```json
{ "agents": [...] }
```

#### `PATCH /agents/:id`

```json
// Request body (all optional)
{ "name": "Updated Name", "email": "new@email.com", "city": "Melbourne" }
```

#### `POST /agents/:id/approve`

#### `POST /agents/:id/reject`

#### `GET /jobs/:id/campuses`

```json
{ "campuses": [{ "id": "uuid", "name": "Main Campus", "city": "Sydney", "..." }] }
```

#### `PATCH /campuses/:id`

```json
{ "name": "Updated Campus", "postcode": "2000" }
```

#### `GET /jobs/:id/visas`

```json
{ "visas": [...] }
```

#### `GET /jobs/:id/verification-results`

```json
{
  "results": [
    {
      "id": "uuid", "course_id": "uuid",
      "field_name": "international_fee_total",
      "extracted_value": "45000",
      "live_value": "46000",
      "status": "mismatch"
    }
  ]
}
```

---

### 5. Staged Entities (Create/Delete child records)

#### Study Options

`POST /study-options`
```json
{
  "job_id": "uuid",
  "course_id": "uuid",
  "name": "On-campus Full-time",
  "study_mode": "on_campus",
  "study_load": "full_time",
  "duration_value": 3,
  "duration_unit": "years",
  "applicable_to": "both"
}
```

`PATCH /study-options/:id`
```json
{ "study_mode": "online", "duration_value": 4 }
```

`DELETE /study-options/:id`

#### Course Fees

`POST /course-fees`
```json
{
  "job_id": "uuid",
  "name": "International Annual Fee",
  "student_type": "international",
  "period_type": "Per Year",
  "currency": "AUD",
  "total_amount": 45000,
  "installments": [{ "label": "Semester 1", "amount": 22500 }]
}
```

`DELETE /course-fees/:id`

#### Intakes

`POST /intakes`
```json
{
  "job_id": "uuid",
  "intake_name": "February 2027",
  "start_date": "2027-02-15",
  "end_date": "2027-06-30",
  "admission_deadline": "2026-12-01",
  "intake_month": 2,
  "intake_year": 2027
}
```

`DELETE /intakes/:id`

#### Eligibility Requirements

`POST /eligibility-requirements`
```json
{
  "job_id": "uuid",
  "name": "Undergraduate Entry",
  "applicable_to": "international",
  "min_degree_level": "High School",
  "min_score_percent": 65,
  "academic_tests": [{ "test": "SAT", "min_score": 1200 }],
  "language_tests": [{ "test": "IELTS", "min_overall": 6.5 }]
}
```

`DELETE /eligibility-requirements/:id`

#### Study Units

`POST /study-units`
```json
{
  "job_id": "uuid",
  "unit_name": "Introduction to Programming",
  "unit_code": "COMP1010",
  "credit_points": 6,
  "description": "..."
}
```

`DELETE /study-units/:id`

#### Staged Accreditations

`POST /staged-accreditations`
```json
{
  "name": "AACSB",
  "issuing_organization": "AACSB International",
  "website": "https://www.aacsb.edu",
  "description": "Business school accreditation"
}
```

`DELETE /staged-accreditations/:id`

#### Agents & Campuses (Manual CRUD)

`POST /agents`
```json
{ "job_id": "uuid", "name": "Agent Co", "country": "India", "email": "...", "phone": "...", "website": "..." }
```

`DELETE /agents/:id`

`POST /campuses`
```json
{ "job_id": "uuid", "name": "City Campus", "address": "...", "city": "Melbourne", "state": "VIC", "country": "Australia", "postcode": "3000" }
```

`DELETE /campuses/:id`

#### Junctions (Link/Unlink course ↔ entity)

Available junction slugs: `study-options`, `course-fees`, `intakes`, `eligibility-requirements`, `study-units`, `accreditations`, `campuses`

`POST /junctions/:junction/assign`
```json
{ "job_id": "uuid", "course_id": "uuid", "entity_id": "uuid" }
```

`DELETE /junctions/:junction/assign`
```json
{ "job_id": "uuid", "course_id": "uuid", "entity_id": "uuid" }
```

#### Accreditation Mappings

`PATCH /accreditation-mappings`
```json
{
  "job_id": "uuid",
  "extraction_accreditation_ids": ["uuid1", "uuid2"],
  "accreditation_id": "uuid-of-live-accreditation-or-null"
}
```

---

### 6. Immigration

#### `GET /visas?status=active&limit=100`

#### `GET /mara-agents?status=active&limit=100`

#### `POST /visas/:id/discard`

#### `POST /mara-agents/:id/discard`

#### `POST /visas/:id/promote`
```json
{ "department_business_id": "uuid" }
```

#### `POST /mara-agents/:id/promote`

#### `POST /visas/extract` (503 stub)
```json
{ "source_url": "https://...", "country_code": "AU", "max_visas": 50 }
```

#### `POST /mara-agents/extract` (503 stub)
```json
{ "source_url": "https://...", "state_filter": "NSW", "max_agents": 100 }
```

---

### 7. Supporting (Site Profiles, Lessons, Save & Learn)

#### `GET /site-profiles?search=university&limit=200`

#### `GET /jobs/:id/site-profile`

#### `PUT /site-profiles` — Upsert
```json
{
  "domain": "university.edu.au",
  "canonical_institution_name": "University of Example",
  "fee_format_hint": "Fees shown per semester, multiply by 2",
  "intake_format_hint": "Month names only",
  "notes": "Course pages use /program/ prefix"
}
```

#### `GET /lessons?domain=university.edu.au&step=extraction&scope=domain&active_only=true&limit=200`

#### `PATCH /lessons/:id`
```json
{ "is_active": false }
```

#### `DELETE /lessons/:id`

#### `POST /save-and-learn` — Patch a record + store correction in extraction_memory
```json
{
  "table": "extraction_courses",
  "id": "uuid-of-course",
  "patch": { "domestic_fee_total": 35000, "domestic_currency": "AUD" },
  "job_id": "uuid-of-job",
  "source_url": "https://..."
}
```

Valid tables: `extraction_courses`, `extraction_institution_overview`, `extraction_campuses`, `extraction_agents`, `extraction_intakes`, `extraction_course_fees`, `extraction_eligibility_requirements`, `extraction_study_units`, `extraction_accreditations`

---

### 8. Promote

#### `POST /:jobId/promote` — Promote to live catalog (stub)

Currently marks status as `exported`. Full promotion logic TBD when catalog tables exist.

```json
{ "updated": true }
```

---

## Postman Testing Guide

### Prerequisites

1. Backend running: `cd backend && npm run dev`
2. Migrations run: `npm run migrate:globalyapp && npm run migrate:superadmin`
3. Seeds run: `npm run seed:globalyapp && npm run seed:superadmin`
4. LavinMQ running on localhost:5672 (needed for workers)

### Step 1: Get an admin JWT

```
POST http://localhost:3000/api/v3/auth/send-otp
Content-Type: application/json

{ "email": "admin@globalyhub.com" }
```

Then verify (check the seeded admin email, or check server logs for OTP):

```
POST http://localhost:3000/api/v3/auth/verify-otp
Content-Type: application/json

{ "email": "admin@globalyhub.com", "otp": "123456" }
```

Save the `access_token` from the response. The token must have `type: "admin"`.

### Step 2: Create an extraction job (minimal — URL only)

```
POST http://localhost:3000/api/v3/admin/data-extraction/jobs
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "institution_url": "https://www.example-university.edu.au"
}
```

Response: `{ "id": "abc-123-..." }`

### Step 3: Create an extraction job (guided — full wizard)

```
POST http://localhost:3000/api/v3/admin/data-extraction/jobs
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "institution_url": "https://www.example-university.edu.au",
  "source_type": "institution",
  "business_category_id": 1,
  "service_category_id": 1,
  "sample_course_url": "https://www.example-university.edu.au/courses/bachelor-of-arts",
  "guidance_notes": "Fees are per semester. CRICOS codes in sidebar.",
  "guided_urls": {
    "course_list_urls": ["https://www.example-university.edu.au/courses"],
    "contact_urls": ["https://www.example-university.edu.au/contact"],
    "branches_urls": ["https://www.example-university.edu.au/campuses"],
    "agents_urls": [],
    "extract_fields": ["description", "fees", "intakes", "eligibility", "campus_locations"]
  }
}
```

### Step 4: Check job status

```
GET http://localhost:3000/api/v3/admin/data-extraction/jobs/<job-id>
Authorization: Bearer <access_token>
```

### Step 5: List jobs with filters

```
GET http://localhost:3000/api/v3/admin/data-extraction/jobs-filtered?statuses=pending,processing,review&limit=50
Authorization: Bearer <access_token>
```

### Step 6: View pipeline events

```
GET http://localhost:3000/api/v3/admin/data-extraction/jobs/<job-id>/events?limit=50
Authorization: Bearer <access_token>
```

### Step 7: View extracted data (after workers finish)

```
GET http://localhost:3000/api/v3/admin/data-extraction/jobs/<job-id>/courses
GET http://localhost:3000/api/v3/admin/data-extraction/jobs/<job-id>/course-links
GET http://localhost:3000/api/v3/admin/data-extraction/jobs/<job-id>/agents
GET http://localhost:3000/api/v3/admin/data-extraction/jobs/<job-id>/campuses
GET http://localhost:3000/api/v3/admin/data-extraction/jobs/<job-id>/verification-results
```

### Step 8: Review — approve a course

```
POST http://localhost:3000/api/v3/admin/data-extraction/courses/<course-id>/approve
Authorization: Bearer <access_token>
```

### Step 9: Correct a course + teach the AI

```
POST http://localhost:3000/api/v3/admin/data-extraction/save-and-learn
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "table": "extraction_courses",
  "id": "<course-id>",
  "patch": { "domestic_fee_total": 35000 },
  "job_id": "<job-id>",
  "source_url": "https://..."
}
```

### Step 10: Control pipeline

```
POST .../jobs/<job-id>/pause
POST .../jobs/<job-id>/resume
POST .../jobs/<job-id>/decline
POST .../jobs/<job-id>/reset-pipeline
DELETE .../jobs/<job-id>
```

### Testing without workers

If you don't want to run workers, you can test the API layer independently:

1. Create a job (it will stay in `pending` status)
2. Manually insert test data:
   ```sql
   INSERT INTO superadmin.extraction_courses (job_id, name, degree_level)
   VALUES ('<job-id>', 'Test Course', 'Bachelor');
   ```
3. Use the GET/PATCH/approve/reject endpoints to verify CRUD works
4. The queue, events, and junction endpoints all work without workers running

### Environment for workers

To run the full pipeline with workers, you also need:
- `GEMINI_API_KEY` — Google AI API key
- `CRAWL4AI_BASE_URL` — Crawl4AI instance URL (or `FIRECRAWL_API_KEY` as fallback)
- LavinMQ running

Start workers in separate terminals:
```bash
npm run job:extraction          # site analysis + URL discovery
npm run job:extraction-pages    # course extraction (auto-scales)
npm run job:extraction-verify   # data verification
```

---

## Job Status Lifecycle

```
pending → processing → review → verified → approved → exported → done
              ↓
           failed ← (any error)
              ↓
         paused (admin) → resume → extracting
              ↓
         declined (admin)
```

Valid statuses: `pending`, `processing`, `stalled`, `extracting`, `paused`, `failed`, `declined`, `review`, `verified`, `approved`, `done`, `exported`
