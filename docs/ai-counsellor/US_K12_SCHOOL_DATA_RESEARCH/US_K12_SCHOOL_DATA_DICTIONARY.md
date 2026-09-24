# U.S. K-12 School Data Dictionary (Globaly)

Research date: 2026-08-25. Fields are grouped by schema table (see `schemas/globaly_k12_schema.sql`).

Column legend:
- **Type**: data type in the Globaly schema
- **Level**: S = school, D = district, ST = state
- **Source**: primary authoritative source (fallbacks in Source Registry §4)
- **Freq**: how often the value changes/refreshes
- **Req**: required for MVP search (Y/N)
- **AI Use**: `filter` (hard filter), `signal` (soft preference/recommendation input), `display` (show only, never rank on), `internal` (ETL/QA only)
- **Conf**: expected confidence tier — HIGH (official gov), MEDIUM (official school), LOW (third party), INFERRED (calculated)

## 1. Identity (`schools`, `school_identifiers`, `school_years`)

| Field | Description | Type | Level | Source | Freq | Req | AI Use | Conf |
|---|---|---|---|---|---|---|---|---|
| school_id | Globaly canonical UUID | UUID | S | generated | never | Y | internal | — |
| ncessch | 12-digit NCES school ID (7-digit LEAID + 5-digit SCHID) | CHAR(12) | S | CCD | stable | Y (public) | internal | HIGH |
| pss_pin | NCES PSS private-school ID (PPIN) | TEXT | S | PSS | stable | Y (private) | internal | HIGH |
| st_schid | State-assigned school ID | TEXT | S | CCD / SEA | stable | N | internal | HIGH |
| sevp_campus_id | SEVP certification campus ID | TEXT | S | DHS SEVP list | weekly-monthly | N | internal | HIGH |
| name | Official school name (current) | TEXT | S | CCD/PSS | annual | Y | filter (search) | HIGH |
| name_history | Prior names, by year | via school_years | S | CCD history | annual | N | display | HIGH |
| sector | public / private | ENUM | S | CCD vs PSS | never | Y | filter | HIGH |
| sch_type | Regular / Alternative / Special Ed / CTE | CAT | S | CCD SCH_TYPE | annual | Y | filter | HIGH |
| is_charter | Charter school flag | BOOL | S | CCD CHARTER_TEXT | annual | Y | filter | HIGH |
| charter_authorizer | Authorizing body name(s) | TEXT | S | CCD CHARTAUTH1/2 | annual | N | display | HIGH |
| is_magnet | Magnet school flag | BOOL | S | **CRDC (not in current CCD)** / state | biennial | N | filter | HIGH (stale) |
| is_virtual | Virtual school flag + type | BOOL+CAT | S | CCD 129 VIRTUAL | annual | Y | filter | HIGH |
| religious_affiliation | Religious orientation (Catholic, Jewish, Islamic, nonsectarian…) | CAT | S | PSS RELIG/ORIENT/DIOCESE | biennial | Y (private) | filter | HIGH |
| status | Open / Closed / New / Inactive / Future / Reopened | CAT | S | CCD UPDATED_STATUS | annual (+state updates) | Y | filter | HIGH |
| level | Elementary / Middle / High / Other | CAT | S | CCD LEVEL (derivable from grade span) | annual | Y | filter | HIGH |
| grade_lo / grade_hi | Lowest/highest grade offered | CAT | S | CCD GSLO/GSHI, PSS LOGR/HIGR | annual | Y | filter | HIGH |
| grades_offered | Per-grade booleans PK…13, UG, AE | ARRAY | S | CCD G_*_OFFERED | annual | Y | filter | HIGH |
| website | Official website URL | TEXT | S | CCD (31% blank!) + crawl enrichment | annual/volatile | N | display | HIGH/MEDIUM |
| phone | Main phone | TEXT | S | CCD/PSS | annual | N | display | HIGH |
| district_id | Parent LEA | FK | S | CCD LEAID | stable | Y (public) | filter | HIGH |
| accreditation | Accreditor name(s) + status | TEXT[] | S | Accreditor lists (Cognia, ICAISA…) | annual | N | display | MEDIUM |
| nais_member / tabs_member | Association memberships | BOOL | S | PSS P-items / association lists | biennial | N | signal (boarding proxy) | HIGH |

