# V2 Frontend Write Paths to Extraction Tables

> **Finding:** The V2 frontend makes **zero direct Supabase writes** to
> extraction tables. Every write goes through the ai-service HTTP API, routed
> via either:
>
> 1. **Typed React Query hooks** in `apps/web/src/services/ai-extraction/index.ts`
>    (calls `aiApi.POST/PATCH/DELETE` against ai-service endpoints)
> 2. **`saveAndLearn()` helper** in `apps/web/src/lib/saveAndLearn.ts`
>    (calls `aiApi.POST("/admin/extraction/save-and-learn", ...)`)
>
> The route-file comments saying _"the admin extraction UI still does directly
> against Supabase"_ refer to **V1 behaviour that has already been ported**.
> The `ponytail: no ai-service endpoint yet` comments are stale — every
> operation now has a backend endpoint.
>
> **Consequence for V3:** No "new endpoints needed" gap exists. Every
> frontend write already maps to an endpoint documented in
> `docs/extraction-v2-endpoints.md`. V3 needs to implement those same
> endpoints; it does not need to invent additional ones.

---

## 1. Call Sites

### 1a. Writes via ai-extraction service hooks

Each hook in `apps/web/src/services/ai-extraction/index.ts` calls one
ai-service endpoint. The table below maps every mutation hook to its
UI trigger and corresponding backend endpoint.

