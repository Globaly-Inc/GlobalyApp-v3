# Federal Data Sources — Verified Findings

Research date: 2026-08-25. All URLs below were fetched/downloaded and verified on this date unless marked otherwise.

## 1. NCES Common Core of Data (CCD) — VERIFIED BY DOWNLOAD

The primary national database of U.S. public elementary/secondary schools. Annual, mandatory reporting by all SEAs. Public domain (17 USC §105).

- Program page: https://nces.ed.gov/ccd/
- File browser (Angular app): https://nces.ed.gov/ccd/files.asp
- Direct file URL pattern: `https://nces.ed.gov/ccd/Data/zip/ccd_{sch|lea}_{fileno}_{yy1yy2}_{w|l}_{version}_{MMDDYY}.zip`
  - `029` = directory, `052` = membership (enrollment), `059` = staff, `129` = school characteristics, `033` = lunch program eligibility. `w` = wide, `l` = long format. Each ZIP contains CSV + SAS.

### Verified current files (SY 2024-25, version 1a, released ~2025-07-30)

| File | URL | Contents | Verified size/rows |
|---|---|---|---|
| School directory | https://nces.ed.gov/ccd/Data/zip/ccd_sch_029_2425_w_1a_073025.zip | IDs, names, addresses, phone, website, status, type, charter + authorizers, grades offered, level | **102,178 schools**, 65 columns |
| School membership | https://nces.ed.gov/ccd/Data/zip/ccd_sch_052_2425_l_1a_073025.zip | Enrollment by grade × race/ethnicity × sex (long format) | 192 MB zip |
| School staff | https://nces.ed.gov/ccd/Data/zip/ccd_sch_059_2425_l_1a_073025.zip | Teacher FTE per school | 100,237 schools |
| School characteristics | https://nces.ed.gov/ccd/Data/zip/ccd_sch_129_2425_w_1a_073025.zip | Shared-time, NSLP status, **virtual status** | 17 columns |
| Lunch eligibility | https://nces.ed.gov/ccd/Data/zip/ccd_sch_033_2425_l_2a_073025.zip | Free/reduced-price lunch counts, direct certification (long) | school-level |
| LEA directory | https://nces.ed.gov/ccd/Data/zip/ccd_lea_029_2425_w_1a_073025.zip | District IDs, addresses, type, charter-LEA, grade span, operational-schools count | **19,629 LEAs**, 58 columns |
| LEA membership | https://nces.ed.gov/ccd/Data/zip/ccd_lea_052_2425_l_1a_073025.zip | District enrollment | not downloaded |
| LEA staff | https://nces.ed.gov/ccd/Data/zip/ccd_lea_059_2425_l_1a_073025.zip | District staff by category (counselors, admins, support) | not downloaded |

Prior year (SY 2023-24 v1a): same pattern with `2324 ... 073124`; LEA-level also has `ccd_lea_032_2324_l_1a_pub_051425.zip` and `ccd_lea_040_2324_l_1a_pub_051425.zip` (dropout/ACGR-related, published 2025-05-14). Companion documentation files (XLSX data dictionaries) verified at e.g. https://nces.ed.gov/ccd/xls/SY_2023-24_School_Directory_Companion_2024-252.xlsx

### Key columns verified (directory 029)
`SCHOOL_YEAR, FIPST, STATENAME, ST, SCH_NAME, LEA_NAME, ST_LEAID, LEAID, ST_SCHID, NCESSCH, SCHID, M*/L* address fields, PHONE, WEBSITE, SY_STATUS(_TEXT), UPDATED_STATUS(_TEXT), EFFECTIVE_DATE, SCH_TYPE(_TEXT), RECON_STATUS, OUT_OF_STATE_FLAG, CHARTER_TEXT, CHARTAUTH1/2 + names, NOGRADES, G_PK…G_AE_OFFERED (per-grade booleans), GSLO, GSHI, LEVEL, IGOFFERED`

### Verified distributions (SY 2024-25 directory)
- Status: Open 99,259; Closed 1,068; New 887; Inactive 501; Future 357; Reopened 24; Added 34; Changed Boundary/Agency 48
- Charter: No 90,026; Yes 8,398; Not applicable 3,754
- Type: Regular 92,735; Alternative 5,867; Special Education 1,926; Career & Technical 1,650
- Level: Elementary 52,812; High 23,831; Middle 16,254; Other 4,536; Not reported 2,334; PK 1,632; Secondary 392; Ungraded 98; Adult Ed 8
- 31,864 schools (31%) have blank WEBSITE — school-website enrichment cannot rely on CCD alone.
- NCESSCH is 100% unique in the directory file.

### CCD limitations (verified/observed)
- **Magnet status is NOT in the 2023-24 or 2024-25 school characteristics file** (only SHARED_TIME, NSLP_STATUS, VIRTUAL). Magnet flags must come from CRDC or state sources.
- No performance, tuition, programs, or course data — CCD is directory + enrollment + staff counts + FRL only.
- ~1 year lag (2024-25 files released July 2025; 2025-26 shows preliminary directory slots in the file tool).
- Membership file is long-format and large (192 MB zipped); plan for ~10M+ rows nationally.

## 2. EDGE — Education Demographic and Geographic Estimates — VERIFIED BY DOWNLOAD

