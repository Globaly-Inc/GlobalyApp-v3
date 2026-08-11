# V3 Extraction — Pre-Code Decisions

Settled before writing any migration or application code.
Source data: `docs/extraction-v2-schema.md`, `docs/extraction-v2-endpoints.md`.

---

## 1. The 7 external FKs

V2 extraction tables reference 7 tables in the `public` schema. V3 keeps
all extraction tables in the `superadmin` schema. Decision per FK:

| V2 FK target | Exists in V3 `globalyapp` DB? | V3 decision |
|---|---|---|
| `public.businesses` | **Yes** — `20260723_001_businesses.ts` | Cross-schema FK: `references("public.businesses")`. ON DELETE SET NULL. |
| `public.service_categories` | No | Plain `uuid` column, no FK. Comment in migration: `-- FK target: public.service_categories(id), add when table exists`. |
| `public.business_categories` | No | Plain `uuid` column, no FK. Same comment pattern. |
| `public.fee_types` | No | Plain `uuid` column, no FK. |
| `public.degree_levels` | No | Plain `uuid` column, no FK. |
| `public.accreditations` | No | Plain `uuid` column, no FK. |
| `public.business_services` | No | Plain `uuid` column, no FK. |

**Rationale:** Cross-schema FKs within the same Postgres database work
fine. But we can't FK to a table that doesn't exist yet. When those
catalog tables land, a follow-up migration adds the constraints. The uuid
columns are typed and named identically to V2 so promote code doesn't
need to change.

---

## 2. What `admin_logs` becomes in V3

### V2 behaviour

Every extraction write endpoint calls `logAdmin()` to insert a row into
`admin_logs` with: `action` (string), `admin_id`, `details` (jsonb),
`created_at`. This table lives in Supabase's `public` schema alongside
RLS policies. It is a catch-all audit table shared by the entire admin UI,
not specific to extraction.

### V3 decision

**New table: `superadmin.admin_audit_logs`.**

```sql
CREATE TABLE superadmin.admin_audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      integer NOT NULL,  -- FK to superadmin.admin_users(id)
  action        text    NOT NULL,  -- e.g. 'EXTRACTION_JOB_CREATE'
  entity_type   text,              -- e.g. 'extraction_jobs'
  entity_id     uuid,              -- the row PK
  details       jsonb   NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_audit_logs_admin ON superadmin.admin_audit_logs(admin_id);
CREATE INDEX idx_admin_audit_logs_entity ON superadmin.admin_audit_logs(entity_type, entity_id);
```

Why a dedicated table instead of Winston logs:
- The frontend reads audit history (who changed what, when).
- Structured `entity_type` + `entity_id` enables "show me all changes to
  this extraction job" queries.
- Lives in `superadmin` schema — same DB, same `masterKnex` connection,
  no extra pool.

Shared helper in `src/modules/superadmin/data-extraction/shared/audit.ts`:

```typescript
export async function logAudit(adminId: number, action: string, opts?: {
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) { ... }
```

Every extraction write endpoint calls `logAudit()` — direct port of V2's
`logAdmin()` pattern.

---

## 3. Canonical status values

Collected from V2 application code (not the database, which has no CHECK
constraints). These become the Zod enum/union sources in V3. The database
columns stay `text` — validation is in the API layer.

### extraction_jobs.status

| Value | Set by | Description |
|---|---|---|
| `pending` | Job create (E3), reset-pipeline (C9) | Waiting for pipeline to pick up |
| `processing` | Pipeline worker (not in admin routes) | Currently being extracted |
| `stalled` | Pipeline heartbeat monitor (not in admin routes) | Heartbeat expired |
| `extracting` | Resume (C12) | Re-started after pause |
| `paused` | Pause (C11), stop-all (C8) | Admin-paused |
| `failed` | Fail (E4) | Terminal failure |
| `declined` | Decline (C10) | Admin rejected |
| `review` | Pipeline worker | Extraction complete, awaiting human review |
| `verified` | Pipeline worker | Automated verification passed |
| `approved` | Pipeline worker | Ready for promotion |
| `done` | Pipeline worker | Fully processed |
| `exported` | Promote (P1) | Promoted to live catalog |

**Zod schema:** `z.enum([...all values])` for reads.
Writes use the subset relevant to each endpoint (e.g. resume only
sets `extracting`).

### extraction_queue.status

`pending`, `processing`, `paused`, `ignored`, `stopped`, `completed`, `failed`

### extraction_courses.verification_status

`unverified`, `confirmed`, `flagged`, `manual`

### extraction_agents.source_status

`active`, `archived`

### extraction_visas.status / extraction_mara_agents.status

`pending`, `discarded`, `promoted`

### extraction_verification_results.status

`not_found`, `found`, `match`, `mismatch`

### agent_extraction_runs.status

`running`, `completed`, `failed`

### extraction_job_events.level

`info`, `warn`, `error`

### extraction_lessons.scope

`global`, `domain` — enforced by CHECK in DB too.

### extraction_study_units.unit_type

`compulsory`, `elective` — enforced by CHECK in DB too.

### extraction_eligibility_requirements.score_type

`percentage`, `gpa_4`, `gpa_10`, `cgpa` — enforced by CHECK in DB too.

### agent_extraction_cadence (PG enum)

`daily`, `weekly`, `monthly` — the only real PG enum. Created in migration.

---

## 4. Junction table unique constraints — intentional tightening

V2 has composite UNIQUE on only 2 of 6 junction tables. V3 adds UNIQUE
on all 6. This prevents duplicate assignments that V2 allowed silently.

| Junction table | V2 unique? | V3 unique columns |
|---|---|---|
| extraction_course_intake_assignments | Yes | `(course_id, intake_id)` |
| extraction_course_study_option_assignments | Yes | `(course_id, study_option_id)` |
| extraction_course_fee_assignments | **No** | `(course_id, course_fee_id)` — **added** |
| extraction_course_eligibility_assignments | **No** | `(course_id, eligibility_requirement_id)` — **added** |
| extraction_course_study_unit_assignments | **No** | `(course_id, study_unit_id)` — **added** |
| extraction_course_accreditation_assignments | **No** | `(course_id, extraction_accreditation_id)` — **added** |

---

## 5. Schema placement

All extraction tables live in the `superadmin` schema. They use `masterKnex`
with table references like `superadmin.extraction_jobs`.

Migrations go in `database/migrations/superadmin/` and run via
`npm run migrate:superadmin`.