| Hook | UI Component / Action | Endpoint | Endpoint Doc Ref |
|------|----------------------|----------|-----------------|
| `useCreateExtractionJob()` | ExtractionDashboard → NewExtractionWizard | POST `/admin/extraction/jobs` | E3 |
| `useFailExtractionJob()` | AgentCISImportPanel → Stop button | POST `/admin/extraction/jobs/{id}/fail` | E4 |
| `usePromoteExtractionJob()` | AdminExtractionReview → Publish button | POST `/admin/extraction/{jobId}/promote` | P1 |
| `usePatchExtractionCourse()` | CourseDetailPanel → inline field edits | PATCH `/admin/extraction/courses/{id}` | RC3 |
| `useApproveExtractionCourse()` | CourseDetailPanel → Approve button | POST `/admin/extraction/courses/{id}/approve` | RC4 |
| `useRejectExtractionCourse()` | CourseDetailPanel → Reject button | POST `/admin/extraction/courses/{id}/reject` | RC5 |
| `usePatchExtractionAgent()` | AgentsTab → inline field edits | PATCH `/admin/extraction/agents/{id}` | RA3 |
| `useApproveExtractionAgent()` | AgentsTab → Approve button | POST `/admin/extraction/agents/{id}/approve` | RA4 |
| `useRejectExtractionAgent()` | AgentsTab → Reject button | POST `/admin/extraction/agents/{id}/reject` | RA5 |
| `usePatchExtractionCampus()` | BranchesTab → inline field edits (via hook, not saveAndLearn) | PATCH `/admin/extraction/campuses/{id}` | RCa2 |
| `usePatchJobContext()` | ContextTab → Save guided URLs | PATCH `/admin/extraction/jobs/{id}/context` | C14 |
| `useCreateExtractionCourse()` | CourseDetailPanel → Add Course button | POST `/admin/extraction/jobs/{jobId}/courses` | C15 |
| `useMergeDuplicates()` | AdminExtractionReview → Merge Duplicates button | POST `/admin/extraction/jobs/{id}/merge-duplicates` | C16 |
| `useQueueIgnore()` | CourseQueuePanel → Ignore button | POST `/admin/extraction/queue/{id}/ignore` | C1 |
| `useQueueRetry()` | CourseQueuePanel → Retry button | POST `/admin/extraction/queue/{id}/retry` | C2 |
| `useQueuePause()` | CourseQueuePanel → Pause button | POST `/admin/extraction/queue/{id}/pause` | C3 |
| `useQueueStop()` | CourseQueuePanel → Stop button | POST `/admin/extraction/queue/{id}/stop` | C4 |
| `useQueueResume()` | CourseQueuePanel → Resume button | POST `/admin/extraction/queue/{id}/resume` | C5 |
| `useQueueRemove()` | CourseQueuePanel → Remove button | DELETE `/admin/extraction/queue/{id}` | C6 |
| `usePauseAllPendingQueue()` | PipelineStepsCard → Pause All | POST `/admin/extraction/jobs/{id}/queue/pause-all` | C7 |
| `useStopAllExtraction()` | PipelineStepsCard → Stop All Extraction | POST `/admin/extraction/jobs/{id}/stop-all` | C8 |
| `useResetPipeline()` | AdminExtractionReview → Reset button | POST `/admin/extraction/jobs/{id}/reset-pipeline` | C9 |
| `useDeclineExtractionJob()` | AdminExtractionReview → Decline button | POST `/admin/extraction/jobs/{id}/decline` | C10 |
| `usePauseExtractionJob()` | StepActionBar → Pause | POST `/admin/extraction/jobs/{id}/pause` | C11 |
| `useResumeExtractionJob()` | StepActionBar → Resume | POST `/admin/extraction/jobs/{id}/resume` | C12 |
| `useDeleteExtractionJob()` | AdminExtractionReview → Delete button | DELETE `/admin/extraction/jobs/{id}` | C13 |
| `useCreateStudyOption()` | ExtractionStudyOptionTab → Add | POST `/admin/extraction/study-options` | SO1 |
| `useUpdateStudyOption()` | ExtractionStudyOptionTab → inline edit | PATCH `/admin/extraction/study-options/{id}` | SO2 |
| `useDeleteStudyOption()` | ExtractionStudyOptionTab → Delete | DELETE `/admin/extraction/study-options/{id}` | SO3 |
| `useCreateCourseFee()` | CourseFeeTab → Add Fee | POST `/admin/extraction/course-fees` | CE1 |
| `useDeleteCourseFee()` | CourseFeeTab → Delete | DELETE `/admin/extraction/course-fees/{id}` | CE2 |
| `useCreateIntake()` | IntakeTab → Add Intake | POST `/admin/extraction/intakes` | CE3 |
| `useDeleteIntake()` | IntakeTab → Delete | DELETE `/admin/extraction/intakes/{id}` | CE4 |
| `useCreateEligibilityRequirement()` | EligibilityTab → Add | POST `/admin/extraction/eligibility-requirements` | CE5 |
| `useDeleteEligibilityRequirement()` | EligibilityTab → Delete | DELETE `/admin/extraction/eligibility-requirements/{id}` | CE6 |
| `useCreateStudyUnit()` | StudyUnitTab → Add | POST `/admin/extraction/study-units` | CE7 |
| `useDeleteStudyUnit()` | StudyUnitTab → Delete | DELETE `/admin/extraction/study-units/{id}` | CE8 |
| `useCreateExtractionAgent()` | AgentsTab → Add Agent | POST `/admin/extraction/agents` | AC1 |
| `useDeleteExtractionAgent()` | AgentsTab → Delete | DELETE `/admin/extraction/agents/{id}` | AC2 |
| `useCreateExtractionCampus()` | BranchesTab → Add Branch | POST `/admin/extraction/campuses` | AC3 |
| `useDeleteExtractionCampus()` | BranchesTab → Delete | DELETE `/admin/extraction/campuses/{id}` | AC4 |
| `useJunctionAssign()` | LinkToCoursesPicker / BulkAssignCoursesDialog | POST `/admin/extraction/junctions/{junction}/assign` | J1 |
| `useJunctionUnassign()` | LinkToCoursesPicker / BulkAssignCoursesDialog | DELETE `/admin/extraction/junctions/{junction}/assign` | J2 |
| `useAccreditationMappingUpdate()` | AccreditationsTab → Map to library | PATCH `/admin/extraction/accreditation-mappings` | J3 |
| `linkCourseAccreditation()` | CourseDetailPanel → Link accreditation | POST `/admin/extraction/courses/{courseId}/accreditation-links` | E6 |
| `unlinkCourseAccreditation()` | CourseDetailPanel → Unlink accreditation | DELETE `/admin/extraction/courses/{courseId}/accreditation-links/{accreditationId}` | E7 |
| `useRerunExtraction()` | StepActionBar → Re-run | POST `/admin/extraction/jobs/{jobId}/rerun` | (trigger, 503 stub) |
| `useRunPipelineStep()` | StepActionBar → Run Step | POST `/admin/extraction/run-pipeline-step` | (trigger, 503 stub) |
| `useProcessExtractionQueue()` | PipelineStepsCard → Process Queue | POST `/admin/extraction/process-queue` | (trigger, 503 stub) |
| `useSiteMapTrigger()` | ExtractionDashboard → Site Map | POST `/admin/extraction/site-map` | (trigger, 503 stub) |

