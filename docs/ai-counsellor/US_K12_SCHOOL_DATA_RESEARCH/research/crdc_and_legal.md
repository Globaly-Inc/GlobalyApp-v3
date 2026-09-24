# CRDC & Legal/Ethical/Licensing Research — U.S. K-12 School Database

Research date: 2026-08-25 | For: GlobalyApp AI counselling school-discovery product

---

# PART A — Civil Rights Data Collection (CRDC)

## A1. Latest available year & cadence

- **Latest public release: 2021-22 CRDC** — released by OCR on **January 16, 2025** (public-use data file + "A First Look" report + data-quality snapshot).
- **2023-24 CRDC**: collection window Dec 9, 2024 – Apr 7, 2025 (deadline extended from Mar 7). **Public-use file NOT yet released as of Aug 2026.** Based on the historical lag (2020-21 collected 2022 → released Nov 2023; 2021-22 collected 2023 → released Jan 2025), expect the 2023-24 public file **late 2026 – 2027**.
- **Cadence**: biennial (every other school year). Next collection is 2025-26; its submission system opens fall 2026, so its data won't be public until ~2028.
- Practical implication: **build the pipeline against 2021-22 now**, design for a drop-in refresh when 2023-24 lands (schemas are largely stable module-to-module, but element lists change each cycle — check the flat-file spec on release).

## A2. Where the data lives, formats, structure

- **Download hub**: https://civilrightsdata.ed.gov/data — public-use data files per collection year.
- **Format**: ZIP archives of **CSV flat files**, one file per module/topic (e.g., Enrollment, Advanced Placement, Suspensions), plus a combined national file for some years. Accompanied by:
  - **Public-Use Data File User's Manual** (structure, suppression rules, reserve codes)
  - **Flat File Specifications / Code Book** (field name, order, description per file)
  - **Data Notes appendix** (known quality issues per element/district)
- **Structure**: school-level rows keyed by a 12-digit combined ID (**7-digit LEAID + 5-digit school ID**, aligning to NCES CCD `NCESSCH`), plus LEA-level files for district-only items (e.g., civil-rights coordinators, harassment policies). Most count fields are disaggregated by **race/ethnicity (7 categories) × sex**, with separate columns for IDEA, 504, and EL subsets.
- **Reserve codes** in cells: negative values (e.g., -3 skip, -5 action plan, -9 not applicable, -11 suppressed) — must be handled in ingestion, never treated as counts.
- Also mirrored on data.gov (`catalog.data.gov/?q=crdc`) and queryable via the site's report tool (school/district/state/national lookups).

## A3. School-level field categories

Note: **chronic absenteeism is NOT in the CRDC since 2017-18** — it moved to EDFacts (FS195) and is published school-level via ED Data Express / EDFacts files. Source it from there instead.