- Page: https://nces.ed.gov/programs/edge/geographic/schoollocations
- Public school geocodes SY 2024-25: https://nces.ed.gov/programs/edge/data/EDGE_GEOCODE_PUBLICSCH_2425.zip (29 MB; pipe-delimited TXT + XLSX + shapefile)
- Verified layout (TXT): `NCESSCH|LEAID|NAME|OPSTFIPS|STREET|CITY|STATE|ZIP|STFIP|CNTY|NMCNTY|LOCALE|LAT|LON|CBSA|NMCBSA|CBSATYPE|CSA|NMCSA|CD|SLDL|SLDU|SCHOOLYEAR`
- **100% join rate with CCD directory on NCESSCH (102,178/102,178)** — verified 2026-08-25.
- Provides: lat/long, county, locale code (urban-centric 11–43 scale), CBSA/CSA, congressional district, state legislative districts.
- Private school geocodes exist for PSS years (biennial); postsecondary from IPEDS.
- District boundary composite files: EDGE School District Boundaries (annual, from Census TIGER/SDRP).
- SABS (School Attendance Boundaries Survey) — **last collected 2015-16, discontinued**. No current national attendance-boundary dataset exists; boundaries must come from districts or commercial vendors.

## 3. NCES Private School Universe Survey (PSS) — VERIFIED BY DOWNLOAD

- Data page: https://nces.ed.gov/surveys/pss/pssdata.asp
- Latest public file: **2021-22** (`https://nces.ed.gov/surveys/pss/zip/pss2122_pu_csv.zip`, 4.3 MB). 2023-24 was still listed as "available spring 2026" and not posted as of 2026-08-25. Biennial.
- Verified: **22,344 private schools**, 459 columns (88 are sampling/replicate weights).
- Key verified variables: `PINST` (name), address + `PCNTY/PCNTNM` (county), `LATITUDE22/LONGITUDE22`, `RELIG, ORIENT, DIOCESE` (religious affiliation), `LEVEL/LEVEL2`, `NUMSTUDS, SIZE, NUMTEACH, STTCH_RT` (student/teacher ratio), race/ethnicity percentages (`P_HISP, P_WHITE, P_BLACK,…`), `MALES` (coed inference), `TOTHRS`, `ULOCALE22`, grade range (`LOGR2022/HIGR2022`), typology, plus P-item questionnaire fields (association memberships incl. TABS boarding proxy, program details) with F_/S1_F_ imputation flags.
- **No tuition. No PII concerns (school-level).** Weighted universe survey — some schools are nonrespondents with imputed values (check F_ flags).
- Codebook: https://nces.ed.gov/surveys/pss/pdf/codebook2021_22.pdf; layout: https://nces.ed.gov/surveys/pss/zip/layout2021-22.zip (downloaded).
- PSS school ID (`PPIN`) is the private-school identifier; NOT the same series as NCESSCH.

## 4. EDFacts / ED Data Express — assessment & graduation (PARTIALLY VERIFIED)

- School-level state assessment proficiency (math/RLA) and ACGR historically published as EDFacts files: https://www.ed.gov/about/inits/ed/edfacts/data-files (files through SY 2018-19 era).
- Since SY 2020-21, downloads moved to **ED Data Express**: https://eddataexpress.ed.gov/download/data-library. **Site returned 403 to our environment on 2026-08-25** — could not verify current file inventory directly; must be re-verified from another network or manually. Search evidence indicates SEA/LEA/school-level files for RLA/math performance and ACGR are published there.
- Third-party archive verified: **Education Data Center / Zelma** (https://www.eddatacenter.org/edfacts) — free school-level math/RLA proficiency CSVs, SY 2009-10 → 2021-22 (no 2019-20; COVID), hosted on Google Cloud Storage. Nonprofit, "as is". Useful as bootstrap/backfill; treat as MEDIUM confidence mirror of federal data.
- Caveat: EDFacts proficiency rates are NOT comparable across states (different tests/cut scores). Store per-state with methodology metadata.

## 5. Civil Rights Data Collection (CRDC)

See `crdc_and_legal.md`. Latest public: 2021-22 (released 2025-01-16); biennial; 2023-24 not yet public as of 2026-08-25. School-level AP/IB/dual-enrollment, gifted, counselors, discipline; includes magnet flag. Flat files + documentation at https://civilrightsdata.ed.gov/.

## 6. Urban Institute Education Data Portal (API aggregator)

- https://educationdata.urban.org/ — REST API + R/Stata packages unifying CCD, CRDC, EDFacts, SAIPE, IPEDS with harmonized variables.
- Endpoint pattern: `https://educationdata.urban.org/api/v1/schools/ccd/directory/{year}/`
- **NOT verified live: Cloudflare blocked all requests from our environment (403, both curl and real browser) on 2026-08-25.** Widely used in research; licensing is ODC-BY-style (check current terms before commercial use). Treat as a convenience layer, not system of record — raw federal files remain authoritative.

## 7. Other federal sources noted

- **NCES ELSI** (Elementary/Secondary Information System) table generator: https://nces.ed.gov/ccd/elsi/ — custom CCD/PSS extracts, good for spot checks, not for pipelines.
- **SAIPE** (Census small-area income/poverty by district) — district poverty context.
- **SEVP certified school list** (DHS) — K-12 schools certified to enroll F-1 international students; public downloadable list at studyinthestates.dhs.gov (see private_school_sources.md). Critical for Globaly's international-student use case.
- **School Pulse Panel / NTPS** — sample surveys, not school-universe; not usable for per-school profiles.

## Access/blocking summary (operational risk log, 2026-08-25)

| Host | Result |
|---|---|
| nces.ed.gov (CCD, PSS, EDGE) | ✅ full download access, no blocking |
| educationdata.urban.org | ❌ Cloudflare 403 (curl AND real browser) |
| eddataexpress.ed.gov | ❌ 403 |
| civilrightsdata.ed.gov | ✅ (per CRDC agent) |
| Many state DOE sites | ❌ WAF/bot-blocking common (see state files) — plan headless-browser fallback + manual download runbooks |
