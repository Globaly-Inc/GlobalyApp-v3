# US K-12 State Education Data Infrastructure — States 02: HI, ID, IL, IN, IA, KS, KY, LA, ME, MD

Research date: 2026-08-25. All URLs below were verified by fetch or by multiple corroborating search results unless marked "NOT VERIFIED". Fetch failures caused by state-server bot blocking / TLS issues are noted explicitly — those sites exist but could not be inspected from this environment.

---

## Hawaii

- **SEA**: Hawai'i State Department of Education (HIDOE) — https://hawaiipublicschools.org/ (single statewide district; site migrated to WordPress in ~2024-25). Verified.
- **School directory**: List of Schools — https://hawaiipublicschools.org/wp-content/uploads/List-of-Schools.xlsx (verified: real 52 KB XLSX, 2 sheets). Staff phone directory moved to https://iportal.k12.hi.us/phonedirectory (not fetched).
- **Report card / profiles**: Strive HI Performance Reports on ARCH — https://arch.k12.hi.us/reports/strivehi-performance and Strive HI Dashboard — https://hawaiipublicschools.org/about/organization/strive-hi-dashboard/. ARCH is a JavaScript SPA — page content not readable via plain fetch, so download formats could not be inspected directly. Per HIDOE press releases, school-level Strive HI reports for 2024-25 are posted there.
- **Assessment data**: Strive HI school-level reports (SBA ELA/math, science) via ARCH (above). Statewide Strive HI 2025 report (PDF): https://hawaiipublicschools.org/wp-content/uploads/Strive-HI-State-Report-2025.pdf. A "2024-25 KPI Master Data File" (downloadable data) is referenced on ARCH/ADC.
- **Graduation**: Included in Strive HI reports and KPI data; also Accountability Data Center (ADC) — https://adc.hidoe.us (referenced by HIDOE, not fetched).
- **Enrollment/demographics**: Official enrollment counts published via HIDOE Data & Reports — https://hawaiipublicschools.org/data-reports/school-reports/ (page exists per search; download formats not inspected).
- **API / open data**: None found; ADC (adc.hidoe.us) offers downloadable KPI data per HIDOE.
- **Private schools**: No state-published downloadable directory found. Hawaii private schools are licensed via the Hawaii Council of Private Schools (HAIS), not HIDOE. NOT VERIFIED as a dataset.
- **Recency**: 2024-25 Strive HI data released Sept 2025; annual updates.
- **Limitations**: ARCH/ADC are JS apps — hard to scrape; much statewide reporting is PDF; single-district structure means no district-level rollups beyond complex areas.

## Idaho