### 1b. Writes via saveAndLearn() helper

`saveAndLearn()` is a thin wrapper around `POST /admin/extraction/save-and-learn`
(endpoint SL1). It applies a patch to a staging row AND records it in
`extraction_memory` for the AI learning loop. Used for inline field edits
on rows that the AI extracted (as opposed to admin-created rows).

| File | Line | Table | UI Action |
|------|------|-------|-----------|
| `pages/admin/AdminExtractionReview.tsx` | 669 | `extraction_institution_overview` | patchOverview — inline edit of institution fields (name, email, phone, etc.) |
| `components/admin/extraction/AgentsTab.tsx` | 216 | `extraction_agents` | Inline edit of agent fields (alongside usePatchExtractionAgent for non-learn edits) |
| `components/admin/extraction/BranchesTab.tsx` | 115 | `extraction_campuses` | patchBranch — inline edit of campus fields |
| `components/admin/extraction/CourseFeeTab.tsx` | 97 | `extraction_course_fees` | Save edit on fee creation form |
| `components/admin/extraction/CourseFeeTab.tsx` | 291 | `extraction_course_fees` | Inline edit of existing fee row |
| `components/admin/extraction/IntakeTab.tsx` | 49 | `extraction_intakes` | Save edit on intake creation form |
| `components/admin/extraction/IntakeTab.tsx` | 190 | `extraction_intakes` | Inline edit of existing intake row |
| `components/admin/extraction/EligibilityTab.tsx` | 130 | `extraction_eligibility_requirements` | Save edit on eligibility creation form |
| `components/admin/extraction/StudyUnitTab.tsx` | 34 | `extraction_study_units` | Save edit on study unit creation form |
| `components/admin/extraction/StudyUnitTab.tsx` | 146 | `extraction_study_units` | Inline edit of existing study unit row |
| `components/admin/extraction/AccreditationsTab.tsx` | 555 | `extraction_accreditations` | Inline edit of accreditation name |
| `components/admin/extraction/AccreditationsTab.tsx` | 560 | `extraction_accreditations` | Inline edit of issuing_organization |
| `components/admin/extraction/AccreditationsTab.tsx` | 566 | `extraction_accreditations` | Inline edit of website |

### 1c. Staged accreditation CRUD

| Hook / Function | File | UI Action | Endpoint | Doc Ref |
|-----------------|------|-----------|----------|---------|
| (not a hook — uses ai-service directly) | AccreditationsTab.tsx | Create staged accreditation | POST `/admin/extraction/staged-accreditations` | SA1 |
| (not a hook — uses ai-service directly) | AccreditationsTab.tsx | Delete staged accreditation | DELETE `/admin/extraction/staged-accreditations/{id}` | SA2 |

### 1d. Site profile & lesson management

| Hook / Function | File | UI Action | Endpoint | Doc Ref |
|-----------------|------|-----------|----------|---------|
| (direct ai-service call) | AdminAIMemory | Upsert site profile | PUT `/admin/extraction/site-profiles` | E8 |
| (direct ai-service call) | AdminAIMemory | Toggle lesson active | PATCH `/admin/extraction/lessons/{id}` | E9 |
| (direct ai-service call) | AdminAIMemory | Delete lesson | DELETE `/admin/extraction/lessons/{id}` | E10 |

---

## 2. Coverage Matrix

### Fully covered — every frontend write has a backend endpoint