| Field group | Example fields | AI-counselling suitability | Caution notes |
|---|---|---|---|
| Enrollment & demographics | Total enrollment by race × sex; EL enrollment; IDEA enrollment; 504-only enrollment | **Yes — core** | Use for context/diversity display; overlaps CCD enrollment (prefer CCD as canonical, CRDC for subgroup detail) |
| AP program | School offers AP (Y/N); # AP courses; AP enrollment by race/sex/EL/IDEA; AP exam-taking (some cycles) | **Yes — high value** | Course counts are self-reported; a school reporting 0 courses may be a reporting error; AP participation by subgroup is analytical, not a headline stat |
| IB & dual enrollment | IB program (Y/N) and enrollment; dual/concurrent enrollment program (Y/N) and enrollment by subgroup | **Yes — high value** | Same self-report caveats; dual-enrollment definitions vary by state |
| Gifted & talented | GATE program (Y/N); GATE enrollment by race/sex | **Yes (offering flag); subgroup counts with caution** | GATE identification practices vary wildly; subgroup disparity framing is analytical/risky |
| Advanced math & science courses | Algebra I (by grade 7-8 vs 9-12), Geometry, Algebra II, Advanced Math, Calculus, Biology, Chemistry, Physics, Computer Science — offered + enrollment by subgroup | **Yes — high value** | Best used as "course access" indicators (e.g., "offers Calculus & Physics"); enrollment counts noisier than offer flags |
| Discipline | In-school suspensions, out-of-school suspensions (1 vs >1), expulsions (with/without services, zero-tolerance), transfers to alternative school, corporal punishment, referrals to law enforcement, school-related arrests — all by race/sex/IDEA/504/EL | **Display with strong caution** | Most error-prone module: underreporting, zero-inflation, logical inconsistencies (see A4). If shown at all, show school-total rates with year + "self-reported" label; never as a quality score |
| Discipline disparities by race | Same counts, cross-tabbed by race | **Analytical only — do not surface as school "quality"** | High misinterpretation risk; small-n instability; suppression holes; risk of steering families along racial lines (fair-housing-adjacent concern) |
| Restraint & seclusion | Mechanical/physical restraint, seclusion instances & students, by subgroup | **No (internal/analytical only)** | GAO (GAO-19-551R) found severe underreporting — ~70% of districts reported zeros, most unverified |
| Harassment/bullying | Allegations by basis (sex, race, disability, religion...); students disciplined; students reported as harassed | **No / analytical only** | Zero can mean "no incidents" or "didn't report"; low counts ≠ safe school — inverse-reporting bias |
| Offenses | Incidents of violence (with/without weapon), robbery, sexual assault, rape, homicide, firearm possession | **No / analytical only** | Same zero-inflation problem; sensational fields, high harm if misread |
| Teachers | FTE teacher counts; certified teachers; first- and second-year teachers; teacher absenteeism (>10 days) | **Yes (derived indicators)** | Use as % certified / % novice; absenteeism definition is crude; small schools noisy |
| School counselors & support staff | FTE counselors, social workers, psychologists, nurses | **Yes — high value** | Show as student-per-counselor ratio (families understand it); 0 FTE may be a shared/district-level staff artifact |
| Security staff & policing | Sworn law-enforcement officers/security guards FTE; school resource officer presence | **Neutral display only** | Interpretations differ by family; present as fact, never scored good/bad |
| School characteristics | Charter/magnet/alternative/JJ facility flags; grades offered; preschool program & enrollment | **Yes** | Cross-check against CCD flags (CCD canonical) |
| Retention | Students retained by grade × race/sex | Analytical only | Noisy, small counts |
| Chronic absenteeism | **Not in CRDC since 2017-18** | Ingest from EDFacts/ED Data Express (FS195) instead | Post-COVID years have known state comparability issues |

## A4. Known data-quality issues

1. **Self-reported, no audit**: LEAs certify their own submissions; OCR does limited validation. Course, staffing, and discipline counts all inherit this.
2. **Discipline underreporting / zero-inflation**: GAO-19-551R found restraint/seclusion zeros overwhelmingly unverified; similar zero-inflation affects harassment, offenses, and arrests. A zero is not evidence of absence.
3. **Logical inconsistencies**: e.g., 2017-18 schools reporting fewer OSS *instances* than *students* suspended (impossible per OCR guidance) — documented in OCR Data Notes.
4. **Quality suppression**: since 2017-18 OCR suppresses values failing quality rules or flagged as outliers (reserve code in file). EdTrust estimated **~11% of suspension data suppressed** in the 2020-21 file. Suppression is for *quality*, not privacy — CRDC does not do small-n privacy suppression the way state DOEs do, but suppressed cells still create coverage holes.
5. **COVID-era anomalies**: 2020-21 (remote year) is unusable for discipline/absences; 2021-22 partially recovered but OCR's own "Data Quality from Start to Finish" snapshot documents remaining issues.
6. **Cycle-to-cycle element churn**: elements are added/retired each collection (chronic absenteeism out in 2017-18; various changes in 2023-24 per the "General Overview, Changes, and List of Data Elements" doc) — pipelines must be spec-driven per year, not hardcoded.
7. **Staleness**: biennial + 1.5–2yr release lag means "latest" data is 3-4 school years old at display time — always label the school year prominently in the product.

## A5. Suitability summary for the product

