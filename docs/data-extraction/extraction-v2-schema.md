# V2 Extraction Schema Inventory

> **Source files**
>
> - **Drizzle schema**: `/home/user/Documents/Priansu/Globalyhub/GlobalyApp-V2/apps/core-api/src/db/schema/schema.ts`
> - **SQL migration**: `/home/user/Documents/Priansu/Globalyhub/GlobalyApp-V2/apps/core-api/src/db/schema/0000_init.sql`
> - **Extensions shim**: `/home/user/Documents/Priansu/Globalyhub/GlobalyApp-V2/db/shim/001-extensions.sql`
>
> All 32 tables appear in **both** the Drizzle schema and the SQL migration file.
> No table exists in one source but not the other.

---

## Table of Contents

Tables are listed in dependency order (parents before children).

| # | Table | FK Parent(s) |
|---|-------|-------------|
| 1 | [extraction_jobs](#1-extraction_jobs) | service_categories, business_categories (external) |
| 2 | [extraction_accreditations](#2-extraction_accreditations) | _(none)_ |
| 3 | [extraction_site_profiles](#3-extraction_site_profiles) | _(none)_ |
| 4 | [extraction_lessons](#4-extraction_lessons) | _(none)_ |
| 5 | [extraction_job_events](#5-extraction_job_events) | extraction_jobs |
| 6 | [extraction_queue](#6-extraction_queue) | extraction_jobs |
| 7 | [extraction_institution_overview](#7-extraction_institution_overview) | extraction_jobs |
| 8 | [extraction_site_intelligence](#8-extraction_site_intelligence) | extraction_jobs |
| 9 | [extraction_campuses](#9-extraction_campuses) | extraction_jobs |
| 10 | [extraction_courses](#10-extraction_courses) | extraction_jobs |
| 11 | [extraction_agents](#11-extraction_agents) | extraction_jobs |
| 12 | [extraction_additional_info](#12-extraction_additional_info) | extraction_jobs |
| 13 | [extraction_memory](#13-extraction_memory) | extraction_jobs |
| 14 | [extraction_intakes](#14-extraction_intakes) | extraction_jobs, extraction_courses |
| 15 | [extraction_course_fees](#15-extraction_course_fees) | extraction_jobs, fee_types (external) |
| 16 | [extraction_eligibility_requirements](#16-extraction_eligibility_requirements) | extraction_jobs, degree_levels (external) |
| 17 | [extraction_english_requirements](#17-extraction_english_requirements) | extraction_jobs, extraction_courses |
| 18 | [extraction_study_options](#18-extraction_study_options) | extraction_jobs |
| 19 | [extraction_study_units](#19-extraction_study_units) | extraction_jobs |
| 20 | [extraction_verification_results](#20-extraction_verification_results) | extraction_jobs, extraction_courses |
| 21 | [extraction_agent_locations](#21-extraction_agent_locations) | extraction_agents, extraction_jobs |
| 22 | [extraction_course_campuses](#22-extraction_course_campuses) | extraction_courses, extraction_campuses, extraction_jobs |
| 23 | [extraction_course_intake_assignments](#23-extraction_course_intake_assignments) | extraction_courses, extraction_intakes, extraction_jobs |
| 24 | [extraction_course_fee_assignments](#24-extraction_course_fee_assignments) | extraction_courses, extraction_course_fees, extraction_jobs |
| 25 | [extraction_course_eligibility_assignments](#25-extraction_course_eligibility_assignments) | extraction_courses, extraction_eligibility_requirements, extraction_jobs |
| 26 | [extraction_course_study_option_assignments](#26-extraction_course_study_option_assignments) | extraction_courses, extraction_study_options, extraction_jobs |
| 27 | [extraction_course_study_unit_assignments](#27-extraction_course_study_unit_assignments) | extraction_courses, extraction_study_units, extraction_jobs |
| 28 | [extraction_course_accreditation_assignments](#28-extraction_course_accreditation_assignments) | extraction_courses, extraction_accreditations, extraction_jobs, accreditations (external) |
| 29 | [extraction_visas](#29-extraction_visas) | business_services (external) |
| 30 | [extraction_mara_agents](#30-extraction_mara_agents) | businesses (external) |
| 31 | [agent_extraction_runs](#31-agent_extraction_runs) | extraction_jobs |
| 32 | [agent_extraction_schedule](#32-agent_extraction_schedule) | extraction_jobs |

---

## 1. extraction_jobs

### Drizzle definition

```typescript
export const extractionJobs = pgTable("extraction_jobs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	institutionName: text("institution_name"),
	institutionUrl: text("institution_url").notNull(),
	status: text().default('pending').notNull(),
	sourceType: text("source_type").default('institution'),
	aggregatorName: text("aggregator_name"),
	totalPagesFound: integer("total_pages_found").default(0).notNull(),
	coursesExtracted: integer("courses_extracted").default(0).notNull(),
	verificationScore: integer("verification_score").default(0).notNull(),
	verificationTotal: integer("verification_total").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	businessCategoryId: uuid("business_category_id"),
	serviceCategoryId: uuid("service_category_id"),
	guidedUrls: jsonb("guided_urls").default({}),
	guidanceNotes: text("guidance_notes"),
	pipelineProgress: jsonb("pipeline_progress").default({}),
	pagesScraped: integer("pages_scraped").default(0),
	pagesFailed: integer("pages_failed").default(0),
	sampleCourseUrl: text("sample_course_url"),
	supportingDocuments: jsonb("supporting_documents").default([]),
	processingHeartbeatAt: timestamp("processing_heartbeat_at", { withTimezone: true, mode: 'string' }),
	lastProgressAt: timestamp("last_progress_at", { withTimezone: true, mode: 'string' }),
	stopRequested: boolean("stop_requested").default(false).notNull(),
	pageQueue: jsonb("page_queue").default([]).notNull(),
	pagesTotal: integer("pages_total").default(0).notNull(),
	workerId: text("worker_id"),
	attempts: integer().default(0).notNull(),
	maxAttempts: integer("max_attempts").default(3).notNull(),
	skippedRecords: jsonb("skipped_records").default([]).notNull(),
	errorMessage: text("error_message"),
}, (table) => [
	index("idx_extraction_jobs_status_heartbeat").using("btree", table.status.asc().nullsLast(), table.processingHeartbeatAt.asc().nullsLast()).where(sql`(status = ANY (ARRAY['pending'::text, 'processing'::text, 'stalled'::text]))`),
	foreignKey({
			columns: [table.serviceCategoryId],
			foreignColumns: [serviceCategories.id],
			name: "extraction_jobs_service_category_id_fkey"
		}),
	foreignKey({
			columns: [table.businessCategoryId],
			foreignColumns: [businessCategories.id],
			name: "extraction_jobs_business_category_id_fkey"
		}),
	pgPolicy("Data admins manage extraction_jobs", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_jobs", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| institution_name | text | YES | — | — |
| institution_url | text | NOT NULL | — | — |
| status | text | NOT NULL | 'pending' | — |
| source_type | text | YES | 'institution' | — |
| aggregator_name | text | YES | — | — |
| total_pages_found | integer | NOT NULL | 0 | — |
| courses_extracted | integer | NOT NULL | 0 | — |
| verification_score | integer | NOT NULL | 0 | — |
| verification_total | integer | NOT NULL | 0 | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |
| business_category_id | uuid | YES | — | FK |
| service_category_id | uuid | YES | — | FK |
| guided_urls | jsonb | YES | '{}'::jsonb | — |
| guidance_notes | text | YES | — | — |
| pipeline_progress | jsonb | YES | '{}'::jsonb | — |
| pages_scraped | integer | YES | 0 | — |
| pages_failed | integer | YES | 0 | — |
| sample_course_url | text | YES | — | — |
| supporting_documents | jsonb | YES | '[]'::jsonb | — |
| processing_heartbeat_at | timestamptz | YES | — | — |
| last_progress_at | timestamptz | YES | — | — |
| stop_requested | boolean | NOT NULL | false | — |
| page_queue | jsonb | NOT NULL | '[]'::jsonb | — |
| pages_total | integer | NOT NULL | 0 | — |
| worker_id | text | YES | — | — |
| attempts | integer | NOT NULL | 0 | — |
| max_attempts | integer | NOT NULL | 3 | — |
| skipped_records | jsonb | NOT NULL | '[]'::jsonb | — |
| error_message | text | YES | — | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_jobs_service_category_id_fkey | service_category_id | public.service_categories(id) | no action | no action |
| extraction_jobs_business_category_id_fkey | business_category_id | public.business_categories(id) | no action | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_extraction_jobs_status_heartbeat | btree | status ASC NULLS LAST, processing_heartbeat_at ASC NULLS LAST | `status = ANY (ARRAY['pending'::text, 'processing'::text, 'stalled'::text])` |

---

## 2. extraction_accreditations

### Drizzle definition

```typescript
export const extractionAccreditations = pgTable("extraction_accreditations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	issuingOrganization: text("issuing_organization"),
	website: text(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	pgPolicy("Data admins manage extraction_accreditations", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_accreditations", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| name | text | NOT NULL | — | — |
| issuing_organization | text | YES | — | — |
| website | text | YES | — | — |
| description | text | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

_(none)_

### Unique constraints

_(none beyond PK)_

### Indexes

_(none beyond PK)_

---

## 3. extraction_site_profiles

### Drizzle definition

```typescript
export const extractionSiteProfiles = pgTable("extraction_site_profiles", {
	domain: text().primaryKey().notNull(),
	canonicalInstitutionName: text("canonical_institution_name"),
	canonicalLegalName: text("canonical_legal_name"),
	feeFormatHint: text("fee_format_hint"),
	intakeFormatHint: text("intake_format_hint"),
	notes: text(),
	hints: jsonb().default([]).notNull(),
	successRate: numeric("success_rate").default('0').notNull(),
	totalRuns: integer("total_runs").default(0).notNull(),
	totalCorrections: integer("total_corrections").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	pgPolicy("Admin/data-admin manage site profiles", { as: "permissive", for: "all", to: ["public"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| domain | text | NOT NULL | — | PRIMARY KEY |
| canonical_institution_name | text | YES | — | — |
| canonical_legal_name | text | YES | — | — |
| fee_format_hint | text | YES | — | — |
| intake_format_hint | text | YES | — | — |
| notes | text | YES | — | — |
| hints | jsonb | NOT NULL | '[]'::jsonb | — |
| success_rate | numeric | NOT NULL | '0' | — |
| total_runs | integer | NOT NULL | 0 | — |
| total_corrections | integer | NOT NULL | 0 | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

_(none)_

### Unique constraints

_(none — PK is domain text, not UUID)_

### Indexes

_(none beyond PK)_

---

## 4. extraction_lessons

### Drizzle definition

```typescript
export const extractionLessons = pgTable("extraction_lessons", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scope: text().notNull(),
	domain: text(),
	step: text(),
	rule: text().notNull(),
	exampleBad: text("example_bad"),
	exampleGood: text("example_good"),
	source: text().default('admin_manual').notNull(),
	weight: integer().default(1).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_extraction_lessons_domain_step").using("btree", table.domain.asc().nullsLast(), table.step.asc().nullsLast()).where(sql`(is_active = true)`),
	pgPolicy("Admin/data-admin manage lessons", { as: "permissive", for: "all", to: ["public"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	check("extraction_lessons_scope_check", sql`scope = ANY (ARRAY['global'::text, 'domain'::text])`),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| scope | text | NOT NULL | — | CHECK `scope = ANY (ARRAY['global'::text, 'domain'::text])` |
| domain | text | YES | — | — |
| step | text | YES | — | — |
| rule | text | NOT NULL | — | — |
| example_bad | text | YES | — | — |
| example_good | text | YES | — | — |
| source | text | NOT NULL | 'admin_manual' | — |
| weight | integer | NOT NULL | 1 | — |
| is_active | boolean | NOT NULL | true | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

_(none)_

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_extraction_lessons_domain_step | btree | domain ASC NULLS LAST, step ASC NULLS LAST | `is_active = true` |

---

## 5. extraction_job_events

### Drizzle definition

```typescript
export const extractionJobEvents = pgTable("extraction_job_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	kind: text().notNull(),
	level: text().default('info').notNull(),
	phase: text(),
	message: text(),
	data: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_extraction_job_events_job_created").using("btree", table.jobId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_job_events_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Super admins can read job events", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_super_admin()` }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| kind | text | NOT NULL | — | — |
| level | text | NOT NULL | 'info' | — |
| phase | text | YES | — | — |
| message | text | YES | — | — |
| data | jsonb | NOT NULL | '{}'::jsonb | — |
| created_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_job_events_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_extraction_job_events_job_created | btree | job_id ASC NULLS LAST, created_at DESC NULLS FIRST | — |

---

## 6. extraction_queue

### Drizzle definition

```typescript
export const extractionQueue = pgTable("extraction_queue", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	url: text().notNull(),
	status: text().default('pending').notNull(),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	extractedData: jsonb("extracted_data"),
	retryCount: integer("retry_count").default(0).notNull(),
	failureClass: text("failure_class"),
	processingMeta: jsonb("processing_meta").default({}).notNull(),
	kind: text().default('institution').notNull(),
}, (table) => [
	index("extraction_queue_kind_idx").using("btree", table.kind.asc().nullsLast()),
	index("idx_extraction_queue_job_status").using("btree", table.jobId.asc().nullsLast(), table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_queue_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("super_admin_all_extraction_queue", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
	pgPolicy("Data admins manage extraction_queue", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| url | text | NOT NULL | — | — |
| status | text | NOT NULL | 'pending' | — |
| error | text | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |
| extracted_data | jsonb | YES | — | — |
| retry_count | integer | NOT NULL | 0 | — |
| failure_class | text | YES | — | — |
| processing_meta | jsonb | NOT NULL | '{}'::jsonb | — |
| kind | text | NOT NULL | 'institution' | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_queue_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| extraction_queue_kind_idx | btree | kind ASC NULLS LAST | — |
| idx_extraction_queue_job_status | btree | job_id ASC NULLS LAST, status ASC NULLS LAST | — |

---

## 7. extraction_institution_overview

### Drizzle definition

```typescript
export const extractionInstitutionOverview = pgTable("extraction_institution_overview", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	name: text(),
	website: text(),
	phone: text(),
	email: text(),
	address: text(),
	city: text(),
	state: text(),
	country: text(),
	description: text(),
	logoUrl: text("logo_url"),
	sourceUrl: text("source_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	zipCode: text("zip_code"),
	facebookUrl: text("facebook_url"),
	instagramUrl: text("instagram_url"),
	twitterUrl: text("twitter_url"),
	linkedinUrl: text("linkedin_url"),
	youtubeUrl: text("youtube_url"),
}, (table) => [
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_institution_overview_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("super_admin_all_extraction_institution_overview", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
	pgPolicy("Data admins manage extraction_institution_overview", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| name | text | YES | — | — |
| website | text | YES | — | — |
| phone | text | YES | — | — |
| email | text | YES | — | — |
| address | text | YES | — | — |
| city | text | YES | — | — |
| state | text | YES | — | — |
| country | text | YES | — | — |
| description | text | YES | — | — |
| logo_url | text | YES | — | — |
| source_url | text | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |
| zip_code | text | YES | — | — |
| facebook_url | text | YES | — | — |
| instagram_url | text | YES | — | — |
| twitter_url | text | YES | — | — |
| linkedin_url | text | YES | — | — |
| youtube_url | text | YES | — | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_institution_overview_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

_(none beyond PK)_

---

## 8. extraction_site_intelligence

### Drizzle definition

```typescript
export const extractionSiteIntelligence = pgTable("extraction_site_intelligence", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	institutionName: text("institution_name"),
	institutionType: text("institution_type"),
	country: text(),
	currency: text(),
	feeStructure: jsonb("fee_structure").default({}),
	extractionHints: text("extraction_hints").array(),
	navigationPatterns: jsonb("navigation_patterns").default({}),
	rawAnalysis: jsonb("raw_analysis"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_site_intelligence_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Data admins manage extraction_site_intelligence", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_site_intelligence", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| institution_name | text | YES | — | — |
| institution_type | text | YES | — | — |
| country | text | YES | — | — |
| currency | text | YES | — | — |
| fee_structure | jsonb | YES | '{}'::jsonb | — |
| extraction_hints | text[] | YES | — | — |
| navigation_patterns | jsonb | YES | '{}'::jsonb | — |
| raw_analysis | jsonb | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_site_intelligence_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

_(none beyond PK)_

---

## 9. extraction_campuses

### Drizzle definition

```typescript
export const extractionCampuses = pgTable("extraction_campuses", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	name: text(),
	address: text(),
	city: text(),
	state: text(),
	country: text(),
	phone: text(),
	email: text(),
	mapLink: text("map_link"),
	sourceUrl: text("source_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	postcode: text(),
}, (table) => [
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_campuses_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("super_admin_all_extraction_campuses", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
	pgPolicy("Data admins manage extraction_campuses", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| name | text | YES | — | — |
| address | text | YES | — | — |
| city | text | YES | — | — |
| state | text | YES | — | — |
| country | text | YES | — | — |
| phone | text | YES | — | — |
| email | text | YES | — | — |
| map_link | text | YES | — | — |
| source_url | text | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |
| postcode | text | YES | — | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_campuses_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

_(none beyond PK)_

---

## 10. extraction_courses

### Drizzle definition

```typescript
export const extractionCourses = pgTable("extraction_courses", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	name: text().notNull(),
	shortName: text("short_name"),
	degreeLevel: text("degree_level"),
	degreeLevelCode: text("degree_level_code"),
	subjectArea: text("subject_area"),
	subjectAreaCode: text("subject_area_code"),
	durationWeeks: integer("duration_weeks"),
	studyMode: text("study_mode"),
	description: text(),
	domesticFeeTotal: numeric("domestic_fee_total"),
	domesticFeeInstallments: text("domestic_fee_installments"),
	domesticFeeHeading: text("domestic_fee_heading"),
	domesticCurrency: text("domestic_currency"),
	domesticEligibility: text("domestic_eligibility"),
	internationalFeeTotal: numeric("international_fee_total"),
	internationalFeeInstallments: text("international_fee_installments"),
	internationalCurrency: text("international_currency"),
	internationalEligibility: text("international_eligibility"),
	awardingInstitution: text("awarding_institution"),
	brochureUrl: text("brochure_url"),
	imageUrl: text("image_url"),
	careerPaths: text("career_paths").array(),
	countryCode: text("country_code"),
	courseStatus: integer("course_status"),
	sourceUrl: text("source_url"),
	verificationStatus: text("verification_status").default('unverified'),
	lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_extraction_courses_job_id").using("btree", table.jobId.asc().nullsLast()),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_courses_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Data admins manage extraction_courses", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_courses", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| name | text | NOT NULL | — | — |
| short_name | text | YES | — | — |
| degree_level | text | YES | — | — |
| degree_level_code | text | YES | — | — |
| subject_area | text | YES | — | — |
| subject_area_code | text | YES | — | — |
| duration_weeks | integer | YES | — | — |
| study_mode | text | YES | — | — |
| description | text | YES | — | — |
| domestic_fee_total | numeric | YES | — | — |
| domestic_fee_installments | text | YES | — | — |
| domestic_fee_heading | text | YES | — | — |
| domestic_currency | text | YES | — | — |
| domestic_eligibility | text | YES | — | — |
| international_fee_total | numeric | YES | — | — |
| international_fee_installments | text | YES | — | — |
| international_currency | text | YES | — | — |
| international_eligibility | text | YES | — | — |
| awarding_institution | text | YES | — | — |
| brochure_url | text | YES | — | — |
| image_url | text | YES | — | — |
| career_paths | text[] | YES | — | — |
| country_code | text | YES | — | — |
| course_status | integer | YES | — | — |
| source_url | text | YES | — | — |
| verification_status | text | YES | 'unverified' | — |
| last_verified_at | timestamptz | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_courses_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_extraction_courses_job_id | btree | job_id ASC NULLS LAST | — |

---

## 11. extraction_agents

### Drizzle definition

```typescript
export const extractionAgents = pgTable("extraction_agents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	name: text(),
	country: text(),
	email: text(),
	phone: text(),
	website: text(),
	sourceUrl: text("source_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	pageNumber: integer("page_number"),
	sourceStatus: text("source_status").default('active'),
	street1: text(),
	street2: text(),
	city: text(),
	state: text(),
	postcode: text(),
	address: text(),
	externalId: text("external_id"),
	locationCount: integer("location_count").default(1).notNull(),
	logoUrl: text("logo_url"),
	logoStoragePath: text("logo_storage_path"),
	logoSourceUrl: text("logo_source_url"),
	websiteSource: text("website_source"),
}, (table) => [
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_agents_job_id_fkey"
		}).onDelete("cascade"),
	unique("extraction_agents_job_external_uniq").on(table.jobId, table.externalId),
	pgPolicy("Data admins manage extraction_agents", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_agents", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| name | text | YES | — | — |
| country | text | YES | — | — |
| email | text | YES | — | — |
| phone | text | YES | — | — |
| website | text | YES | — | — |
| source_url | text | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |
| page_number | integer | YES | — | — |
| source_status | text | YES | 'active' | — |
| street1 | text | YES | — | — |
| street2 | text | YES | — | — |
| city | text | YES | — | — |
| state | text | YES | — | — |
| postcode | text | YES | — | — |
| address | text | YES | — | — |
| external_id | text | YES | — | — |
| location_count | integer | NOT NULL | 1 | — |
| logo_url | text | YES | — | — |
| logo_storage_path | text | YES | — | — |
| logo_source_url | text | YES | — | — |
| website_source | text | YES | — | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_agents_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

| Name | Columns |
|------|---------|
| extraction_agents_job_external_uniq | (job_id, external_id) |

### Indexes

_(none beyond PK)_

---

## 12. extraction_additional_info

### Drizzle definition

```typescript
export const extractionAdditionalInfo = pgTable("extraction_additional_info", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	key: text().notNull(),
	value: text(),
	sourceUrl: text("source_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_additional_info_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Data admins manage extraction_additional_info", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_additional_info", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| key | text | NOT NULL | — | — |
| value | text | YES | — | — |
| source_url | text | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_additional_info_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

_(none beyond PK)_

---

## 13. extraction_memory

### Drizzle definition

```typescript
export const extractionMemory = pgTable("extraction_memory", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id"),
	domain: text().notNull(),
	step: text().notNull(),
	entityType: text("entity_type").notNull(),
	entityRef: text("entity_ref"),
	sourceUrl: text("source_url"),
	sourceExcerpt: text("source_excerpt"),
	aiOutput: jsonb("ai_output").notNull(),
	finalOutput: jsonb("final_output"),
	diff: jsonb(),
	embedding: vector({ dimensions: 1536 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	correctedAt: timestamp("corrected_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_extraction_memory_corrected").using("btree", table.correctedAt.asc().nullsLast()).where(sql`(corrected_at IS NOT NULL)`),
	index("idx_extraction_memory_domain_step").using("btree", table.domain.asc().nullsLast(), table.step.asc().nullsLast()),
	index("idx_extraction_memory_embedding").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_memory_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Admin/data-admin manage memory", { as: "permissive", for: "all", to: ["public"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | YES | — | FK |
| domain | text | NOT NULL | — | — |
| step | text | NOT NULL | — | — |
| entity_type | text | NOT NULL | — | — |
| entity_ref | text | YES | — | — |
| source_url | text | YES | — | — |
| source_excerpt | text | YES | — | — |
| ai_output | jsonb | NOT NULL | — | — |
| final_output | jsonb | YES | — | — |
| diff | jsonb | YES | — | — |
| embedding | vector(1536) | YES | — | **Requires pgvector extension** |
| created_at | timestamptz | NOT NULL | now() | — |
| corrected_at | timestamptz | YES | — | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_memory_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE | Notes |
|------|--------|---------|---------------|-------|
| idx_extraction_memory_corrected | btree | corrected_at ASC NULLS LAST | `corrected_at IS NOT NULL` | — |
| idx_extraction_memory_domain_step | btree | domain ASC NULLS LAST, step ASC NULLS LAST | — | — |
| idx_extraction_memory_embedding | ivfflat | embedding vector_cosine_ops | — | WITH (lists=100). **Requires pgvector.** |

---

## 14. extraction_intakes

### Drizzle definition

```typescript
export const extractionIntakes = pgTable("extraction_intakes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	courseId: uuid("course_id"),
	intakeName: text("intake_name"),
	startDate: date("start_date"),
	endDate: date("end_date"),
	orientationDate: date("orientation_date"),
	admissionDeadline: date("admission_deadline"),
	intakeMonth: integer("intake_month"),
	intakeYear: integer("intake_year"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_extraction_intakes_job_id").using("btree", table.jobId.asc().nullsLast()),
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [extractionCourses.id],
			name: "extraction_intakes_course_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_intakes_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("super_admin_all_extraction_intakes", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
	pgPolicy("Data admins manage extraction_intakes", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| course_id | uuid | YES | — | FK |
| intake_name | text | YES | — | — |
| start_date | date | YES | — | — |
| end_date | date | YES | — | — |
| orientation_date | date | YES | — | — |
| admission_deadline | date | YES | — | — |
| intake_month | integer | YES | — | — |
| intake_year | integer | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_intakes_course_id_fkey | course_id | public.extraction_courses(id) | **set null** | no action |
| extraction_intakes_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_extraction_intakes_job_id | btree | job_id ASC NULLS LAST | — |

---

## 15. extraction_course_fees

### Drizzle definition

```typescript
export const extractionCourseFees = pgTable("extraction_course_fees", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	name: text(),
	studentType: text("student_type").default('both').notNull(),
	periodType: text("period_type").default('Per Year'),
	currency: text().default('AUD').notNull(),
	totalAmount: numeric("total_amount").default('0').notNull(),
	installments: jsonb().default([]).notNull(),
	saveForReuse: boolean("save_for_reuse").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	feeTypeId: uuid("fee_type_id"),
}, (table) => [
	index("idx_extraction_course_fees_job_id").using("btree", table.jobId.asc().nullsLast()),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_course_fees_job_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.feeTypeId],
			foreignColumns: [feeTypes.id],
			name: "extraction_course_fees_fee_type_id_fkey"
		}).onDelete("set null"),
	pgPolicy("Data admins manage extraction_course_fees", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_course_fees", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| name | text | YES | — | — |
| student_type | text | NOT NULL | 'both' | — |
| period_type | text | YES | 'Per Year' | — |
| currency | text | NOT NULL | 'AUD' | — |
| total_amount | numeric | NOT NULL | '0' | — |
| installments | jsonb | NOT NULL | '[]'::jsonb | — |
| save_for_reuse | boolean | NOT NULL | false | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |
| fee_type_id | uuid | YES | — | FK (external) |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_course_fees_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |
| extraction_course_fees_fee_type_id_fkey | fee_type_id | public.fee_types(id) | **set null** | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_extraction_course_fees_job_id | btree | job_id ASC NULLS LAST | — |

---

## 16. extraction_eligibility_requirements

### Drizzle definition

```typescript
export const extractionEligibilityRequirements = pgTable("extraction_eligibility_requirements", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	name: text(),
	applicableTo: text("applicable_to").default('both').notNull(),
	minDegreeLevel: text("min_degree_level"),
	minScorePercent: numeric("min_score_percent"),
	minScoreGrade: text("min_score_grade"),
	description: text(),
	academicTests: jsonb("academic_tests").default([]).notNull(),
	languageTests: jsonb("language_tests").default([]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	scoreType: text("score_type"),
	minScore: numeric("min_score"),
	degreeLevelId: uuid("degree_level_id"),
}, (table) => [
	index("idx_extraction_eligibility_requirements_job_id").using("btree", table.jobId.asc().nullsLast()),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_eligibility_requirements_job_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.degreeLevelId],
			foreignColumns: [degreeLevels.id],
			name: "extraction_eligibility_requirements_degree_level_id_fkey"
		}).onDelete("set null"),
	pgPolicy("Data admins manage extraction_eligibility_requirements", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_eligibility_requirements", { as: "permissive", for: "all", to: ["authenticated"] }),
	check("extraction_eligibility_requirements_score_type_check", sql`score_type = ANY (ARRAY['percentage'::text, 'gpa_4'::text, 'gpa_10'::text, 'cgpa'::text])`),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| name | text | YES | — | — |
| applicable_to | text | NOT NULL | 'both' | — |
| min_degree_level | text | YES | — | — |
| min_score_percent | numeric | YES | — | — |
| min_score_grade | text | YES | — | — |
| description | text | YES | — | — |
| academic_tests | jsonb | NOT NULL | '[]'::jsonb | — |
| language_tests | jsonb | NOT NULL | '[]'::jsonb | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |
| score_type | text | YES | — | CHECK `score_type = ANY (ARRAY['percentage'::text, 'gpa_4'::text, 'gpa_10'::text, 'cgpa'::text])` |
| min_score | numeric | YES | — | — |
| degree_level_id | uuid | YES | — | FK (external) |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_eligibility_requirements_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |
| extraction_eligibility_requirements_degree_level_id_fkey | degree_level_id | public.degree_levels(id) | **set null** | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_extraction_eligibility_requirements_job_id | btree | job_id ASC NULLS LAST | — |

---

## 17. extraction_english_requirements

### Drizzle definition

```typescript
export const extractionEnglishRequirements = pgTable("extraction_english_requirements", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	courseId: uuid("course_id"),
	testTypeName: text("test_type_name"),
	testType: integer("test_type"),
	overallScore: text("overall_score"),
	listeningScore: text("listening_score"),
	readingScore: text("reading_score"),
	writingScore: text("writing_score"),
	speakingScore: text("speaking_score"),
	sourceUrl: text("source_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [extractionCourses.id],
			name: "extraction_english_requirements_course_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_english_requirements_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Data admins manage extraction_english_requirements", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_english_requirements", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| course_id | uuid | YES | — | FK |
| test_type_name | text | YES | — | — |
| test_type | integer | YES | — | — |
| overall_score | text | YES | — | — |
| listening_score | text | YES | — | — |
| reading_score | text | YES | — | — |
| writing_score | text | YES | — | — |
| speaking_score | text | YES | — | — |
| source_url | text | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_english_requirements_course_id_fkey | course_id | public.extraction_courses(id) | cascade | no action |
| extraction_english_requirements_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

_(none beyond PK)_

---

## 18. extraction_study_options

### Drizzle definition

```typescript
export const extractionStudyOptions = pgTable("extraction_study_options", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	studyMode: text("study_mode").default('on_campus').notNull(),
	studyLoad: text("study_load").default('full_time').notNull(),
	durationValue: integer("duration_value"),
	durationUnit: text("duration_unit").default('months'),
	applicableTo: text("applicable_to").default('both').notNull(),
	saveForReuse: boolean("save_for_reuse").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	name: text(),
}, (table) => [
	index("idx_extraction_study_options_job").using("btree", table.jobId.asc().nullsLast()),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_study_options_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Data admins manage extraction_study_options", { as: "permissive", for: "all", to: ["public"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_study_options", { as: "permissive", for: "all", to: ["public"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| study_mode | text | NOT NULL | 'on_campus' | — |
| study_load | text | NOT NULL | 'full_time' | — |
| duration_value | integer | YES | — | — |
| duration_unit | text | YES | 'months' | — |
| applicable_to | text | NOT NULL | 'both' | — |
| save_for_reuse | boolean | NOT NULL | false | — |
| created_at | timestamptz | NOT NULL | now() | — |
| name | text | YES | — | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_study_options_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_extraction_study_options_job | btree | job_id ASC NULLS LAST | — |

---

## 19. extraction_study_units

### Drizzle definition

```typescript
export const extractionStudyUnits = pgTable("extraction_study_units", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	unitCode: text("unit_code"),
	unitName: text("unit_name").notNull(),
	creditPoints: integer("credit_points"),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	unitType: text("unit_type").default('compulsory').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_study_units_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Data admins manage extraction_study_units", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_study_units", { as: "permissive", for: "all", to: ["authenticated"] }),
	check("extraction_study_units_unit_type_check", sql`unit_type = ANY (ARRAY['compulsory'::text, 'elective'::text])`),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| unit_code | text | YES | — | — |
| unit_name | text | NOT NULL | — | — |
| credit_points | integer | YES | — | — |
| description | text | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |
| unit_type | text | NOT NULL | 'compulsory' | CHECK `unit_type = ANY (ARRAY['compulsory'::text, 'elective'::text])` |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_study_units_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

_(none beyond PK)_

---

## 20. extraction_verification_results

### Drizzle definition

```typescript
export const extractionVerificationResults = pgTable("extraction_verification_results", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	courseId: uuid("course_id"),
	fieldName: text("field_name").notNull(),
	extractedValue: text("extracted_value").notNull(),
	liveValue: text("live_value"),
	status: text().default('not_found').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [extractionCourses.id],
			name: "extraction_verification_results_course_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_verification_results_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Data admins manage extraction_verification_results", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_verification_results", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| course_id | uuid | YES | — | FK |
| field_name | text | NOT NULL | — | — |
| extracted_value | text | NOT NULL | — | — |
| live_value | text | YES | — | — |
| status | text | NOT NULL | 'not_found' | — |
| created_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_verification_results_course_id_fkey | course_id | public.extraction_courses(id) | cascade | no action |
| extraction_verification_results_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

_(none beyond PK)_

---

## 21. extraction_agent_locations

### Drizzle definition

```typescript
export const extractionAgentLocations = pgTable("extraction_agent_locations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	agentId: uuid("agent_id").notNull(),
	jobId: uuid("job_id").notNull(),
	isHeadOffice: boolean("is_head_office").default(false).notNull(),
	street1: text(),
	street2: text(),
	city: text(),
	state: text(),
	country: text(),
	postcode: text(),
	address: text(),
	email: text(),
	phone: text(),
	website: text(),
	externalId: text("external_id"),
	sourceUrl: text("source_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("extraction_agent_locations_agent_id_idx").using("btree", table.agentId.asc().nullsLast()),
	index("extraction_agent_locations_job_id_idx").using("btree", table.jobId.asc().nullsLast()),
	foreignKey({
			columns: [table.agentId],
			foreignColumns: [extractionAgents.id],
			name: "extraction_agent_locations_agent_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_agent_locations_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Super admins manage extraction_agent_locations", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| agent_id | uuid | NOT NULL | — | FK |
| job_id | uuid | NOT NULL | — | FK |
| is_head_office | boolean | NOT NULL | false | — |
| street1 | text | YES | — | — |
| street2 | text | YES | — | — |
| city | text | YES | — | — |
| state | text | YES | — | — |
| country | text | YES | — | — |
| postcode | text | YES | — | — |
| address | text | YES | — | — |
| email | text | YES | — | — |
| phone | text | YES | — | — |
| website | text | YES | — | — |
| external_id | text | YES | — | — |
| source_url | text | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_agent_locations_agent_id_fkey | agent_id | public.extraction_agents(id) | cascade | no action |
| extraction_agent_locations_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| extraction_agent_locations_agent_id_idx | btree | agent_id ASC NULLS LAST | — |
| extraction_agent_locations_job_id_idx | btree | job_id ASC NULLS LAST | — |

---

## 22. extraction_course_campuses

### Drizzle definition

```typescript
export const extractionCourseCampuses = pgTable("extraction_course_campuses", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	courseId: uuid("course_id"),
	campusId: uuid("campus_id"),
	campusName: text("campus_name"),
	campusEmail: text("campus_email"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [extractionCourses.id],
			name: "extraction_course_campuses_course_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.campusId],
			foreignColumns: [extractionCampuses.id],
			name: "extraction_course_campuses_campus_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_course_campuses_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Data admins manage extraction_course_campuses", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_course_campuses", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| course_id | uuid | YES | — | FK |
| campus_id | uuid | YES | — | FK |
| campus_name | text | YES | — | — |
| campus_email | text | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_course_campuses_course_id_fkey | course_id | public.extraction_courses(id) | cascade | no action |
| extraction_course_campuses_campus_id_fkey | campus_id | public.extraction_campuses(id) | **set null** | no action |
| extraction_course_campuses_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

_(none beyond PK)_

---

## 23. extraction_course_intake_assignments

### Drizzle definition

```typescript
export const extractionCourseIntakeAssignments = pgTable("extraction_course_intake_assignments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	courseId: uuid("course_id").notNull(),
	intakeId: uuid("intake_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_eci_assignments_course_id").using("btree", table.courseId.asc().nullsLast()),
	index("idx_eci_assignments_intake_id").using("btree", table.intakeId.asc().nullsLast()),
	index("idx_eci_assignments_job_id").using("btree", table.jobId.asc().nullsLast()),
	foreignKey({
			columns: [table.intakeId],
			foreignColumns: [extractionIntakes.id],
			name: "extraction_course_intake_assignments_intake_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_course_intake_assignments_job_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [extractionCourses.id],
			name: "extraction_course_intake_assignments_course_id_fkey"
		}).onDelete("cascade"),
	unique("extraction_course_intake_assignments_course_id_intake_id_key").on(table.courseId, table.intakeId),
	pgPolicy("super_admin_all_extraction_course_intake_assignments", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
	pgPolicy("Data admins manage extraction_course_intake_assignments", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| course_id | uuid | NOT NULL | — | FK |
| intake_id | uuid | NOT NULL | — | FK |
| created_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_course_intake_assignments_intake_id_fkey | intake_id | public.extraction_intakes(id) | cascade | no action |
| extraction_course_intake_assignments_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |
| extraction_course_intake_assignments_course_id_fkey | course_id | public.extraction_courses(id) | cascade | no action |

### Unique constraints

| Name | Columns |
|------|---------|
| extraction_course_intake_assignments_course_id_intake_id_key | (course_id, intake_id) |

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_eci_assignments_course_id | btree | course_id ASC NULLS LAST | — |
| idx_eci_assignments_intake_id | btree | intake_id ASC NULLS LAST | — |
| idx_eci_assignments_job_id | btree | job_id ASC NULLS LAST | — |

---

## 24. extraction_course_fee_assignments

### Drizzle definition

```typescript
export const extractionCourseFeeAssignments = pgTable("extraction_course_fee_assignments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	courseFeeId: uuid("course_fee_id"),
	courseId: uuid("course_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_extraction_course_fee_assignments_job_id").using("btree", table.jobId.asc().nullsLast()),
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [extractionCourses.id],
			name: "extraction_course_fee_assignments_course_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_course_fee_assignments_job_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.courseFeeId],
			foreignColumns: [extractionCourseFees.id],
			name: "extraction_course_fee_assignments_course_fee_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Data admins manage extraction_course_fee_assignments", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_course_fee_assignments", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| course_fee_id | uuid | YES | — | FK |
| course_id | uuid | YES | — | FK |
| created_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_course_fee_assignments_course_id_fkey | course_id | public.extraction_courses(id) | cascade | no action |
| extraction_course_fee_assignments_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |
| extraction_course_fee_assignments_course_fee_id_fkey | course_fee_id | public.extraction_course_fees(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_extraction_course_fee_assignments_job_id | btree | job_id ASC NULLS LAST | — |

---

## 25. extraction_course_eligibility_assignments

### Drizzle definition

```typescript
export const extractionCourseEligibilityAssignments = pgTable("extraction_course_eligibility_assignments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	courseId: uuid("course_id"),
	eligibilityRequirementId: uuid("eligibility_requirement_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [extractionCourses.id],
			name: "extraction_course_eligibility_assignments_course_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_course_eligibility_assignments_job_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.eligibilityRequirementId],
			foreignColumns: [extractionEligibilityRequirements.id],
			name: "extraction_course_eligibility_a_eligibility_requirement_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Data admins manage extraction_course_eligibility_assignments", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_course_eligibility_assignments", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| course_id | uuid | YES | — | FK |
| eligibility_requirement_id | uuid | YES | — | FK |
| created_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_course_eligibility_assignments_course_id_fkey | course_id | public.extraction_courses(id) | cascade | no action |
| extraction_course_eligibility_assignments_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |
| extraction_course_eligibility_a_eligibility_requirement_id_fkey | eligibility_requirement_id | public.extraction_eligibility_requirements(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

_(none beyond PK)_

---

## 26. extraction_course_study_option_assignments

### Drizzle definition

```typescript
export const extractionCourseStudyOptionAssignments = pgTable("extraction_course_study_option_assignments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	courseId: uuid("course_id").notNull(),
	studyOptionId: uuid("study_option_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_extraction_course_study_option_assignments_course").using("btree", table.courseId.asc().nullsLast()),
	index("idx_extraction_course_study_option_assignments_job").using("btree", table.jobId.asc().nullsLast()),
	index("idx_extraction_course_study_option_assignments_option").using("btree", table.studyOptionId.asc().nullsLast()),
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [extractionCourses.id],
			name: "extraction_course_study_option_assignments_course_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_course_study_option_assignments_job_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.studyOptionId],
			foreignColumns: [extractionStudyOptions.id],
			name: "extraction_course_study_option_assignments_study_option_id_fkey"
		}).onDelete("cascade"),
	unique("extraction_course_study_option_as_course_id_study_option_id_key").on(table.courseId, table.studyOptionId),
	pgPolicy("Data admins manage extraction_course_study_option_assignments", { as: "permissive", for: "all", to: ["public"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_course_study_option_assignments", { as: "permissive", for: "all", to: ["public"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| course_id | uuid | NOT NULL | — | FK |
| study_option_id | uuid | NOT NULL | — | FK |
| created_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_course_study_option_assignments_course_id_fkey | course_id | public.extraction_courses(id) | cascade | no action |
| extraction_course_study_option_assignments_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |
| extraction_course_study_option_assignments_study_option_id_fkey | study_option_id | public.extraction_study_options(id) | cascade | no action |

### Unique constraints

| Name | Columns |
|------|---------|
| extraction_course_study_option_as_course_id_study_option_id_key | (course_id, study_option_id) |

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_extraction_course_study_option_assignments_course | btree | course_id ASC NULLS LAST | — |
| idx_extraction_course_study_option_assignments_job | btree | job_id ASC NULLS LAST | — |
| idx_extraction_course_study_option_assignments_option | btree | study_option_id ASC NULLS LAST | — |

---

## 27. extraction_course_study_unit_assignments

### Drizzle definition

```typescript
export const extractionCourseStudyUnitAssignments = pgTable("extraction_course_study_unit_assignments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	courseId: uuid("course_id"),
	studyUnitId: uuid("study_unit_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [extractionCourses.id],
			name: "extraction_course_study_unit_assignments_course_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.studyUnitId],
			foreignColumns: [extractionStudyUnits.id],
			name: "extraction_course_study_unit_assignments_study_unit_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_course_study_unit_assignments_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Data admins manage extraction_course_study_unit_assignments", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_course_study_unit_assignments", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| course_id | uuid | YES | — | FK |
| study_unit_id | uuid | YES | — | FK |
| created_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_course_study_unit_assignments_course_id_fkey | course_id | public.extraction_courses(id) | cascade | no action |
| extraction_course_study_unit_assignments_study_unit_id_fkey | study_unit_id | public.extraction_study_units(id) | cascade | no action |
| extraction_course_study_unit_assignments_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

_(none beyond PK)_

---

## 28. extraction_course_accreditation_assignments

### Drizzle definition

```typescript
export const extractionCourseAccreditationAssignments = pgTable("extraction_course_accreditation_assignments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	courseId: uuid("course_id"),
	extractionAccreditationId: uuid("extraction_accreditation_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	accreditationId: uuid("accreditation_id"),
}, (table) => [
	index("idx_eca_accreditation").using("btree", table.accreditationId.asc().nullsLast()),
	index("idx_eca_job_extraction").using("btree", table.jobId.asc().nullsLast(), table.extractionAccreditationId.asc().nullsLast()),
	foreignKey({
			columns: [table.courseId],
			foreignColumns: [extractionCourses.id],
			name: "extraction_course_accreditation_assignments_course_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.accreditationId],
			foreignColumns: [accreditations.id],
			name: "extraction_course_accreditation_assignme_accreditation_id_fkey1"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.extractionAccreditationId],
			foreignColumns: [extractionAccreditations.id],
			name: "extraction_course_accreditation_assignmen_accreditation_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "extraction_course_accreditation_assignments_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Data admins manage extraction_course_accreditation_assignments", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin_or_data_admin()`, withCheck: sql`is_admin_or_data_admin()`  }),
	pgPolicy("super_admin_all_extraction_course_accreditation_assignments", { as: "permissive", for: "all", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| course_id | uuid | YES | — | FK |
| extraction_accreditation_id | uuid | YES | — | FK |
| created_at | timestamptz | NOT NULL | now() | — |
| accreditation_id | uuid | YES | — | FK (external: accreditations) |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_course_accreditation_assignments_course_id_fkey | course_id | public.extraction_courses(id) | cascade | no action |
| extraction_course_accreditation_assignme_accreditation_id_fkey1 | accreditation_id | **public.accreditations(id)** | **set null** | no action |
| extraction_course_accreditation_assignmen_accreditation_id_fkey | extraction_accreditation_id | public.extraction_accreditations(id) | cascade | no action |
| extraction_course_accreditation_assignments_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_eca_accreditation | btree | accreditation_id ASC NULLS LAST | — |
| idx_eca_job_extraction | btree | job_id ASC NULLS LAST, extraction_accreditation_id ASC NULLS LAST | — |

---

## 29. extraction_visas

### Drizzle definition

```typescript
export const extractionVisas = pgTable("extraction_visas", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id"),
	status: text().default('pending').notNull(),
	promotedServiceId: uuid("promoted_service_id"),
	countryCode: text("country_code"),
	subclassCode: text("subclass_code"),
	visaStream: text("visa_stream"),
	category: text(),
	name: text(),
	description: text(),
	durationMonths: integer("duration_months"),
	isPermanent: boolean("is_permanent"),
	workRights: jsonb("work_rights"),
	studyRights: jsonb("study_rights"),
	pointsTestRequired: boolean("points_test_required"),
	minPoints: integer("min_points"),
	englishRequirements: jsonb("english_requirements"),
	ageMin: integer("age_min"),
	ageMax: integer("age_max"),
	eligibleNationalities: text("eligible_nationalities").array(),
	excludedNationalities: text("excluded_nationalities").array(),
	applicationFeeAmount: numeric("application_fee_amount"),
	applicationFeeCurrency: text("application_fee_currency"),
	processingTimeMinDays: integer("processing_time_min_days"),
	processingTimeMaxDays: integer("processing_time_max_days"),
	officialUrl: text("official_url"),
	sourceUrl: text("source_url"),
	confidenceScore: numeric("confidence_score"),
	rawPayload: jsonb("raw_payload"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("extraction_visas_job_idx").using("btree", table.jobId.asc().nullsLast()),
	index("extraction_visas_status_idx").using("btree", table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.promotedServiceId],
			foreignColumns: [businessServices.id],
			name: "extraction_visas_promoted_service_id_fkey"
		}).onDelete("set null"),
	pgPolicy("Super admins manage extraction_visas", { as: "permissive", for: "all", to: ["public"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | YES | — | — |
| status | text | NOT NULL | 'pending' | — |
| promoted_service_id | uuid | YES | — | FK (external) |
| country_code | text | YES | — | — |
| subclass_code | text | YES | — | — |
| visa_stream | text | YES | — | — |
| category | text | YES | — | — |
| name | text | YES | — | — |
| description | text | YES | — | — |
| duration_months | integer | YES | — | — |
| is_permanent | boolean | YES | — | — |
| work_rights | jsonb | YES | — | — |
| study_rights | jsonb | YES | — | — |
| points_test_required | boolean | YES | — | — |
| min_points | integer | YES | — | — |
| english_requirements | jsonb | YES | — | — |
| age_min | integer | YES | — | — |
| age_max | integer | YES | — | — |
| eligible_nationalities | text[] | YES | — | — |
| excluded_nationalities | text[] | YES | — | — |
| application_fee_amount | numeric | YES | — | — |
| application_fee_currency | text | YES | — | — |
| processing_time_min_days | integer | YES | — | — |
| processing_time_max_days | integer | YES | — | — |
| official_url | text | YES | — | — |
| source_url | text | YES | — | — |
| confidence_score | numeric | YES | — | — |
| raw_payload | jsonb | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_visas_promoted_service_id_fkey | promoted_service_id | **public.business_services(id)** | **set null** | no action |

> **Note:** `job_id` has **no FK constraint** in the SQL migration despite being present. The Drizzle schema does not define a FK for job_id on this table either.

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| extraction_visas_job_idx | btree | job_id ASC NULLS LAST | — |
| extraction_visas_status_idx | btree | status ASC NULLS LAST | — |

---

## 30. extraction_mara_agents

### Drizzle definition

```typescript
export const extractionMaraAgents = pgTable("extraction_mara_agents", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id"),
	status: text().default('pending').notNull(),
	promotedBusinessId: uuid("promoted_business_id"),
	marn: text().notNull(),
	agentName: text("agent_name"),
	businessName: text("business_name"),
	registrationStatus: text("registration_status"),
	registrationDate: date("registration_date"),
	expiryDate: date("expiry_date"),
	email: text(),
	phone: text(),
	website: text(),
	practiceAreas: text("practice_areas").array(),
	languagesSpoken: text("languages_spoken").array(),
	officeCountry: text("office_country"),
	officeState: text("office_state"),
	officeCity: text("office_city"),
	officeAddress: text("office_address"),
	sourceUrl: text("source_url"),
	confidenceScore: numeric("confidence_score"),
	rawPayload: jsonb("raw_payload"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("extraction_mara_agents_job_idx").using("btree", table.jobId.asc().nullsLast()),
	index("extraction_mara_agents_marn_idx").using("btree", table.marn.asc().nullsLast()),
	index("extraction_mara_agents_status_idx").using("btree", table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.promotedBusinessId],
			foreignColumns: [businesses.id],
			name: "extraction_mara_agents_promoted_business_id_fkey"
		}).onDelete("set null"),
	pgPolicy("Super admins manage extraction_mara_agents", { as: "permissive", for: "all", to: ["public"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | YES | — | — |
| status | text | NOT NULL | 'pending' | — |
| promoted_business_id | uuid | YES | — | FK (external) |
| marn | text | NOT NULL | — | — |
| agent_name | text | YES | — | — |
| business_name | text | YES | — | — |
| registration_status | text | YES | — | — |
| registration_date | date | YES | — | — |
| expiry_date | date | YES | — | — |
| email | text | YES | — | — |
| phone | text | YES | — | — |
| website | text | YES | — | — |
| practice_areas | text[] | YES | — | — |
| languages_spoken | text[] | YES | — | — |
| office_country | text | YES | — | — |
| office_state | text | YES | — | — |
| office_city | text | YES | — | — |
| office_address | text | YES | — | — |
| source_url | text | YES | — | — |
| confidence_score | numeric | YES | — | — |
| raw_payload | jsonb | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| extraction_mara_agents_promoted_business_id_fkey | promoted_business_id | **public.businesses(id)** | **set null** | no action |

> **Note:** `job_id` has **no FK constraint** in either source despite being present as a column.

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| extraction_mara_agents_job_idx | btree | job_id ASC NULLS LAST | — |
| extraction_mara_agents_marn_idx | btree | marn ASC NULLS LAST | — |
| extraction_mara_agents_status_idx | btree | status ASC NULLS LAST | — |

---

## 31. agent_extraction_runs

### Drizzle definition

```typescript
export const agentExtractionRuns = pgTable("agent_extraction_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	status: text().default('running').notNull(),
	provider: text(),
	agentsFound: integer("agents_found").default(0).notNull(),
	agentsNew: integer("agents_new").default(0).notNull(),
	agentsUpdated: integer("agents_updated").default(0).notNull(),
	agentsRemoved: integer("agents_removed").default(0).notNull(),
	errorMessage: text("error_message"),
	meta: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_agent_extraction_runs_job").using("btree", table.jobId.asc().nullsLast(), table.startedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "agent_extraction_runs_job_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Admins manage agent runs", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(is_admin_or_data_admin() OR is_super_admin())`, withCheck: sql`(is_admin_or_data_admin() OR is_super_admin())`  }),
	pgPolicy("Admins read agent runs", { as: "permissive", for: "select", to: ["authenticated"] }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK |
| started_at | timestamptz | NOT NULL | now() | — |
| finished_at | timestamptz | YES | — | — |
| status | text | NOT NULL | 'running' | — |
| provider | text | YES | — | — |
| agents_found | integer | NOT NULL | 0 | — |
| agents_new | integer | NOT NULL | 0 | — |
| agents_updated | integer | NOT NULL | 0 | — |
| agents_removed | integer | NOT NULL | 0 | — |
| error_message | text | YES | — | — |
| meta | jsonb | NOT NULL | '{}'::jsonb | — |
| created_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| agent_extraction_runs_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

_(none beyond PK)_

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| idx_agent_extraction_runs_job | btree | job_id ASC NULLS LAST, started_at DESC NULLS FIRST | — |

---

## 32. agent_extraction_schedule

### Drizzle definition

```typescript
export const agentExtractionSchedule = pgTable("agent_extraction_schedule", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	cadence: agentExtractionCadence().notNull(),
	enabled: boolean().default(true).notNull(),
	nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: 'string' }),
	lastStatus: text("last_status"),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("agent_extraction_schedule_due_idx").using("btree", table.nextRunAt.asc().nullsLast()).where(sql`(enabled = true)`),
	foreignKey({
			columns: [table.jobId],
			foreignColumns: [extractionJobs.id],
			name: "agent_extraction_schedule_job_id_fkey"
		}).onDelete("cascade"),
	unique("agent_extraction_schedule_job_id_key").on(table.jobId),
	pgPolicy("Super admins manage agent extraction schedules", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_super_admin()`, withCheck: sql`is_super_admin()`  }),
]);
```

### Columns

| Column | PG Type | Nullable | Default | Constraints |
|--------|---------|----------|---------|-------------|
| id | uuid | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| job_id | uuid | NOT NULL | — | FK, UNIQUE |
| cadence | agent_extraction_cadence (enum) | NOT NULL | — | — |
| enabled | boolean | NOT NULL | true | — |
| next_run_at | timestamptz | NOT NULL | now() | — |
| last_run_at | timestamptz | YES | — | — |
| last_status | text | YES | — | — |
| last_error | text | YES | — | — |
| created_at | timestamptz | NOT NULL | now() | — |
| updated_at | timestamptz | NOT NULL | now() | — |

### Foreign keys

| Constraint | Column | References | ON DELETE | ON UPDATE |
|-----------|--------|------------|-----------|-----------|
| agent_extraction_schedule_job_id_fkey | job_id | public.extraction_jobs(id) | cascade | no action |

### Unique constraints

| Name | Columns |
|------|---------|
| agent_extraction_schedule_job_id_key | (job_id) |

### Indexes

| Name | Method | Columns | Partial WHERE |
|------|--------|---------|---------------|
| agent_extraction_schedule_due_idx | btree | next_run_at ASC NULLS LAST | `enabled = true` |

---

## Enums

| Enum Name | Legal Values | Used By |
|-----------|-------------|---------|
| `agent_extraction_cadence` | `'daily'`, `'weekly'`, `'monthly'` | agent_extraction_schedule.cadence |

The following are **not enums** but are enforced by text defaults or CHECK constraints:

| Field | Table | Legal Values (from CHECK or default) |
|-------|-------|--------------------------------------|
| status | extraction_jobs | Default `'pending'`. No CHECK. Values observed in code: `pending`, `processing`, `failed`, `paused`, `declined`, `exported`, `stalled` |
| status | extraction_queue | Default `'pending'`. No CHECK. Values observed in code: `pending`, `processing`, `paused`, `ignored`, `stopped` |
| status | extraction_visas | Default `'pending'`. No CHECK. Values observed in code: `pending`, `discarded`, `promoted` |
| status | extraction_mara_agents | Default `'pending'`. No CHECK. Values observed in code: `pending`, `discarded`, `promoted` |
| status | agent_extraction_runs | Default `'running'`. No CHECK. |
| status | extraction_verification_results | Default `'not_found'`. No CHECK. Values observed in code: `not_found`, `found`, `match`, `mismatch` |
| verification_status | extraction_courses | Default `'unverified'`. No CHECK. Values observed in code: `unverified`, `verified`, `manual` |
| level | extraction_job_events | Default `'info'`. No CHECK. Values observed in code: `info`, `warn`, `error` |
| scope | extraction_lessons | CHECK: `'global'`, `'domain'` |
| score_type | extraction_eligibility_requirements | CHECK: `'percentage'`, `'gpa_4'`, `'gpa_10'`, `'cgpa'` |
| unit_type | extraction_study_units | CHECK: `'compulsory'`, `'elective'` |
| kind | extraction_queue | Default `'institution'`. No CHECK. |
| source | extraction_lessons | Default `'admin_manual'`. No CHECK. |
| student_type | extraction_course_fees | Default `'both'`. No CHECK. Values observed in code: `both`, `domestic`, `international` |
| applicable_to | extraction_eligibility_requirements | Default `'both'`. No CHECK. Values observed in code: `both`, `domestic`, `international` |
| applicable_to | extraction_study_options | Default `'both'`. No CHECK. |
| study_mode | extraction_study_options | Default `'on_campus'`. No CHECK. Values observed in code: `on_campus`, `online`, `hybrid` |
| study_load | extraction_study_options | Default `'full_time'`. No CHECK. Values observed in code: `full_time`, `part_time` |
| duration_unit | extraction_study_options | Default `'months'`. No CHECK. Values observed in code: `months`, `weeks`, `years` |
| source_type | extraction_jobs | Default `'institution'`. No CHECK. |

---

## Extension Dependencies

| Extension | Column / Feature | Table |
|-----------|-----------------|-------|
| **pgvector** (`vector`) | `embedding vector(1536)` | extraction_memory |
| **pgvector** (`vector`) | ivfflat index with `vector_cosine_ops` | extraction_memory (idx_extraction_memory_embedding) |
| **pgcrypto** or built-in | `gen_random_uuid()` | All tables (PK default) |

> `gen_random_uuid()` is available natively in PostgreSQL 13+. The V2 codebase installs `pgcrypto` in the `extensions` schema (Supabase convention), but the function is called unqualified so it resolves to the built-in.

---

## RLS Policies

All 32 tables have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.

### Policy details

Policies reference two Supabase helper functions (not defined in the migration file itself):
- `is_super_admin()` — returns true if the authenticated user is a super_admin
- `is_admin_or_data_admin()` — returns true if the authenticated user is an admin or data_admin

| # | Table | Policy Name | FOR | TO | USING | WITH CHECK |
|---|-------|------------|-----|-----|-------|------------|
| 1 | agent_extraction_runs | Admins manage agent runs | ALL | authenticated | `is_admin_or_data_admin() OR is_super_admin()` | `is_admin_or_data_admin() OR is_super_admin()` |
| 2 | agent_extraction_runs | Admins read agent runs | SELECT | authenticated | _(none)_ | _(n/a — SELECT only)_ |
| 3 | agent_extraction_schedule | Super admins manage agent extraction schedules | ALL | authenticated | `is_super_admin()` | `is_super_admin()` |
| 4 | extraction_accreditations | Data admins manage extraction_accreditations | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 5 | extraction_accreditations | super_admin_all_extraction_accreditations | ALL | authenticated | _(none)_ | _(none)_ |
| 6 | extraction_additional_info | Data admins manage extraction_additional_info | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 7 | extraction_additional_info | super_admin_all_extraction_additional_info | ALL | authenticated | _(none)_ | _(none)_ |
| 8 | extraction_agent_locations | Super admins manage extraction_agent_locations | ALL | authenticated | `is_super_admin()` | `is_super_admin()` |
| 9 | extraction_agents | Data admins manage extraction_agents | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 10 | extraction_agents | super_admin_all_extraction_agents | ALL | authenticated | _(none)_ | _(none)_ |
| 11 | extraction_campuses | super_admin_all_extraction_campuses | ALL | authenticated | `is_super_admin()` | `is_super_admin()` |
| 12 | extraction_campuses | Data admins manage extraction_campuses | ALL | authenticated | _(none)_ | _(none)_ |
| 13 | extraction_course_accreditation_assignments | Data admins manage ... | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 14 | extraction_course_accreditation_assignments | super_admin_all_... | ALL | authenticated | _(none)_ | _(none)_ |
| 15 | extraction_course_campuses | Data admins manage extraction_course_campuses | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 16 | extraction_course_campuses | super_admin_all_extraction_course_campuses | ALL | authenticated | _(none)_ | _(none)_ |
| 17 | extraction_course_eligibility_assignments | Data admins manage ... | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 18 | extraction_course_eligibility_assignments | super_admin_all_... | ALL | authenticated | _(none)_ | _(none)_ |
| 19 | extraction_course_fee_assignments | Data admins manage ... | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 20 | extraction_course_fee_assignments | super_admin_all_... | ALL | authenticated | _(none)_ | _(none)_ |
| 21 | extraction_course_fees | Data admins manage extraction_course_fees | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 22 | extraction_course_fees | super_admin_all_extraction_course_fees | ALL | authenticated | _(none)_ | _(none)_ |
| 23 | extraction_course_intake_assignments | super_admin_all_... | ALL | authenticated | `is_super_admin()` | `is_super_admin()` |
| 24 | extraction_course_intake_assignments | Data admins manage ... | ALL | authenticated | _(none)_ | _(none)_ |
| 25 | extraction_course_study_option_assignments | Data admins manage ... | ALL | **public** | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 26 | extraction_course_study_option_assignments | super_admin_all_... | ALL | **public** | _(none)_ | _(none)_ |
| 27 | extraction_course_study_unit_assignments | Data admins manage ... | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 28 | extraction_course_study_unit_assignments | super_admin_all_... | ALL | authenticated | _(none)_ | _(none)_ |
| 29 | extraction_courses | Data admins manage extraction_courses | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 30 | extraction_courses | super_admin_all_extraction_courses | ALL | authenticated | _(none)_ | _(none)_ |
| 31 | extraction_eligibility_requirements | Data admins manage ... | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 32 | extraction_eligibility_requirements | super_admin_all_... | ALL | authenticated | _(none)_ | _(none)_ |
| 33 | extraction_english_requirements | Data admins manage ... | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 34 | extraction_english_requirements | super_admin_all_... | ALL | authenticated | _(none)_ | _(none)_ |
| 35 | extraction_institution_overview | super_admin_all_... | ALL | authenticated | `is_super_admin()` | `is_super_admin()` |
| 36 | extraction_institution_overview | Data admins manage ... | ALL | authenticated | _(none)_ | _(none)_ |
| 37 | extraction_intakes | super_admin_all_extraction_intakes | ALL | authenticated | `is_super_admin()` | `is_super_admin()` |
| 38 | extraction_intakes | Data admins manage extraction_intakes | ALL | authenticated | _(none)_ | _(none)_ |
| 39 | extraction_job_events | Super admins can read job events | **SELECT** | authenticated | `is_super_admin()` | _(n/a)_ |
| 40 | extraction_jobs | Data admins manage extraction_jobs | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 41 | extraction_jobs | super_admin_all_extraction_jobs | ALL | authenticated | _(none)_ | _(none)_ |
| 42 | extraction_lessons | Admin/data-admin manage lessons | ALL | **public** | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 43 | extraction_mara_agents | Super admins manage extraction_mara_agents | ALL | **public** | `is_super_admin()` | `is_super_admin()` |
| 44 | extraction_memory | Admin/data-admin manage memory | ALL | **public** | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 45 | extraction_queue | super_admin_all_extraction_queue | ALL | authenticated | `is_super_admin()` | `is_super_admin()` |
| 46 | extraction_queue | Data admins manage extraction_queue | ALL | authenticated | _(none)_ | _(none)_ |
| 47 | extraction_site_intelligence | Data admins manage ... | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 48 | extraction_site_intelligence | super_admin_all_... | ALL | authenticated | _(none)_ | _(none)_ |
| 49 | extraction_site_profiles | Admin/data-admin manage site profiles | ALL | **public** | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 50 | extraction_study_options | Data admins manage ... | ALL | **public** | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 51 | extraction_study_options | super_admin_all_... | ALL | **public** | _(none)_ | _(none)_ |
| 52 | extraction_study_units | Data admins manage ... | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 53 | extraction_study_units | super_admin_all_... | ALL | authenticated | _(none)_ | _(none)_ |
| 54 | extraction_verification_results | Data admins manage ... | ALL | authenticated | `is_admin_or_data_admin()` | `is_admin_or_data_admin()` |
| 55 | extraction_verification_results | super_admin_all_... | ALL | authenticated | _(none)_ | _(none)_ |
| 56 | extraction_visas | Super admins manage extraction_visas | ALL | **public** | `is_super_admin()` | `is_super_admin()` |

> **Pattern note:** Many "super_admin_all_*" policies have **no USING/WITH CHECK clause** in the SQL. In Supabase's Postgres, a PERMISSIVE policy with no USING clause on FOR ALL grants access to **all** authenticated users (the TO role). These appear to be intentionally permissive fallbacks — the real gate is the companion "Data admins manage..." policy. Some tables (agent_locations, campuses, intakes, queue, job_events) use only explicit `is_super_admin()` checks with no data_admin fallback, indicating stricter access.

### External FK targets (tables outside extraction scope)

| External Table | Referenced By | Column |
|---------------|--------------|--------|
| public.service_categories | extraction_jobs | service_category_id |
| public.business_categories | extraction_jobs | business_category_id |
| public.fee_types | extraction_course_fees | fee_type_id |
| public.degree_levels | extraction_eligibility_requirements | degree_level_id |
| public.accreditations | extraction_course_accreditation_assignments | accreditation_id |
| public.business_services | extraction_visas | promoted_service_id |
| public.businesses | extraction_mara_agents | promoted_business_id |

---

## Addendum: V3 Migration Decisions

The following findings were identified during review and affect how the V3
migrations should be written. They are recorded here so the inventory doc
stays the single source of truth.

### A. Missing table in original plan

`extraction_additional_info` (child of `extraction_jobs`) was omitted from
the migration grouping. It belongs with the institution/campus group
(Migration 2 in the original plan).

### B. External FK resolution

7 foreign keys reference tables outside the extraction family.
Verified against V3 `globalyapp` database on 2026-08-04:

| External parent | Exists in V3? | V3 migration decision |
|---|---|---|
| `public.businesses` | **Yes** | Real cross-schema FK to `public.businesses(id)` |
| `public.service_categories` | No | Keep `uuid` column, **no FK constraint**. Comment: `-- FK target: service_categories(id), add when table exists` |
| `public.business_categories` | No | Keep `uuid` column, **no FK constraint**. Comment: `-- FK target: business_categories(id), add when table exists` |
| `public.fee_types` | No | Keep `uuid` column, **no FK constraint**. Comment: `-- FK target: fee_types(id), add when table exists` |
| `public.degree_levels` | No | Keep `uuid` column, **no FK constraint**. Comment: `-- FK target: degree_levels(id), add when table exists` |
| `public.accreditations` | No | Keep `uuid` column, **no FK constraint**. Comment: `-- FK target: accreditations(id), add when table exists` |
| `public.business_services` | No | Keep `uuid` column, **no FK constraint**. Comment: `-- FK target: business_services(id), add when table exists` |

### C. Missing unique constraints on junction tables — intentional fix

V2 has only 4 unique constraints across 32 tables. Of the 6 junction
(assignment) tables, only 2 have composite uniqueness:

| Junction table | Has UNIQUE(course_id, entity_id)? |
|---|---|
| extraction_course_intake_assignments | **Yes** `(course_id, intake_id)` |
| extraction_course_study_option_assignments | **Yes** `(course_id, study_option_id)` |
| extraction_course_fee_assignments | **No** |
| extraction_course_eligibility_assignments | **No** |
| extraction_course_study_unit_assignments | **No** |
| extraction_course_accreditation_assignments | **No** |

**V3 decision:** Add composite unique constraints on all 6 junction tables.
The 4 missing ones are treated as a V2 oversight, not an intentional design.
This is an intentional tightening documented here as a parity deviation.

### D. Status values are bare text, not PG enums

Only `agent_extraction_cadence` is a real PG enum. All other status/type
fields are plain `text` with a default and no CHECK constraint. The "legal
values" listed in the Enums section of this doc were **inferred from
application code**, not enforced by the database.

**V3 decision:** V3 Zod schemas will validate against the known value lists.
The database columns will remain `text` with no CHECK (matching V2), so
that extraction pipeline code can write unexpected values without a
migration. Validation strictness lives in the API layer, not the DB.

### E. Access control — intentional tightening

V2 RLS policies are inconsistent and in several cases broken:

- Many `super_admin_all_*` policies have **no USING/WITH CHECK clause**,
  meaning they grant access to every `authenticated` user regardless of
  role, defeating the companion `is_admin_or_data_admin()` policy.
- 6 policies are scoped `TO public` instead of `TO authenticated`,
  granting access to unauthenticated connections.
- The net effect: V2's database-level access control does not actually
  restrict extraction tables to admins.

**V3 decision:** All extraction endpoints require `super_admin` role,
enforced at the application layer (`req.auth.role === 'super_admin'`).
No RLS policies are used (V3 does not use RLS). This is an intentional
tightening, not a parity gap.
