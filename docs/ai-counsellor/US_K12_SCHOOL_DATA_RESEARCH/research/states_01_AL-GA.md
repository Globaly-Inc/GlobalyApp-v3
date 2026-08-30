# US K-12 State Education Data Infrastructure — States 01: Alabama–Georgia

Research date: 2026-08-25. Method: WebSearch + WebFetch verification of each URL.
Verification legend: **[V]** = page fetched and content confirmed; **[S]** = found via official search listings but the host blocked/refused automated fetch (URL not independently confirmed on 2026-08-25).

---

## Alabama

**IMPORTANT ACCESS NOTE:** All Alabama SEA hosts (`alabamaachieves.org`, `reportcard.alsde.edu`, `statereportcard.alsde.edu`) were unreachable from this research environment (DNS failure / connection refused / timeout on 2026-08-25) — likely geo/WAF blocking of automated clients. Everything below is [S] — sourced from official search listings only, not fetched.

- **SEA:** Alabama State Department of Education (ALSDE) — https://www.alabamaachieves.org [S]
- **School directory:** ALSDE "LookUp Tool" under Reports & Data provides district/school address info plus a printable PDF directory; no confirmed bulk CSV found. Directory page also listed at https://al.accessgov.com/adoemain/Home/Directory [S]
- **Report card:** Alabama Education Report Card — https://reportcard.alsde.edu/Alsde/OverallScorePage/ (interactive) and legacy https://statereportcard.alsde.edu/SelectSchool.aspx [S]. Downloadability of school-level data unconfirmed.
- **Assessment data:** ACAP results published via Reports & Data at https://www.alabamaachieves.org/reports-data/ [S]; format/year unconfirmed.
- **Graduation:** Reported in the state report card system [S]; standalone download unconfirmed.
- **Enrollment/demographics:** https://www.alabamaachieves.org/reports-data/student-data/ [S]; format unconfirmed.
- **API/open data:** None found.
- **Private schools:** The LookUp Tool reportedly includes links for private school lists and homeschool organizations [S].
- **Most recent year confirmed:** none confirmable (site unreachable).
- **Limitations:** State sites block/failed automated access; much directory output is PDF; no evident bulk machine-readable directory. Expect manual/browser collection or an open-records request.

## Alaska