## 2. Location (`school_locations`)

| Field | Description | Type | Level | Source | Freq | Req | AI Use | Conf |
|---|---|---|---|---|---|---|---|---|
| address (mailing + location) | Street, city, state, ZIP, ZIP4 | JSONB | S/D | CCD M*/L* fields, PSS | annual | Y | filter | HIGH |
| latitude / longitude | Geocoded point | NUMERIC | S/D | EDGE geocode (100% CCD coverage verified) | annual | Y | filter (distance) | HIGH |
| county_fips / county_name | County | TEXT | S | EDGE | annual | Y | filter | HIGH |
| locale_code | NCES urban-centric locale 11 (city-large) … 43 (rural-remote) | CHAR(2) | S | EDGE LOCALE | annual | Y | filter/signal | HIGH |
| cbsa_code / cbsa_name | Metro/micro area | TEXT | S | EDGE | annual | N | filter | HIGH |
| congressional_district | CD code | TEXT | S | EDGE CD | annual | N | display | HIGH |
| state_leg_districts | SLDL/SLDU | TEXT | S | EDGE | annual | N | display | HIGH |
| timezone | IANA tz | TEXT | S | derived from lat/long | never | N | internal | INFERRED |
| attendance_boundary | Catchment polygon | GEO | S | **unavailable nationally (SABS dead 2015-16)**; district GIS where published | varies | N | filter (where exists) | MEDIUM |
| district_boundary | LEA polygon | GEO | D | EDGE/TIGER composite | annual | N | filter | HIGH |
| distance_to_user | Distance from student location | KM | — | computed (PostGIS) | realtime | Y | filter | INFERRED |

## 3. Enrollment & demographics (`school_enrollment`, `school_enrollment_detail`)

| Field | Description | Type | Level | Source | Freq | Req | AI Use | Conf |
|---|---|---|---|---|---|---|---|---|
| total_enrollment | Total students | INT | S/D | CCD 052 / PSS NUMSTUDS | annual/biennial | Y | filter/signal | HIGH |
| enrollment_by_grade | Count per grade | INT long | S | CCD 052 (grade rows) | annual | N | signal | HIGH |
| enrollment_by_sex | Male/female counts | INT | S | CCD 052 / PSS | annual | N | display | HIGH |
| enrollment_by_race | 7 race/ethnicity categories | INT long | S | CCD 052 / PSS P_* pcts | annual | N | display (see legal notes) | HIGH |
| diversity_index | Probability two random students differ in race/ethnicity | NUMERIC | S | computed from race counts | annual | N | signal (opt-in preference) | INFERRED |
| frl_count / frl_pct | Free/reduced-price lunch eligible | INT/PCT | S | CCD 033 (incl. direct certification) | annual | N | signal (economic context) | HIGH |
| el_count | English learners | INT | S | CRDC (school) / state / CCD LEA | biennial | N | filter (EL support) | HIGH (stale) |
| swd_count | Students with disabilities (IDEA/504) | INT | S | CRDC | biennial | N | display | HIGH (stale) |
| gender_of_school | Coed / boys / girls | CAT | S (private) | PSS MALES-derived / school | biennial | Y (private) | filter | HIGH |
| historical_enrollment | Enrollment time series | rows/year | S | CCD/PSS prior years | annual | N | signal (trend) | HIGH |

## 4. Staffing (`school_staff`)

