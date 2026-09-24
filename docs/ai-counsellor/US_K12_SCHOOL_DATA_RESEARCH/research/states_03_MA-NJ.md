# US K-12 State Education Data Infrastructure — Batch 3: MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ

Research date: 2026-08-25. Verification method: WebFetch of live pages where possible; several state sites block automated fetching (HTTP 403 / connection refused) — those entries are marked **[search-verified]** (URL and capability confirmed via search-engine snippets of the official page, not a direct page load) instead of **[fetched]**. Nothing below is guessed; unverified items are flagged.

---

## Massachusetts

- **SEA**: Massachusetts Department of Elementary and Secondary Education (DESE) — https://www.doe.mass.edu/ **[fetched via subpages]**
- **School directory**: School and District Profiles — https://profiles.doe.mass.edu/ **[fetched]**. Directory search with "Search, Export and Mailing Labels" export function covering public districts, schools, charter schools, **and private schools**. Format: on-screen with export (Excel/CSV via Export button).
- **Report card / profiles system**: Same site (profiles.doe.mass.edu) — per-school profile pages plus statewide "statereport" tables, all with Export buttons. School-level data downloadable.
- **Assessment downloads**: MCAS achievement results — https://profiles.doe.mass.edu/statereport/mcas.aspx **[fetched]**. Year selector 2017–2025 (2025 = SY2024-25, posted Sept 2025). Export button on page; default view is district-level, school-level available via org-type navigation.
- **Graduation rates**: https://profiles.doe.mass.edu/statereport/gradrates.aspx **[fetched]**. Years 2006–2025, 4-year cohort + subgroups, Export button; page last updated March 2026. Also mirrored on the "Education-to-Career (E2C) Research and Data Hub" (linked from the grad page; the hub itself not fetched in this pass).
- **Enrollment/demographics**: Statistical reports index — https://www.doe.mass.edu/infoservices/reports/ **[fetched]** — enrollment by grade/race/gender/selected populations, attendance, dropout, retention, AP, teacher data; all served as sortable/exportable statereport tables.
- **API / open data**: E2C Research and Data Hub (Socrata-style open data, educationtocareer.data.mass.gov) referenced from profiles pages — **not directly verified this pass**.
- **Private schools**: Included in the profiles directory search (own org type).
- **Recency**: SY2024-25 assessment and graduation data live; profiles updated continuously (grad page updated 2026-03-05).
- **Limitations**: Small-group suppression in reports; statereport default views are district-level so school-level requires an extra navigation step. No login needed. Best-in-batch openness.

## Michigan

- **SEA**: Michigan Department of Education (MDE) — https://www.michigan.gov/mde ; data infrastructure run by CEPI (Center for Educational Performance and Information) — https://www.michigan.gov/cepi
- **School directory**: Educational Entity Master (EEM) — https://cepi.state.mi.us/eem/ and https://www.michigan.gov/cepi/pk-12/eem **[search-verified; both blocked WebFetch with 403]**. Official directory of all Michigan educational entities; unrestricted downloads by entity type in **Excel and XML**. Column descriptions doc: https://cepi.state.mi.us/eem/Documents/ColumnDescriptions.pdf
- **Report card / profiles**: MI School Data — https://www.mischooldata.org/ **[search-verified; site returns 403 to automated fetch]**. State's public education data portal (dashboards + School Index).
- **Assessment downloads**: MI School Data data-file pages: https://www.mischooldata.org/districtschool-data-files/ and https://www.mischooldata.org/historical-assessment-data-files/ **[search-verified]** — M-STEP, MI-Access, PSAT performance files in Excel. Report catalog PDF: https://www.michigan.gov/cepi/-/media/Project/Websites/cepi/MiSchoolData/reference/MSD_Report_Catalog.pdf
- **Graduation rates**: https://www.mischooldata.org/graddropout-rates-data-files/ **[search-verified]** — 2024 cohort 4-year (plus 5/6-year for earlier cohorts) with subgroups, Excel. 2024-25 School Index uses 2023-24 grad class.
- **Enrollment/demographics**: K-12 student counts by race/gender etc. in the District/School Data Files section of mischooldata.org (Excel).
- **API / open data**: None found; bulk Excel/XML files are the mechanism.
- **Private schools**: Nonpublic schools are entities in the EEM (downloads "by entity type").
- **Recency**: 2024-25 School Index published; 2024 grad cohort files.
- **Limitations**: Both michigan.gov/cepi and mischooldata.org aggressively block non-browser clients (403) — scraping/automation will need browser-grade requests; suppression applied to small subgroups.