- **SEA:** Alaska Department of Education & Early Development (DEED) — https://education.alaska.gov [V]
- **School directory:** DEED Online Directory — https://education.alaska.gov/eeddirectory [V — fetched; it is a contact/lookup hub, not a bulk file]. No downloadable statewide school CSV confirmed; district directories come through the Data Center's "Districts and Schools Information" section.
- **Report card:** Report Card to the Public — https://education.alaska.gov/reportcard and per-year pages such as https://education.alaska.gov/ReportCardToThePublic/Report/2023-2024 [S/V — Data Center page confirms report cards from 2009-10 onward; per-year URL from official search listing]. Report cards downloadable as zipped files.
- **Assessment data:** Linked from the Data Center (https://education.alaska.gov/data-center) [V]; specific formats not stated on the hub page (AK STAR/ACCESS results pages sit under education.alaska.gov/assessments).
- **Graduation:** Data Center — graduates and graduation rates by district/school, subgroups, 4- and 5-year rates, coverage 1991–2025; XLSX for several series [V].
- **Enrollment/demographics:** Data Center — October 1 enrollment snapshots by district/school/grade/ethnicity, historical 1989–2025; XLSX for several series [V].
- **API/open data:** None found; data served as Excel/PDF files from the Data Center.
- **Private schools:** No private school list found on the Data Center or directory pages [V — checked both].
- **Most recent year confirmed:** 2024-25/2025-26 series (enrollment and ADM series run to 2025/FY26) [V].
- **Limitations:** No API; mixed XLSX/PDF; directory is lookup-only, no confirmed bulk school file; small-district suppression likely given tiny enrollments (not explicitly stated on hub page).

## Arizona

- **SEA:** Arizona Department of Education (ADE) — https://www.azed.gov [S — host returns HTTP 403 to automated fetch]
- **School directory:** ADE publishes school/LEA entity information via AZ School Report Cards site and ADE data pages; no bulk directory file could be verified because azed.gov 403-blocks bots. ADE "School Finder"/entity lists exist under azed.gov but unverified [S].
- **Report card:** AZ School Report Cards — https://azreportcards.azed.gov/ [V — fetched; JavaScript SPA]. School-level pages exist (e.g. /schools/detail/{id}); site offers PDF export of school comparisons; bulk download not exposed in the SPA shell.
- **Assessment data:** Public Data Sets — https://www.azed.gov/data/public-data-sets and Accountability & Research Data — https://www.azed.gov/accountability-research/data [S]. Per official search listings these hold Excel files of assessment results, graduation rates, dropout rates and enrollment at school/LEA/county/state level; direct fetch blocked (403).
- **Graduation:** Same Public Data Sets page (Excel) [S]; also displayed in azreportcards.
- **Enrollment/demographics:** Same Public Data Sets page (Excel) [S].
- **API/open data:** None found; azreportcards is an SPA backed by an internal JSON API (not documented publicly).
- **Private schools:** No state-published private school directory found (ADE has minimal private-school oversight; ESA program lists exist but were not verified).
- **Most recent year confirmed:** could not confirm directly (403); search listings reference current A–F letter grades and recent-year files.
- **Limitations:** azed.gov aggressively blocks automated clients (HTTP 403) — scraping will require browser automation or manual download; report card site is an SPA; some data requires ADEConnect login (e.g. CCRI self-report).

## Arkansas

- **SEA:** Arkansas Department of Education, Division of Elementary & Secondary Education (DESE) — https://dese.ade.arkansas.gov
- **School directory:** ADE Data Center — https://adedata.arkansas.gov/ [V — fetched]. Directory tools: School Locator https://adedata.arkansas.gov/lea, NCES ID Directory https://adedata.arkansas.gov/nid, School Personnel Directory https://adedata.arkansas.gov/spd [V — links confirmed on hub]. These tools export lists; exact export formats not confirmed per-tool.
- **Report card:** My School Info — https://myschoolinfo.arkansas.gov/ [V — fetched]. School report cards, letter grades, ESSA School Index; site last updated 2026-04-13. Offers data reports/analysis tools; per-report downloads (Excel/CSV) exist within the app but weren't individually confirmed.
- **Assessment data:** ATLAS (Arkansas Teaching, Learning and Assessment System) data sets released on My School Info; 2024 ATLAS data confirmed as most recent named release on the Data Center hub [V].
- **Graduation:** Via My School Info school performance reports and Statewide Information System Reports (legacy) https://adedata.arkansas.gov/statewide/ [V — link confirmed].
- **Enrollment/demographics:** Statewide Information System (SIS) https://adedata.arkansas.gov/sis and legacy statewide reports [V — links confirmed]; Arkansas K-12 Profile https://adedata.arkansas.gov/ark12 [V].
- **API/open data:** No formal public API documented; adedata.arkansas.gov apps generate reports/exports.
- **Private schools:** Not found on the Data Center hub; unconfirmed.
- **Most recent year confirmed:** 2024 ATLAS assessment data (hub reference) [V]; MSI updated April 2026 so 2024-25 data is likely live but unconfirmed.
- **Limitations:** Data spread across many small web apps rather than one bulk-download page; export formats vary per tool; LEA Insights (https://insight.ade.arkansas.gov/) is dashboard-oriented.

## California

- **SEA:** California Department of Education (CDE) — https://www.cde.ca.gov [S — cde.ca.gov WAF-redirects automated fetches to a block page]
- **School directory:** Public Schools and Districts data file — https://www.cde.ca.gov/ds/si/ds/pubschls.asp (tab-delimited TXT, all schools with CDS codes, addresses, status; updated daily) [S — canonical URL confirmed in search listings; fetch blocked by CDE WAF]. **Verified alternative [V]:** data.ca.gov hosts CDE datasets "California Public Schools 2025-26" (and 2024-25, 2023-24) and "California School District Offices 2025-26" in CSV/Excel/GeoJSON/Shapefile, last modified 2026-08-24/25 — https://data.ca.gov (search "California Public Schools").
- **Report card:** California School Dashboard — https://www.caschooldashboard.org (accountability) plus DataQuest — https://dataquest.cde.ca.gov [S]. Dashboard research files downloadable from CDE dashboard data page [S].
- **Assessment data:** CAASPP/ELPAC research files — https://www.cde.ca.gov/ds/ad/assessmentdata.asp and CAASPP results site caaspp-elpac.ets.org (CSV research files, school level) [S — blocked from direct fetch].
- **Graduation:** Adjusted cohort graduation rate downloadable files via https://www.cde.ca.gov/ds/ad/downloadabledata.asp (Filesbygroup: "Graduates") [S].
- **Enrollment/demographics:** Census Day enrollment files (CSV/TXT) via the same Downloadable Data Files page and DataQuest [S].
- **API/open data:** **data.ca.gov (CKAN) — verified working API** [V]: `https://data.ca.gov/api/3/action/package_search?q=school+directory` returns CDE datasets; no restrictions on public use.
- **Private schools:** CDE Private School Directory (annual Private School Affidavit filings, XLSX) at https://www.cde.ca.gov/ds/si/ps/ [S — known CDE page, fetch blocked].
- **Most recent year confirmed:** 2025-26 directory datasets on data.ca.gov, modified 2026-08-25 [V].
- **Limitations:** cde.ca.gov blocks non-browser clients via WAF (303 → wafalert.html) — bulk downloads need browser-like requests or the data.ca.gov mirrors; CAASPP files use *asterisk* suppression for n<11.

## Colorado

- **SEA:** Colorado Department of Education (CDE) — https://www.cde.state.co.us [note: `www.cde.state.co.us` refused automated connections; mirror host `ed.cde.state.co.us` worked]
- **School directory:** District and School Contact Information ("mailing labels") — https://www.cde.state.co.us/cdereval/downloadablemailinglabels — XLSX downloads for district/school contacts AND Non-Public Schools Contact Information [S — URL from CDE search listing; www host refused fetch, ed. mirror returned 404 for this path]. Also "list of all Colorado Schools (XLSX)" on the Pupil Membership Statistics page — https://ed.cde.state.co.us/cdereval/pupilmembership-statistics [S].
- **Report card:** SchoolView — https://www.cde.state.co.us/schoolview/explore/welcome [S]; District & School Dashboard — https://www.cde.state.co.us/district-school-dashboard [S]. SchoolView supports OData feeds (v2 endpoint usable in Excel/Tableau) per CDE documentation [S].
- **Assessment data:** **Verified [V]:** Spring 2025 CMAS Data and Results — https://ed.cde.state.co.us/assessment/cmas-dataandresults-2025 — XLSX: "2025 CMAS Math and ELA District and School Overall Results", "2025 CMAS Science District and School Overall Results", plus disaggregated summary files (ELA, CSLA, Math, Science). Prior years at .../cmas-dataandresults-2024 etc.
- **Graduation:** Graduation/dropout statistics under CDE "CDEREVAL" pages (annual XLSX), e.g. https://ed.cde.state.co.us/cdereval/related [S/V — hub confirmed reachable on ed. host].
- **Enrollment/demographics:** Pupil Membership — https://cde.state.co.us/cdereval/pupilcurrent — 2023-24/2024-25 XLSX: PK-12 membership by grade/school, race/ethnicity & gender by school, free/reduced lunch by school [S].
- **API/open data:** SchoolView OData endpoints [S]; data.colorado.gov's "School View" Socrata entry (tedy-p7a5) is only a stale 2012 link record, not a dataset [V — checked, not useful].
- **Private schools:** Non-Public Schools Contact Information XLSX on the mailing-labels page [S].
- **Most recent year confirmed:** Spring 2025 CMAS school-level XLSX [V]; FRL/membership 2024-25 referenced [S].
- **Limitations:** Primary host `www.cde.state.co.us` refused automated connections (use `ed.cde.state.co.us` mirror); data scattered across CDEREVAL pages; XLSX not CSV; standard n<16 suppression applies to CMAS subgroup files (per CDE practice; not restated on the 2025 page).

## Connecticut

- **SEA:** Connecticut State Department of Education (CSDE) — https://portal.ct.gov/sde
- **School directory:** **Education Directory dataset on CT Open Data — verified [V]:** https://data.ct.gov/Education/Education-Directory/9k2y-kqxn — all public education organizations with district name, school name, org type, 7-digit organization code, address, town, zip, phone, grades offered, magnet status, geocoded location. Formats: CSV/JSON/XLSX via Socrata export + SODA API. Last updated 2026-01-20; stated frequency "Bi-annually".
- **Report card:** EdSight — https://public-edsight.ct.gov/ [S — confirmed as CSDE's interactive portal via portal.ct.gov/sde/performance/edsight]. School-level data exportable from EdSight reports; many EdSight series are mirrored as downloadable datasets on data.ct.gov ("EdSight (State education data repository)" — https://data.ct.gov/Education/EdSight-State-education-data-repository-/7uts-qap4) [S].
- **Assessment data:** Smarter Balanced / NGSS / SAT results via EdSight (export) and data.ct.gov education datasets [S]; CSV/API.
- **Graduation:** 4-year cohort graduation rates on EdSight and data.ct.gov [S].
- **Enrollment/demographics:** Enrollment datasets on EdSight/data.ct.gov [S].
- **API/open data:** **Socrata SODA API on data.ct.gov — verified working [V]** (`/api/views/9k2y-kqxn.json` returned full metadata).
- **Private schools:** Education Directory covers public organizations only; a separate state private-school list was not found/verified.
- **Most recent year confirmed:** directory updated Jan 2026 [V].
- **Limitations:** EdSight suppresses small cells (<6 students, CSDE standard); some EdSight views are dashboard-only; directory updates only bi-annual.

## Delaware

- **SEA:** Delaware Department of Education (DDOE) — https://education.delaware.gov
- **School directory:** **Delaware Public Education Organization Directory — verified [V]:** https://data.delaware.gov/Education/Delaware-Public-Education-Organization-Directory/p3ez-si4g — active education organizations incl. physical school buildings, district/school codes used consistently across all DDOE open-data files, physical address, longitude/latitude. Socrata CSV/JSON/API. Updated 2025-02-17.
- **Report card:** Delaware Report Card — https://reportcard.doe.k12.de.us/ and Explore Delaware Schools — https://explore.education.delaware.gov/ [S — both from official listings]; underlying data downloadable via the open data portal.
- **Assessment data:** **Student Assessment Performance — verified [V]:** https://data.delaware.gov/Education/Student-Assessment-Performance/ms6b-mt82 — tested counts, proficient counts, proficiency rates by school/district/state; updated yearly (last data update Jan 2025 per metadata).
- **Graduation:** Graduation-rate dataset on data.delaware.gov education category (same portal pattern) [S]; also shown on Report Card.
- **Enrollment/demographics:** **Student Enrollment — verified [V]:** dataset 6i7v-xnmf on data.delaware.gov, fall + end-of-year enrollment by demographics/grade, updated 2026-01-08. Student Attendance dataset crb4-kdc7 also verified.
- **API/open data:** **Socrata SODA API at data.delaware.gov — verified working [V]**; education data 2015–present.
- **Private schools:** Not in the public-org directory; DDOE publishes a nonpublic-school report but it was not verified.
- **Most recent year confirmed:** enrollment updated Jan 2026 (2025-26 fall) [V]; assessment through 2023-24/2024-25 file (metadata Jan 2025) [V].
- **Limitations:** **Heavy redaction:** ~79% of Student Assessment Performance rows are marked "REDACTED" for privacy [V — from dataset metadata]; only "REPORTED" rows carry values. Open data starts 2015.

## Florida

- **SEA:** Florida Department of Education (FDOE) — https://www.fldoe.org [note: fldoe.org returned HTTP 403 to automated fetch]
- **School directory:** **Master School Identification (MSID) file — verified [V]:** https://eds.fldoe.org/EDS/MasterSchoolID/ — public directory of all public PK-12 + district-operated adult/technical schools, searchable by name/district/city; submitting an empty search returns all schools; currently showing 2026-27 school year. HTML tool — no bulk CSV/Excel export exposed on the page (Excel extracts of MSID exist on fldoe.org but that host 403-blocks bots).
- **Report card:** EduData "Know Your Schools" — https://edudata.fldoe.org/ [V — fetched]. Florida Report Cards, ESSA info, school grades, assessment reports, enrollment/demographics and staff reports for state/district/school; Know Your Data interactive reports downloadable as Image/Crosstab/PDF/PowerPoint.
- **Assessment data:** FAST/B.E.S.T. results via edudata assessment reports [V] and bulk XLS files under https://www.fldoe.org/accountability/assessments/k-12-student-assessment/results/ [S — 403 on direct fetch].
- **Graduation:** Graduation-rate publications under PK-12 Public School Data Publications & Reports — https://www.fldoe.org/accountability/data-sys/edu-info-accountability-services/pk-12-public-school-data-pubs-reports/ [S — 403 on fetch; URL from official listings]. XLS/PDF.
- **Enrollment/demographics:** Same Data Publications & Reports series (membership by school, XLS) [S]; also via edudata [V].
- **API/open data:** None found; no state open-data portal coverage for FDOE.
- **Private schools:** Florida private school directory maintained by FDOE Office of School Choice (searchable at https://pfsd.fldoe.org / linked from fldoe.org) [S — not verified due to 403]; charter school directories at https://www.fldoe.org/schools/school-choice/charter-schools/charter-school-directories/ [S].
- **Most recent year confirmed:** MSID showing 2026-27 [V]; 2025-26 staff directory PDF (2526-173125.pdf) listed on fldoe.org [S].
- **Limitations:** fldoe.org 403-blocks automated clients (bulk files need browser automation); MSID web tool lacks a one-click bulk export; EduData exports are presentation formats (PDF/PPT/crosstab) rather than clean CSV.

## Georgia

- **SEA:** Georgia Department of Education (GaDOE) — https://gadoe.org ; plus Governor's Office of Education & Workforce Strategy (GOEWS, formerly GOSA) for the state report card.
- **School directory:** No single verified bulk directory file from GaDOE (georgiainsights.gadoe.org refused automated connections). GOSA/GOEWS downloadable files carry school/district IDs usable as a de facto directory [V]. GaDOE school/district lookup at https://gadoe.org/district-schools/ [S].
- **Report card:** GOEWS dashboards & report card — https://goews.georgia.gov/reporting and downloadable data page https://goews.georgia.gov/dashboards-data-report-card/downloadable-data [V — fetched]; K-12 report card dashboards with school-level data backed by CSV downloads.
- **Assessment data:** **Verified [V]:** GOEWS Downloadable Data Repository — https://download.gosa.ga.gov/ — Georgia Milestones EOG/EOC by subject and subgroup, GAA 2.0, ACT/SAT/AP. CSV (recent years), XLS and ZIP (historical). Coverage 2004–2025; most recent 2024-25. Direct file pattern e.g. https://download.gosa.ga.gov/2024/2024_directly_certified_school.xls [V — pattern confirmed].
- **Graduation:** 4-year and 5-year cohort graduation rates with subgroups, CSV, through 2024-25, in the same repository [V].
- **Enrollment/demographics:** Enrollment by grade/subgroup, FTE counts, CSV through 2024-25 [V]; also attendance, dropout, retention, discipline, personnel, finance.
- **API/open data:** No formal API; download.gosa.ga.gov is a flat-file repository with predictable year-based URLs (easily scriptable) [V].
- **Private schools:** Not in the GOSA repository; GaDOE private school list not verified.
- **Most recent year confirmed:** 2024-25 CSVs in GOEWS repository [V].
- **Limitations:** georgiainsights.gadoe.org (GaDOE's own download page, incl. Milestones dashboard files) refused automated connections; GOEWS pages note no explicit suppression rules but GOSA files traditionally use "TFS" (too few students) masking; pre-2010 data by request form only.

---

## Summary Table

| State | Agency | School Directory URL | Report Card URL | Assessment Data | Graduation | Enrollment | Format/API | Notes |
|---|---|---|---|---|---|---|---|---|
| AL | ALSDE (alabamaachieves.org) | LookUp Tool via alabamaachieves.org/reports-data/ [S] | reportcard.alsde.edu [S] | alabamaachieves.org/reports-data/ [S] | In report card [S] | reports-data/student-data/ [S] | PDF-heavy; no API | **All state hosts blocked automated access — nothing directly verified** |
| AK | DEED (education.alaska.gov) | education.alaska.gov/eeddirectory (lookup only) [V] | education.alaska.gov/reportcard [V/S] | Via data-center links | data-center, XLSX, 1991–2025 [V] | data-center, XLSX, 1989–2025 [V] | XLSX/PDF; no API | No bulk school CSV; report cards as ZIPs |
| AZ | ADE (azed.gov) | Not verified (azed.gov 403) | azreportcards.azed.gov [V] | azed.gov/data/public-data-sets (Excel) [S] | Same page (Excel) [S] | Same page (Excel) [S] | XLSX; SPA report card; no public API | azed.gov 403-blocks bots; some data behind ADEConnect login |
| AR | DESE / ADE | adedata.arkansas.gov (School Locator /lea, NCES /nid) [V] | myschoolinfo.arkansas.gov [V] | ATLAS via My School Info (2024) [V] | MSI + adedata statewide reports [V] | adedata.arkansas.gov/sis [V] | Web apps w/ exports; no formal API | Data split across many small apps |
| CA | CDE (cde.ca.gov) | cde.ca.gov/ds/si/ds/pubschls.asp (TXT, daily) [S]; data.ca.gov "California Public Schools 2025-26" (CSV) [V] | caschooldashboard.org + DataQuest [S] | cde.ca.gov/ds/ad/assessmentdata.asp (CAASPP CSV) [S] | downloadabledata.asp cohort files [S] | Census Day files, CSV [S] | CSV/TXT; **CKAN API at data.ca.gov [V]** | cde.ca.gov WAF blocks bots; n<11 suppression |
| CO | CDE (cde.state.co.us) | cdereval/downloadablemailinglabels (XLSX, incl. non-public) [S] | SchoolView / district-school-dashboard [S] | ed.cde.state.co.us/assessment/cmas-dataandresults-2025 (XLSX, school level) [V] | CDEREVAL pages, XLSX [S] | cdereval/pupilcurrent (XLSX, 2024-25) [S] | XLSX; SchoolView OData [S] | www host refuses bots — use ed.cde.state.co.us; n<16 subgroup suppression |
| CT | CSDE (portal.ct.gov/sde) | data.ct.gov/Education/Education-Directory/9k2y-kqxn (CSV/API, Jan 2026) [V] | public-edsight.ct.gov [S] | EdSight + data.ct.gov (CSV/API) [S] | EdSight/data.ct.gov [S] | EdSight/data.ct.gov [S] | **Socrata SODA API [V]** | <6 suppression; directory bi-annual |
| DE | DDOE (education.delaware.gov) | data.delaware.gov p3ez-si4g Org Directory (CSV/API, w/ lat-long) [V] | reportcard.doe.k12.de.us [S] | data.delaware.gov ms6b-mt82 (CSV/API, yearly) [V] | Report card + open data [S] | data.delaware.gov 6i7v-xnmf (Jan 2026) [V] | **Socrata SODA API [V]** | ~79% of assessment rows REDACTED; data from 2015 |
| FL | FDOE (fldoe.org) | eds.fldoe.org/EDS/MasterSchoolID/ (HTML, 2026-27) [V] | edudata.fldoe.org [V] | edudata + fldoe.org results pages (XLS) [S] | PK-12 Data Pubs & Reports (XLS/PDF) [S] | Same series + edudata [V/S] | XLS/PDF/HTML; no API | fldoe.org 403-blocks bots; MSID lacks bulk export |
| GA | GaDOE + GOEWS/GOSA | Via download.gosa.ga.gov file IDs [V]; no bulk GaDOE directory verified | goews.georgia.gov/reporting [V] | download.gosa.ga.gov Milestones CSV, 2004–2025 [V] | 4/5-yr cohort CSV, 2024-25 [V] | Enrollment/FTE CSV, 2024-25 [V] | Flat CSV repo, predictable URLs; no API | georgiainsights.gadoe.org refused bots; TFS masking |