| Field | Description | Type | Level | Source | Freq | Req | AI Use | Conf |
|---|---|---|---|---|---|---|---|---|
| teacher_fte | Classroom teacher FTE | NUMERIC | S | CCD 059 (98.1% coverage verified) / PSS NUMTEACH | annual | Y | internal | HIGH |
| student_teacher_ratio | total / teacher_fte | NUMERIC | S | computed (PSS ships STTCH_RT) | annual | Y | signal | INFERRED/HIGH |
| counselor_fte | School counselors | NUMERIC | S | CRDC; CCD LEA 059 (district) | biennial | N | signal | HIGH (stale) |
| students_per_counselor | Derived ratio | NUMERIC | S | computed | biennial | N | signal | INFERRED |
| pct_teachers_certified | Fully certified teachers % | PCT | S | CRDC | biennial | N | signal | HIGH (stale) |
| pct_teachers_novice | First/second-year teachers % | PCT | S | CRDC / state report cards | biennial | N | signal | HIGH (stale) |
| avg_teacher_salary | Average salary | USD | D (not S) | NCES F-33 fiscal / state | annual | N | display | HIGH |
| staff_by_category | Admins, aides, support staff FTE | NUMERIC long | D | CCD LEA 059 | annual | N | display | HIGH |

## 5. Performance (`school_performance` metric store)

Every metric row = (metric_code, subgroup, year, value, denominator, source). Metric codes are state-scoped where methodologies differ.

| Field | Description | Type | Level | Source | Freq | Req | AI Use | Conf |
|---|---|---|---|---|---|---|---|---|
| math_proficiency_pct | % proficient+ on state math test | PCT | S | State DOE files (primary); EDFacts/EDE (backfill) | annual | N | signal (in-state only) | HIGH |
| rla_proficiency_pct | % proficient+ reading/language arts | PCT | S | State DOE / EDFacts | annual | N | signal (in-state only) | HIGH |
| science_proficiency_pct | % proficient+ science | PCT | S | State DOE | annual | N | signal (in-state only) | HIGH |
| proficiency_by_subgroup | Same, per subgroup (EL, SWD, econ, race) | PCT | S | State DOE | annual | N | display (see legal) | HIGH |
| growth_metric | State growth/value-added measure | varies | S | State DOE (methodology varies wildly) | annual | N | signal (in-state) | HIGH |
| acgr_4yr | 4-year adjusted cohort graduation rate | PCT | S | State DOE / ED Data Express | annual | Y (HS) | signal | HIGH |
| acgr_extended | 5/6-year cohort rates | PCT | S | State DOE | annual | N | display | HIGH |
| attendance_rate | Average daily attendance % | PCT | S | State DOE (not all states) | annual | N | signal | HIGH |
| chronic_absenteeism_pct | % chronically absent | PCT | S | ED Data Express / state | annual | N | signal | HIGH |
| state_accountability_rating | State's own rating (A-F, 1-5 stars, index…) | TEXT/NUM | S | State DOE | annual | N | signal (in-state only) | HIGH |
| ap_participation_pct | % students in ≥1 AP course | PCT | S (HS) | CRDC | biennial | N | signal | HIGH (stale) |
| ap_pass_rate | % AP exams ≥3 | PCT | S | State report cards (some); College Board (licensed) | annual | N | signal | MEDIUM |
| sat_act_averages | Mean SAT/ACT | NUM | S | State report cards (some states) | annual | N | display | HIGH where published |
| college_enrollment_rate | % enrolling in college after HS | PCT | S | State report cards (some); NSC data is licensed | annual | N | signal | MEDIUM |
| metric_definition | Methodology text per metric_code | TEXT | — | metric_definitions table | static | Y | internal | — |

**Rule: never compare proficiency or accountability ratings across states. `comparable_scope` on every metric enforces this.**

## 6. Programs & activities (`school_programs`)