| Operation | Table(s) | Frontend Path | Backend Endpoint | Doc Ref |
|-----------|----------|--------------|-----------------|---------|
| Create job | extraction_jobs | useCreateExtractionJob | POST /admin/extraction/jobs | E3 |
| Fail job | extraction_jobs | useFailExtractionJob | POST /admin/extraction/jobs/{id}/fail | E4 |
| Pause job | extraction_jobs | usePauseExtractionJob | POST /admin/extraction/jobs/{id}/pause | C11 |
| Resume job | extraction_jobs | useResumeExtractionJob | POST /admin/extraction/jobs/{id}/resume | C12 |
| Decline job | extraction_jobs | useDeclineExtractionJob | POST /admin/extraction/jobs/{id}/decline | C10 |
| Delete job | extraction_jobs | useDeleteExtractionJob | DELETE /admin/extraction/jobs/{id} | C13 |
| Stop all | extraction_jobs + extraction_queue | useStopAllExtraction | POST /admin/extraction/jobs/{id}/stop-all | C8 |
| Reset pipeline | extraction_jobs + extraction_queue | useResetPipeline | POST /admin/extraction/jobs/{id}/reset-pipeline | C9 |
| Update context | extraction_jobs | usePatchJobContext | PATCH /admin/extraction/jobs/{id}/context | C14 |
| Merge duplicates | extraction_jobs (via RPC) | useMergeDuplicates | POST /admin/extraction/jobs/{id}/merge-duplicates | C16 |
| Promote | extraction_jobs + live catalog | usePromoteExtractionJob | POST /admin/extraction/{jobId}/promote | P1 |
| Queue ignore | extraction_queue | useQueueIgnore | POST /admin/extraction/queue/{id}/ignore | C1 |
| Queue retry | extraction_queue | useQueueRetry | POST /admin/extraction/queue/{id}/retry | C2 |
| Queue pause | extraction_queue | useQueuePause | POST /admin/extraction/queue/{id}/pause | C3 |
| Queue stop | extraction_queue | useQueueStop | POST /admin/extraction/queue/{id}/stop | C4 |
| Queue resume | extraction_queue | useQueueResume | POST /admin/extraction/queue/{id}/resume | C5 |
| Queue remove | extraction_queue | useQueueRemove | DELETE /admin/extraction/queue/{id} | C6 |
| Pause all queue | extraction_queue | usePauseAllPendingQueue | POST /admin/extraction/jobs/{id}/queue/pause-all | C7 |
| Create course | extraction_courses | useCreateExtractionCourse | POST /admin/extraction/jobs/{jobId}/courses | C15 |
| Patch course | extraction_courses | usePatchExtractionCourse | PATCH /admin/extraction/courses/{id} | RC3 |
| Approve course | extraction_courses | useApproveExtractionCourse | POST /admin/extraction/courses/{id}/approve | RC4 |
| Reject course | extraction_courses | useRejectExtractionCourse | POST /admin/extraction/courses/{id}/reject | RC5 |
| Patch agent | extraction_agents | usePatchExtractionAgent | PATCH /admin/extraction/agents/{id} | RA3 |
| Approve agent | extraction_agents | useApproveExtractionAgent | POST /admin/extraction/agents/{id}/approve | RA4 |
| Reject agent | extraction_agents | useRejectExtractionAgent | POST /admin/extraction/agents/{id}/reject | RA5 |
| Patch campus | extraction_campuses | usePatchExtractionCampus | PATCH /admin/extraction/campuses/{id} | RCa2 |
| Create/delete agent | extraction_agents | useCreateExtractionAgent / useDeleteExtractionAgent | POST/DELETE /admin/extraction/agents | AC1, AC2 |
| Create/delete campus | extraction_campuses | useCreateExtractionCampus / useDeleteExtractionCampus | POST/DELETE /admin/extraction/campuses | AC3, AC4 |
| Create/delete fee | extraction_course_fees | useCreateCourseFee / useDeleteCourseFee | POST/DELETE /admin/extraction/course-fees | CE1, CE2 |
| Create/delete intake | extraction_intakes | useCreateIntake / useDeleteIntake | POST/DELETE /admin/extraction/intakes | CE3, CE4 |
| Create/delete eligibility | extraction_eligibility_requirements | useCreateEligibilityRequirement / useDeleteEligibilityRequirement | POST/DELETE /admin/extraction/eligibility-requirements | CE5, CE6 |
| Create/delete study unit | extraction_study_units | useCreateStudyUnit / useDeleteStudyUnit | POST/DELETE /admin/extraction/study-units | CE7, CE8 |
| Create/update/delete study option | extraction_study_options | useCreateStudyOption / useUpdateStudyOption / useDeleteStudyOption | POST/PATCH/DELETE /admin/extraction/study-options | SO1, SO2, SO3 |
| Create/delete staged accreditation | extraction_accreditations | (direct calls) | POST/DELETE /admin/extraction/staged-accreditations | SA1, SA2 |
| Junction assign | 7 junction tables | useJunctionAssign | POST /admin/extraction/junctions/{junction}/assign | J1 |
| Junction unassign | 7 junction tables | useJunctionUnassign | DELETE /admin/extraction/junctions/{junction}/assign | J2 |
| Accreditation mapping | extraction_course_accreditation_assignments | useAccreditationMappingUpdate | PATCH /admin/extraction/accreditation-mappings | J3 |
| Link accreditation | extraction_course_accreditation_assignments | linkCourseAccreditation | POST /admin/extraction/courses/{courseId}/accreditation-links | E6 |
| Unlink accreditation | extraction_course_accreditation_assignments | unlinkCourseAccreditation | DELETE /admin/extraction/courses/{courseId}/accreditation-links/{accreditationId} | E7 |
| Upsert site profile | extraction_site_profiles | (direct call) | PUT /admin/extraction/site-profiles | E8 |
| Toggle lesson | extraction_lessons | (direct call) | PATCH /admin/extraction/lessons/{id} | E9 |
| Delete lesson | extraction_lessons | (direct call) | DELETE /admin/extraction/lessons/{id} | E10 |
| Patch via save-and-learn | 9 extraction tables + extraction_memory | saveAndLearn() | POST /admin/extraction/save-and-learn | SL1 |
| Discard visa | extraction_visas | (VisaStagedRow) | POST /admin/extraction/visas/{id}/discard | I3 |
| Discard MARA | extraction_mara_agents | (MaraStagedRow) | POST /admin/extraction/mara-agents/{id}/discard | I4 |
| Promote visa | extraction_visas (via RPC) | (VisaStagedRow) | POST /admin/extraction/visas/{id}/promote | I5 |
| Promote MARA | extraction_mara_agents (via RPC) | (MaraStagedRow) | POST /admin/extraction/mara-agents/{id}/promote | I6 |
| Extract visas | (stub) | (VisaExtractionDashboard) | POST /admin/extraction/visas/extract | I7 (503 stub) |
| Extract MARA | (stub) | (MaraExtractionDashboard) | POST /admin/extraction/mara-agents/extract | I8 (503 stub) |

