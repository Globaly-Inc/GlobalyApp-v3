# V2 Extraction Endpoints & Write Paths

> **Source files** (all under `/home/user/Documents/Priansu/Globalyhub/GlobalyApp-V2/apps/ai-service/src/`)
>
> - `routes/extraction-control.ts`
> - `routes/extraction-extras.ts`
> - `routes/extraction-promote.ts`
> - `routes/extraction-immigration.ts`
> - `routes/extraction-review/index.ts`, `shared.ts`, `jobs.ts`, `courses.ts`, `agents.ts`, `campuses.ts`
> - `routes/extraction-staged/index.ts`, `study-options.ts`, `child-entities.ts`, `junctions.ts`, `staged-accreditations.ts`, `agents-campuses.ts`, `reference-reads.ts`
> - `routes/save-and-learn.ts`
> - `lib/promote-courses.ts`, `lib/promote-helpers.ts`

---

## Table of Contents

1. [Endpoint Inventory](#1-endpoint-inventory)
2. [Multi-Step Side Effects](#2-multi-step-side-effects)
3. [SQL Functions](#3-sql-functions)
4. [Status Transitions](#4-status-transitions)
5. [Non-Route Write Paths](#5-non-route-write-paths)
6. [Bugs & Anomalies](#6-bugs--anomalies)

---

## 1. Endpoint Inventory

### Auth pattern

All endpoints use `requireUser` (JWT) then `makeAsAdmin` which calls
`withUser(pool, claims, db => assertAdmin(db, uid, ["super_admin"]))`.
The `assertAdmin` function checks the `user_roles` table for a matching
`super_admin` role. Default would be `["super_admin", "data_admin"]` but
extraction routes explicitly pass `["super_admin"]` only.

**Exception:** `POST .../promote` calls `assertAdmin` directly with
`["super_admin"]` instead of using `makeAsAdmin`.

### extraction-control.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| C1 | POST | `/admin/extraction/queue/:id/ignore` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_queue (status→ignored), admin_logs |
| C2 | POST | `/admin/extraction/queue/:id/retry` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_queue (status→pending, error→null, extractedData→null, failureClass→null, retryCount→0), admin_logs |
| C3 | POST | `/admin/extraction/queue/:id/pause` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_queue (status→paused), admin_logs |
| C4 | POST | `/admin/extraction/queue/:id/stop` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_queue (status→stopped), admin_logs |
| C5 | POST | `/admin/extraction/queue/:id/resume` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_queue (status→pending, error→null), admin_logs |
| C6 | DELETE | `/admin/extraction/queue/:id` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_queue (DELETE row), admin_logs |
| C7 | POST | `/admin/extraction/jobs/:id/queue/pause-all` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403 | — | extraction_queue (all pending/processing→paused for job), admin_logs |
| C8 | POST | `/admin/extraction/jobs/:id/stop-all` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_jobs (status→paused), extraction_queue (processing→paused for job), admin_logs |
| C9 | POST | `/admin/extraction/jobs/:id/reset-pipeline` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_jobs (status→pending, counters→0, heartbeat→null, pipeline→waiting), extraction_queue (DELETE all for job), admin_logs |
| C10 | POST | `/admin/extraction/jobs/:id/decline` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_jobs (status→declined), admin_logs |
| C11 | POST | `/admin/extraction/jobs/:id/pause` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_jobs (status→paused), admin_logs |
| C12 | POST | `/admin/extraction/jobs/:id/resume` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_jobs (status→extracting, errorMessage→null, heartbeat→null), admin_logs |
| C13 | DELETE | `/admin/extraction/jobs/:id` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_jobs (DELETE row; FK CASCADE deletes queue+courses+all children), admin_logs |
| C14 | PATCH | `/admin/extraction/jobs/:id/context` | super_admin | params: `{id: uuid}`, body: `{guided_urls?: object\|null, guidance_notes?: string\|null}` | `{updated:true}` | 200,401,403,404 | — | extraction_jobs (guidedUrls, guidanceNotes), admin_logs |
| C15 | POST | `/admin/extraction/jobs/:jobId/courses` | super_admin | params: `{jobId: uuid}`, body: `{name: string, source_url?, degree_level?, subject_area?, duration_weeks?, study_mode?, description?}` | `{id: string}` | 200,401,403 | — | extraction_courses (INSERT with verificationStatus="manual"), admin_logs |
| C16 | POST | `/admin/extraction/jobs/:id/merge-duplicates` | super_admin | params: `{id: uuid}`, body: `{dry_run: boolean}` | `Record<string,unknown>` (RPC result) | 200,401,403 | — | Calls `merge_extraction_job_duplicates(jobId, dry_run)` SQL RPC, admin_logs |

### extraction-extras.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| E1 | GET | `/admin/extraction/jobs/:id/agent-runs` | super_admin | params: `{id: uuid}` | `{runs: [...]}` | 200,401,403 | agent_extraction_runs | — |
| E2 | GET | `/admin/extraction/jobs-filtered` | super_admin | query: `{statuses?: csv, source_type?, exclude_source_type?, limit?: max500 default100}` | `{jobs: [...]}` | 200,401,403 | extraction_jobs, extraction_campuses (count), extraction_agents (count) | — |
| E3 | POST | `/admin/extraction/jobs` | super_admin | body: `{institution_url: string, institution_name?, source_type?, business_category_id?, service_category_id?, guided_urls?, guidance_notes?, sample_course_url?, supporting_documents?, pipeline_progress?}` | `{id: string}` | 201,401,403 | — | extraction_jobs (INSERT), admin_logs |
| E4 | POST | `/admin/extraction/jobs/:id/fail` | super_admin | params: `{id: uuid}`, body: `{error?: string, phase?: string}` | `{updated:true}` | 200,401,403,404 | — | extraction_jobs (status→failed, optionally pipelineProgress), admin_logs |
| E5 | GET | `/admin/extraction/courses/:courseId/accreditation-links` | super_admin | params: `{courseId: uuid}` | `{accreditations: [...]}` | 200,401,403 | extraction_course_accreditation_assignments JOIN accreditations | — |
| E6 | POST | `/admin/extraction/courses/:courseId/accreditation-links` | super_admin | params: `{courseId: uuid}`, body: `{job_id: uuid, accreditation_id: uuid}` | `{id: string}` | 201,401,403 | — | extraction_course_accreditation_assignments (INSERT), admin_logs |
| E7 | DELETE | `/admin/extraction/courses/:courseId/accreditation-links/:accreditationId` | super_admin | params: `{courseId: uuid, accreditationId: uuid}` | `{deleted:true}` | 200,401,403 | — | extraction_course_accreditation_assignments (DELETE by courseId+accreditationId), admin_logs |
| E8 | PUT | `/admin/extraction/site-profiles` | super_admin | body: `{domain: string, canonical_institution_name?, canonical_legal_name?, fee_format_hint?, intake_format_hint?, notes?}` | `{updated:true}` | 200,401,403 | — | extraction_site_profiles (UPSERT on domain), admin_logs |
| E9 | PATCH | `/admin/extraction/lessons/:id` | super_admin | params: `{id: uuid}`, body: `{is_active: boolean}` | `{updated:true}` | 200,401,403,404 | — | extraction_lessons (isActive, updatedAt), admin_logs |
| E10 | DELETE | `/admin/extraction/lessons/:id` | super_admin | params: `{id: uuid}` | `{deleted:true}` | 200,401,403 | — | extraction_lessons (DELETE), admin_logs |

### extraction-promote.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| P1 | POST | `/admin/extraction/:jobId/promote` | super_admin | params: `{jobId: uuid}` | PromoteResult (see below) | 200,400,401,403,404 | extraction_jobs, extraction_institution_overview, extraction_campuses, extraction_courses, extraction_course_fees, extraction_course_fee_assignments, extraction_intakes, extraction_course_intake_assignments, extraction_english_requirements, extraction_eligibility_requirements, extraction_course_eligibility_assignments, extraction_course_campuses, extraction_course_accreditation_assignments, extraction_agents, accreditations | businesses, business_branches, credit_wallets, business_allowed_categories, business_services, service_fees, service_fee_assignments, service_intakes, service_eligibility_requirements, service_eligibility_assignments, service_branch_sharing, representations, extraction_jobs (status→exported), admin_logs |

**PromoteResult shape:**
```
{ business_id, business_created, branches_created, branches_reused,
  services_inserted, services_reused, fees_inserted, fee_assignments_created,
  intakes_inserted, eligibility_inserted, eligibility_assignments_created,
  sharing_rows_created, agents_created, agents_reused, representations_created }
```

### extraction-immigration.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| I1 | GET | `/admin/extraction/visas` | super_admin | query: `{status?, limit?: max200 default100}` | `{visas: [...]}` | 200,401,403 | extraction_visas | — |
| I2 | GET | `/admin/extraction/mara-agents` | super_admin | query: `{status?, limit?: max200 default100}` | `{mara_agents: [...]}` | 200,401,403 | extraction_mara_agents | — |
| I3 | POST | `/admin/extraction/visas/:id/discard` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_visas (status→discarded), admin_logs |
| I4 | POST | `/admin/extraction/mara-agents/:id/discard` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_mara_agents (status→discarded), admin_logs |
| I5 | POST | `/admin/extraction/visas/:id/promote` | super_admin | params: `{id: uuid}`, body: `{department_business_id: uuid}` | `{id: string}` | 200,401,403 | — | Calls `promote_visa_to_service(id, dept_biz_id)` SQL RPC, admin_logs |
| I6 | POST | `/admin/extraction/mara-agents/:id/promote` | super_admin | params: `{id: uuid}` | `{id: string}` | 200,401,403 | — | Calls `promote_mara_to_business(id)` SQL RPC, admin_logs |
| I7 | POST | `/admin/extraction/visas/extract` | super_admin | body: `{source_url: url, country_code: string(min2), max_visas?: int(1-200)}` | `{status:"queued"}` | 202,401,403,503 | — | **Nothing** (stub; returns 503 via requireProvider) |
| I8 | POST | `/admin/extraction/mara-agents/extract` | super_admin | body: `{source_url: url, state_filter?, max_agents?: int(1-200)}` | `{status:"queued"}` | 202,401,403,503 | — | **Nothing** (stub; returns 503 via requireProvider) |

### extraction-review/jobs.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| RJ1 | GET | `/admin/extraction/jobs` | super_admin | query: `{status?, q?, limit?: max200 default100}` | `{jobs: [...], counts: {status: count}}` | 200,401,403 | extraction_jobs (list + GROUP BY status count) | — |
| RJ2 | GET | `/admin/extraction/jobs/:id` | super_admin | params: `{id: uuid}` | `{job: {...}, overview: {...}\|null}` | 200,401,403,404 | extraction_jobs, extraction_institution_overview | — |
| RJ3 | GET | `/admin/extraction/jobs/:id/events` | super_admin | params: `{id: uuid}`, query: `{limit?: max500 default200}` | `{events: [...]}` | 200,401,403 | extraction_job_events | — |
| RJ4 | GET | `/admin/extraction/jobs/:id/queue` | super_admin | params: `{id: uuid}`, query: `{status?}` | `{queue: [...]}` | 200,401,403 | extraction_queue | — |

### extraction-review/courses.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| RC1 | GET | `/admin/extraction/jobs/:id/courses` | super_admin | params: `{id: uuid}` | `{courses: [...]}` | 200,401,403 | extraction_courses | — |
| RC2 | GET | `/admin/extraction/jobs/:id/course-links` | super_admin | params: `{id: uuid}` | 13-key bundle (see detail below) | 200,401,403 | extraction_intakes, extraction_study_options, extraction_eligibility_requirements, extraction_course_fees, extraction_study_units, extraction_accreditations, all 7 junction/assignment tables | — |
| RC3 | PATCH | `/admin/extraction/courses/:id` | super_admin | params: `{id: uuid}`, body: partial of `{name, short_name, degree_level, subject_area, duration_weeks, study_mode, description, domestic_fee_total, domestic_currency, international_fee_total, international_currency, awarding_institution, career_paths, source_url}` | `{updated:true}` | 200,401,403,404 | — | extraction_courses (patched fields + updatedAt), admin_logs |
| RC4 | POST | `/admin/extraction/courses/:id/approve` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_courses (verificationStatus→confirmed, lastVerifiedAt→now), admin_logs |
| RC5 | POST | `/admin/extraction/courses/:id/reject` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_courses (verificationStatus→flagged), admin_logs |

**RC2 course-links response shape:**
```
{ intakes, study_options, eligibility_requirements, accreditations,
  course_fees, study_units, intake_assignments, study_option_assignments,
  accreditation_assignments, eligibility_assignments, course_campuses,
  fee_assignments, study_unit_assignments }
```

### extraction-review/agents.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| RA1 | GET | `/admin/extraction/jobs/:id/agents` | super_admin | params: `{id: uuid}` | `{agents: [...], agent_locations: [...]}` | 200,401,403 | extraction_agents, extraction_agent_locations | — |
| RA2 | GET | `/admin/extraction/jobs/:id/mara-agents` | super_admin | params: `{id: uuid}` | `{mara_agents: [...]}` | 200,401,403 | extraction_mara_agents (WHERE jobId) | — |
| RA3 | PATCH | `/admin/extraction/agents/:id` | super_admin | params: `{id: uuid}`, body: partial of `{name, country, email, phone, website, street1, street2, city, state, postcode, address, location_count, logo_url}` | `{updated:true}` | 200,401,403,404 | — | extraction_agents (patched fields + updatedAt), admin_logs |
| RA4 | POST | `/admin/extraction/agents/:id/approve` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_agents (sourceStatus→active), admin_logs |
| RA5 | POST | `/admin/extraction/agents/:id/reject` | super_admin | params: `{id: uuid}` | `{updated:true}` | 200,401,403,404 | — | extraction_agents (sourceStatus→archived), admin_logs |

### extraction-review/campuses.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| RCa1 | GET | `/admin/extraction/jobs/:id/campuses` | super_admin | params: `{id: uuid}` | `{campuses: [...]}` | 200,401,403 | extraction_campuses | — |
| RCa2 | PATCH | `/admin/extraction/campuses/:id` | super_admin | params: `{id: uuid}`, body: partial of `{name, address, city, state, country, phone, email, map_link, postcode}` | `{updated:true}` | 200,401,403,404 | — | extraction_campuses (patched fields + updatedAt), admin_logs |
| RCa3 | GET | `/admin/extraction/jobs/:id/visas` | super_admin | params: `{id: uuid}` | `{visas: [...]}` | 200,401,403 | extraction_visas (WHERE jobId) | — |
| RCa4 | GET | `/admin/extraction/jobs/:id/verification-results` | super_admin | params: `{id: uuid}` | `{results: [...]}` | 200,401,403 | extraction_verification_results | — |

### extraction-staged/study-options.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| SO1 | POST | `/admin/extraction/study-options` | super_admin | body: `{job_id: uuid, course_id?: uuid, name?, study_mode?, study_load?, duration_value?, duration_unit?, applicable_to?, save_for_reuse?}` | `{id: string}` | 200,401,403 | — | extraction_study_options (INSERT), optionally extraction_course_study_option_assignments (INSERT if course_id), admin_logs |
| SO2 | PATCH | `/admin/extraction/study-options/:id` | super_admin | params: `{id: uuid}`, body: partial of writable fields | `{updated:true}` | 200,401,403,404 | — | extraction_study_options (patched fields; no updatedAt — table lacks it), admin_logs |
| SO3 | DELETE | `/admin/extraction/study-options/:id` | super_admin | params: `{id: uuid}` | `{deleted:true}` | 200,401,403 | — | extraction_study_options (DELETE; FK CASCADE deletes assignments), admin_logs |

### extraction-staged/child-entities.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| CE1 | POST | `/admin/extraction/course-fees` | super_admin | body: `{job_id: uuid, name?, student_type?, period_type?, currency?, total_amount?, installments?, save_for_reuse?}` | `{id: string}` | 200,401,403 | — | extraction_course_fees (INSERT), admin_logs |
| CE2 | DELETE | `/admin/extraction/course-fees/:id` | super_admin | params: `{id: uuid}` | `{deleted:true}` | 200,401,403 | — | extraction_course_fees (DELETE; FK CASCADE), admin_logs |
| CE3 | POST | `/admin/extraction/intakes` | super_admin | body: `{job_id: uuid, intake_name?, start_date?, end_date?, orientation_date?, admission_deadline?, intake_month?, intake_year?}` | `{id: string}` | 200,401,403 | — | extraction_intakes (INSERT), admin_logs |
| CE4 | DELETE | `/admin/extraction/intakes/:id` | super_admin | params: `{id: uuid}` | `{deleted:true}` | 200,401,403 | — | extraction_intakes (DELETE; FK CASCADE), admin_logs |
| CE5 | POST | `/admin/extraction/eligibility-requirements` | super_admin | body: `{job_id: uuid, name?, applicable_to?, min_degree_level?, degree_level_id?, score_type?, min_score?, min_score_percent?, description?, academic_tests?, language_tests?}` | `{id: string}` | 200,401,403 | — | extraction_eligibility_requirements (INSERT), admin_logs |
| CE6 | DELETE | `/admin/extraction/eligibility-requirements/:id` | super_admin | params: `{id: uuid}` | `{deleted:true}` | 200,401,403 | — | extraction_eligibility_requirements (DELETE; FK CASCADE), admin_logs |
| CE7 | POST | `/admin/extraction/study-units` | super_admin | body: `{job_id: uuid, unit_name: string(min1), unit_code?, credit_points?, description?, unit_type?}` | `{id: string}` | 200,401,403 | — | extraction_study_units (INSERT), admin_logs |
| CE8 | DELETE | `/admin/extraction/study-units/:id` | super_admin | params: `{id: uuid}` | `{deleted:true}` | 200,401,403 | — | extraction_study_units (DELETE; FK CASCADE), admin_logs |

### extraction-staged/junctions.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| J1 | POST | `/admin/extraction/junctions/:junction/assign` | super_admin | params: `{junction: enum}`, body: `{job_id: uuid, course_id: uuid, entity_id: uuid}` | `{id: string}` | 200,400,401,403 | — | The junction table selected by `:junction` (INSERT), admin_logs |
| J2 | DELETE | `/admin/extraction/junctions/:junction/assign` | super_admin | params: `{junction: enum}`, body: `{job_id: uuid, course_id: uuid, entity_id: uuid}` | `{deleted:true}` | 200,400,401,403 | — | The junction table selected by `:junction` (DELETE by jobId+courseId+entityId), admin_logs |
| J3 | PATCH | `/admin/extraction/accreditation-mappings` | super_admin | body: `{job_id: uuid, extraction_accreditation_ids: uuid[], accreditation_id: uuid\|null}` | `{updated: number}` | 200,401,403 | — | extraction_course_accreditation_assignments (UPDATE accreditationId WHERE jobId + extractionAccreditationId IN [...]), admin_logs |

**`:junction` enum values:** `study-options`, `course-fees`, `intakes`, `eligibility-requirements`, `study-units`, `accreditations`, `campuses`

**Junction → table mapping:**

| Slug | Table | Entity FK column |
|------|-------|-----------------|
| study-options | extraction_course_study_option_assignments | studyOptionId |
| course-fees | extraction_course_fee_assignments | courseFeeId |
| intakes | extraction_course_intake_assignments | intakeId |
| eligibility-requirements | extraction_course_eligibility_assignments | eligibilityRequirementId |
| study-units | extraction_course_study_unit_assignments | studyUnitId |
| accreditations | extraction_course_accreditation_assignments | extractionAccreditationId |
| campuses | extraction_course_campuses | campusId |

### extraction-staged/staged-accreditations.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| SA1 | POST | `/admin/extraction/staged-accreditations` | super_admin | body: `{name: string(min1), issuing_organization?, website?, description?}` | `{id: string}` | 200,401,403 | — | extraction_accreditations (INSERT), admin_logs |
| SA2 | DELETE | `/admin/extraction/staged-accreditations/:id` | super_admin | params: `{id: uuid}` | `{deleted:true}` | 200,401,403 | — | extraction_accreditations (DELETE; FK CASCADE), admin_logs |

### extraction-staged/agents-campuses.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| AC1 | POST | `/admin/extraction/agents` | super_admin | body: `{job_id: uuid, name?, country?, email?, phone?, website?}` | `{id: string}` | 200,401,403 | — | extraction_agents (INSERT), admin_logs |
| AC2 | DELETE | `/admin/extraction/agents/:id` | super_admin | params: `{id: uuid}` | `{deleted:true}` | 200,401,403 | — | extraction_agents (DELETE; FK CASCADE deletes locations), admin_logs |
| AC3 | POST | `/admin/extraction/campuses` | super_admin | body: `{job_id: uuid, name?, address?, city?, state?, country?, phone?, email?, map_link?, postcode?, source_url?}` | `{id: string}` | 200,401,403 | — | extraction_campuses (INSERT), admin_logs |
| AC4 | DELETE | `/admin/extraction/campuses/:id` | super_admin | params: `{id: uuid}` | `{deleted:true}` | 200,401,403 | — | extraction_campuses (DELETE; FK CASCADE), admin_logs |

### extraction-staged/reference-reads.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| RR1 | GET | `/admin/extraction/site-profiles` | super_admin | query: `{search?, limit?: max500 default200}` | `{profiles: [...]}` | 200,401,403 | extraction_site_profiles | — |
| RR2 | GET | `/admin/extraction/jobs/:id/site-profile` | super_admin | params: `{id: uuid}` | `{profile: {...}\|null}` | 200,401,403,404 | extraction_jobs (institutionUrl), extraction_site_profiles (by domain) | — |
| RR3 | GET | `/admin/extraction/lessons` | super_admin | query: `{domain?, step?, scope?, active_only?, limit?: max500 default200}` | `{lessons: [...]}` | 200,401,403 | extraction_lessons | — |
| RR4 | GET | `/admin/extraction/verification-queue` | super_admin | query: `{data_type?, submitter_type?, status?, limit?: max500 default50}` | `{queue: [...]}` | 200,401,403 | data_verification_queue (not an extraction table) | — |
| RR5 | GET | `/admin/extraction/scrape-smoke-results` | super_admin | query: `{function_name?, passed?, limit?: max500 default200}` | `{results: [...]}` | 200,401,403 | scrape_smoke_results (not an extraction table) | — |

### save-and-learn.ts

| # | Method | Path | Role | Params/Query/Body | Success | Codes | Reads | Writes |
|---|--------|------|------|-------------------|---------|-------|-------|--------|
| SL1 | POST | `/admin/extraction/save-and-learn` | super_admin + data_admin (default assertAdmin) | body: `{table: string, id: uuid, patch: Record<string,unknown>, job_id?: uuid, source_url?: string}` | `{success:true}` | 200,400,401,403,404 | The target extraction table (SELECT * WHERE id), extraction_memory (on learn phase) | The target extraction table (UPDATE patched columns), extraction_memory (INSERT + optional UPDATE embedding), admin_logs (not present — see Bugs) |

**Allowed tables in TABLE_MAP:** `extraction_courses`, `extraction_institution_overview`, `extraction_campuses`, `extraction_agents`, `extraction_intakes`, `extraction_course_fees`, `extraction_eligibility_requirements`, `extraction_study_units`, `extraction_accreditations`

---

## 2. Multi-Step Side Effects

### C8 — stop-all

1. UPDATE `extraction_jobs` SET status='paused', updated_at=now() WHERE id=:id (404 if not found)
2. UPDATE `extraction_queue` SET status='paused', updated_at=now() WHERE job_id=:id AND status='processing'
3. INSERT `admin_logs` (action=JOB_STOP_ALL)

### C9 — reset-pipeline

1. UPDATE `extraction_jobs` SET status='pending', total_pages_found=0, courses_extracted=0, pages_scraped=0, pages_failed=0, processing_heartbeat_at=null, pipeline_progress={all stages→waiting}, updated_at=now() WHERE id=:id (404 if not found)
2. DELETE FROM `extraction_queue` WHERE job_id=:id
3. INSERT `admin_logs` (action=JOB_RESET_PIPELINE)

### SO1 — create study option (with optional auto-assign)

1. INSERT `extraction_study_options` (returns id)
2. IF body.course_id: INSERT `extraction_course_study_option_assignments` (jobId, courseId, studyOptionId=new id)
3. INSERT `admin_logs` (action=STUDY_OPTION_CREATE)

### SL1 — save-and-learn (two transactions)

**Transaction 1 (always commits):**
1. SELECT * FROM `extraction_{table}` WHERE id=:id (404 if not found)
2. Validate patch keys against table column schema
3. UPDATE `extraction_{table}` SET ...patch, updated_at=now() WHERE id=:id
4. INSERT `extraction_memory` (jobId, domain derived from source_url, step from table name, aiOutput=original row, finalOutput=merged, diff=patch)

**Transaction 2 (503 if no LLM keys; transaction 1 NOT rolled back):**
5. Call provider.embed(JSON.stringify(finalOutput)) to generate embedding vector
6. UPDATE `extraction_memory` SET embedding=vector, corrected_at=now() WHERE id=memoryId

### P1 — promote (single transaction, 15+ extraction tables read, 13+ live tables written)

**Reads (all scoped to jobId):**
1. SELECT extraction_jobs (validate status in PROMOTABLE_JOB_STATUSES)
2. SELECT extraction_institution_overview (1 row)
3. SELECT extraction_campuses
4. SELECT extraction_courses
5. SELECT extraction_course_fees
6. SELECT extraction_course_fee_assignments
7. SELECT extraction_intakes
8. SELECT extraction_course_intake_assignments
9. SELECT extraction_english_requirements
10. SELECT extraction_eligibility_requirements
11. SELECT extraction_course_eligibility_assignments
12. SELECT extraction_course_campuses
13. SELECT accreditations (full table — live library)
14. SELECT extraction_course_accreditation_assignments
15. SELECT extraction_agents

**Writes — Phase 1: Upsert business:**
16. SELECT businesses WHERE website=:website (lookup by website)
17. SELECT businesses WHERE name ILIKE :name (fallback lookup)
18. If found: UPDATE businesses SET content fields
19. If not found: INSERT businesses (type=institution, status=pending, createdVia=admin_extraction)

**Writes — Phase 2: Branches:**
20. SELECT business_branches WHERE parent=businessId (existing branches)
21. For each campus after the first (sorted by createdAt):
    - If name match in existing branches: reuse
    - Else: INSERT businesses (child), INSERT business_branches, INSERT credit_wallets, SELECT+INSERT business_allowed_categories

**Writes — Phase 3: Courses → services (per course via promoteCourses):**
22. For each course: upsert business_services by name
23. For each fee: dedupe by feeKey → INSERT service_fees or INSERT service_fee_assignments
24. For each intake: dedupe by intakeKey → INSERT service_intakes
25. For each eligibility: dedupe by eligKey → INSERT service_eligibility_requirements or INSERT service_eligibility_assignments
26. For each branch link: INSERT service_branch_sharing (onConflictDoNothing)

**Writes — Phase 4: Agents:**
27. For each agent: lookup businesses by email → website → domain → name
28. If not found: INSERT businesses (type=agent, status=pending), INSERT credit_wallets
29. INSERT representations for each institution+branch (onConflictDoNothing)

**Writes — Phase 5: Finalize:**
30. UPDATE extraction_jobs SET status='exported' WHERE id=jobId
31. INSERT admin_logs (action=EXTRACTION_PROMOTE, details=PromoteResult)

**PROMOTABLE_JOB_STATUSES:** `["approved", "verified", "review", "exported", "done"]`

---

## 3. SQL Functions

### merge_extraction_job_duplicates

**Body:** NOT FOUND IN REPO. The code comments in extraction-control.ts (line 330) explicitly state: _"no migration file for it in this repo"_. The function exists only in the production Supabase database as a SECURITY DEFINER procedure.

**Type signature** (from generated Supabase types.ts):
```typescript
merge_extraction_job_duplicates: {
  Args: { _dry_run?: boolean; _job_id: string }
  Returns: Json
}
```

**Inferred behaviour from call site:** Called with `(jobId, dry_run)`. When `dry_run=true`, returns a preview of what would be merged. When `dry_run=false`, merges duplicate courses within the job. Returns a JSON result object.

**Tables touched:** UNKNOWN — function body not available.

### promote_visa_to_service

**Body:** NOT FOUND IN REPO. Same pattern — SECURITY DEFINER in production DB only.

**Type signature:**
```typescript
promote_visa_to_service: {
  Args: { _department_business_id: string; _extraction_id: string }
  Returns: string
}
```

**Inferred behaviour:** Takes a staged visa id and a department business id. Creates a business_service from the extraction_visas row. Returns the new service id. Updates extraction_visas.promoted_service_id.

**Tables touched (inferred):** extraction_visas (read + update promoted_service_id), business_services (insert). Possibly service_fees, service_eligibility_requirements.

### promote_mara_to_business

**Body:** NOT FOUND IN REPO.

**Type signature:**
```typescript
promote_mara_to_business: {
  Args: { _staged_id: string }
  Returns: string
}
```

**Inferred behaviour:** Takes a staged MARA agent id. Creates an unclaimed business from the extraction_mara_agents row. Returns the new business id. Updates extraction_mara_agents.promoted_business_id.

**Tables touched (inferred):** extraction_mara_agents (read + update promoted_business_id), businesses (insert). Possibly credit_wallets.

---

## 4. Status Transitions

### extraction_jobs.status

| From | To | Endpoint / Code Path |
|------|----|---------------------|
| _(any)_ | pending | C9 reset-pipeline |
| _(any)_ | paused | C8 stop-all, C11 pause |
| _(any)_ | extracting | C12 resume |
| _(any)_ | declined | C10 decline |
| _(any)_ | failed | E4 fail |
| _(any)_ | exported | P1 promote (phase 5) |
| _(new)_ | pending | E3 create job (INSERT with status='pending') |

**Note:** No from-status guard exists on any transition except promote (which checks
`PROMOTABLE_JOB_STATUSES = ["approved", "verified", "review", "exported", "done"]`).
Every other endpoint blindly overwrites status regardless of current value.

**Stall detection:** The partial index `idx_extraction_jobs_status_heartbeat` covers
`status IN ('pending', 'processing', 'stalled')`. The code that performs stall detection
(reading heartbeat, setting status to 'stalled') is NOT in these route files. See
[Non-Route Write Paths](#5-non-route-write-paths).

**DB trigger:** A trigger `sync_pipeline_progress_from_status` is referenced in code
comments (extraction-control.ts and StepActionBar.tsx) as flipping running pipeline stages
to paused when job.status is set to 'paused'. The trigger definition is NOT in this repo.

### extraction_queue.status

| From | To | Endpoint / Code Path |
|------|----|---------------------|
| _(any)_ | ignored | C1 ignore |
| _(any)_ | pending | C2 retry, C5 resume |
| _(any)_ | paused | C3 pause, C7 pause-all (from pending/processing), C8 stop-all (from processing) |
| _(any)_ | stopped | C4 stop |
| _(all for job)_ | _(deleted)_ | C9 reset-pipeline |

**Note:** No from-status guard exists on individual queue item transitions. The bulk
operations (C7, C8) filter by current status (pending/processing) via WHERE clause.

### extraction_visas.status

| From | To | Endpoint / Code Path |
|------|----|---------------------|
| _(any)_ | discarded | I3 discard |
| _(any)_ | promoted | I5 promote (via SQL RPC — inferred) |
| _(new)_ | pending | _(inserted by extraction pipeline, not in routes)_ |

### extraction_mara_agents.status

| From | To | Endpoint / Code Path |
|------|----|---------------------|
| _(any)_ | discarded | I4 discard |
| _(any)_ | promoted | I6 promote (via SQL RPC — inferred) |
| _(new)_ | pending | _(inserted by extraction pipeline, not in routes)_ |

### extraction_courses.verificationStatus

| From | To | Endpoint / Code Path |
|------|----|---------------------|
| _(any)_ | confirmed | RC4 approve |
| _(any)_ | flagged | RC5 reject |
| _(new)_ | manual | C15 create course |
| _(new)_ | unverified | _(default on extraction pipeline insert)_ |

### extraction_agents.sourceStatus

| From | To | Endpoint / Code Path |
|------|----|---------------------|
| _(any)_ | active | RA4 approve |
| _(any)_ | archived | RA5 reject |
| _(new)_ | active | _(default on insert)_ |

---

## 5. Non-Route Write Paths

### 5a. Database trigger: sync_pipeline_progress_from_status

**Referenced in:** extraction-control.ts (line comment at C11), `apps/web/src/components/admin/extraction/StepActionBar.tsx` (line 68 comment)

**Definition:** NOT IN REPO. Exists only in production Supabase database.

**Described behaviour:** When `extraction_jobs.status` is set to `'paused'`, the trigger automatically flips any `pipeline_progress` stage with status `'processing'` to `'paused'`.

**Tables written:** extraction_jobs (pipeline_progress JSONB column)

### 5b. Extraction pipeline workers

The extraction pipeline (site mapping, course discovery, LLM extraction, verification) is **not in this V2 repo**. These are V1 Supabase Edge Functions referenced in comments:

- `supabase/functions/extract-visas` — writes to extraction_visas
- `supabase/functions/extract-mara-agents` — writes to extraction_mara_agents
- `supabase/functions/process-extraction-queue` — writes to extraction_queue, extraction_courses, extraction_institution_overview, extraction_campuses, and other staging tables
- `supabase/functions/save-and-learn` (V1 version) — writes to extraction_memory

**The I7 and I8 endpoints** (`POST .../visas/extract` and `POST .../mara-agents/extract`) are stubs that return 503 via `requireProvider()`. When LLM keys are configured, these would invoke the pipeline logic — but that logic is not present in the V2 ai-service codebase.

### 5c. save-and-learn.ts (route file, but separate auth pattern)

File: `routes/save-and-learn.ts`

This route is listed in Section 1 (SL1) but called out here because:
- It writes to **any of 9 extraction tables** dynamically (via TABLE_MAP)
- It writes to `extraction_memory` (INSERT + UPDATE)
- Its auth gate is `assertAdmin(db, uid)` with **default roles** (`["super_admin", "data_admin"]`), unlike all other extraction routes which pass `["super_admin"]` explicitly
- Phase 2 (embedding) uses `withServiceRole` (bypasses RLS) instead of `withUser`

### 5d. Frontend direct Supabase writes

Multiple admin React components write directly to extraction tables via the Supabase client, bypassing ai-service routes entirely. The route files' own comments document this:

- extraction-control.ts header: _"the admin extraction UI still does directly against Supabase"_
- extraction-staged/ header: _"the admin extraction UI still writes directly to Supabase"_
- Multiple `// ponytail: no ai-service endpoint yet` comments in frontend components

These are NOT routed through the ai-service API. In V3 (no Supabase client), all writes must go through API endpoints.

### 5e. No other write paths found

No writes to extraction tables found in:
- Backend worker processes
- Cron or scheduled functions within this repo
- Seed or backfill scripts
- The core-api service

---

## 6. Bugs & Anomalies

### B1. save-and-learn uses default admin gate (data_admin + super_admin)

All other extraction routes pass `["super_admin"]` to `assertAdmin`. save-and-learn.ts (line 153) calls `assertAdmin(db, claims.sub!)` with no second argument, which defaults to `["super_admin", "data_admin"]`. This means data_admins can edit extraction table rows via save-and-learn but not via any other endpoint.

**Likely intent:** Bug. Should pass `["super_admin"]` like everything else.

### B2. save-and-learn does not write admin_logs

Every other write endpoint calls `logAdmin()` to insert an audit trail in `admin_logs`. save-and-learn.ts does not. The correction is recorded in `extraction_memory` instead, but the `admin_logs` audit trail has a gap.

### B3. No from-status guards on job transitions

Endpoints C10 (decline), C11 (pause), C12 (resume) set job status unconditionally. A job in status='exported' can be declined; a job in status='failed' can be resumed to status='extracting'. Only promote (P1) validates current status.

### B4. resume sets status to 'extracting' — not in any documented enum

C12 sets `status: "extracting"`. This value does not appear in the schema's status defaults, any CHECK constraint (there are none), or the partial index filter (`pending`, `processing`, `stalled`). It is a valid status used by the pipeline but not covered by the heartbeat monitoring index.

### B5. stop-all pauses only processing queue items

C8 (stop-all) sets job status to 'paused' and pauses queue items WHERE `status='processing'`. It does NOT pause `status='pending'` queue items, unlike C7 (pause-all) which pauses both pending and processing. A pending queue item could be picked up by a worker after stop-all completes.

### B6. Promote re-runs are partially idempotent

The promote endpoint allows re-promoting an already-exported job (status='exported' is in PROMOTABLE_JOB_STATUSES). Business and service upserts are deduplicated by name, but fees/intakes/eligibility deduplication relies on content-hash keys that may not be stable if the staged data was edited between promotes. Agent deduplication uses a fallback chain (email → website → domain → name) that could match different businesses on different runs if agent data was edited.

### B7. DELETE endpoints return 200 even when row didn't exist

AC2, AC4, CE2, CE4, CE6, CE8, SA2, SO3 all delete without checking whether the row existed. The DELETE succeeds silently with zero affected rows. Compare to C6 (queue delete) and C13 (job delete) which check `.returning()` and throw 404.

### B8. Course-links response loads full accreditations table fan-out

RC2 (course-links) collects `extraction_accreditation_id` values from assignment rows, then does `WHERE id IN (...)` against `extraction_accreditations`. If assignments reference accreditation IDs that have been deleted, the accreditation data silently drops from the response with no error.

### B9. Promote skips agent contact back-fill

extraction-promote.ts line 437 comment: _"ponytail: V1 also back-fills missing contact/address fields on the existing agent business here. Skipped"_. This means re-promoting a job that added new contact info for a known agent will NOT update the agent's business record.

### B10. study-options table has no updated_at column

The comment in study-options.ts notes: _"extraction_study_options has no updated_at column (unlike its sibling staged tables)"_. PATCH (SO2) updates fields but cannot stamp updated_at. This is a schema inconsistency in V2.
