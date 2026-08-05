# V3 Extraction — Parity Checklist

Tracks whether every V2 endpoint has a V3 implementation.
Source: `docs/extraction-v2-endpoints.md`.

## Tables (32/32)

All 32 V2 extraction tables have V3 migrations in `database/migrations/superadmin/`.

| Migration file | Tables |
|---|---|
| `20260805_001_admin_audit_logs.ts` | admin_audit_logs (new V3 table) |
| `20260805_002_extraction_standalone.ts` | extraction_jobs, extraction_accreditations, extraction_site_profiles, extraction_lessons |
| `20260805_003_extraction_job_children.ts` | extraction_job_events, extraction_queue, extraction_institution_overview, extraction_site_intelligence, extraction_campuses, extraction_courses, extraction_agents, extraction_additional_info, extraction_memory |
| `20260805_004_extraction_staged_entities.ts` | extraction_intakes, extraction_course_fees, extraction_eligibility_requirements, extraction_english_requirements, extraction_study_options, extraction_study_units, extraction_verification_results, extraction_agent_locations |
| `20260805_005_extraction_junctions.ts` | extraction_course_campuses, extraction_course_intake_assignments, extraction_course_fee_assignments, extraction_course_eligibility_assignments, extraction_course_study_option_assignments, extraction_course_study_unit_assignments, extraction_course_accreditation_assignments |
| `20260805_006_extraction_immigration.ts` | extraction_visas, extraction_mara_agents, agent_extraction_runs, agent_extraction_schedule |

## Endpoints — extraction-control.ts

| V2 Ref | Method | Path | V3 Status |
|---|---|---|---|
| C1 | POST | /queue/:id/ignore | Done — queue.routes.ts |
| C2 | POST | /queue/:id/retry | Done — queue.routes.ts |
| C3 | POST | /queue/:id/pause | Done — queue.routes.ts |
| C4 | POST | /queue/:id/stop | Done — queue.routes.ts |
| C5 | POST | /queue/:id/resume | Done — queue.routes.ts |
| C6 | DELETE | /queue/:id | Done — queue.routes.ts |
| C7 | POST | /jobs/:id/queue/pause-all | Done — queue.routes.ts |
| C8 | POST | /jobs/:id/stop-all | Done — queue.routes.ts |
| C9 | POST | /jobs/:id/reset-pipeline | Done — queue.routes.ts |
| C10 | POST | /jobs/:id/decline | Done — jobs.routes.ts |
| C11 | POST | /jobs/:id/pause | Done — jobs.routes.ts |
| C12 | POST | /jobs/:id/resume | Done — jobs.routes.ts |
| C13 | DELETE | /jobs/:id | Done — jobs.routes.ts |
| C14 | PATCH | /jobs/:id/context | Done — jobs.routes.ts |
| C15 | POST | /jobs/:jobId/courses | Done — courses.routes.ts |
| C16 | POST | /jobs/:id/merge-duplicates | Stub — SQL RPC not in repo |

## Endpoints — extraction-extras.ts

| V2 Ref | Method | Path | V3 Status |
|---|---|---|---|
| E1 | GET | /jobs/:id/agent-runs | Done — jobs.routes.ts |
| E2 | GET | /jobs-filtered | Done — jobs.routes.ts |
| E3 | POST | /jobs | Done — jobs.routes.ts |
| E4 | POST | /jobs/:id/fail | Done — jobs.routes.ts |
| E5 | GET | /courses/:courseId/accreditation-links | Done — courses.routes.ts |
| E6 | POST | /courses/:courseId/accreditation-links | Done — courses.routes.ts |
| E7 | DELETE | /courses/:courseId/accreditation-links/:accreditationId | Done — courses.routes.ts |
| E8 | PUT | /site-profiles | Done — supporting.routes.ts |
| E9 | PATCH | /lessons/:id | Done — supporting.routes.ts |
| E10 | DELETE | /lessons/:id | Done — supporting.routes.ts |

## Endpoints — extraction-promote.ts

| V2 Ref | Method | Path | V3 Status |
|---|---|---|---|
| P1 | POST | /:jobId/promote | Stub — live catalog tables don't exist yet |

## Endpoints — extraction-immigration.ts

| V2 Ref | Method | Path | V3 Status |
|---|---|---|---|
| I1 | GET | /visas | Done — immigration.routes.ts |
| I2 | GET | /mara-agents | Done — immigration.routes.ts |
| I3 | POST | /visas/:id/discard | Done — immigration.routes.ts |
| I4 | POST | /mara-agents/:id/discard | Done — immigration.routes.ts |
| I5 | POST | /visas/:id/promote | Stub — SQL RPC not in repo |
| I6 | POST | /mara-agents/:id/promote | Stub — SQL RPC not in repo |
| I7 | POST | /visas/extract | 503 stub (matches V2) |
| I8 | POST | /mara-agents/extract | 503 stub (matches V2) |

## Endpoints — extraction-review/*

