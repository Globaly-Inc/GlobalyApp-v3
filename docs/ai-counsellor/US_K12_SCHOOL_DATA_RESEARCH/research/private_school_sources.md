# U.S. Private K-12 School Data Sources

Research date: 2026-08-25. For Globaly school-database project (private K-12 focus, international-student relevance).

Reliability tiers: **[OFFICIAL]** = verified government/official source · **[ASSOC]** = association/accreditor (authoritative for members) · **[3P]** = third-party aggregator · **[INFERRED]** = pattern noted, not individually verified.

## Source summary table

| # | Source | Org | URL | Coverage | Format | Update freq | Bulk download? | Tuition? | Tier |
|---|--------|-----|-----|----------|--------|-------------|----------------|----------|------|
| 1 | Private School Universe Survey (PSS) | NCES / Census | nces.ed.gov/surveys/pss/pssdata.asp | ~30K private schools, universe | CSV, SAS, SPSS + codebooks | Biennial (latest posted: 2021-22; 2023-24 delayed) | Yes, free | **No** | OFFICIAL |
| 2 | PSS Private School Locator | NCES | nces.ed.gov/surveys/pss/privateschoolsearch/ | Same as PSS | Web search UI | With PSS releases | No (use PSS files) | No | OFFICIAL |
| 3 | SEVP Certified School List | DHS / ICE SEVP | studyinthestates.dhs.gov/school-search | All schools certified for F-1/M-1 (incl. K-12) | Dated PDF (from xlsx); web map | ~Weekly–biweekly (latest seen: 2026-08-05) | Yes, free | No | OFFICIAL |
| 4 | NAIS School Directory | NAIS | nais.org/school-directory | ~1,600+ independent schools | Web directory | Ongoing | No | Partial (public directory) | ASSOC |
| 5 | NAIS DASL | NAIS + 40 assocs | nais.org/data-and-research/about-dasl | Largest independent-school dataset | Online tool | Annual surveys | **Member-only** | Yes (member-only) | ASSOC |
| 6 | TABS / boardingschools.com | TABS | boardingschools.com | ~300 boarding schools | Web profiles | Ongoing | No | Not on public profile (verified sample) | ASSOC |
| 7 | Cognia Accreditation Registry | Cognia | cognia.org (registry search; legacy advanc-ed.org/oasis2/u/par/search) | ~40K institutions incl. AdvancED legacy | Web lookup | Ongoing | No | No | ASSOC |
| 8 | NCEA Member School Locator | NCEA | ncea.org (School Locator) | Catholic member schools | Web map/search | Annual | No (annual data report published as aggregate) | No | ASSOC |
| 9 | ICAISA member accreditors | ICAISA | icaisa.org | ~20 accreditors' member lists | Web lists per accreditor | Varies | No | No | ASSOC/INFERRED |
| 10 | NIPSA | NIPSA | nipsa.org | Proprietary private schools | Web member list | Varies | No | No | ASSOC/INFERRED |
| 11 | State independent school associations | ~40 state assocs | varies | State-level member lists | Web directories | Varies | Rarely | Rarely | INFERRED (separate team) |
| 12 | Private School Review / Boarding School Review | privateschoolreview.com | privateschoolreview.com | Most US private schools | Web profiles | Ongoing | No; commercial site | Yes (mixed sourcing) | 3P |
| 13 | State DOE nonpublic school lists | 50 state DOEs | varies | Registered private schools per state | CSV/XLS/PDF varies | Annual typical | Often yes | No | INFERRED (separate team) |

---

## 1. NCES Private School Universe Survey (PSS) — [OFFICIAL] — the backbone source

