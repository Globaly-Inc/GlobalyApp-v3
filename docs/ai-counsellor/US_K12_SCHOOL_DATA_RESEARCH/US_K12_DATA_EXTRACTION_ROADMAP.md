# U.S. K-12 Data Extraction Roadmap (Globaly)

Research date: 2026-08-25. Volumes marked **verified** were confirmed by actual download during this research; the pipeline for Phase 1 already exists in `data/download_and_extract.ps1`.

## Guiding rules
- Never scrape where an official file/API exists.
- Every ingestion run records: source URL, school year, retrieved_at, file hash.
- History is append-only; a new year never overwrites an old year.
- Bot-blocking is the #1 operational hazard (≈15 state DOEs + ED Data Express + Urban Institute blocked our automated clients). Every state adapter needs a manual-download runbook fallback; schedule state pulls through a headless browser with realistic UA where permitted.

---

## Phase 1 — Core national dataset (public schools) ✅ PIPELINE PROVEN

| | |
|---|---|
| Sources | NCES CCD SY 2024-25 (school + LEA directory, membership, staff, lunch, characteristics), EDGE geocodes 2024-25 |
| Data | Identity, addresses, status, type, charter, virtual, grade span, enrollment, teacher FTE, FRL, lat/long, county, locale, CBSA |
| Method | Direct ZIP download (URL pattern documented) → CSV load → join on NCESSCH |
| Volume | **verified: 102,178 schools; 19,629 LEAs; 100% geocode join; 98.1% staff join** |
| Difficulty | Low — no blocking, stable formats, public domain |
| Refresh | Annual (preliminary directory ~July, final v1a within the year). Watch https://nces.ed.gov/ccd/files.asp |
| Dependencies | None |
| Risks | Version churn (1a→2a revisions); membership file size (192 MB zip, ~10M rows) — stream-load |

## Phase 2 — State-level enrichment