| V2 Ref | Method | Path | V3 Status |
|---|---|---|---|
| RJ1 | GET | /jobs | Done — jobs.routes.ts |
| RJ2 | GET | /jobs/:id | Done — jobs.routes.ts |
| RJ3 | GET | /jobs/:id/events | Done — jobs.routes.ts |
| RJ4 | GET | /jobs/:id/queue | Done — queue.routes.ts |
| RC1 | GET | /jobs/:id/courses | Done — courses.routes.ts |
| RC2 | GET | /jobs/:id/course-links | Done — courses.routes.ts |
| RC3 | PATCH | /courses/:id | Done — courses.routes.ts |
| RC4 | POST | /courses/:id/approve | Done — courses.routes.ts |
| RC5 | POST | /courses/:id/reject | Done — courses.routes.ts |
| RA1 | GET | /jobs/:id/agents | Done — review.routes.ts |
| RA2 | GET | /jobs/:id/mara-agents | Done — review.routes.ts |
| RA3 | PATCH | /agents/:id | Done — review.routes.ts |
| RA4 | POST | /agents/:id/approve | Done — review.routes.ts |
| RA5 | POST | /agents/:id/reject | Done — review.routes.ts |
| RCa1 | GET | /jobs/:id/campuses | Done — review.routes.ts |
| RCa2 | PATCH | /campuses/:id | Done — review.routes.ts |
| RCa3 | GET | /jobs/:id/visas | Done — review.routes.ts |
| RCa4 | GET | /jobs/:id/verification-results | Done — review.routes.ts |

## Endpoints — extraction-staged/*

| V2 Ref | Method | Path | V3 Status |
|---|---|---|---|
| SO1 | POST | /study-options | Done — staged.routes.ts |
| SO2 | PATCH | /study-options/:id | Done — staged.routes.ts |
| SO3 | DELETE | /study-options/:id | Done — staged.routes.ts |
| CE1 | POST | /course-fees | Done — staged.routes.ts |
| CE2 | DELETE | /course-fees/:id | Done — staged.routes.ts |
| CE3 | POST | /intakes | Done — staged.routes.ts |
| CE4 | DELETE | /intakes/:id | Done — staged.routes.ts |
| CE5 | POST | /eligibility-requirements | Done — staged.routes.ts |
| CE6 | DELETE | /eligibility-requirements/:id | Done — staged.routes.ts |
| CE7 | POST | /study-units | Done — staged.routes.ts |
| CE8 | DELETE | /study-units/:id | Done — staged.routes.ts |
| SA1 | POST | /staged-accreditations | Done — staged.routes.ts |
| SA2 | DELETE | /staged-accreditations/:id | Done — staged.routes.ts |
| AC1 | POST | /agents | Done — staged.routes.ts |
| AC2 | DELETE | /agents/:id | Done — staged.routes.ts |
| AC3 | POST | /campuses | Done — staged.routes.ts |
| AC4 | DELETE | /campuses/:id | Done — staged.routes.ts |
| J1 | POST | /junctions/:junction/assign | Done — staged.routes.ts |
| J2 | DELETE | /junctions/:junction/assign | Done — staged.routes.ts |
| J3 | PATCH | /accreditation-mappings | Done — staged.routes.ts |

## Endpoints — extraction-staged/reference-reads.ts

| V2 Ref | Method | Path | V3 Status |
|---|---|---|---|
| RR1 | GET | /site-profiles | Done — supporting.routes.ts |
| RR2 | GET | /jobs/:id/site-profile | Done — supporting.routes.ts |
| RR3 | GET | /lessons | Done — supporting.routes.ts |
| RR4 | GET | /verification-queue | Skipped — reads non-extraction table (data_verification_queue) |
| RR5 | GET | /scrape-smoke-results | Skipped — reads non-extraction table (scrape_smoke_results) |

## Endpoints — save-and-learn.ts

| V2 Ref | Method | Path | V3 Status |
|---|---|---|---|
| SL1 | POST | /save-and-learn | Done — supporting.routes.ts |

## V2 Bug Fixes in V3

| Bug | V2 Ref | Fix |
|---|---|---|
| B1 | save-and-learn uses default admin gate (data_admin + super_admin) | V3 allows both super_admin and data_admin for all extraction endpoints |
| B2 | save-and-learn does not write admin_logs | Fixed — V3 save-and-learn calls logAudit() |
| B7 | DELETE endpoints return 200 even when row didn't exist | Not fixed — matches V2 behavior for staged entity deletes (FK CASCADE handles cleanup) |

## Intentional Deviations from V2

| What | Why |
|---|---|
| All tables in `superadmin` schema, not `public` | V3 architecture decision |
| No RLS policies | V3 uses application-layer auth (super_admin + data_admin) |
| 4 additional UNIQUE constraints on junction tables | V2 oversight fix (see decisions doc) |
| `admin_audit_logs` replaces `admin_logs` | Structured with entity_type/entity_id for better querying |
| extraction_memory: no embedding column | Added when LLM memory search is implemented |
| Pipeline trigger stubs (RR4, RR5) | Non-extraction tables, not in scope |

## Stubs Requiring Follow-Up

| Stub | Blocked on |
|---|---|
| P1 promote (marks as exported, doesn't create catalog entries) | Live catalog tables (businesses, business_services, etc.) |
| C16 merge-duplicates | SQL function `merge_extraction_job_duplicates` |
| I5 promote-visa | SQL function `promote_visa_to_service` |
| I6 promote-mara | SQL function `promote_mara_to_business` |
| extraction_memory embedding | pgvector extension + LLM key config |