- **SEA**: Idaho State Department of Education (SDE) — https://www.sde.idaho.gov/ (pages verified via search: /school-districts/, /about-us/idaho-schools/).
- **School directory**: No standalone statewide directory file confirmed on sde.idaho.gov. School/district information files are in the Idaho Report Card **Data Downloads** section ("About Us" category — school information, enrollment, workforce): https://www.idahoreportcard.org/datafiles (verified page exists with 4 download categories). Formats not shown on the landing page (files behind category links).
- **Report card**: Idaho Report Card — https://www.idahoreportcard.org/ (verified; school search, comparison, ISAT/IDAA and IRI results, demographics). School-level data IS downloadable via /datafiles. (Older domain idahoschools.org redirects to/was replaced by this site.)
- **Assessment data**: ISAT/IDAA proficiency (ELA, math, science) and IRI — in Report Card "Achievement" download files. Data Release Calendar: https://www.idahoreportcard.org/content/doc/data/DataReleaseCalendar.pdf. Most recent year not confirmed from landing page (site is data-driven); expect 2024-25.
- **Graduation**: In Report Card "Success Indicators" downloads (graduation rates, attendance, career readiness) — same /datafiles page.
- **Enrollment/demographics**: In "About Us" download category on /datafiles.
- **API / open data**: None found.
- **Private schools**: No state directory found — Idaho does not register/accredit private K-12 schools (only proprietary non-degree schools via State Board: https://boardofed.idaho.gov/higher-education-private/proprietary-schools-non-degree-granting/registered-school-listing/). NOT AVAILABLE for K-12.
- **Recency**: Rolling releases per Data Release Calendar; exact latest year not confirmed.
- **Limitations**: File formats/years on /datafiles not visible without clicking through category pages; no bulk directory file confirmed outside the report card site.

## Illinois

- **SEA**: Illinois State Board of Education (ISBE) — https://www.isbe.net/. Verified.
- **School directory**: **Directory of Educational Entities** — https://www.isbe.net/Pages/Data-Analysis-Directories.aspx (verified). Excel, **updated nightly**; includes entity names, administrators, addresses, grades served, legislative districts, NCES IDs, RCDTS codes; separate sheets for public schools/districts, special ed, ROE/ISC, CTE centers, and **non-public schools**. Archives back to 2003-04.
- **Report card**: Illinois Report Card — https://www.illinoisreportcard.com/ (verified; branded 2024-2025). Interactive per-school; bulk downloads live at ISBE, not on this site.
- **Assessment data**: ISBE Report Card Data Library — https://www.isbe.net/Pages/Illinois-State-Report-Card-Data.aspx (verified). "2025 Report Card Public Data Set" (updated 05/14/2026), XLSX/zip; includes IAR/SAT/ACT assessment results, demographics, staffing, finance at school level. Legacy SPSS/SAS for older years.
- **Graduation**: Included in Report Card Public Data Set (same page).
- **Enrollment/demographics**: Included in Report Card Public Data Set; also Fall Enrollment files on ISBE Data Analysis pages.
- **API / open data**: No dedicated API found; the ISBE data library (bulk XLSX) is the de facto open-data source. data.illinois.gov NOT VERIFIED for school data.
- **Private schools**: Non-public schools sheet in the Directory of Educational Entities + Non-Public Schools Directory link on the same page. Verified.
- **Recency**: Directory nightly; report card data annually (2025 = SY2024-25, latest).
- **Limitations**: Public data set is one very large multi-sheet workbook (15-25+ MB zips); suppression applies to small cell sizes.

## Indiana

- **SEA**: Indiana Department of Education (IDOE) — https://www.in.gov/doe/. Verified.
- **School directory**: **2025-2026 Indiana School Directory** (XLSX, updated 4/1/2026) — linked from https://www.in.gov/doe/it/data-center-and-reports/ (verified); file at https://www.in.gov/doe/files/2025-2026-school-directory-2026-03-23.xlsx.
- **Report card / profiles**: Indiana GPS dashboard — https://indianagps.doe.in.gov/ (returned HTTP 403 to automated fetch — bot-blocked; exists per IDOE). Legacy INview retired. Bulk data comes from the Data Center instead.
- **Assessment data**: IDOE Data Center & Reports (verified): ILEARN 2025 grade 3-8 + biology school/corporation results (XLSX, disaggregated); IREAD 2026 (XLSX); SAT grade 11 2026 (XLSX).
- **Graduation**: 2025 State and Federal Graduation Rates (XLSX, as of Dec 29 2025) — same Data Center page.
- **Enrollment/demographics**: School and corporation enrollment by grade, ethnicity/meal status, SpEd/ELL, gender — XLSX, SY 2025-26 — same Data Center page.
- **API / open data**: None found; everything is flat XLSX from the Data Center.
- **Private schools**: The Indiana School Directory traditionally includes accredited non-public schools — NOT VERIFIED whether the 2025-26 file includes them (file not opened).
- **Recency**: SY 2025-26 enrollment/directory; 2025 ILEARN, 2026 IREAD/SAT. Annual updates.
- **Limitations**: Indiana GPS dashboard blocks automated access; suppression in disaggregated XLSX files.

## Iowa

- **SEA**: Iowa Department of Education — https://educate.iowa.gov/. Verified (note: /data returned 404; data lives under other paths).
- **School directory**: https://educate.iowa.gov/directories (verified): 2026-27 Preliminary **Public School District Directory** (XLSX, 67 KB), **Public School Building Directory** (XLSX, 244 KB), **Nonpublic School Building Directory** (XLSX, 60 KB); finals each October.
- **Report card**: Iowa School Performance Profiles — https://www.iaschoolperformance.gov/ (fetch hit a redirect loop from this environment; site confirmed live via Iowa DE press releases, 2025 ratings released Sept 2025, district-level ratings added Dec 2025). Downloadability of school-level data from the profiles site NOT directly verified.
- **Assessment data**: ISASP results are surfaced through the Performance Profiles and Iowa DE reports; no bulk ISASP school-level CSV verified. Data.gov catalogs an "Iowa School Performance Profiles" dataset (via data.iowa.gov).
- **Graduation**: Published via Iowa DE (graduation rate reports) and Performance Profiles; also datasets on data.iowa.gov ("High School Graduation Rates by District"). data.iowa.gov blocked automated fetch (403) — NOT directly verified this session.
- **Enrollment/demographics**: Iowa DE enrollment reports (certified enrollment) + data.iowa.gov datasets; formats XLSX/Socrata.
- **API / open data**: data.iowa.gov (Socrata — SODA API) hosts education datasets; blocked to automated fetch here but well-established.
- **Private schools**: Nonpublic School Building Directory XLSX (verified, see directories page).
- **Recency**: 2026-27 preliminary directories (Aug 2026); 2025 performance ratings.
- **Limitations**: iaschoolperformance.gov redirect issues for scrapers; assessment bulk files not clearly published outside the profiles tool.

## Kansas

**Access note:** every KSDE domain (ksde.gov, datacentral.ksde.gov, ksreportcard.ksde.gov, *.ksde.org) failed from this environment — TLS certificate-chain errors on .gov hosts and connection refused on .org hosts. URLs below are corroborated by KSDE's own PDF tutorial and third-party references but pages were NOT directly inspected.

- **SEA**: Kansas State Department of Education (KSDE) — https://www.ksde.gov/ (data hub: https://www.ksde.gov/data-and-reporting).
- **School directory**: Kansas Educational Directory via KSDE Data Central — https://datacentral.ksde.gov/ — includes a **raw data download of directory information by building or by district** (per KSDE Data Central tutorial PDF: https://www.ksde.gov/Portals/0/School%20Finance/reports_and_publications/Data%20Central%20tutorial.pdf); full directory also published as PDF.
- **Report card**: Kansas Report Card — https://ksreportcard.ksde.gov/ (building-level report cards; assessment, graduation, postsecondary effectiveness).
- **Assessment data**: Kansas Assessment Program results via Data Central reports and the Report Card (https://ksassessments.org/node/212 points to the report card). Downloads exist via Data Central's K-12 Report Generator (https://datacentral.ksde.org/report_gen.aspx).
- **Graduation**: Data Central "Graduation and Postsecondary Effectiveness" reports.
- **Enrollment/demographics**: Data Central demographic/headcount reports (building and district level).
- **API / open data**: None found.
- **Private schools**: Accredited private schools appear in the Kansas Educational Directory — NOT VERIFIED this session.
- **Recency**: Could not confirm (site unreachable); Data Central is updated annually per KSDE.
- **Limitations**: State servers present certificate problems to automated clients; Data Central is a report-generator UI rather than flat-file bulk downloads; expect suppression on small groups.

## Kentucky

**Access note:** education.ky.gov returned 403 and openhouse.education.ky.gov had TLS errors to automated fetch; facts below corroborated by multiple KDE pages in search results.

- **SEA**: Kentucky Department of Education (KDE) — https://www.education.ky.gov/.
- **School directory**: Open House **District and School Directory** — https://openhouse.education.ky.gov/directory — schools/districts with addresses, contacts, NCES IDs (fed by DASCR system).
- **Report card**: Kentucky School Report Card — https://www.kyschoolreportcard.com/ (also https://reportcard.kyschools.us/ — fetch returned a KDE-branded page but content was JS-rendered). 2024-25 report card released in phases Oct-Nov 2025.
- **Assessment data**: School Report Card Datasets — https://www.education.ky.gov/Open-House/data/Pages/Historical-SRC-Datasets.aspx — ~717 files, school/district/state level, back to SY 2011-12; 2024-25 datasets available on the SRC Suite Dashboard. Format historically XLSX/CSV.
- **Graduation**: In SRC datasets (accountability/graduation files) and on the report card site.
- **Enrollment/demographics**: Open House "Supplemental Data" datasets + SRC datasets.
- **API / open data**: Open House portal is the open-data hub (dataset downloads, no formal API found). Third-party: https://education.kyopengov.org/.
- **Private schools**: Kentucky nonpublic school certification list exists via KDE — NOT VERIFIED this session.
- **Recency**: 2024-25 SRC data (phased release Oct 2025-May 2026: academics Nov 2025, finance May 2026).
- **Limitations**: KDE web servers block/fail automated clients; SRC dashboard is JS-heavy; datasets released in phases so mid-year the latest year is incomplete.

## Louisiana

**Access note:** doe.louisiana.gov and louisianaschools.com return HTTP 403 to automated fetch (bot protection). URLs corroborated via search results including LDOE's own indexed pages.

- **SEA**: Louisiana Department of Education (LDOE) — https://doe.louisiana.gov/ (formerly louisianabelieves.com, which now largely redirects/403s).
- **School directory**: Louisiana School Directory generated from the Sponsor Site (SPS) database (public + nonpublic facilities) — see https://leads13.doe.louisiana.gov/lug/SPS/SPS.htm and the Data & Reports hub https://doe.louisiana.gov/data-and-reports. Direct XLSX link NOT VERIFIED (403).
- **Report card**: Louisiana School and Center Finder — https://www.louisianaschools.com/ — school/system report cards, performance scores (403 to bots; confirmed live via LDOE references).
- **Assessment data**: LEAP results on https://doe.louisiana.gov/data-and-reports/elementary-and-middle-school-performance — includes "2026 State LEA School LEAP Grade 3-8 Achievement Level Subgroup Summary" and high-school summaries, i.e. **2025-26 results already posted** (typically XLSX).
- **Graduation**: Cohort graduation rate files under Data & Reports (historically XLSX on the data center page). NOT directly verified this session.
- **Enrollment/demographics**: Data & Reports hub: enrollment counts for public, nonpublic, home study; discipline/attendance/dropout data.
- **API / open data**: None found.
- **Private schools**: BESE-Approved Nonpublic Schools — https://doe.louisiana.gov/topic-pages/louisiana-school-choice/nonpublic-schools (100k+ students; directory of approved nonpublic schools).
- **Recency**: 2026 LEAP results (SY 2025-26) posted; directory maintained continuously via SPS.
- **Limitations**: Aggressive bot-blocking on all LDOE properties; the louisianabelieves.com → doe.louisiana.gov migration broke many legacy data-center URLs.

## Maine

- **SEA**: Maine Department of Education — https://www.maine.gov/doe/. Verified.
- **School directory**: NEO Dashboard public reports — "Search for Maine Schools" https://neo.maine.gov/DOE/neo/Supersearch/ContactSearch/SearchForMaineSchools and "Maine Schools — Open and Closed Report" https://neo.maine.gov/DOE/neo/Supersearch/ContactSearch/SearchByOpenAndClosedSchools (verified: filters for public/private, school type, town; shows name, address, grades, open/close year). Export-to-Excel exists in NEO tooling per Maine State Library instructions, but the export button was not directly visible on the fetched view.
- **Report card**: Maine ESSA Dashboard — https://www.maine.gov/doe/dashboard (linked from the data warehouse page; not separately fetched). No commercial-style "report card" site.
- **Assessment data**: Maine DOE Data Warehouse — https://www.maine.gov/doe/data-reporting/reporting/warehouse (verified): "Maine State Assessment by Grade Level" reports + ESSA Dashboard links; some files dated 2025.
- **Graduation**: Data Warehouse: 4-, 5-, 6-year cohort graduation rates (verified listing).
- **Enrollment/demographics**: Data Warehouse: October 1 enrollment with demographic/categorical breakdowns; "Schools & SAU Data" (student population, geography, grade spans, school types).
- **API / open data**: None found; NEO is the closest thing (queryable reports).
- **Private schools**: NEO Open/Closed report filters to "Other Private" / "Private Sectarian" — state list of private schools available through NEO (verified filter options).
- **Recency**: Files dated 2025 on the warehouse page; annual updates. Exact latest assessment year not confirmed.
- **Limitations**: Warehouse page doesn't state formats/years up front (mix of dashboards, XLSX and PDF); NEO exports require interactive use; custom data requests needed for anything else.

## Maryland

- **SEA**: Maryland State Department of Education (MSDE) — https://www.marylandpublicschools.org/. Verified via search (main site indexed; direct fetch of report card blocked).
- **School directory**: No single verified bulk public-school directory file. School/district contacts via https://www.marylandpublicschools.org/about/Pages/directory.aspx (MSDE staff/office directory) and per-district lists; the Maryland Report Card is the practical per-school lookup. A downloadable all-schools file was NOT VERIFIED — flag for follow-up (report card Data Downloads includes school lists within its files).
- **Report card**: Maryland School Report Card — https://reportcard.msde.maryland.gov/ (HTTP 403 to automated fetch; confirmed live — 2024-25 report card released Nov 2025 per MSDE and district announcements). Has a **Data Downloads** section with school-level files including per-grade ELA/math results.
- **Assessment data**: MCAP (ELA, math, science, general + alternate) — school-level data in Report Card Data Downloads; example school-level release PDF: https://news.maryland.gov/msde/wp-content/uploads/sites/12/2023/09/09.26.23-2023-MCAP-School-Level-Data.pdf; 2024-25 MCAP presented Aug 2025 (https://www.marylandpublicschools.org/stateboard/Documents/2025/0826/Maryland-Comprehensive-Assessment-Program-MCAP-2024-2025-A.pdf).
- **Graduation**: Published in Report Card (accountability measures incl. graduation rate) Data Downloads.
- **Enrollment/demographics**: Report Card data downloads + MSDE enrollment publications (marylandpublicschools.org, historically XLSX/PDF).
- **API / open data**: None found (opendata.maryland.gov hosts some education datasets — NOT VERIFIED this session).
- **Private schools**: Strong: MSDE Nonpublic School Approval directories — https://oitinfo.msde.maryland.gov/NSAB/NSABSchoolList/TotalPrivateSchoolList (private-pay approved), .../TotalPubliclyFundedList, plus church-exempt registered schools; hub https://nonpublic.msde.maryland.gov/. HTML lists.
- **Recency**: 2024-25 report card released Nov 2025; MCAP 2024-25 results Aug 2025. Annual.
- **Limitations**: reportcard.msde.maryland.gov blocks automated fetch; data downloads are inside an Angular app (manual navigation); nonpublic directories are HTML (ASP pages), not CSV.

---

## Summary table

| State | Agency | School Directory URL | Report Card URL | Assessment Data | Graduation | Enrollment | Format/API | Notes |
|---|---|---|---|---|---|---|---|---|
| Hawaii | HIDOE (hawaiipublicschools.org) | hawaiipublicschools.org/wp-content/uploads/List-of-Schools.xlsx (verified XLSX) | arch.k12.hi.us/reports/strivehi-performance | Strive HI school reports + 2024-25 KPI Master Data File (ARCH/ADC) | Strive HI / KPI data | HIDOE data-reports pages | XLSX + JS dashboards; no API | ARCH/ADC are JS apps, hard to scrape; single statewide district |
| Idaho | Idaho SDE (sde.idaho.gov) | Via idahoreportcard.org/datafiles ("About Us" files) | idahoreportcard.org | ISAT/IDAA, IRI in Report Card downloads | "Success Indicators" downloads | "About Us" downloads | File downloads via report card; no API | No standalone directory file found; no private-school registry |
| Illinois | ISBE (isbe.net) | isbe.net/Pages/Data-Analysis-Directories.aspx — Directory of Educational Entities (XLSX, nightly) | illinoisreportcard.com (2024-25) | 2025 Report Card Public Data Set (XLSX/zip) at isbe.net | In public data set | In public data set + directory | XLSX bulk; no API | Best-in-class: nightly directory incl. non-public schools |
| Indiana | IDOE (in.gov/doe) | 2025-26 School Directory XLSX via in.gov/doe/it/data-center-and-reports/ | indianagps.doe.in.gov (bot-blocked) | ILEARN 2025, IREAD 2026, SAT 2026 school-level XLSX | 2025 state+federal rates XLSX | SY 2025-26 school/corp XLSX | Flat XLSX; no API | Data Center is comprehensive; GPS dashboard 403s bots |
| Iowa | Iowa DoE (educate.iowa.gov) | educate.iowa.gov/directories — district/building/nonpublic XLSX (2026-27 prelim) | iaschoolperformance.gov (redirect issues for bots) | ISASP via Performance Profiles; bulk file unverified | Profiles + data.iowa.gov | Certified enrollment + data.iowa.gov | XLSX; data.iowa.gov Socrata/SODA API | Directories excellent; profiles site scraper-hostile |
| Kansas | KSDE (ksde.gov) | datacentral.ksde.gov (directory raw download) — UNREACHABLE (TLS) | ksreportcard.ksde.gov — UNREACHABLE (TLS) | Data Central report generator | Data Central | Data Central | Report-generator UI; no API | All KSDE hosts failed TLS/connection from this environment |
| Kentucky | KDE (education.ky.gov) | openhouse.education.ky.gov/directory | kyschoolreportcard.com (2024-25, phased) | Historical SRC Datasets (~717 files, since 2011-12) | In SRC datasets | Open House supplemental data | XLSX/CSV datasets; no formal API | KDE servers 403/TLS-fail to bots; phased annual release |
| Louisiana | LDOE (doe.louisiana.gov) | School Directory via SPS db; leads13.doe.louisiana.gov/lug/SPS/SPS.htm | louisianaschools.com (bot-blocked) | LEAP 2026 (SY25-26) school-level files on doe.louisiana.gov | Data & Reports hub (unverified) | Public/nonpublic/home-study enrollment | XLSX; no API | Aggressive bot-blocking; site migration broke legacy URLs |
| Maine | Maine DOE (maine.gov/doe) | neo.maine.gov school search/open-closed report (verified, incl. private filter) | maine.gov/doe/dashboard (ESSA) | Data Warehouse: assessment by grade | Data Warehouse: 4/5/6-yr cohorts | Oct 1 enrollment + demographics | NEO queryable reports + mixed XLSX/PDF; no API | NEO exports interactive; formats not stated up front |
| Maryland | MSDE (marylandpublicschools.org) | No verified bulk file; per-school via report card; NSAB lists for nonpublic | reportcard.msde.maryland.gov (2024-25, bot-blocked) | MCAP school-level in report card Data Downloads | Report card downloads | Report card downloads + MSDE pubs | Angular app downloads; no API | Strong nonpublic directories (oitinfo.msde.maryland.gov/NSAB); report card blocks bots |