| Field | Description | Type | Level | Source | Freq | Req | AI Use | Conf |
|---|---|---|---|---|---|---|---|---|
| ap_offered / ap_course_count | AP availability + breadth | BOOL/INT | S | CRDC (count); state course files | biennial | N | filter+signal | HIGH (stale) |
| ib_offered | IB programme (PYP/MYP/DP) | BOOL+CAT | S | IBO public school finder / CRDC | annual | N | filter | HIGH |
| dual_enrollment | Dual/concurrent enrollment offered | BOOL | S | CRDC | biennial | N | filter | HIGH (stale) |
| gifted_program | Gifted & talented offered | BOOL | S | CRDC / state | biennial | N | filter | HIGH (stale) |
| advanced_math_science | Calculus, physics, chemistry, adv. math offered | BOOL each | S | CRDC | biennial | N | signal | HIGH (stale) |
| cte_programs | Career/technical program areas | CAT multi | S | State CTE files / Perkins | annual | N | filter | MEDIUM |
| language_programs | World languages / immersion | CAT multi | S | State course files / school sites | varies | N | filter | MEDIUM |
| stem_designation | STEM school/magnet theme | BOOL | S | State magnet/theme lists / school sites | varies | N | filter | MEDIUM |
| arts_programs | Visual/performing arts emphasis | CAT multi | S | School sites / state | varies | N | signal | MEDIUM/LOW |
| sports_offered | Interscholastic sports list | CAT multi | S (HS) | State athletic associations / school sites | annual | N | signal | MEDIUM |
| clubs | Club/activity list | TEXT[] | S | School-supplied only | volatile | N | display | MEDIUM |
| before_after_care | Extended care offered | BOOL | S | School sites / PSS items (K) | varies | N | filter | MEDIUM |
| esl_support | EL/ESL program | BOOL | S | CRDC EL counts (proxy) / school | biennial | N | filter | INFERRED |
| special_ed_services | SPED services detail | TEXT | S | School/district | varies | N | display | MEDIUM |
| montessori_waldorf_etc | Pedagogy type | CAT | S | PSS typology / school sites | biennial | N | filter | HIGH (private) |

## 7. Admissions (`school_admissions`)

| Field | Description | Type | Level | Source | Freq | Req | AI Use | Conf |
|---|---|---|---|---|---|---|---|---|
| admission_type | open_zone / lottery / selective / application | CAT | S | inferred (public default=zone; charter=lottery; magnet/private=application) + school verification | annual | Y | filter | INFERRED→MEDIUM |
| accepts_out_of_district | Inter-district transfer accepted | BOOL | S/D | State open-enrollment policy + district | annual | N | filter | MEDIUM |
| sevp_certified / accepts_international | Can enroll F-1 students | BOOL | S | DHS SEVP list | weekly-monthly | Y (Globaly) | **filter (core)** | HIGH |
| boarding | day / boarding / both | CAT | S (private) | PSS TABS proxy + school sites | biennial | Y (private) | filter | MEDIUM |
| application_deadline | Date(s) | DATE/JSONB | S (private/choice) | School sites | annual | N | filter | MEDIUM |
| application_fee | USD | NUM | S (private) | School sites | annual | N | display | MEDIUM |
| tests_required | SSAT / ISEE / HSPT / none | CAT multi | S (private) | School sites | annual | N | filter | MEDIUM |
| interview_required | Y/N | BOOL | S (private) | School sites | annual | N | display | MEDIUM |
| age_grade_requirements | Entry requirements | TEXT | S | School sites | annual | N | display | MEDIUM |
| requirements_status | verified / inferred / unverified | ENUM | S | ETL | per-update | Y | internal | — |

## 8. Costs (`school_costs`)