- **Org:** National Center for Education Statistics (data collected by U.S. Census Bureau).
- **URLs:** https://nces.ed.gov/surveys/pss/ · data files: https://nces.ed.gov/surveys/pss/pssdata.asp · questionnaire: https://nces.ed.gov/surveys/pss/pdf/questionnaire2021-22.pdf · user's manual/codebook: https://nces.ed.gov/pubs2024/2024011.pdf
- **Coverage:** Universe survey of all US private elementary/secondary schools (~29-30K schools), biennial since 1989-90. Frame built from state lists + national association lists.
- **Latest year (verified 2026-08-25):** Data files page lists **1989-90 through 2021-22**. The page states 2023-24 data "are being finalized and will be available in spring 2026" — **still not posted as of Aug 2026** (slipped). Plan on 2021-22 now, swap in 2023-24 when it lands; re-check the pssdata.asp page quarterly.
- **Formats:** SAS (.sas7bdat), SPSS (.sav), and CSV (CSV from 2013-14 onward; tab-delimited before). Each release ships documentation PDFs, Excel file layout, questionnaire, codebook (PDF/Word), SAS/SPSS syntax.
- **Key variables (per questionnaire/codebook):** school name, mailing + physical address, phone; NCES school ID; religious orientation/affiliation (detailed denominations); school type/program emphasis (regular, Montessori, special ed, alternative, early childhood); grades offered; total enrollment and enrollment by grade; enrollment by race/ethnicity and by sex; coed vs single-sex; number of high-school graduates; teachers (FTE); days in school year and length of school day; kindergarten program type; library media center; **association memberships** (long checklist incl. NAIS, TABS boarding-school association, NCEA, Montessori bodies, special-ed associations — the TABS membership flag is the practical PSS proxy for boarding schools); urbanicity/locale codes and county.
- **Tuition: NOT collected — verified.** Neither the questionnaire nor the locator carries tuition. (NCES's published *average* private tuition figures come from SASS/NTPS samples, not PSS, and are not per-school.)
- **Licensing:** US government public-use data, free, no restrictions. Public-use file suppresses/perturbs some values; documented in the user's manual.
- **Reliability:** Highest available for existence, identity, NCES ID, address, affiliation, enrollment structure. Weakness: 2-year cadence + ~2-4 yr release lag; self-reported by schools; nonresponse imputed.

## 2. PSS Private School Locator — [OFFICIAL]

- **URL:** https://nces.ed.gov/surveys/pss/privateschoolsearch/ (verified live).
- Web front-end over the latest PSS file. Search by name/NCES ID, address/city/state/zip/county, radius from zip, phone, religious affiliation, association membership (incl. boarding-school association), school type, coed/all-girls/all-boys, enrollment size, grade span.
- **No tuition shown (verified).** Explicit disclaimer that listing ≠ endorsement or accreditation.
- Use: manual verification/QA of individual records; not a bulk source (use the PSS files instead).

## 3. SEVP-Certified School List — [OFFICIAL] — critical for Globaly

- **Org:** DHS ICE Student and Exchange Visitor Program (SEVP), published via Study in the States.
- **URLs:** search UI: https://studyinthestates.dhs.gov/school-search · downloadable list: dated files at `https://studyinthestates.dhs.gov/assets/certified-school-list-MM-DD-YY.pdf` — verified examples: `...-04-30-26.pdf`, `...-05-13-26.pdf`, `...-05-20-26.pdf`, `...-05-27-26.pdf`, `...-07-22-26.pdf`, and latest found `...-08-05-26.pdf`. ICE FOIA library also posts state-batch PDFs (ice.gov/foia).
- **Downloadable: YES, public and free.** Caveats: (a) published as **PDF generated from an xlsx** (~230+ pages) — needs table extraction (Tabula/camelot handles it; layout is a clean grid); (b) studyinthestates.dhs.gov returns 403 to non-browser fetchers, so pull with a real browser UA or manually.
- **Fields (verified from file headers):** SCHOOL NAME, CAMPUS NAME, F (certified for F-1), M (certified for M-1), CITY, ST, CAMPUS ID/CODE.
- **Update frequency:** dated snapshots roughly every 1-4 weeks.
- **Coverage:** every school authorized to enroll international F-1/M-1 students — universities, language schools, AND private K-12. Private K-12 subset = join against PSS by name+city+state (no NCES ID in the SEVP file; fuzzy matching needed — note public K-12 can only host F-1 for max 1 year, so nearly all long-term K-12 F-1 enrollment is private).
- **Reliability:** authoritative for "can this school enroll international students" — the single most Globaly-relevant flag.

## 4-5. NAIS: public directory + DASL — [ASSOC]

- **NAIS School Directory** (https://www.nais.org/school-directory, plus sliced views e.g. /school-directory/boarding-schools): public, searchable directory of ~1,600+ member/subscriber schools with basic profile and admission info; "Facts at a Glance" aggregate tables (enrollment, tuition medians, salaries, demographics) are public. No bulk download; per-school scraping subject to nais.org terms.
- **DASL** (Data and Analysis for School Leadership): largest independent-school dataset (40+ collaborating associations), includes per-school tuition, enrollment, admissions, salaries. **Member/subscriber-only — verified.** Access requires membership in a participating association; data shared for benchmarking, not redistribution. Not a licensable feed for a public database.
- **Reliability:** authoritative for the independent-school (NAIS) segment; small slice of the ~30K private-school universe.

## 6. TABS / boardingschools.com — [ASSOC]

- ~300 college-prep boarding schools (US, Canada, abroad). Public profile fields **verified on a sample profile** (The Pennington School): location, boarding grades, day-student option, coed status ("All Gender" etc.), religious affiliation (Y/N), boarding enrollment (as a range, e.g. 101-250), total enrollment (range), founding year, program description, international/ESL program mentions in prose.
- **Not on public profiles (verified sample): tuition, boarding %, international %, structured ESL flag.** TABS publishes aggregates (e.g. ~15% international across members) and notes tuition is quoted "for the highest grade offered" in its data collection, but the per-school numbers are not exposed publicly in structured form. Boarding School Review (3P, below) exposes more per-school detail incl. ESL-offering lists.
- **Use for Globaly:** membership roster = high-quality boarding-school flag; cross-check with the PSS boarding-association membership variable. Get richer fields from school sites directly.

## 7. Cognia (incl. AdvancED legacy) — [ASSOC]

- ~40,000 institutions in network (public + private, global). AdvancED merged into Cognia (2019 rebrand); legacy NCA CASI / SACS CASI / NWAC brands live under Cognia.
- **Public accreditation registry lookup** (cognia.org; legacy endpoint www.advanc-ed.org/oasis2/u/par/search): search by name/country/state/type; shows accreditation status, dates, adverse actions. **Lookup only — no downloadable list.**
- Use: verification of accreditation claims, not a harvestable directory.

## 8. NCEA (Catholic schools) — [ASSOC]

- **Member School Locator** (public map/search): https://ncea.org/NCEA/NCEA/Who_We_Are/About_Catholic_Schools/School-Locator/The_NCEA_Member_School_Locator.aspx — name/location lookup of member Catholic schools. No bulk export.
- Annual *Catholic School Data* report (ncea.org/catholicschooldata): authoritative sector statistics (~5,800 Catholic schools, enrollment, staffing) — aggregate only.
- Catholic schools are fully covered in PSS (affiliation = Catholic, incl. parochial/diocesan/private order); use NCEA mainly for validation and (arch)diocesan directories for local detail.

## 9-10. ICAISA and NIPSA — [ASSOC/INFERRED]

- **ICAISA** (International Council Advancing Independent School Accreditation, icaisa.org): umbrella of ~20 recognized independent-school accreditors (state associations like AISNE/SAIS/ISAS, plus specialty bodies). NAIS publishes the approved-accreditor list (nais.org → Approved Accreditors for NAIS Membership). Each member accreditor publishes its own accredited-school directory on its own site — the practical harvest is per-accreditor web lists, no consolidated download. [Member list verified; per-accreditor directory formats inferred.]
- **NIPSA** (nipsa.org): accredits proprietary (for-profit) private schools; co-accreditation with Middle States, Cognia, WASC, NWAC. Website lists member organizations; individual school directory small and web-only. Niche source. [INFERRED detail.]

## 11. State independent school associations — [INFERRED — separate team]

Pattern: nearly every state has one or more associations (CAIS-CA, TAPPS/ISAS-TX, FCIS-FL, NYSAIS-NY, AISNE, SAIS...) publishing public member directories (name, city, grades, sometimes enrollment/tuition). Formats are HTML directories; no standard schema. Many feed DASL. Useful for validation and coverage checks, not primary ingestion.

## 12. Third-party aggregators: Private School Review / Boarding School Review — [3P]

- privateschoolreview.com and boardingschoolreview.com (same publisher family): per-school profiles for most US private schools with **tuition, enrollment, student:teacher ratio, acceptance rate, ESL-offering lists** (e.g. a 2026 list of 179 ESL-offering boarding schools).
- **Sourcing:** blend of NCES PSS baseline + school self-submission/claimed profiles + own research. Not audited; tuition can be stale or "from" figures.
- **Licensing:** commercial sites; standard terms prohibit scraping/republication (terms page not directly fetchable — 404 on guessed URL — treat as all-rights-reserved unless a data license is negotiated). Niche.com similar.
- **Use for Globaly:** benchmark/QA only, or negotiate a license. Do **not** ingest by scraping.

## 13. State DOE nonpublic-school registration lists — [INFERRED — separate team]

Pattern: state education departments maintain registered/nonpublic school lists (e.g. CA Private School Affidavit downloadable XLSX, NY nonpublic school directory, TX/FL equivalents). Official, usually annual, often CSV/XLS. These are the same lists NCES uses to build the PSS frame — fresher than PSS between cycles. Covered by the states team.

---

## Tuition data strategy (recommendation)

Facts verified: PSS has **no tuition**; NCES publishes only sample-based *averages* (SASS/NTPS); DASL has per-school tuition but is member-only and non-redistributable; TABS public profiles omit tuition; aggregators have it but under restrictive terms.

**Conclusion: there is no bulk, licensed, official per-school tuition source. Strategy:**
1. **Primary: school websites.** Private schools publish tuition/fees pages (marketing necessity, esp. schools recruiting international students, which usually also post I-20/international fees). Build a per-school URL registry + LLM-assisted extraction pipeline; refresh annually (tuition is set each spring for fall).
2. **Prioritize by Globaly relevance:** start with the SEVP-certified private K-12 subset (~2-4K schools) — exactly the schools international students can attend, and the most likely to publish full fee schedules incl. boarding/homestay/ESL fees.
3. **Fill/QA layer:** NAIS Facts-at-a-Glance medians and TABS aggregates for sanity ranges; flag outliers.
4. **Optional:** license data from an aggregator (Private School Review/Niche) if budget allows — but scraping them is off the table.
5. Store tuition with `school_year`, `source_url`, `retrieved_at`, and boarding/day/international breakdown; treat as time-series.

## Recommended ingestion order

1. **PSS 2021-22 CSV** → base universe + NCES IDs + structure (swap to 2023-24 when posted).
2. **SEVP certified school list (latest dated PDF → extract)** → international-eligibility flag; re-pull monthly.
3. **Association rosters** (NAIS, TABS, NCEA, ICAISA accreditors) → quality/segment flags.
4. **School-website tuition pipeline** on the SEVP∩PSS subset.
5. State DOE lists (other team) → freshness deltas between PSS cycles.
