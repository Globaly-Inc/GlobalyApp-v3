# US K-12 State Education Data Infrastructure — Batch 4: NM, NY, NC, ND, OH, OK, OR, PA, RI, SC

Research date: 2026-08-25. All URLs below were verified by direct fetch unless marked otherwise.
Verification legend: [V] = fetched and confirmed; [S] = confirmed via official search listing only (fetch failed or not attempted); [U] = unverified/not found.

---

## New Mexico

- **SEA**: New Mexico Public Education Department (NMPED) — https://web.ped.nm.gov/ [V]
- **School directory**: NM Public Schools Directory — https://web.ped.nm.gov/new-mexico-public-schools-directory/ [V]. CSV downloads: "New Mexico Schools" (all schools), Principals (Elem/Middle/High), Superintendent list. Format: CSV.
- **Report card**: NM Vistas — https://nmvistas.org/ [S, linked from verified PED page]. ESSA accountability dashboard (1-100 school ratings, proficiency, graduation, attendance, subgroups). Dashboard-only; PED accountability page (https://web.ped.nm.gov/bureaus/accountability/accountability-system-nm-vistas/ [V]) links no raw data downloads, only methodology PDFs/calculators. 2025-26 accountability cycle is the current one listed.
- **Assessment downloads**: Achievement Data by Year — https://web.ped.nm.gov/bureaus/accountability/achievement-data-by-year/ [V]. CSV/XLSX. Most recent: SY 2024-25 (ELA/Math/Science proficiency by assessment, by student group). Files explicitly labeled "MASKED" (FERPA suppression).
- **Graduation**: shown on NM Vistas dashboard; bulk graduation files on Achievement Data page only cover 2005-2008 [V]. No current bulk graduation download confirmed [U].
- **Enrollment**: collected via STARS (https://web.ped.nm.gov/bureaus/information-technology/stars/ [S]); district-level data "available upon request". No verified bulk enrollment download.
- **API/open data**: none found [U].
- **Private schools**: no state-published private school directory found [U].
- **Update frequency / most recent**: assessment SY 2024-25; directory CSVs maintained for current year.
- **Limitations**: assessment files masked; graduation and enrollment not available as current bulk downloads; NM Vistas is dashboard-only; old domain webnew.ped.state.nm.us still floats around and duplicates content.

## New York

- **SEA**: New York State Education Department (NYSED) — https://www.nysed.gov/ [S]
- **School directory**: SEDREF (State Education Department Reference File). Directory hub: https://www.p12.nysed.gov/irs/schoolDirectory/ [V]; SEDREF home: https://www.oms.nysed.gov/sedref/home.html [S]. 40+ public reports downloadable as XLS/CSV/PDF, refreshed nightly. Covers public districts/schools, charters, nonpublic schools, state-operated schools, BOCES.
- **Report card**: data.nysed.gov. Bulk downloads: https://data.nysed.gov/downloads.php [V].
  - Report Card Database 2024-25 — MS Access .zip, 372 MB (accountability, performance, attendance, grad rate, participation, progress).
  - Graduation Rate Database 2024-25 — Access .zip.
  - Enrollment Database 2024-25 — Access .zip (school/district/county/state by grade, race/ethnicity, gender).
  - 3-8 Assessment Database — latest standalone file listed is 2020-21; newer assessment results are inside the Report Card Database.
  - Also: Student & Educator, ELL, Pathways databases (2024-25). Archives back to 1999-00.
- **Graduation**: Graduation Rate Database (above) [V].
- **Enrollment**: Enrollment Database (above) [V].
- **API/open data**: no dedicated API; data.ny.gov hosts some NYSED sets [U].
- **Private schools**: covered in SEDREF/nonpublic school directory reports [V].
- **Update frequency / most recent**: SEDREF nightly; report card databases annual, 2024-25 released.
- **Limitations**: bulk files are Microsoft Access format (need conversion); 3-8 assessment standalone file lags (2020-21).

## North Carolina

- **SEA**: NC Department of Public Instruction (NC DPI) — https://www.dpi.nc.gov/ [V]
- **School directory**: EDDIE (Educational Directory and Demographical Information Exchange) — https://www.dpi.nc.gov/districts-schools/district-operations/financial-and-business-services/demographics-and-finances/eddie [S]. Authoritative source for LEA/school numbers, contacts, addresses, grade levels. Public can view/run reports without login; export format not verified.
- **Report card**: NC School Report Cards — https://ncreports.ondemand.sas.com/src/ [S, linked from verified DPI page]. SAS-hosted interactive site.
- **Assessment downloads**: Accountability Data Sets and Reports — https://www.dpi.nc.gov/districts-schools/accountability-and-testing/school-accountability-and-reporting/accountability-data-sets-and-reports [V]. As of 2026-08, 2025-26 resources are all "Coming Soon"; the Accountability Report Archive page (https://www.dpi.nc.gov/.../accountability-report-archive [V]) says "This website is under construction" and redirects users to the report cards site and dashboards (https://go.ncdpi.gov/AccountabilityDashboards [S]). Historically DPI published Excel data sets of EOG/EOC results, School Performance Grades, grad rates.
- **Graduation**: cohort graduation rates page — https://www.dpi.nc.gov/districts-schools/testing-and-school-accountability/school-accountability-and-reporting/cohort-graduation-rates [S, linked from verified Data & Reports page].
- **Enrollment**: Student Statistical Profile (interactive multi-year enrollment app) and ADM data under Demographics & Finances — https://www.dpi.nc.gov/districts-schools/district-operations/financial-and-business-services/demographics-and-finances [S]. Data & Reports hub: https://www.dpi.nc.gov/data-reports [V].
- **API/open data**: none found; dashboards only [U].
- **Private schools**: private/home schools are regulated by the NC Dept. of Administration, Division of Non-Public Education (not DPI) — not verified this session [U].
- **Update frequency / most recent**: 2023-24/2024-25 accountability data released historically each Sept; 2025-26 pending.
- **Limitations**: DPI site is mid-reorganization (archive pages 404 or "under construction"); downloadable accountability datasets temporarily hard to reach; data spread across DPI + SAS-hosted report cards + dashboards.

## North Dakota

- **SEA**: North Dakota Department of Public Instruction (NDDPI) — https://www.nd.gov/dpi/ [S]
- **School directory**: Data page — https://www.nd.gov/dpi/data [V]. Current directory: `falldir25-26.xlsx` (Excel, school contact info, updated annually).
- **Report card**: Insights of North Dakota — https://insights.nd.gov/Education [S]; state summary shows 2024-2025. Dashboard (test scores, graduation, EL progress, attendance); fed by the Statewide Longitudinal Data System.
- **Assessment downloads**: no bulk public download found; assessment shown on Insights dashboard; BRIDGE portal is the internal assessment system [U for bulk files].
- **Graduation**: Insights dashboard [S]; no bulk file confirmed.
- **Enrollment**: Excel downloads on https://www.nd.gov/dpi/data [V]: fall enrollment 2008-2026 for public districts, public school plants, non-public, BIE, state institutions, home school, and county-level counts.
- **API/open data**: none found; custom data via NDDPI Information Data Request Form [V].
- **Private schools**: non-public enrollment Excel files published [V]; non-public reporting calendar exists; dedicated private-school directory not separately verified [U].
- **Update frequency / most recent**: directory + enrollment annual, through 2025-26; dashboard 2024-25.
- **Limitations**: dashboard masks groups <10 students; no bulk assessment/graduation downloads — data requests required for research files.

## Ohio

- **SEA**: Ohio Department of Education and Workforce (DEW) — https://education.ohio.gov/ [S — site actively rejects automated requests: "The requested URL was rejected"]
- **School directory**: OEDS (Ohio Educational Directory System) — https://education.ohio.gov/topics/data/ohio-educational-directory-system-OEDS [S]. Decentralized directory; organizations maintain own data; publicly searchable. Export options not verifiable this session.
- **Report card**: Ohio School Report Cards — https://reportcard.education.ohio.gov/ [V, reachable; single-page app]. Download Data page: https://reportcard.education.ohio.gov/download [V exists; content JS-rendered, file list not verifiable by fetch]. Also Advanced Reports (https://reportcard.education.ohio.gov/advanced [S]) and Archives (https://reportcard.education.ohio.gov/archives [S]). Historically the download page provides Excel/CSV files for achievement, progress, gap closing, graduation, enrollment/demographics — needs manual confirmation.
- **Assessment/graduation/enrollment**: distributed via the report card download page and DEW Reports Portal — https://reports.education.ohio.gov/ [S].
- **API/open data**: none confirmed [U].
- **Private schools**: nonpublic/chartered nonpublic schools are included in OEDS [U — not fetchable].
- **Update frequency / most recent**: 2024-2025 Ohio School Report Cards released Sept 16, 2025 (DEW EdConnection announcement, [S]).
- **Limitations**: education.ohio.gov blocks automated/scripted access (WAF); reportcard site is a JS SPA — scraping requires a headless browser or manual download; OEDS is search-oriented rather than a flat file.

## Oklahoma

- **SEA**: Oklahoma State Department of Education (OSDE) — https://oklahoma.gov/education [S]
- **School directory**: State School Directory — https://oklahoma.gov/education/resources/state-school-directory.html [V]. Excel downloads: `FY26EOYOnlineDirectorySiteList.xlsx` (schools) and `FY26EOYOnlineDirectoryDistrictList.xlsx` (districts) at /content/dam/ok/en/osde/documents/resources/state-directory/. Physical/mailing addresses, phones, emails, URLs. Updated from Q4 annual reporting.
- **Report card**: Oklahoma School Report Cards — https://oklaschools.com/ [S]; download hub https://oklaschools.com/download-data/ [V exists; JS-rendered]; archive https://oklaschools.com/archive.html [V].
- **Assessment downloads**: via oklaschools.com archive [V]. CSV, years 2018-2025: Academic Achievement (ELA/math/science, grades 3-8 & 11), Academic Growth, Chronic Absenteeism, ELP progress. 2025 achievement file: 252,957 records (updated Nov 18, 2025).
- **Graduation**: 4-, 5-, 6-year adjusted cohort rates in the same CSV archive [V].
- **Enrollment**: contextual report card data (attendance, per-pupil expenditure, postsecondary enrollment) in archive [V]; OSDE also posts enrollment via public records page [S].
- **API/open data**: data.ok.gov has OSDE directory datasets but they are stale (2017/2018) [S]. No live API found.
- **Private schools**: OSDE directs to Oklahoma Private School Accreditation Commission (OPSAC) — http://opsac.org/ [V pointer on OSDE page].
- **Update frequency / most recent**: report card data annual; 2025 data current (some indicators updated Jan 2026); directory annual (FY26).
- **Limitations**: 2020-2021 assessment years sparse (COVID cancellations); oklaschools.com download UI is JS-driven (archive.html is the scrape-friendly entry); data.ok.gov copies outdated.

## Oregon

- **SEA**: Oregon Department of Education (ODE) — https://www.oregon.gov/ode [S]
- **School directory**: Institution Lookup / Institutions Database — https://www.ode.state.or.us/instid/ [S]. Daily extract of all institutions as zipped Excel, plus CSV of public schools. Oregon School Directory (contacts, includes private school info): https://www.oregon.gov/ode/about-us/pages/school-directory.aspx [S].
- **Report card**: At-A-Glance School and District Profiles — https://www.oregon.gov/ode/schools-and-districts/reportcards/reportcards/Pages/default.aspx [S]. Profile data downloadable as CSV.
- **Assessment downloads**: Public Transparency page — https://www.oregon.gov/ode/transparency/Pages/default.aspx [V]. XLSX/CSV: ELA/Math/Science results by school/district/state, most recent = 2025 (2024-25); NAEP; growth percentiles (2015-2019). (Old assessment-results page now redirects here [V].)
- **Graduation**: 4-year cohort graduation rates, 9th-grade on-track, college-going rates (2015-16 through 2022-23) on the same Public Transparency page [V].
- **Enrollment**: Fall Membership Reports (Oct counts) 2009-2025 and Spring Enrollment 2022-2025, XLSX/CSV [V]. Also staff FTE 2015-2025.
- **API/open data**: none found; flat-file downloads [U].
- **Private schools**: private school info included in the Oregon School Directory [S]; no separate verified list.
- **Update frequency / most recent**: annual; 2024-25 assessment, graduation, membership current.
- **Limitations**: suppression applied ("results can be suppressed" for confidentiality, e.g. counts <10 in language-of-origin files); data split between oregon.gov/ode pages and legacy ode.state.or.us apps.

## Pennsylvania

- **SEA**: Pennsylvania Department of Education (PDE) — https://www.pa.gov/agencies/education [V]
- **School directory**: EdNA (Education Names and Addresses) — https://www.edna.pa.gov/ [S, described on verified PDE page]. Public app: districts, IUs, CTCs, charters, nonpublic/private schools, higher ed. EdNA datasets also on PA Open Data Portal (data.pa.gov, Socrata — postsecondary EdNA dataset confirmed in listings [S]).
- **Report card**: Future Ready PA Index — https://futurereadypa.org/ [S]. Data Files: https://futurereadypa.org/Home/DataFiles [V] — Excel; SY 2016-17 through SY 2024-25; performance (all measures/indicators), Fast Facts, and fiscal data at school and district level.
- **Assessment downloads**: PSSA/Keystone results linked from Data and Reporting hub — https://www.pa.gov/agencies/education/data-and-reporting [V hub; format/year details on subpages, historically Excel].
- **Graduation**: cohort graduation rates under the same Data and Reporting hub [V hub]; also included in Future Ready PA Index files.
- **Enrollment**: Student Enrollment section under Data and Reporting hub [V hub]; historically Excel by school.
- **API/open data**: data.pa.gov (Socrata, has SODA API) hosts EdNA and some education datasets [S].
- **Private schools**: included in EdNA [S].
- **Update frequency / most recent**: annual; Future Ready data files current through SY 2024-25.
- **Limitations**: pa.gov migration means some deep links shift; PSSA/Keystone file formats/years not verified this session; futurereadypa.org site itself is dashboard-style with Excel files as the bulk path.

## Rhode Island

- **SEA**: Rhode Island Department of Education (RIDE) — https://ride.ri.gov/ [S]
- **School directory**: RIDE Data Center Schools Directory — https://datacenter.ride.ri.gov/Directory [V]. Searchable (LEA, school, type, attributes); NO public bulk export found — full "Master Directory" requires portal login.
- **Report card**: RIDE Report Card — https://reportcard.ride.ri.gov/ [S]; Download Data: https://reportcard.ride.ri.gov/DataFiles [V].
- **Assessment downloads**: from DataFiles [V] — Excel (.xlsx): RICAS (gr 3-8), NGSA (gr 5/8/11), SAT (gr 11), DLM. Years 2017-18 through 2024-25.
- **Graduation**: Excel downloads, 2024-25 available [V].
- **Enrollment**: Oct 1 enrollment Excel downloads, 2024-25 [V]; also eRIDE "Frequently Requested Education Data" (FRED) spreadsheets (enrollment/dropout/graduation) [S].
- **API/open data**: none found; RIDE Data Center is the reporting home (https://datacenter.ride.ri.gov/ [S]).
- **Private schools**: directory search includes school-type filtering; dedicated nonpublic list not verified [U].
- **Update frequency / most recent**: annual; 2024-25 across assessment, graduation, enrollment, accountability.
- **Limitations**: directory bulk export gated behind login; pre-2017-18 data in a separate archive system.

## South Carolina

- **SEA**: South Carolina Department of Education (SCDE) — https://ed.sc.gov/ [S — could not fetch: connection refused]
- **IMPORTANT ACCESS NOTE**: every fetch to ed.sc.gov, screportcards.com, and screportcards.ed.sc.gov was refused at the network level (ECONNREFUSED) during this research — SC state servers appear to block non-browser/datacenter traffic. All SC entries below are [S] (confirmed via official search listings only) and need manual browser verification.
- **School directory**: SCDE school directory pages under ed.sc.gov (e.g., /data/other/school-directory-and-personnel/) [S, unfetchable].
- **Report card**: SC School Report Cards — https://screportcards.com/ (also mirrored at https://screportcards.ed.sc.gov/) [S]. 2025 report cards published (files/2025/ path exists in index).
- **Assessment/graduation downloads**: Data Files section — https://screportcards.com/files/2025/data-files/ [S]. Listed contents per official index: 2025 Report Card Poverty Index, ESSA Achievement Index, Overall Graduation Rate, Accountability Manuals. Historical years back to at least 2021 (files/2021/). State assessment (SC READY/EOCEP) results also under https://ed.sc.gov/data/test-scores/ [S].
- **Enrollment**: SCDE publishes Active Student Headcounts under ed.sc.gov/data/ [S, unfetchable].
- **API/open data**: none found [U].
- **Private schools**: no state-published directory verified [U].
- **Update frequency / most recent**: annual; 2025 report cards are current.
- **Limitations**: state web infrastructure blocks automated access entirely (biggest pipeline risk of the 10 states); data file formats could not be confirmed (historically Excel/CSV).

---

## Summary Table

| State | Agency | School Directory URL | Report Card URL | Assessment Data | Graduation | Enrollment | Format/API | Notes |
|---|---|---|---|---|---|---|---|---|
| NM | NM Public Education Dept (PED) | web.ped.nm.gov/new-mexico-public-schools-directory/ (CSV) | nmvistas.org (dashboard) | web.ped.nm.gov/bureaus/accountability/achievement-data-by-year/ — CSV/XLSX, SY 2024-25, masked | Vistas dashboard only; no current bulk file | STARS; on request, no bulk file | CSV/XLSX; no API | Masked files; grad/enrollment bulk gaps |
| NY | NY State Education Dept (NYSED) | p12.nysed.gov/irs/schoolDirectory/ + SEDREF (XLS/CSV/PDF, nightly) | data.nysed.gov | data.nysed.gov/downloads.php — Report Card DB 2024-25 (Access) | Graduation Rate DB 2024-25 (Access) | Enrollment DB 2024-25 (Access) | MS Access zips; no API | Best directory (incl. nonpublic); Access format awkward |
| NC | NC Dept of Public Instruction (DPI) | EDDIE (dpi.nc.gov, public reports, no login) | ncreports.ondemand.sas.com/src/ | dpi.nc.gov accountability data sets — 2025-26 "Coming Soon", archive under construction | Cohort grad rates page (dpi.nc.gov) | Student Statistical Profile app; ADM | Historically Excel; dashboards; no API | Site mid-reorg; downloads temporarily disrupted |
| ND | ND Dept of Public Instruction (NDDPI) | nd.gov/dpi/data — falldir25-26.xlsx | insights.nd.gov/Education (2024-25) | Dashboard only; no bulk download found | Insights dashboard | nd.gov/dpi/data — Excel, 2008-2026 (incl. nonpublic, homeschool) | Excel; no API | <10 masking; data requests for research files |
| OH | Ohio Dept of Education and Workforce (DEW) | OEDS (education.ohio.gov) | reportcard.education.ohio.gov | reportcard.education.ohio.gov/download (SPA; 2024-25 released 9/2025) | In report card downloads | In report card downloads | Excel/CSV via SPA; no API | State sites block bots; needs manual/headless access |
| OK | OK State Dept of Education (OSDE) | oklahoma.gov/education/resources/state-school-directory.html — FY26 XLSX | oklaschools.com | oklaschools.com/archive.html — CSV, 2018-2025 | In same CSV archive (4/5/6-yr cohort) | Contextual report card CSVs | CSV; no API | Excellent CSV archive; OPSAC for private schools |
| OR | Oregon Dept of Education (ODE) | ode.state.or.us/instid/ — daily zipped Excel + CSV | At-A-Glance profiles (CSV) | oregon.gov/ode/transparency — XLSX/CSV, 2024-25 | 4-yr cohort on transparency page | Fall membership 2009-2025 XLSX | XLSX/CSV; no API | Strong flat-file transparency page; suppression applies |
| PA | PA Dept of Education (PDE) | edna.pa.gov (incl. nonpublic) + data.pa.gov | futurereadypa.org | futurereadypa.org/Home/DataFiles — Excel, 2016-17 to 2024-25; PSSA/Keystone on pa.gov | In Future Ready files + pa.gov | Enrollment on pa.gov data-and-reporting | Excel; data.pa.gov Socrata API | Only state here with a real open-data API path |
| RI | RI Dept of Education (RIDE) | datacenter.ride.ri.gov/Directory (search only, no bulk export) | reportcard.ride.ri.gov | reportcard.ride.ri.gov/DataFiles — XLSX, 2017-18 to 2024-25 | XLSX downloads, 2024-25 | Oct 1 enrollment XLSX, 2024-25 | XLSX; no API | Clean download hub; directory export gated by login |
| SC | SC Dept of Education (SCDE) | ed.sc.gov (unverifiable — blocked) | screportcards.com | screportcards.com/files/2025/data-files/ (blocked to bots; poverty index, achievement index, grad rate listed) | In report card data files | Active Student Headcounts (ed.sc.gov, blocked) | Unconfirmed (historically Excel); no API | All SC state sites refused automated connections |