### Writes with NONE — new endpoints V3 would need

**None.** Every frontend write path already has a corresponding backend
endpoint. The V2 migration from direct Supabase writes to ai-service
endpoints is complete.

---

## 3. Promotable Status Values

`PROMOTABLE_JOB_STATUSES` is defined in `apps/ai-service/src/lib/promote-helpers.ts:11`:
```typescript
export const PROMOTABLE_JOB_STATUSES = ["approved", "verified", "review", "exported", "done"] as const;
```

The promote endpoint (P1) rejects jobs whose status is not in this list.

### Which code sets extraction_jobs.status to these values?

| Status | Set by route code? | Set by frontend code? | Set by any code in V2 repo? |
|--------|-------------------|----------------------|---------------------------|
| `approved` | **No** | **No** | **No** |
| `verified` | **No** | **No** | **No** |
| `review` | **No** | **No** | **No** |
| `done` | **No** | **No** | **No** |
| `exported` | **Yes** — P1 promote (line 551 of extraction-promote.ts) sets status='exported' after successful promotion | No | Yes |

**None of the four prerequisite statuses (`approved`, `verified`, `review`,
`done`) are set by any code in the V2 repository** — not in the ai-service
backend, not in the web frontend, not in any migration, seed, or script.

The frontend **reads** these values for conditional rendering:
- `AdminExtractionReview.tsx:871` — shows Publish button when `job.status` is
  `"review"`, `"verified"`, `"done"`, `"approved"`, or `"exported"`
- `ExtractionDashboard.tsx:1089` — treats these as "finished" statuses
- `ExtractionDashboard.tsx:1154` — shows promote action for `"review"` or
  `"verified"`

**Conclusion:** These statuses are set by the V1 extraction pipeline (Supabase
Edge Functions) which is not in this V2 repository. The pipeline code that
runs site mapping, course discovery, LLM extraction, and verification
presumably transitions jobs through `processing` → `review` → `verified` →
`approved` / `done`. V3 will need to set these statuses when it implements
the extraction pipeline workers.
