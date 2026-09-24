# U.S. K-12 School Data Research — Building an AI-Ready School Database for Globaly

**Research date:** 2026-08-25 · **Prepared for:** Globaly / Wonjala (GlobalyApp AI counselling)
**Companion files:** [Data Dictionary](US_K12_SCHOOL_DATA_DICTIONARY.md) · [Source Registry](US_K12_DATA_SOURCE_REGISTRY.md) · [Extraction Roadmap](US_K12_DATA_EXTRACTION_ROADMAP.md) · [SQL Schema](schemas/globaly_k12_schema.sql) · raw research in `research/`

---

## 1. Executive Summary

**The core question — "what data do we need to build a comprehensive U.S. school database?" — has a clear answer: a federal spine plus three enrichment layers.**

1. **Federal spine (available today, verified by download during this research):** NCES CCD gives every public school (102,178 schools, 19,629 districts, SY 2024-25), PSS gives every private school (22,344 schools, 2021-22), and EDGE geocodes join CCD 100% on the NCES school ID. This alone powers school search, maps, and basic profiles nationwide.
2. **National enrichment (available, slightly stale):** CRDC (AP/IB/gifted/counselors/magnet, 2021-22), ED Data Express (graduation rates, chronic absenteeism), and the DHS SEVP certified-school list (which K-12 schools can enroll international F-1 students — Globaly's differentiator, updated ~weekly).
3. **State layer (51 adapters, uneven):** assessment scores, accountability ratings, and fresher directories exist for every state, but formats range from Socrata APIs (CT, DE, WA, IA, PA) to PDF-only (WY) and hard bot-blocking (~15 states). State metrics are **not comparable across states** and must be stored per-state with methodology metadata.
4. **School-site layer (must be built):** tuition, admissions requirements, deadlines, and program details exist in **no public dataset** — they live only on school websites. This is the highest-effort, highest-value enrichment for Globaly's private/international segment.

**What Niche taught us (and what it didn't):** Niche's K-12 product is ~60% public data (NCES, CRDC, EDFacts, ACS — they cite these themselves) and ~40% a proprietary moat of user surveys, user-reported SAT/ACT, and school-partner-reported private-school data. Globaly can replicate the public-data experience fully and legally; the survey moat must be rebuilt natively over time, and the private-school data gap is closed by crawling official school websites instead of partner self-reporting.

**Biggest risks:** state-site bot-blocking (operational), cross-state metric non-comparability (analytical), stale biennial datasets presented as current (trust), and misusing demographic/discipline data in recommendations (legal/ethical).

---

## 2. U.S. K-12 Education Data Landscape

The U.S. has **no single national school database with everything**. Data authority is distributed:

```
U.S. Dept. of Education (NCES, OCR, OESE)     ← identity, enrollment, civil-rights, grad rates
   ↓ mandatory reporting
50 States + DC (SEAs)                          ← assessments, accountability, report cards
   ↓ 
~19,600 Districts (LEAs)                       ← boundaries, calendars, enrollment zones
   ↓
~102,000 public + ~22,000 private schools      ← tuition, admissions, programs, daily reality
```

Key structural facts (verified from SY 2024-25 CCD):
- **102,178** public school records; **99,259 open**, the rest closed/new/future/inactive — status tracking is built into the data.
- **8,398 charter schools**; charters are flagged with their authorizers.
- School types: 92,735 regular, 5,867 alternative, 1,926 special-education, 1,650 career/technical.
- Levels: 52,812 elementary, 16,254 middle, 23,831 high, plus PK-only, ungraded, "other" (K-12 spans).
- **19,629 LEAs** — includes regular districts, charter agencies, supervisory unions, state-operated agencies.
- Private schools (~22,300 in PSS 2021-22) are covered by a **separate biennial survey** with a separate ID system.
- Magnet status **left the CCD** in recent years (verified absent in 2023-24 and 2024-25 files) — CRDC/state sources must supply it.
- Territories: CCD covers PR/GU/VI/AS/MP; their own portals are PDF-heavy or stale — use CCD for them.

Entity model: **State → LEA (district) → School → grade/program offerings**, with private schools attached to state but not to an LEA.

---

## 3. Niche Data/Feature Analysis

Full reverse-engineered inventory (92 fields, section maps for public/private/charter/district profiles, search filters, and the published ranking methodology): [`research/niche_data_model.md`](research/niche_data_model.md). Method note: Niche blocks automated access; structure was cataloged from archived captures and Niche's public methodology pages — no proprietary content, review text, or ranking values were copied.

Highlights that shaped the Globaly model:

- **Profile anatomy** (public school): hero (name/type/grades/rating/#ranking) → report card (letter grades per topic) → templated summary sentence → about → academics (proficiency, grad rate, user-reported SAT/ACT, "popular colleges") → area/housing → culture & safety polls → students (enrollment, FRL%, diversity) → teachers (S-T ratio, salary, novice %) → clubs → similar schools → reviews.
- **Private profiles swap in:** Applying (deadline, fee, ISEE/SSAT, interview), Tuition (+ boarding price, % on aid, avg aid), Boarding (% boarding, 5/7-day, top countries, % international) — all school-partner-reported on Niche. **Globaly must source these from school websites instead.**
- **Niche's own cited sources:** NCES CCD, PSS, F-33 finance, SABS (dead), CRDC, EDFacts, Census ACS, National Student Clearinghouse (licensed), + their user surveys. This confirms the public-data backbone strategy.
- **Ranking methodology (published):** z-scores of factors → fixed grade distribution (A+ = top ~2.5%). Every topical grade blends 10-80% user-survey signal — e.g. Food is 80% surveys. **Implication: Niche grades cannot be reproduced from public data, and shouldn't be copied; Globaly needs its own transparent scoring (see §18 of the brief / §21 below).**
- **Search filters:** type (public/charter/magnet/private/boarding), religion, grade level, tuition band, boarding, gender, specialty (Montessori/online/SPED), academics/diversity/teachers grade thresholds, distance radius.
- **~60-63% of Niche's structured fields map to public sources.** The rest: user surveys/polls (not replicable), user-reported test scores, school-partner data (replaceable via crawling), NSC college-enrollment data (licensable).

### Niche Feature → Globaly Data Mapping (condensed; full table in research file)

| Niche feature | Data needed | Authoritative source | Alternative | Globaly field(s) | AI use | Availability |
|---|---|---|---|---|---|---|
| School search + filters | Universe, type, grades, location | CCD + PSS + EDGE | state directories | schools, school_years, school_locations | filter | ✅ now |
| Profile hero | Name, type, grades, city | CCD/PSS | — | schools | display | ✅ now |
| Academics section | Proficiency, grad rate | State DOE files; EDE | EDC archive | school_performance | signal (in-state) | ✅ state-by-state |
| AP/IB tags | Course offerings | CRDC; IBO finder | state course files | school_programs | filter | ✅ (2021-22 stale) |
| Students section | Enrollment, FRL%, race/ethnicity | CCD 052/033 | state | school_enrollment | display/signal | ✅ now |
| Teachers section | S-T ratio, novice %, salary | CCD 059; CRDC; F-33 (district salary) | state report cards | school_staff | signal | ✅ now/stale |
| Tuition & Applying (private) | Tuition, deadlines, tests | **school websites** | none public | school_costs, school_admissions | filter | ⚠️ build crawler |
| Boarding section | Boarding %, international % | school websites | PSS TABS-member proxy | school_admissions | filter | ⚠️ partial |
| Rankings / grades | Composite scores | — (Niche proprietary) | **build Globaly scores** | derived layer | signal | ⚠️ build |
| Reviews & polls | UGC | — (Niche proprietary) | **Globaly-native reviews** | school_reviews | signal (guarded) | ⚠️ build |
| Living in the Area | Income, rent, home values | Census ACS | — | out of scope v1 | display | ✅ if wanted |
| Similar schools | Embeddings/nearest-neighbor | computed | — | derived | signal | ⚠️ build |
| Boundary map | Attendance zones | **no national source (SABS dead 2015-16)** | district GIS | school_locations.attendance_boundary | filter | ❌ mostly unavailable |
| International readiness | F-1 certification | **DHS SEVP list** (Niche doesn't surface this!) | — | school_admissions.sevp_certified | **filter — Globaly advantage** | ✅ now |

---

## 4. Federal Data Sources

Full verified detail: [`research/federal_sources_verified.md`](research/federal_sources_verified.md) and Source Registry §1. Summary:

| Source | What | Latest | Verified | Role |
|---|---|---|---|---|
| **CCD** | Public school/LEA universe: directory, enrollment by grade×race×sex, staff FTE, FRL, virtual | SY 2024-25 (Jul 2025) | ✅ downloaded, 102,178 schools | **Spine** |
| **EDGE** | Geocodes, county, locale, CBSA, districts; boundary composites | SY 2024-25 | ✅ downloaded, 100% join | Geography |
| **PSS** | Private school universe | 2021-22 (2023-24 "spring 2026", not posted) | ✅ downloaded, 22,344 schools | Private spine |
| **CRDC** | AP/IB/dual/gifted, counselors, teacher certification, discipline, magnet | 2021-22 (rel. Jan 2025) | ✅ via agent | Programs/equity |
| **ED Data Express** | ACGR graduation, chronic absenteeism, assessment | ~2022-23+ | ⚠️ 403-blocked from our env | Outcomes |
| **EDC/Zelma archive** | EDFacts school-level proficiency 2009-10→2021-22 | 2021-22 | ✅ fetched | Backfill |
| **SEVP list** | F-1 certified schools | 2026-08-05 file | ✅ via agent | International flag |
| **Urban Institute API** | Harmonized CCD/CRDC/EDFacts API | — | ❌ Cloudflare-blocked | Convenience only |
| **F-33 / SAIPE** | District finance / poverty | annual | not downloaded | Context |

**CCD identifiers (the backbone):** `NCESSCH` (12-digit school ID = 7-digit `LEAID` + 5-digit `SCHID`), `ST_SCHID`/`ST_LEAID` (state IDs — the crosswalk to state data), `FIPST` (state). Verified 100% unique, 100% geocodable, 98.1% staff-joinable.

**Civil Rights Data Collection — what to use:** ingest AP/IB/dual-enrollment/gifted offerings and participation, advanced math/science course access, counselor & teacher staffing, magnet flag. Display-with-caution: discipline rates (self-reported, zero-inflation errors). Do **not** surface race-disaggregated discipline as a school-quality signal in recommendations (legal/ethical risk — see §19). Chronic absenteeism moved out of CRDC after 2017-18 — source from ED Data Express.

---

## 5. State Data Sources

Complete per-state findings with verified URLs: `research/states_01…05*.md`. Consolidated matrix: Source Registry §2. The landscape in one view:

- **States with real APIs (Socrata/CKAN/OData):** CT, DE, WA, IA, PA, VA (data.virginia.gov), CA (data.ca.gov). Build these adapters first — they're stable and machine-friendly.
- **States with excellent bulk flat files:** GA (GOSA CSV repo 2004-2025, predictable URLs), OK (CSV archive 2018-2025), TX (AskTED daily + TAPR), IL (nightly directory incl. non-public), WI (CSV ZIPs incl. private, 2025-26 already posted), MA, TN, OR, NY (nightly SEDREF; annual DBs in MS Access), NJ (Excel/Access), IN, IA.
- **Bot-blocked (need headless browser or manual runbooks):** AL, AZ, FL, KS (TLS failures), KY, LA, MD, MI, MS, MO, MT, NE, NH, OH, SC (fully blocked), WV (worst — dashboard-only + request forms), UT gateway, VA agency sites.
- **Weakest data posture:** WV, WY (PDF directory), MS, NV (no verified directory file; ratings lag to 2023-24), AL, ID (no standalone directory, no private registry), HI (JS-app dashboards), NM (masked assessment files, no bulk grad/enrollment).
- **Suppression rules vary:** CT <6, CA <11, CO <16 (subgroups), ND <10, DE ~79% of assessment rows redacted. Store suppression codes, never impute over them.
- **Release lag varies:** LA already posts SY 2025-26 LEAP; NJ released 2024-25 report cards in May 2026; NV's next portal update is Sept 2026 for older data.
- **Territories:** only PR has machine-readable (stale, 2020-21) files; use CCD for all territories.

**Practical consequence:** the state layer is 51 small ETL adapters, prioritized by (user demand × source friendliness), with a manual-download runbook for every blocked state. Never plan a uniform "state scraper".

---

## 6. Private School Data Sources

Full detail: [`research/private_school_sources.md`](research/private_school_sources.md).

- **PSS** is the universe spine: identity, address, lat/long, religious affiliation (RELIG/ORIENT/DIOCESE), level, enrollment (by grade/race/sex), teachers FTE, S-T ratio, coed status, hours, association memberships (NAIS/TABS etc. — TABS membership is the best public boarding proxy). **PSS has no tuition** (verified in the questionnaire). Biennial and stale (2021-22 current until the 2023-24 release lands).
- **SEVP certified school list (DHS)**: the only authoritative "accepts international F-1 students" source; dated PDF, ~weekly updates, needs parsing + name matching. **Core for Globaly.**
- **State nonpublic registries** (IL, WI, NY, NE, MD, ME + others) cross-check PSS coverage and add state IDs.
- **Associations/accreditors** (NAIS, TABS, NCEA, Cognia, ICAISA, NIPSA): public lookup pages for accreditation/membership corroboration; NAIS DASL benchmarking is **member-only** — do not scrape.
- **Tuition/admissions**: no public dataset exists. Strategy: **crawl official school websites** starting with the SEVP∩PSS subset (Globaly's international-ready private schools), QA against association aggregate stats, consider licensing a commercial dataset later only if crawl coverage disappoints.
- Data classes must stay labeled: **verified official** (PSS/SEVP/state registry) vs **school-reported** (website crawl) vs **inferred** (e.g., boarding inferred from TABS membership).

---

## 7. School-Level Data Model & 8. District-Level Data Model

Implemented in [`schemas/globaly_k12_schema.sql`](schemas/globaly_k12_schema.sql); every field defined in the [Data Dictionary](US_K12_SCHOOL_DATA_DICTIONARY.md). Shape:

- `schools` (canonical UUID + NCESSCH/PSS_PIN) → `school_years` (append-only per-year profile: name, status, type, charter, virtual, magnet, grades) → satellite fact tables all keyed `(school_id, school_year)`:
  - `school_locations` (EDGE geo), `school_enrollment` (+`_detail` long form), `school_staff`, `school_performance` (metric store), `school_programs`, `school_admissions`, `school_costs`, `school_reviews` (future), `school_identifiers`, `school_change_history`.
- `districts` → `district_years`, `district_performance` mirror the pattern; schools FK to districts; private schools have no district.
- **The metric store is the load-bearing design decision:** `school_performance(school_id, year, metric_code, subgroup) → value + denominator + suppression`, with `metric_definitions` carrying methodology text and `comparable_scope` (national | state) so the AI layer physically cannot mix incomparable metrics.
- Tables from the brief that research showed should NOT exist yet (facilities, extracurriculars, rankings, boundaries, snapshots, counties) are documented with reasons at the bottom of the SQL file — mostly "no authoritative source exists" or "the per-year keying already is the snapshot mechanism."

## 9-14. Data Category Findings (Academic, Demographic, Admissions, Cost, Programs, Geographic)

| Category | National source? | State source? | School source? | Verdict |
|---|---|---|---|---|
| **Academic performance** | ACGR + absenteeism (EDE); historical proficiency (EDC archive) | ✅ every state, own test + rating, annual | — | Store per-state; never cross-compare; keep raw metric + methodology + year |
| **Demographics** | CCD (public), PSS (private), CRDC (EL/SWD) | fresher in some states | — | Complete; display carefully (see §19) |
| **Admissions** | SEVP (international); charter⇒lottery, magnet⇒application inferable | open-enrollment policies per state | deadlines/tests/fees only on school sites | 3-tier confidence: verified / inferred / missing |
| **Cost** | F-33 per-pupil (public, district); ESSA school-level spending via states | some report cards | **tuition only on school websites** | Tuition always stored with school_year + collected_at; never display undated tuition |
| **Programs/activities** | CRDC (AP/IB/dual/gifted, biennial); IBO finder | CTE + course files (some) | clubs/sports/arts detail | CRDC for filters now; school-site crawl for depth |
| **Geographic** | EDGE (points, locale, districts) ✅ complete | — | — | Only gap: attendance boundaries (SABS dead; district GIS or vendor) |

## 15. Reviews & Sentiment

Niche's review system (star + role + topic + moderation + helpful votes) is a good structural template; its content is untouchable (copyright + ToS). Globaly design (schema ready in `school_reviews`): 1-5 overall + per-dimension JSONB ratings, reviewer role, **verified-relationship flag**, moderation pipeline, timestamps. AI usage rules: aggregate ratings become soft signals only above a volume threshold (e.g. n≥10) and never override facts; review text is RAG context quoted as opinion ("parents mention…"), never asserted as fact; individual reviews from minors carry no identifying info.

## 16. Historical Data

- Store every year as new rows (schema enforces by PK `(entity, school_year)`); never overwrite.
- Practical depth: CCD back to 1986-87 exists; **load 5 years** (2020-21→2024-25) for trends at MVP; deepen on demand. PSS: last 3 waves. Assessment: 2016-17+ where states publish archives (GA 2004+, MA 2006+, OK 2018+ verified).
- Trend signals worth computing: enrollment trajectory (growth/decline), proficiency trend vs state average, staffing-ratio trend. COVID years (2019-20, 2020-21) need caveat flags — assessments were suspended/waived.

## 17. Data Quality Framework

Every fact row carries: `source_id` (→ sources registry with URL/license/retrieved_at), `school_year`, `collected_at`, `is_suppressed` (+ original suppression code in value_text), and confidence:

- **HIGH** — federal/state agency file
- **MEDIUM** — official school website / school-reported
- **LOW** — reputable third party
- **INFERRED** — computed (S-T ratio, diversity index, admission_type defaults)
- **UNKNOWN** — provenance lost (should not exist in production)

Rules: no silent cross-year merging (a profile shows "Enrollment: 562 (2024-25)" not "Enrollment: 562"); suppressed ≠ zero ≠ missing (three distinct states); every derived metric names its inputs; QA gates on ingestion (row-count deltas vs prior year, ID-uniqueness, join-rate thresholds — the 100%/98.1% CCD baselines from this research are the reference points).

## 18. Source Hierarchy

Registry §4 defines the full conflict-resolution ladder: **Federal > State > District > School > Association > Third-party > User**, with one exception — a *fresher* lower-tier source beats a *staler* higher-tier one for volatile operational fields only (status, contact, website, tuition), and both rows keep provenance so the decision is auditable per field.

## 19. Data Licensing / Legal Considerations

Full risk register: [`research/crdc_and_legal.md`](research/crdc_and_legal.md). Essentials:

- **Federal data is public domain** (17 U.S.C. §105) — CCD, PSS, EDGE, CRDC, SEVP; no attribution required (we attribute anyway for trust). State data: overwhelmingly public records; respect portal terms.
- **FERPA** governs student-level records — nothing in this architecture touches student PII. Preserve small-n suppression; never attempt re-identification or cross-dataset inference of small cells.
- **Do NOT:** scrape or reproduce Niche/GreatSchools content, ratings, or reviews (ToS + compilation copyright); ingest NAIS member-only data; use College Board CEEB/AP data without license; collect any individual student data; let the AI counsellor use race/ethnicity composition or discipline rates as ranking signals (discriminatory-steering exposure — display as neutral facts only, or behind explicit user intent like "diverse student body").
- **COPPA/minors:** Globaly's users include minors — review flows need age gates; no minor PII in published content.
- Facts are not copyrightable; curated compilations and review text are. Building from primary sources (as designed here) is legally clean.

## 20. Recommended Architecture & Ingestion Strategy

```
                    ┌─ Federal adapters (CCD, PSS, EDGE, CRDC, EDE, SEVP)   [annual/biennial/weekly]
  Source adapters ──┼─ State adapters ×51 (API > flat-file > headless/manual) [annual, staggered]
                    └─ School-site crawler (tuition/admissions/programs)     [seasonal]
        ↓ raw zone (files as downloaded, hashed, immutable)
  Staging/normalization (schema mapping, ID resolution, suppression handling, QA gates)
        ↓
  Core Postgres (schema in /schemas) — append-only facts + provenance
        ↓
  Serving layers: search index (hard filters + geo) · per-school fact sheets w/ year+confidence (RAG)
                  · derived Globaly scores (transparent methodology) · comparison API
```

- **API ingestion** where offered (7 states, SEVP); **batch ETL** for federal + flat-file states; **headless-browser fetchers + manual runbooks** for blocked states; **crawler** only for school-site data with no alternative.
- Idempotent, versioned loads: same file hash ⇒ skip; new version (1a→2a) ⇒ supersede with `data_status`.
- Entity resolution service sits between staging and core (below).

## 21. Ranking/Scoring (Globaly framework)

Do not copy Niche grades. Publishable Globaly dimensions, computed only from HIGH-confidence inputs, each with a "why" explanation and a minimum-data requirement (no score shown if inputs missing — never a default C):

| Dimension | Inputs | Normalization | Note |
|---|---|---|---|
| Academic Performance | state proficiency + growth + rating | z-score **within state only** | labeled "vs. state" |
| College & Career Readiness | ACGR, AP/IB/dual breadth (CRDC), CTE | national where metric is national (ACGR), else state | |
| Student Support | S-T ratio, students-per-counselor, certified-teacher % | national percentile | |
| Program Availability | count of verified programs vs level peers | national within level | filterable facts first |
| Affordability (private) | tuition vs metro/state peers, aid availability | metro percentile | dated tuition only |
| International Readiness | SEVP cert, ESL support, boarding | boolean tier + evidence list | **Globaly-unique** |

Presentation rule: scores are decision aids with visible methodology + data year, never "the truth about a school." Subjective dimensions (happiness, food, culture) stay unscored until Globaly-native review volume exists.

## 22. Entity Resolution Strategy

- **Public schools:** NCESSCH is canonical (verified unique). State data joins via `ST_SCHID`/`ST_LEAID` (carried in CCD — a free crosswalk). Fuzzy name+city+ZIP matching only as last resort with human-review queue.
- **Private schools:** PSS `PPIN` canonical; SEVP list, state registries, and websites matched by normalized name + city + state + ZIP (+ geocode proximity <500m as tiebreaker). Expect ~5-10% needing manual review.
- **Lifecycle:** CCD status transitions (New/Added/Closed/Reopened/Changed Agency) drive `school_change_history`; a closed NCESSCH is never reused by NCES; renames keep the ID (name history preserved in `school_years`); merges recorded as `merged_into`. Globaly `school_id` (UUID) is permanent and survives all external ID churn; public URLs/slugs map to it.

## 23. Data Availability Matrix (what powers which product capability)

| Capability | Ready now (federal) | Needs state adapters | Needs crawling | Not available |
|---|---|---|---|---|
| Search by location/grade/type/charter/virtual | ✅ | | | |
| Private school search incl. religion, coed | ✅ (2021-22) | | | |
| "Accepts international students" | ✅ SEVP | | | |
| Enrollment, demographics, FRL, S-T ratio | ✅ | fresher | | |
| AP/IB/gifted filters | ✅ CRDC (stale) | fresher in some | depth | |
| Graduation rate | ⚠️ EDE (access issue) | ✅ | | |
| Test performance / ratings | historical only | ✅ (51 adapters) | | |
| Tuition, deadlines, admission tests | | | ✅ | |
| Boarding details, international % | proxy only | | ✅ | |
| Clubs/sports/facilities detail | | partial | ✅ | |
| Attendance boundaries | | district GIS partial | | ❌ national |
| Reviews/sentiment | | | | ❌ build native |
| Safety/discipline as quality metric | | | | ❌ by policy |

## 24. Risks / Gaps

1. **Bot-blocking** (≈15 SEAs, ED Data Express, Urban API) — mitigations: headless fetching, manual runbooks, alternate networks, data.gov mirrors.
2. **Staleness**: PSS 2021-22, CRDC 2021-22 — always display data year; refresh the moment 2023-24 releases land (both expected 2026-2027).
3. **Cross-state comparability** — enforced by `comparable_scope`; the counsellor prompt must say "strong in math *for Texas*".
4. **Suppression** — small schools/subgroups have many masked values; UI needs "not published for privacy" states.
5. **Tuition drift** — crawl yearly; show collection date; never infer current from old.
6. **Entity-resolution errors** for private/SEVP matching — human review queue.
7. **Legal** — the three standing prohibitions: no scraped proprietary content, no student PII, no demographic/discipline ranking signals.
8. **Single-analyst risk in state adapters** — 51 bespoke pipelines will break annually; budget maintenance.

## 25. MVP / Phase 2 / Phase 3 Datasets

- **MVP (weeks 1-3):** CCD directory + EDGE + staff + lunch + LEA (all verified, script ready) + PSS + SEVP flag. Powers: nationwide search, maps, profiles with enrollment/S-T ratio/FRL, private-school discovery with religion/coed/boarding-proxy, international-ready filter. *This is already a differentiated product.*
- **Phase 2:** CRDC programs + ED Data Express graduation/absenteeism + top-10 state adapters (CA, TX, NY, FL, MA, WA, IL, GA, NJ, PA) + 5-year history. Powers: performance signals, AP/IB filters, trends, comparisons.
- **Phase 3:** remaining 41 state adapters, school-site crawler (tuition/admissions for SEVP∩PSS set first), IBO/athletic/CTE lists, Globaly scores, native reviews, counselling fact sheets (RAG).

---

## 26. Final Research Summary (§30 answers)

**Minimum dataset for a U.S. school discovery system:** CCD directory + EDGE geocodes + PSS + CCD enrollment/staff/lunch. Four downloads, ~125k schools, all public domain — verified working in this research.

**Complete dataset for an AI school counsellor:** the above + CRDC programs + graduation/absenteeism + per-state assessment & ratings + SEVP + crawled tuition/admissions/programs + (later) native reviews — every fact carrying year, source, confidence, and comparability scope.

**Obtainable nationally:** identity, geography, enrollment, demographics, staffing, FRL, charter/virtual status, AP/IB/gifted (biennial), graduation, absenteeism, F-1 certification, private-school universe.

**Requires state-by-state collection:** assessment proficiency, growth, accountability ratings, fresher directories/status, some course/CTE data — 51 adapters, wildly uneven formats.

**Requires school-level enrichment:** tuition and fees, admissions requirements/deadlines, boarding detail, clubs/sports/facilities, program depth, current website/contact for the 31% of schools where CCD lacks a website.

**Difficult/unavailable:** attendance boundaries (SABS discontinued 2015-16), national SAT/ACT averages per school, college-destination data (NSC is licensed), private-school outcomes, anything behind the ~15 bot-blocked state portals without manual work, comparable cross-state performance (by design impossible).

**Build first:** the federal spine (Phase 1) — the pipeline is proven and the schema exists; then SEVP+PSS because international-ready private-school discovery is Globaly's edge.

**Do NOT collect:** student-level records/PII (FERPA), scraped Niche/GreatSchools content or reviews, member-only association data, CEEB codes without license, individual staff PII, race/discipline data as ranking inputs.

**Biggest data-quality risks:** stale biennial data presented as current; cross-state metric conflation; suppression mishandling; entity-resolution errors on private schools; silent year-mixing.

**Biggest legal/licensing risks:** scraping ToS-protected aggregators; redistributing licensed datasets (NSC, College Board); discriminatory steering via demographic/discipline signals; minors' privacy in reviews.

**Recommended architecture:** raw-zone → staging with entity resolution + QA gates → append-only Postgres core (provenance on every row) → serving layers (geo search index, per-school dated fact sheets for RAG, transparent derived scores). Schema: `schemas/globaly_k12_schema.sql`.