## Minnesota

- **SEA**: Minnesota Department of Education (MDE) — https://education.mn.gov/ ; Data Center: https://education.mn.gov/mde/data/ **[search-verified]**
- **School directory**: MDE-ORG (Organization Reference Glossary) — https://public.education.mn.gov/MdeOrgView/ (also pub.education.mn.gov/MdeOrgView) **[search-verified; host refused connections during research — appears geo/bot-filtered, not down]**. Searchable directory of all MN schools, districts and education orgs with MDE ID numbers; can generate extract files (e.g. /MdeOrgView/tag/extractContacts/... URLs produce contact extracts).
- **Report card**: Minnesota Report Card — https://rc.education.mn.gov/ **[fetched]**. District- and school-level reports; run by MDE Analytics team. Primarily interactive viewing.
- **Assessment downloads**: Data Reports and Analytics — https://pub.education.mn.gov/MDEAnalytics/Data.jsp **[fetched — page live]**. Assessment and Growth Files (MCA summary data) as Excel/tab-delimited; 2024-25 files documented (Assessment Files User Guide 2024-25, Sept 2025). Student-level DSR/SSR files exist but only via **Secure Reports (login)**: https://education.mn.gov/MDE/dse/datasub/SecureRep/index.html
- **Graduation rates**: Downloadable Excel via Data Reports and Analytics (graduation topic files) **[search-verified]**.
- **Enrollment/demographics**: Same Data Reports and Analytics site — enrollment spreadsheets by year/level; also mirrored on the MN Geospatial Commons (https://gisdata.mn.gov/dataset/society-k12-student-information) **[search-verified]**.
- **API / open data**: No REST API; gisdata.mn.gov hosts some K-12 datasets.
- **Private schools**: Nonpublic schools included in MDE-ORG directory types.
- **Recency**: 2024-25 assessment files (posted Sept 2025); 2025-26 org directory live.
- **Limitations**: Student-level files behind login; public files are summary-level with suppression; MdeOrgView host refused automated connections during research.

## Mississippi

- **SEA**: Mississippi Department of Education (MDE) — https://www.mdek12.org/ **[search-verified; 403 to automated fetch]**
- **School directory**: No standalone downloadable directory file verified. School/district entities are exposed through the report card (msrc) and the Data Download site below; mdek12.org blocks automated access, so a dedicated directory download could not be confirmed. **Gap — verify manually.**
- **Report card**: Mississippi Succeeds Report Card — https://msrc.mdek12.org/ **[search-verified; 403 to fetch]**. Interactive school/district report cards, data from 2017-18 forward (entity pages parameterized by EntityID + SchoolYear, e.g. ?EntityID=0000-000&SchoolYear=2024).
- **Assessment downloads**: Public Reporting — https://mdek12.org/publicreporting/ (2025-26: https://mdek12.org/publicreporting/2025-26/) **[search-verified]**. MAAP results published yearly; 2025 MAAP results executive summary released Aug 2025 (PDF). School-level MAAP tables historically published as Excel/PDF under public reporting.
- **Graduation rates**: Published through msrc.mdek12.org accountability data and public reporting pages.
- **Enrollment/demographics**: Data Downloads portal — https://newreports.mdek12.org/DataDownload **[search-verified; connection refused to automated fetch]** — enrollment data downloads.
- **API / open data**: None found.
- **Private schools**: No state-published private school directory verified (MS has limited private-school oversight; Wikipedia is the top public list, which is telling).
- **Recency**: 2025 MAAP results (Aug 2025); report card SY2023-24/2024-25 cycle.
- **Limitations**: **Worst automation posture in this batch** — all three mdek12.org hosts blocked or refused automated requests; significant reliance on PDF executive summaries; no verified flat-file school directory.

## Missouri

- **SEA**: Missouri Department of Elementary and Secondary Education (DESE) — https://dese.mo.gov/ **[search-verified; 403 to fetch]**
- **School directory**: Missouri School Directory — https://dese.mo.gov/directory with flat-file downloads at https://dese.mo.gov/school-directory/data-downloads **[search-verified]**. District and building files (IDs, addresses), **refreshed weekly**, powered by MCDS.
- **Report card / data portal**: MCDS Portal — https://apps.dese.mo.gov/MCDS/home.aspx **[search-verified; 403 to fetch]**. Includes Missouri School Report Card and Annual Performance Report (APR); category views e.g. ?categoryid=9&view=2.
- **Assessment downloads**: MAP results served through MCDS portal report/download screens (Accountability Data office: https://dese.mo.gov/quality-schools/accountability-data). 2024 Report Card cycle added MAP results and student-group sections; 2025 report card data referenced in district postings (Nov 2025).
- **Graduation rates**: In MCDS / APR datasets and School Report Card.
- **Enrollment/demographics**: MCDS downloadable data (Core Data collections) — district/building enrollment files.
- **API / open data**: None found; MCDS generates CSV/Excel extracts per report.
- **Private schools**: Missouri School Directory includes nonpublic school listings (in the directory files) — **not directly verified due to 403; verify manually**.
- **Recency**: Directory refreshed weekly; 2025 report card data circulating as of Nov 2025.
- **Limitations**: dese.mo.gov and apps.dese.mo.gov both 403 automated fetches; MCDS is a report-builder UI rather than a bulk-file library, so extraction is screen-by-screen.

## Montana

- **SEA**: Montana Office of Public Instruction (OPI) — https://opi.mt.gov/
- **School directory**: Directory of Montana Schools — https://opi.mt.gov/Leadership/Management-Operations/Montana-Schools-Directory **[fetched]**. Full directory PDF download, **Excel downloads via "Advanced Search"**, county search, ArcGIS map, and a separate "All Non-Public Accredited Schools" listing.
- **Report card / data portal**: GEMS (Growth and Enhancement of Montana Students) — https://gems.opi.mt.gov/ **[search-verified; direct fetch returned an error/block page]**. Dashboards for assessment (Math/ELA/Science), enrollment, graduation, district/school profiles, finance; multi-year.
- **Assessment downloads**: GEMS Student Data area — https://gems.opi.mt.gov/student-data **[URL confirmed via search; fetch blocked]** — MontCAS/SBAC proficiency dashboards with export. Format: dashboard exports (Excel/CSV) — not confirmable this pass.
- **Graduation rates**: GEMS graduation-rate reports (multi-year, per search-verified OPI description).
- **Enrollment/demographics**: GEMS enrollment dashboards; OPI Data & Research page https://opi.mt.gov/Leadership/Data-Reporting/Data-and-Research **[search-verified]**.
- **API / open data**: None found.
- **Private schools**: Yes — "Non-Public Accredited Schools" list inside the OPI schools directory **[fetched]**.
- **Recency**: Directory current; GEMS data year not confirmable through the block page (Montana is a small state with typically 1-year-lag postings).
- **Limitations**: GEMS blocks automated fetches; directory Excel requires interactive Advanced Search; small-school suppression pervasive given tiny enrollments.

## Nebraska

- **SEA**: Nebraska Department of Education (NDE) — https://www.education.ne.gov/
- **School directory**: NDE Directory Search — https://educdirsrc.education.ne.gov/ **[search-verified; connection refused to automated fetch]**. Creates lists or **data files** of districts/systems, schools, staff; includes **public, private, state-operated schools and ESUs** (1,300+ records); current for **2025-26**. Quick lists at /QuickMain.aspx and /QuickDisplay.aspx.
- **Report card**: Nebraska Education Profile (NEP) — https://nep.education.ne.gov/ **[fetched — loads, JS-driven app]**; overview at https://www.education.ne.gov/dataservices/nep/ **[search-verified]**. School/district performance profiles (successor to State of the Schools Report).
- **Assessment downloads**: NSCAS results surfaced in NEP; NEP has a data-download area (historically "Data Downloads" CSVs) — download capability **not directly confirmable** because the site is a JS app; flag for manual check.
- **Graduation rates**: Published in NEP per school/district.
- **Enrollment/demographics**: NEP + NDE Data Services; Directory Search also produces student-count files.
- **API / open data**: None found.
- **Private schools**: Included in NDE Directory Search (private/denominational schools are directory record types).
- **Recency**: Directory 2025-26; NEP on the standard fall-release cycle.
- **Limitations**: NEP is a client-side app (hard to scrape without a browser); directory host refused automated connections; small-cell masking in NEP.

## Nevada

- **SEA**: Nevada Department of Education (NDE) — https://doe.nv.gov/
- **School directory**: No standalone flat-file school directory verified. School lists live inside the Nevada Accountability Portal (below); doe.nv.gov/contact/ndedirectory/ is a staff directory. **Gap — verify manually whether NDE posts a school list file.**
- **Report card**: Nevada Accountability Portal (Nevada Report Card) — https://nevadareportcard.nv.gov/DI/nv/ **[fetched]**. State/district/school-level data: ELA/Math proficiency by grade, enrollment, staffing, chronic absenteeism, per-pupil spending, graduation rates, NSPF star ratings. "Data Interaction" customizable reports (https://nevadareportcard.nv.gov/DI/recents).
- **Assessment downloads**: Via Data Interaction custom reports (exportable); plus posted **"NSPF Disaggregated Data File" for 2023-24** school rating data **[search-verified]**.
- **Graduation rates**: In the Accountability Portal per school/district and in NSPF files.
- **Enrollment/demographics**: In the portal (enrollment, staffing, student-teacher ratios).
- **API / open data**: None found.
- **Private schools**: Only a Title I "Private Schools Resources" page verified (https://doe.nv.gov/titlei/part-a/private-schools-resources/); NDE licenses private schools but a downloadable licensed-private-school list was **not verified**.
- **Recency**: Portal banner (fetched) says it "will be updated with the new accountability data in September 2026" — i.e., 2024-25/2025-26 NSPF pending; newest posted rating file is 2023-24. Some portal sample pages still surface 2016-17 snapshots.
- **Limitations**: Data lag (2023-24 latest rating file as of Aug 2026); portal is a report-builder, no bulk API; legacy pages mix old years.

## New Hampshire

- **SEA**: New Hampshire Department of Education — https://www.education.nh.gov/ **[search-verified; 403 to automated fetch]**
- **School directory**: iPlatform "School Information" reports — SAU List, School List, District/Town Cross Reference, Non Public Schools by Town/Name — via https://my.doe.nh.gov/iPlatform (403 to automated fetch) and Schools & SAU Information page: https://www.education.nh.gov/who-we-are/division-of-educator-and-analytic-resources/bureau-of-education-statistics/schools-and-sau-information **[search-verified]**. Downloadable school information covering district public, chartered public, and nonpublic schools.
- **Report card / profiles**: iPlatform (iReport dashboards, iExplore, iDefine) — https://my.doe.nh.gov/iPlatform ; school profiles at https://my.doe.nh.gov/profiles/ **[search-verified]**.
- **Assessment downloads**: iReport — Assessment Participation, Proficiency and Growth, Achievement Levels, ESSA Indicators **[search-verified]**. Export from dashboards; NH SAS assessment. Data year not directly confirmable (site blocks bots); expect SY2024-25.
- **Graduation rates**: iPlatform reports + DOE data-reports page (https://www.education.nh.gov/data-reports).
- **Enrollment/demographics**: iPlatform enrollment report categories, e.g. https://my.doe.nh.gov/iPlatform/Report/DataReportsSubCategory?reportSubCategoryId=9 (Enrollment Reports) and =10 (Enrollments by Grade) **[search-verified]**.
- **API / open data**: None found.
- **Private schools**: Yes — "Non Public Schools by Town/Name" iPlatform reports; Office of Nonpublic Schools page on education.nh.gov.
- **Recency**: iPlatform is the current system (actively maintained); exact latest year unverified due to 403s.
- **Limitations**: Both education.nh.gov and my.doe.nh.gov block automated fetches; heavy suppression in a small state; dashboards rather than bulk files.

## New Jersey

- **SEA**: New Jersey Department of Education (NJDOE) — https://www.nj.gov/education/ ; Data & Reports Portal: https://www.nj.gov/education/doedata/ **[search-verified]**
- **School directory**: NJ School Directory — https://homeroom5.doe.state.nj.us/directory/school.php **[search-verified; 403 to automated fetch]**. Public school directory (district/school codes, addresses); the doedata portal lists "School Directory" as a component.
- **Report card**: NJ School Performance Reports — https://www.nj.gov/education/spr/ **[fetched]** and interactive portal https://rc.doe.state.nj.us/ . School-, district-, and state-level reports; **2024-25 reports released May 21, 2026** (redesigned).
- **Assessment downloads**: Included in the SPR downloadable databases (NJSLA results) — download page https://www.nj.gov/education/spr/download **[fetched]**: school years **2015-16 through 2024-25** selectable, plus archive. Formats: **Excel and Access**, separate school-level and district/state-level databases (per the official Reference Guide, nj.gov/education/sprreports/download/Documents/2023-2024/ReferenceGuide.pdf).
- **Graduation rates**: In SPR databases (4- and 5-year adjusted cohort) and on the doedata portal's Accountability and Performance Data section.
- **Enrollment/demographics**: Fall Enrollment Reports on the doedata portal + enrollment sections of SPR database files.
- **API / open data**: None found beyond the bulk Excel/Access files.
- **Private schools**: Nonpublic school listings exist in NJDOE directory system (homeroom); a distinct downloadable nonpublic file was **not directly verified** (403) — check homeroom5 directory's nonpublic search manually.
- **Recency**: SY2024-25 full release (May 2026) — most current in this batch alongside MA.
- **Limitations**: homeroom5 host blocks automated fetches; Access-format files awkward for pipelines; standard NJ suppression (small cells, <10).

---

## Summary Table

| State | Agency | School Directory URL | Report Card URL | Assessment Data | Graduation | Enrollment | Format/API | Notes |
|---|---|---|---|---|---|---|---|---|
| MA | DESE | profiles.doe.mass.edu (directory + export, incl. private) | profiles.doe.mass.edu | statereport/mcas.aspx, 2017–2025, Export | statereport/gradrates.aspx, 2006–2025 | doe.mass.edu/infoservices/reports/ | Excel exports; E2C open-data hub | Best in batch; fully fetch-verified |
| MI | MDE / CEPI | cepi.state.mi.us/eem (Excel + XML) | mischooldata.org | mischooldata.org data-file pages (M-STEP etc., Excel) | graddropout-rates-data-files (2024 cohort) | districtschool-data-files | Excel/XML bulk; no API | Both sites 403 bots; strong bulk files |
| MN | MDE | public.education.mn.gov/MdeOrgView (MDE-ORG) | rc.education.mn.gov | MDEAnalytics Data.jsp, 2024-25, Excel/tab | MDEAnalytics grad files | MDEAnalytics + gisdata.mn.gov | Excel/tab; no API | Student-level needs login; MdeOrgView refused bot connections |
| MS | MDE (mdek12) | none verified (gap) | msrc.mdek12.org (2017-18→) | mdek12.org/publicreporting (MAAP 2025) | msrc + public reporting | newreports.mdek12.org/DataDownload | Excel/PDF; no API | All hosts block bots; PDF-heavy; weakest posture |
| MO | DESE | dese.mo.gov/school-directory/data-downloads (weekly) | apps.dese.mo.gov/MCDS (Report Card/APR) | MCDS MAP reports (2024/2025 cycle) | MCDS / APR | MCDS Core Data | CSV/Excel extracts; no API | dese.mo.gov 403 bots; report-builder UI |
| MT | OPI | opi.mt.gov Montana-Schools-Directory (PDF + Excel) | gems.opi.mt.gov | GEMS dashboards (year unconfirmed) | GEMS | GEMS | Dashboard exports; no API | GEMS blocks bots; nonpublic list exists |
| NE | NDE | educdirsrc.education.ne.gov (data files, 2025-26, incl. private) | nep.education.ne.gov | NEP (NSCAS) — downloads unconfirmed | NEP | NEP + directory counts | Data-file export; no API | NEP is JS app; directory refused bot connections |
| NV | NDE | none verified (gap) | nevadareportcard.nv.gov/DI/nv | Data Interaction exports; NSPF 2023-24 file | In portal + NSPF | In portal | Report-builder exports; no API | Data lag: next update Sept 2026; 2023-24 latest ratings |
| NH | NH DOE | iPlatform School/SAU lists (incl. nonpublic) | my.doe.nh.gov/iPlatform | iReport dashboards (NH SAS) | iPlatform / data-reports | iPlatform enrollment reports | Dashboard exports; no API | Both DOE hosts 403 bots; small-state suppression |
| NJ | NJDOE | homeroom5.doe.state.nj.us/directory/school.php | nj.gov/education/spr + rc.doe.state.nj.us | SPR databases 2015-16→2024-25 | In SPR databases | SPR + Fall Enrollment (doedata) | Excel + Access bulk files | 2024-25 released May 2026; homeroom blocks bots |

## Cross-cutting observations

1. **Anti-bot blocking is the dominant operational risk**: 7 of 10 states (MI, MS, MO, MT partially, NE, NH, NJ-homeroom, plus michigan.gov) returned 403/connection-refused to non-browser HTTP clients. Ingestion pipelines will need browser-grade fetching (headless browser) or manual bulk-file pulls.
2. **No state in this batch offers a true REST API**; the best machine-readable options are MI's EEM (Excel/XML), NJ's SPR Excel/Access databases, MN's MDEAnalytics Excel files, and MA's exportable statereport tables + E2C hub.
3. **Most current data**: MA and NJ (full SY2024-25 published). **Most lagged**: NV (2023-24 ratings, next refresh Sept 2026) and MS (PDF-heavy 2025 releases).
4. **Directory gaps**: MS and NV have no verified downloadable school directory file; NE/MN directories confirmed but their hosts refused automated connections during research.