| | |
|---|---|
| Sources | 51 state adapters (see Source Registry §2 for each state's verified files) |
| Data | State IDs, fresher directory status, assessment proficiency, accountability ratings, graduation, attendance/absenteeism, enrollment detail |
| Method | Tiered: (a) API states first — CT, DE, WA, IA, PA, VA, CA (Socrata/CKAN); (b) predictable flat-file states — GA (GOSA CSV repo), OK (CSV archive), TX (AskTED + TAPR), IL, WI, TN, OR, MA, NJ, NY (Access→CSV); (c) headless-browser/manual states — the ~15 bot-blocked (AL, KS, SC, WV, OH, MI, MS, MO, MD, LA…) |
| Volume | ~100k school-year metric sets per year; per state 200–8,000 schools |
| Difficulty | Medium-high; 51 bespoke adapters, suppression handling per state |
| Refresh | Annual, staggered Aug–Dec releases (some states lag: NJ SPR released May 2026 for 2024-25) |
| Dependencies | Phase 1 (join on NCESSCH via state↔NCES crosswalk; CCD carries ST_SCHID) |
| Risks | ID crosswalk gaps; site redesigns (NC mid-reorg); WAFs; metric non-comparability across states — enforce `comparable_scope='state'` |
| Priority order | Start with Globaly's top student markets + easiest sources: CA, TX, NY, FL*, MA, WA, IL, GA, NJ, PA (*FL needs manual runbook) |

## Phase 3 — Private school enrichment

| | |
|---|---|
| Sources | PSS 2021-22 now (**verified: 22,344 schools**); PSS 2023-24 when posted; DHS SEVP certified list; state nonpublic registries (IL, WI, NY, NE, MD, ME verified); accreditor lists |
| Data | Private universe, affiliation, enrollment, teachers, coed, boarding proxy (TABS), lat/long; SEVP F-1 certification flag |
| Method | PSS: direct CSV download. SEVP: fetch dated PDF with browser UA → parse table → entity-match on name+city+state. Registries: per-state files |
| Volume | ~22k private schools; SEVP list ~10-12k certified schools (all levels; K-12 subset smaller) |
| Difficulty | Low (PSS) / Medium (SEVP PDF parsing + name matching) |
| Refresh | PSS biennial; SEVP weekly-monthly re-fetch |
| Dependencies | Phase 1 schema; entity-resolution service |
| Risks | PSS staleness (2021-22 until "spring 2026" release actually lands); PSS↔SEVP name matching precision — human-review queue for low-confidence matches |

## Phase 4 — Academic/performance enrichment (national layers)

| | |
|---|---|
| Sources | ED Data Express (ACGR + assessment; **blocked from our env — needs alternate network or manual pull**), Education Data Center archive (2009-10→2021-22 backfill), CRDC 2021-22 flat files |
| Data | National graduation rates, chronic absenteeism, historical proficiency; CRDC: AP/IB/dual/gifted offerings, counselors, teacher certification, magnet flag |
| Method | Bulk CSV downloads; CRDC is one big school-level flat file set per collection |
| Volume | ~97k schools × ~40 usable CRDC field groups; assessment ~100k schools × 2 subjects × subgroups × years |
| Difficulty | Medium — suppression ranges ("80-84%") need interval storage; CRDC quality flags |
| Refresh | CRDC biennial (watch for 2023-24 release, expected late 2026/2027); EDE annual |
| Dependencies | Phase 1 |
| Risks | EDE access blocking; CRDC discipline data misuse — ingest but gate behind display-with-caution policy |

## Phase 5 — Programs, activities & school-site enrichment

| | |
|---|---|
| Sources | School websites (tuition, admissions, programs, clubs, sports), IBO school finder (IB), state CTE/athletic-association lists |
| Data | Tuition by grade band (private), application deadlines/fees/tests, program lists, boarding details |
| Method | Targeted crawler over official school sites (respect robots.txt) + LLM extraction into structured fields with `requirements_status`/confidence; start with SEVP∩PSS private schools (Globaly's core segment), then top-market publics. Note: 31% of CCD public schools have no website on file — website discovery step required |
| Volume | Start ~5k priority private schools; long tail 120k+ |
| Difficulty | High — unstructured, volatile, needs QA sampling |
| Refresh | Annual (tuition cycles); deadlines each admissions season |
| Dependencies | Phases 1+3 (universe + websites); crawl infra |
| Risks | Extraction errors presented as fact — every school-site fact carries MEDIUM confidence + collected_at, and tuition always carries school_year |

## Phase 6 — Reviews & sentiment (Globaly-native)

| | |
|---|---|
| Sources | Globaly users only (parents/students/alumni/teachers). **Never scrape Niche/GreatSchools reviews** |
| Data | Ratings, dimension ratings, review text, verified-relationship flag |
| Method | Product feature + moderation pipeline (see schema `school_reviews`) |
| Volume | Grows with product usage; cold-start via counselor-authored school notes |
| Difficulty | Product/ops work, not extraction |
| Risks | Fake reviews → verification + moderation; defamation → moderation policy; minors' privacy → no PII in published reviews, COPPA-aware flows |

## Phase 7 — AI recommendation dataset

| | |
|---|---|
| Sources | All prior phases |
| Data | Denormalized per-school "counselling document": facts + metric explanations + confidence, embeddings for semantic search, hard-filter columns indexed |
| Method | ETL builds: (a) filterable search index (location/grade/type/tuition/programs/eligibility), (b) per-school JSON fact sheet with source+year on every number for RAG grounding, (c) derived signals (Globaly dimension scores) computed with published methodology |
| Dependencies | Phases 1-5 minimum; 6 optional |
| Risks | Model asserting stale/suppressed values — fact sheets must embed year + confidence inline so the counsellor model can qualify statements; cross-state comparison guardrails in prompt + data (`comparable_scope`) |

---

## Refresh calendar (steady state)

| Cadence | Job |
|---|---|
| Weekly | SEVP list re-fetch; school-status change detection for priority markets |
| Monthly | School-website recrawl for open admissions seasons (Nov–Mar) |
| Annual (Jul-Aug) | CCD preliminary directory + EDGE geocodes |
| Annual (Aug-Jan) | State report-card/assessment adapters as each state releases |
| Biennial | PSS; CRDC |
| Continuous | Globaly reviews; user-reported corrections queue |

## Build order recommendation

1. **Week 1-2**: Phase 1 load into Postgres schema (script exists; schema exists) → immediately powers search/discovery MVP for all public schools.
2. **Week 2-3**: Phase 3 PSS + SEVP → private schools + international flag (Globaly's differentiator) live.
3. **Week 3-6**: Phase 4 CRDC + graduation → programs & outcomes on profiles.
4. **Week 6-12**: Phase 2 top-10 state adapters → performance data where most users are.
5. **Quarter 2**: Phase 5 tuition/admissions crawler for priority private schools; remaining state adapters.
6. **Quarter 3+**: Phases 6-7.