| Field | Description | Type | Level | Source | Freq | Req | AI Use | Conf |
|---|---|---|---|---|---|---|---|---|
| tuition_day | Annual day tuition (by grade band) | USD | S (private) | **School websites only** (no public dataset) | annual — must carry school_year | Y (private) | filter | MEDIUM |
| tuition_boarding | Annual boarding tuition | USD | S (boarding) | School websites | annual | N | filter | MEDIUM |
| registration/activity/transport/meal fees | Other fees | USD | S (private) | School websites | annual | N | display | MEDIUM |
| financial_aid_available | Aid offered | BOOL | S (private) | School websites | annual | N | filter | MEDIUM |
| pct_on_aid / avg_aid | Aid statistics | PCT/USD | S (private) | School-reported | annual | N | display | MEDIUM |
| per_pupil_expenditure | Public per-pupil spending | USD | D (some states S) | NCES F-33 / state report cards (ESSA requires school-level) | annual | N | signal | HIGH |
| district_revenue/expenditure | District finance detail | USD | D | NCES F-33 fiscal survey | annual | N | display | HIGH |

## 9. Reviews & sentiment (`school_reviews` — Globaly-native, future)

| Field | Description | Type | Level | Source | Freq | Req | AI Use | Conf |
|---|---|---|---|---|---|---|---|---|
| overall_rating | 1-5 stars | INT | S | Globaly users | realtime | N | signal (only with volume threshold + verification) | T6 |
| dimension_ratings | academics/teachers/safety/activities… | JSONB | S | Globaly users | realtime | N | signal (aggregated only) | T6 |
| reviewer_role | parent/student/alum/teacher | CAT | — | Globaly users | — | Y (per review) | internal | T6 |
| relationship_verified | Verified affiliation | BOOL | — | Globaly verification | — | Y | internal | — |
| moderation_status | pending/approved/rejected | ENUM | — | Globaly ops | — | Y | internal | — |
| review_text | Free text | TEXT | S | Globaly users | — | N | RAG context (quoted as opinion, never fact) | T6 |
| **Never ingest**: Niche/GreatSchools review text or ratings | — | — | — | ToS + copyright | — | — | — | — |

## 10. District-level (`districts`, `district_years`, `district_performance`)

| Field | Description | Type | Level | Source | Freq | Req | AI Use | Conf |
|---|---|---|---|---|---|---|---|---|
| nces_lea_id | 7-digit LEAID | CHAR(7) | D | CCD | stable | Y | internal | HIGH |
| lea_type | Regular / charter agency / supervisory union / state-operated… | CAT | D | CCD LEA_TYPE | annual | Y | filter | HIGH |
| operational_schools | # schools | INT | D | CCD (verified col) | annual | Y | display | HIGH |
| district_enrollment | Total students | INT | D | CCD LEA 052 | annual | Y | display | HIGH |
| district_staff | Teachers, counselors, admins FTE | NUM | D | CCD LEA 059 | annual | N | signal | HIGH |
| district_finance | Revenue/expenditure per pupil | USD | D | F-33 | annual | N | signal | HIGH |
| district_poverty_est | % children in poverty | PCT | D | Census SAIPE | annual | N | signal | HIGH |
| district_acgr | Graduation rate | PCT | D | ED Data Express / state | annual | N | signal | HIGH |
| open_enrollment_policy | Intra/inter-district choice policy | CAT | D/ST | State statute + district policy | annual | N | filter | MEDIUM |
| superintendent | Name/contact (public record) | TEXT | D | State directories | annual | N | display | HIGH |

## 11. Provenance (every fact table)

| Field | Description | Type |
|---|---|---|
| source_id | FK → sources registry | INT |
| school_year | The year the value describes (never mix years silently) | TEXT |
| collected_at / retrieved_at | When Globaly ingested it | TIMESTAMPTZ |
| is_suppressed | Value withheld by source (small-n) — keep the code | BOOL + value_text |
| confidence | HIGH / MEDIUM / LOW / INFERRED / UNKNOWN | ENUM |
| data_status | active / superseded / retracted | ENUM |

---

**Field count**: ~140 distinct consumer-meaningful fields (plus per-grade/per-race/per-metric expansions that multiply into thousands of stored data points per school). Fields deliberately excluded: individual-student anything (FERPA/PII), staff personal data beyond public-record leadership contacts, crime/discipline incident detail as a rankable metric, scraped third-party ratings/reviews.
