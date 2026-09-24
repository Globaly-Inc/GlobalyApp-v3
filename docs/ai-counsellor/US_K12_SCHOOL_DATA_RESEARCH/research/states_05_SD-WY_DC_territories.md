# US State Education Data Infrastructure — SD, TN, TX, UT, VT, VA, WA, WV, WI, WY, DC + Territories

Research date: 2026-08-25. All URLs below were verified by fetch unless marked otherwise. "Fetch blocked" = site refused automated access (403/connection refused/TLS error) — URL confirmed via official search listings only.

---

## South Dakota

- **SEA**: South Dakota Department of Education (SD DOE) — https://doe.sd.gov
- **School directory**: SD Educational Directory — https://doe.sd.gov/ofm/edudir.aspx (verified). Two Excel downloads: "Address List: Principal & School Info" (school-level) and "Address List: Superintendents, Administrators & District Info" — last updated 10/01/2025. Also an online printable directory.
- **Report card**: SD School Report Card / "School Finder" — https://sdschools.sd.gov/ (verified; JavaScript SPA, no static content — data viewed per school in-app).
- **Assessment**: Program info at https://doe.sd.gov/assessment/ (verified via search). School-level results are surfaced through sdschools.sd.gov; **no statewide bulk assessment flat-file download was found/verified**.
- **Graduation**: Published within the sdschools.sd.gov report card system; no separate verified bulk file.
- **Enrollment/finance**: Statistical Digest — https://doe.sd.gov/ofm/statdigest.aspx (verified). PDF + Excel; most recent year 2024-25; strongest on finance/staffing. "Student Enrollment" section linked from https://doe.sd.gov/data/ (verified landing page, links only).
- **API/open data**: None found.
- **Private schools**: Not verified this session (SD DOE maintains nonpublic school accreditation lists, but no download URL confirmed).
- **Update frequency / latest year**: Directory Excel updated in-year (Oct 2025); Statistical Digest annual, 2024-25.
- **Limitations**: Report card is a SPA (hard to scrape); no confirmed bulk assessment/graduation downloads; digest data is heavily finance-oriented.

## Tennessee

- **SEA**: Tennessee Department of Education (TDOE) — https://www.tn.gov/education
- **School directory**: Tennessee School Directory — https://tnschooldirectory.tnedu.gov/ (verified). Excel download of all TN schools, districts, and regions; contact School.Directory@tn.gov for field details.
- **Report card**: TN State Report Card — https://reportcard.tnedu.gov/ (verified redirect to https://tdepublicschools.ondemand.sas.com/, SAS-hosted interactive site).
- **Assessment**: Data Downloads page — https://www.tn.gov/education/districts/federal-programs-and-oversight/data/data-downloads.html (verified). TCAP/EOC assessment files, accountability files, ACT, AP — Excel (some older years CSV), school level, mostly through 2024-25.
- **Graduation**: Graduation cohort files, Ready Graduate, dropout — same data-downloads page, Excel.
- **Enrollment/demographics**: Membership files (Oct 1 enrollment by grade/gender/race) + profile files — same page, Excel.
- **API/open data**: None; data request form for anything not published (no student-level data released).
- **Private schools**: Not verified this session.
- **Update frequency / latest year**: Annual; most datasets through 2024-25, some educator files into 2026.
- **Limitations**: Excel-only distribution; report card is a SAS app; standard suppression applies to small subgroups (per TDOE data review guide).

## Texas