- **Ingest & display**: AP/IB/dual-enrollment/advanced-course offerings and enrollment, gifted program flag, counselor/teacher-derived ratios (% certified, % novice, students-per-counselor), school characteristics. These answer real family questions ("does this school offer Calculus/AP/IB?") and are the most reliable modules.
- **Display with caution (facts, labeled, never scored)**: overall suspension/expulsion rates, security-staff presence.
- **Analytical only / never surface as school quality**: per-race discipline disparities, harassment/bullying, offenses, restraint/seclusion. Useful internally for equity research; surfacing them in rankings or AI recommendations invites misinterpretation, defamation-adjacent complaints from schools, and discriminatory-steering concerns.

---

# PART B — Legal / Ethical / Licensing Risk Register

## B1. Framework confirmations

- **FERPA (20 U.S.C. §1232g)**: governs **student-level education records held by schools/districts**; it does not restrict use of aggregate, de-identified, publicly released datasets like CRDC/CCD/EDFacts. The relevant residue is **small-n suppression**: agencies must release aggregates in a form that doesn't allow re-identification, so public files suppress/blur small cells (state DOEs typically suppress n<10 or use "<5"/"*" masks; EDFacts blurs; CRDC uses quality-based reserve codes). Consequence for us: **never attempt to reverse or cross-derive suppressed cells**, and preserve suppression symbols through the pipeline.
- **Federal data licensing**: works of the U.S. Government are **public domain (17 U.S.C. §105)** — NCES CCD, EDFacts, CRDC data and documentation carry **no license restrictions and no legal attribution requirement**. NCES requests citation as good practice; ed.gov content policy allows free reuse. Only trap: third-party content occasionally embedded in federal reports (rare in flat files).
- **State DOE portals**: data is generally public record; most portals have no restrictive license, some assert terms (attribution, no-bulk-download, or API keys). Pattern: **treat facts as free, honor per-portal ToS on access method** (prefer documented bulk downloads over scraping portal UIs).
- **Niche.com** (User Agreement, niche.com/about/terms/ — site blocks automated fetch (HTTP 403), language verified via indexed excerpts): prohibits users to "alter, modify, copy, distribute, transmit, display, perform, reproduce, reuse, post, publish, license, hyperlink to, promote, frame, download, cache, store for subsequent use, create derivative works from, transfer, or sell any information or content" from the site; standard prohibitions on automated access/scraping apply, and the site actively enforces with bot-blocking. **Do not scrape Niche; do not reproduce Niche grades or reviews.**
- **GreatSchools (comparison point)**: their 1-10 ratings are proprietary and **commercially licensed** (Enterprise Data License; NearbySchools API excludes the ratings; public API is metered, ~15k calls base). This is the industry model to emulate or license from — it also demonstrates that *derived ratings are protectable expression even when built on public data*.
- **Facts vs. expression (Feist v. Rural, 1991)**: raw facts (a school's AP count, enrollment, address) are **not copyrightable** regardless of source. Protectable: creative **selection/arrangement** of compilations, and original expression (Niche grades, GreatSchools ratings, written reviews). So: recomputing our own metrics from public data = safe; copying someone's rating/review = infringement + ToS breach.

## B2. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Scraping Niche/GreatSchools or reproducing their ratings/reviews (ToS breach, CFAA exposure, copyright on compilations/reviews) | **High** | Never ingest from rating sites. Build ratings only from public-domain federal/state data; if their ratings are ever wanted, license via GreatSchools' commercial API/data license |
| 2 | Surfacing race-based discipline/demographic disparities as school "quality" in recommendations — discriminatory steering, reputational harm, potential fair-housing-adjacent liability (school recs drive housing choices) | **High** | Keep disparity data analytical/internal; display demographics as neutral facts; never let AI rank or recommend schools on racial composition or per-race discipline rates; red-team AI prompts for "avoid schools with lots of X students" style queries |
| 3 | Presenting stale or error-prone CRDC data (esp. discipline, harassment, zeros) as current fact — misleads families, invites school complaints/defamation claims | **High** | Prominent school-year labels; "self-reported to U.S. Dept. of Education" sourcing; suppress display of known-bad modules (restraint/seclusion, offenses); treat zeros in incident data as "not reported" not "none" |
| 4 | COPPA (15 U.S.C. §6501) — if children under 13 use the product directly, collecting their personal info requires verifiable parental consent | **Medium-High** | Position product for parents/families and students 13+; no under-13 accounts; minimal data collection from any minor; if teen accounts exist, follow FTC guidance + state minor-privacy laws (e.g., CA AADC-style duties) |
| 5 | Collecting/storing student-level PII (transcripts, IDs, individual records) — FERPA flows down via school contracts; Common Sense-type privacy expectations; breach liability | **Medium-High** | Product ingests **aggregate school-level data only**; any user-provided student info (grades, interests for counselling) is user-consented consumer data, stored minimally, never merged into the school database or shared/sold; publish a plain-language privacy policy |
| 6 | Reversing/deriving suppressed small-n cells by cross-joining datasets (re-identification of students) | **Medium** | Preserve suppression codes end-to-end; no arithmetic across suppressed cells; QA rule blocking display of derived counts <10 in subgroup views |
| 7 | Violating state DOE portal terms (bulk scraping UIs, rate limits, attribution clauses) | **Medium** | Per-state source inventory with ToS notes; use official bulk/download endpoints; keep attribution lines per state where requested |
| 8 | AI counselling output treated as authoritative advice (wrong school data → family decision harm) | **Medium** | Disclaimers ("verify with the school/district"), citations with data year on every AI claim, human-readable source links |
| 9 | Copying federal report *narrative text* wholesale, or third-party images inside federal PDFs | **Low** | Use the data, write our own prose; check embedded third-party content before reuse |
| 10 | Missing attribution for federal data | **Low** (no legal requirement) | Cite "U.S. Department of Education, Office for Civil Rights, Civil Rights Data Collection, 2021-22" as good practice — builds trust anyway |

## B3. Responsible-display guidelines (Common Sense-aligned)

- Do NOT collect: student PII beyond what the counselling flow needs, individual school records, behavioral tracking of minors, precise location of minors.
- Race/demographic display: neutral, contextual ("student body: X% ..."), never valenced, never an input to ranking.
- Discipline display: rates not raw counts, year-labeled, "self-reported" caveat, no cross-school leaderboards.
- AI recommendations: rank on program access (AP/IB/dual-enrollment, counselor ratio, outcomes) — auditable, defensible, family-relevant.

---

## Key sources

- CRDC data hub: https://civilrightsdata.ed.gov/data
- 2021-22 release (Jan 16, 2025): https://www.ed.gov/laws-and-policy/civil-rights-laws/civil-rights-data-collection-crdc/civil-rights-data/civil-rights-data-collection-crdc-2021-22-school-year ; First Look: https://www.ed.gov/media/document/2021-22-crdc-first-look-report-109194.pdf
- 2023-24 CRDC Q&A / school form: https://www.ed.gov/sites/ed/files/about/offices/list/ocr/docs/2023-24-crdc-qa.pdf ; https://crdc.communities.ed.gov/sites/default/files/2025-01/2023-24-crdc-school-form.pdf
- 2021-22 Data File User's Manual (mirror): https://topofire.dbs.umt.edu/public_data/federal_public_datasets/Civil%20Rights%20Data%20Collection/2021-2022/Data%20File%20Users%20Manual%202021-22.pdf
- OCR data-quality snapshot (Jan 2025): https://www.ed.gov/media/document/crdc-quality-informational-snapshot-january-2025-109165.pdf
- GAO restraint/seclusion accuracy: https://www.gao.gov/assets/gao-19-551r.pdf
- EdTrust on 2020-21 suppression (~11% of suspension data): https://edtrust.org/blog/new-crdc-data-what-to-be-excited-what-to-watch-for/
- Chronic absenteeism via EDFacts: https://eddataexpress.ed.gov/resources/reports-and-files/chronic-absenteeism-data ; Brookings: https://www.brookings.edu/articles/taking-attendance-seriously-in-the-new-civil-rights-data-collection
- Niche User Agreement: https://www.niche.com/about/terms/ (403 to automated fetch; restriction language via indexed excerpts)
- GreatSchools licensing: https://www.greatschools.org/solutions/k12-data-solutions/enterprise-data-license ; https://www.greatschools.org/solutions/k12-data-solutions/nearbyschools-api
- Legal anchors: 17 U.S.C. §105 (federal PD); FERPA 20 U.S.C. §1232g; COPPA 15 U.S.C. §6501; Feist Publications v. Rural Telephone, 499 U.S. 340 (1991)