- **SEA**: Texas Education Agency (TEA) — https://tea.texas.gov
- **School directory**: AskTED (Texas Education Directory) — download page https://tealprod.tea.state.tx.us/Tea.AskTed.Web/Forms/DownloadFile.aspx (verified). Options: "School and District Data File", "School, District and ESC Personnel Data File", "Download All Schools and Districts" (sortable). Updated daily; delimited text/Excel. Annual Texas School Directory also published.
- **Report card**: Texas Academic Performance Reports (TAPR) — https://tea.texas.gov/texas-schools/accountability/academic-accountability/performance-reporting/texas-academic-performance-reports (verified). Current: 2024-25 at https://rptsvr1.tea.texas.gov/perfreport/tapr/2025/index.html; archives to 2012-13. Campus-level data downloadable as Excel or comma-delimited text ("Basic" and "Advanced" download pages). Note: rptsvr1.tea.texas.gov refused automated connection during this session; download pages confirmed via TEA search listings. Parent-facing A-F ratings at TXschools.gov (not fetched).
- **Assessment**: STAAR results embedded in TAPR downloads (campus level, CSV/Excel); TEA also runs STAAR aggregate data portals.
- **Graduation**: In TAPR (4-, 5-, 6-year longitudinal rates, campus level) and TEA completion reports.
- **Enrollment/demographics**: In TAPR student profile sections; enrollment reports via TEA/PEIMS standard reports.
- **API/open data**: TEA Public Open Data (ArcGIS Hub) — https://schoolsdata2-tea-texas.opendata.arcgis.com/ (verified to exist; JS-rendered — standard ArcGIS Hub exports: CSV/GeoJSON/REST API; school locations and boundaries).
- **Private schools**: TEA does not accredit most private schools; TEPSAC list is the usual source (not verified this session).
- **Update frequency / latest year**: AskTED daily; TAPR annual — 2024-25 current, 2025-26 due Dec 2026.
- **Limitations**: rptsvr1 host intermittently blocks/refuses non-browser clients; TAPR masking rules apply to small cells.

## Utah

- **SEA**: Utah State Board of Education (USBE) — https://www.schools.utah.gov
- **School directory**: Utah Schools Directory (searchable online, linked from USBE Data & Statistics Reports page — verified reference). No bulk directory file confirmed.
- **Report card / data portal**: USBE Data Gateway — https://datagateway.schools.utah.gov/ (fetch refused — connection refused to automated client; confirmed as USBE's public data/report portal via USBE pages and search). Utah also has a separate school report card site linked from the Gateway.
- **Assessment**: Data & Statistics Reports — https://schools.utah.gov/datastatistics/reports (verified). RISE / Utah Aspire Plus proficiency, ACT grade 11, early literacy, WIDA, growth percentiles — Excel (.xlsx) + PDF, latest 2025.
- **Graduation**: Same reports page — cohort graduation and dropout rates by student group, Excel/PDF, latest 2024-25.
- **Enrollment/demographics**: Same page — fall enrollment by grade/demographics, ADM, mobility, chronic absenteeism — Excel, latest 2025-26.
- **API/open data**: None found; Data Gateway is interactive.
- **Private schools**: Not verified this session.
- **Update frequency / latest year**: Annual; enrollment already posted for 2025-26.
- **Limitations**: Data Gateway blocks automated access; custom data requests billed at $60/hour after 2 hours; small-N suppression in Gateway reports.

## Vermont

- **SEA**: Vermont Agency of Education (AOE) — https://education.vermont.gov
- **School directory**: Fragmented. Verified spreadsheet downloads: "Directory of Principals by School" (https://education.vermont.gov/documents/directory-principals-by-school) and "Directory of Superintendents by Supervisory Union" (search-verified, xlsx). Vermont Annual Snapshot organization directory — https://schoolsnapshot.vermont.gov/organization/directory (fetch blocked, 403). **No single all-public-schools CSV confirmed.**
- **Report card**: Vermont Education Dashboard — https://education.vermont.gov/data-and-reporting/vermont-education-dashboard (verified landing); Annual Snapshot at schoolsnapshot.vermont.gov.
- **Assessment**: Dashboard assessment page — https://education.vermont.gov/data-and-reporting/vermont-education-dashboard/vermont-education-dashboard-assessment (verified). Full downloadable datasets (General + Alternate assessment) for 2018, 2019, 2021, 2022, 2023, 2024, 2025.
- **Graduation**: Published via dashboard/accountability pages (not separately verified as a bulk file).
- **Enrollment**: Dashboard enrollment page — https://education.vermont.gov/data-and-reporting/vermont-education-dashboard/vermont-education-dashboard-enrollment (search-verified) with downloadable datasets.
- **API/open data**: Dashboard datasets appear on Vermont's data portal; no dedicated education API confirmed.
- **Private schools**: Directory of Vermont Independent Schools — https://education.vermont.gov/documents/independent-schools-directory (search-verified, PDF ~420 KB).
- **Update frequency / latest year**: Annual; assessment through 2024-25 (released 2025).
- **Limitations**: Very small schools → heavy suppression expected; directory data split across several files; snapshot site blocks bots.

## Virginia

- **SEA**: Virginia Department of Education (VDOE) — https://www.doe.virginia.gov (**fetch blocked: 403 to automated clients**).
- **School directory**: VDOE publishes school/division directory listings, but the main site blocks bots; the practical bulk source is the open data portal (below). Not directly verified on doe.virginia.gov.
- **Report card**: Virginia School Quality Profiles — https://schoolquality.virginia.gov with a dedicated Download Data page at https://schoolquality.virginia.gov/download-data (fetch failed on TLS certificate-chain error at time of check; page existence confirmed via search listings). School-level CSV downloads.
- **Assessment**: SOL results via Build-A-Table — https://p1pe.doe.virginia.gov/buildatab/ (**fetch blocked: 403**; long-standing VDOE query tool producing CSV at school level).
- **Graduation / Enrollment**: Virginia Open Data Portal — https://data.virginia.gov/dataset/?organization=department-of-education (verified). **197 VDOE datasets**: fall membership, graduates/completers, chronic absenteeism, positions/salaries, SOL participation. Formats: XLSX (125), CSV (26), XLS (23); historical back to the 1990s; latest verified titles ~2022-23 (newer data lives on VDOE's own pages).
- **API/open data**: data.virginia.gov is CKAN — full CKAN API available (verified).
- **Private schools**: Licensure/accreditation via VCPE, not a VDOE dataset (not verified).
- **Update frequency / latest year**: Annual; open-data portal lags VDOE site by a year or more for some series.
- **Limitations**: doe.virginia.gov and p1pe (Build-A-Table) aggressively block automated access; schoolquality.virginia.gov had an invalid TLS chain; open-data copies can be stale.

## Washington

- **SEA**: Office of Superintendent of Public Instruction (OSPI) — https://ospi.k12.wa.us
- **School directory**: Education Directory (EDS) — https://eds.ospi.k12.wa.us/DirectoryEDS.aspx (verified; HTML tables, current as of fetch date). Bulk directory/contact dataset also published on data.wa.gov (per OSPI Data Portal page).
- **Report card**: Washington State Report Card — https://reportcard.ospi.k12.wa.us/ (search-verified). Every visualization has a "Download Data" link; bulk report-card files moved to data.wa.gov (e.g. "Schools Report Card Data - OSPI": https://data.wa.gov/Education/Schools-Report-Card-Data-OSPI/7m7a-urs7).
- **Assessment**: Report Card assessment datasets on data.wa.gov (CSV + Socrata API), school level.
- **Graduation**: Graduation-rate datasets on data.wa.gov, school level.
- **Enrollment/demographics**: Enrollment datasets on data.wa.gov; OSPI Data Portal hub — https://ospi.k12.wa.us/data-reporting/data-portal (verified; lists students, educators, accountability, facilities, finance, directory categories; 2024-25 and 2025-26 current, history to 1990).
- **API/open data**: Yes — data.wa.gov (Socrata: CSV export + SODA API). One of the strongest states for programmatic access.
- **Private schools**: OSPI approves private schools and publishes a list (not verified this session).
- **Update frequency / latest year**: Annual per school year; 2024-25/2025-26 current.
- **Limitations**: Standard small-N suppression in report-card files; directory page itself is HTML (use the data.wa.gov dataset for bulk).

## West Virginia

- **SEA**: West Virginia Department of Education (WVDE) — https://wvde.us (**fetch blocked: 403**).
- **School directory**: WVDE publishes a school directory on wvde.us, but the site blocks automated access — **not verifiable this session**.
- **Report card / data portal**: ZoomWV — https://zoomwv.k12.wv.us/ (**fetch failed: connection refused**). Per WVDE pages (search-verified): interactive dashboards for enrollment, attendance, state assessment results, graduation rates at school/district/state level.
- **Assessment / Graduation / Enrollment**: All via ZoomWV dashboards; anything else requires the ZoomWV data request form (https://wvde.us/data-school-improvement/education-data/how-make-zoomwv-data-requests — search-verified). No bulk flat-file downloads confirmed.
- **API/open data**: None found.
- **Private schools**: Not verified.
- **Update frequency / latest year**: Could not confirm (sites unreachable to automated clients).
- **Limitations**: **Poor automated availability** — both wvde.us and zoomwv.k12.wv.us refused automated access; data appears dashboard-only with aggregate/de-identified request process for the rest. Plan for manual collection or a data request.

## Wisconsin

- **SEA**: Department of Public Instruction (DPI) — https://dpi.wi.gov
- **School directory**: School Directory Public Portal (linked from https://dpi.wi.gov/schooldirectory; historical published-data page verified at https://dpi.wi.gov/schooldirectory/public/published-data). WISEdash files carry DPI-assigned DISTRICT_CODE and SCHOOL_CODE for joins.
- **Report card**: DPI School Report Cards — dpi.wi.gov/accountability/report-cards (not fetched); data also flows through WISEdash.
- **Assessment**: WISEdash Data Files by Topic — https://dpi.wi.gov/wisedash/public/download-files (verified). Forward Exam, ACT, AP — statewide ZIP/CSV files covering ALL public schools; Forward/ACT files updated through Oct 2025 (2024-25 results).
- **Graduation**: Same page — graduation/HS completion and attendance/dropout topic files, ZIP/CSV.
- **Enrollment/demographics**: Same page — enrollment files (public AND private schools), 2025-26 file already posted (uploaded Mar 2026); discipline, special ed, postsecondary enrollment, per-pupil expenditure also available.
- **API/open data**: No formal API; the statewide CSV downloads are the bulk channel. WISEdash Public Portal for interactive views — https://dpi.wi.gov/wisedash/public.
- **Private schools**: Private school enrollment included in WISEdash enrollment topic files; private school directory/enrollment data on the published-data page (verified page).
- **Update frequency / latest year**: Annual per topic; 2025-26 enrollment posted, 2024-25 complete across topics.
- **Limitations**: Suppression in small cells; report cards separate from raw files; directory bulk export is via portal rather than a simple static CSV link.

## Wyoming

- **SEA**: Wyoming Department of Education (WDE) — https://edu.wyoming.gov
- **School directory**: WDE Education Directory — https://edu.wyoming.gov/downloads/wde-resources/directory.pdf (search-verified; **PDF only**). Wyoming Education Fusion directory site (fusion.edu.wyoming.gov) has an **invalid TLS certificate** — unusable/unverifiable.
- **Report card**: Wyoming School Performance Dashboard — https://wyoadvances.com/ (fetched: JavaScript SPA, renders empty to non-browser clients).
- **Assessment**: WY-TOPP results via Assessment Reports on https://edu.wyoming.gov/data/ (verified landing page) and the Data Reporting Tools section (https://edu.wyoming.gov/data/data-reporting-tools/).
- **Graduation**: Graduation Rates Report under WDE Data Reports (https://edu.wyoming.gov/transparency/data-reports/ — search-verified); four-year on-time rates.
- **Enrollment/demographics**: School District Enrollment & Staff Report / Statistical Report Series (edu.wyoming.gov/data/statisticalreportseries-2/ — search-verified); attendance & membership reports.
- **API/open data**: None found.
- **Private schools**: Not verified.
- **Update frequency / latest year**: Annual; exact latest year not confirmable from fetched pages (formats/years not shown on data landing page).
- **Limitations**: Directory PDF-only; dashboard is a SPA; Fusion legacy site broken TLS; tiny cohorts → heavy suppression likely.

## District of Columbia

- **SEA**: Office of the State Superintendent of Education (OSSE) — https://osse.dc.gov
- **School directory**: No single SEA directory file verified. Practical sources: DC School Report Card school list (schoolreportcard.dc.gov) and enrollment-audit workbooks (all public + charter schools). DC's citywide portal opendata.dc.gov carries DCPS/charter school point datasets (not verified this session).
- **Report card**: DC School Report Card — https://schoolreportcard.dc.gov/home (verified link from OSSE). Bulk data: DC School Report Card Resource Library — https://osse.dc.gov/page/dc-school-report-card-resource-library (verified): Excel metric-score files (assessment, attendance, graduation, enrollment, discipline, finance, educator workforce) for 2018–2026.
- **Assessment**: Statewide assessment results (PARCC→DC CAPE, MSAA) at state/LEA/school level — e.g. https://osse.dc.gov/assessmentresults2023 (search-verified); Excel downloads.
- **Graduation**: Graduation metric files in the Report Card Resource Library (xlsx).
- **Enrollment/demographics**: Annual Enrollment Audit — https://osse.dc.gov/enrollment (verified via search + PDF): audited counts per school, report PDF + data files each year; SY2024-25 audit published Mar 2025 (~100,235 students).
- **API/open data**: opendata.dc.gov (ArcGIS) for school locations — not verified this session; OSSE data itself is Excel-file based.
- **Private schools**: OSSE licenses nonpublic schools; no downloadable list verified.
- **Update frequency / latest year**: Annual; Resource Library files through 2025/2026 school years.
- **Limitations**: Data spread across many per-year OSSE pages; xlsx-only; suppression (n<10 typical) in public files.

---

## Territories

### Puerto Rico
- **Agency**: Departamento de Educación de Puerto Rico (DEPR) — https://de.pr.gov; school directory pages at https://de.pr.gov/directorio/directorio-de-escuelas/ (search-verified).
- **School-level data: YES, but dated.** Puerto Rico open data portal (Instituto de Estadísticas) — https://datos.estadisticas.pr: "Directorio de Escuelas Públicas en Puerto Rico 2020-2021" (CSV/XLSX; school name, unique code, district, address, coordinates, level, grades, enrollment, dropout rate, META-PR achievement) and "Directorio de Escuelas Privadas K-12 con Matrícula por Grado" (2017-18 forward). Verified via portal search listings.
- **Assessment**: META-PR results embedded in the directory dataset; no current per-year public download confirmed. DEPR "E-Data" page exists (https://de.pr.gov/edata/).
- **Verdict**: Reliable structured school-level data exists but the best open datasets are several years old; current-year data is HTML/Spanish-language pages.

### Guam
- **Agency**: Guam Department of Education (GDOE) — https://www.gdoe.net (single unified district, ~41 schools, ~30,000 students).
- **Data**: School Performance Report Card pages at gdoe.net (search-verified) and the statutory Annual State of Public Education Report — **PDF only** (demographics, assessment, graduation/dropout).
- **Verdict**: School list obtainable from GDOE site; no machine-readable datasets. PDF-only reporting.

### U.S. Virgin Islands
- **Agency**: Virgin Islands Department of Education (VIDE) — https://www.vide.vi. Schools page verified: https://www.vide.vi/schools-9 — HTML list of 23 schools in two districts (St. Thomas/St. John; St. Croix) with links, **no downloadable data**.
- **Verdict**: School list exists (HTML only); no public assessment/enrollment datasets found. Poor data availability.

### American Samoa
- **Agency**: American Samoa Department of Education (ASDOE); ~28 public schools. No functional data portal found; references exist to an American Samoa Center for Education and Workforce Statistics. Best structured source is NCES/federal reporting.
- **Verdict**: Effectively no territory-published school-level data online. Use NCES CCD.

### Northern Mariana Islands
- **Agency**: CNMI Public School System (PSS) — https://www.cnmipss.org; 20 schools + Head Start centers. Has an SLDS (https://slds.cnmipss.org — **fetch blocked, 403**) collecting enrollment, assessment, graduation/dropout; public output is annual report PDFs (e.g. PSS Annual Report, Citizen Centric Report FY2024).
- **Verdict**: Data is collected (SLDS) but published mainly as PDFs; no bulk downloads verified.

**Territory recommendation**: For all five territories, NCES CCD remains the only consistent machine-readable school-level source; territory sites add contact info (PR, Guam, USVI) and PDF reports. Puerto Rico is the only territory with genuine open-data school datasets, though stale (2020-21).

---

## Summary Table

| State | Agency | School Directory URL | Report Card URL | Assessment Data | Graduation | Enrollment | Format/API | Notes |
|---|---|---|---|---|---|---|---|---|
| SD | SD DOE (doe.sd.gov) | doe.sd.gov/ofm/edudir.aspx (Excel, 10/2025) | sdschools.sd.gov (SPA) | Via report card SPA; no bulk file found | Via report card | Statistical Digest doe.sd.gov/ofm/statdigest.aspx (PDF/XLSX, 2024-25) | Excel/PDF; no API | Report card hard to scrape; digest finance-heavy |
| TN | TDOE (tn.gov/education) | tnschooldirectory.tnedu.gov (Excel) | reportcard.tnedu.gov → SAS site | tn.gov/...data/data-downloads.html (XLSX, 2024-25) | Grad cohort files, same page | Membership files, same page | XLSX; no API | Comprehensive flat files; no student-level |
| TX | TEA (tea.texas.gov) | AskTED tealprod.tea.state.tx.us/Tea.AskTed.Web (daily, delimited) | TAPR rptsvr1.tea.texas.gov/perfreport/tapr/2025 + TXschools.gov | TAPR campus downloads (XLSX/CSV, 2024-25) | In TAPR | In TAPR + PEIMS | CSV/XLSX + ArcGIS open data (schoolsdata2-tea-texas.opendata.arcgis.com) | rptsvr1 blocks some bots; best-in-class breadth |
| UT | USBE (schools.utah.gov) | Online Utah Schools Directory (no bulk file confirmed) | datagateway.schools.utah.gov (fetch refused) | schools.utah.gov/datastatistics/reports (XLSX, 2025) | Same page (XLSX, 2024-25) | Same page (XLSX, 2025-26) | XLSX; no API | Gateway blocks bots; $60/hr data requests |
| VT | AOE (education.vermont.gov) | Fragmented: principals xlsx + schoolsnapshot.vermont.gov (403) | education.vermont.gov Vermont Education Dashboard | Dashboard datasets 2018-2025 (downloadable) | Via dashboard/accountability | Dashboard enrollment datasets | CSV/XLSX; no API | No single all-schools file; heavy suppression (small state) |
| VA | VDOE (doe.virginia.gov, 403 to bots) | Via data.virginia.gov datasets | schoolquality.virginia.gov/download-data (TLS error at check) | Build-A-Table p1pe.doe.virginia.gov (403 to bots) | data.virginia.gov graduates/completers | Fall membership on data.virginia.gov | XLSX/CSV + CKAN API (197 datasets) | Agency sites block automation; open-data copies lag |
| WA | OSPI (ospi.k12.wa.us) | eds.ospi.k12.wa.us/DirectoryEDS.aspx + data.wa.gov dataset | reportcard.ospi.k12.wa.us | data.wa.gov Report Card datasets (CSV/API, 2024-25) | data.wa.gov datasets | data.wa.gov datasets (2025-26 current) | Socrata SODA API + CSV | Best API access of this group |
| WV | WVDE (wvde.us, 403) | Not verifiable (site blocks bots) | zoomwv.k12.wv.us (connection refused) | ZoomWV dashboards only | ZoomWV | ZoomWV | Dashboard-only; no API | POOR automated availability; data request form for extracts |
| WI | DPI (dpi.wi.gov) | School Directory Public Portal (dpi.wi.gov/schooldirectory) | dpi.wi.gov report cards + WISEdash | dpi.wi.gov/wisedash/public/download-files (ZIP/CSV, 2024-25) | Same page | Same page (2025-26 posted; incl. private) | Statewide CSV ZIPs; school codes for joins; no API | Excellent flat files incl. private schools |
| WY | WDE (edu.wyoming.gov) | directory.pdf (PDF only); fusion site TLS broken | wyoadvances.com (JS SPA) | edu.wyoming.gov/data/ reports | Grad Rates Report (data-reports page) | Statistical Report Series | Mostly PDF/report; no API | PDF directory; SPA dashboard; small-N suppression |
| DC | OSSE (osse.dc.gov) | No SEA file; report card list + enrollment audit workbooks | schoolreportcard.dc.gov + Resource Library (XLSX 2018-2026) | osse.dc.gov assessment results pages (XLSX) | Report Card grad metric files | Enrollment Audit osse.dc.gov/enrollment (SY2024-25) | XLSX; opendata.dc.gov for locations (unverified) | Data split across per-year pages |
| PR | DEPR (de.pr.gov) | datos.estadisticas.pr public-school directory (CSV/XLSX, 2020-21) | — | META-PR in directory dataset (dated) | — | In directory dataset | CSV/XLSX (stale) | Only territory with open data; several years old |
| GU | GDOE (gdoe.net) | School list on gdoe.net (HTML) | SPCR pages on gdoe.net | Annual report PDFs | Annual report PDFs | Annual report PDFs | PDF only | Single district; no datasets |
| VI | VIDE (vide.vi) | vide.vi/schools-9 (HTML, 23 schools) | — | Not published | Not published | Not published | HTML only | Poor availability |
| AS | ASDOE | None found online | — | — | — | — | — | Use NCES CCD |
| MP | CNMI PSS (cnmipss.org) | School list on cnmipss.org | Annual report PDFs | SLDS exists (slds.cnmipss.org, 403) | PDF reports | PDF reports | PDF; SLDS not public-bulk | Data collected but PDF-published |
