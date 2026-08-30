# U.S. K-12 Data Source Registry

Research date: 2026-08-25. Verification legend: **[V]** = fetched/downloaded and verified directly on that date; **[S]** = confirmed via search evidence but the host blocked automated access; **[U]** = unverified/asserted by documentation only.

Reliability tiers: **T1** = federal government · **T2** = state education agency · **T3** = district/school official · **T4** = association/accreditor · **T5** = reputable third party · **T6** = user-generated.

---

## 1. Federal sources

### 1.1 NCES Common Core of Data (CCD) [V]
| | |
|---|---|
| Organization | National Center for Education Statistics (U.S. Dept. of Education) |
| URL | https://nces.ed.gov/ccd/files.asp (file tool); direct: `https://nces.ed.gov/ccd/Data/zip/…` |
| Data category | Public school + LEA universe: directory, enrollment (grade×race×sex), staff FTE, FRL/lunch, virtual status, charter status |
| Coverage | All 50 states, DC, PR, territories, DoD/BIE schools — **102,178 schools, 19,629 LEAs (SY 2024-25, verified by download)** |
| Level | School + LEA + state |
| Public/private | Public only |
| Years | 1986-87 → 2024-25 (v1a released 2025-07-30); 2025-26 preliminary directory slots visible |
| Update frequency | Annual (preliminary directory ~July following the school year; final v1a later) |
| Format | ZIP of CSV + SAS; wide (directory) and long (membership/lunch/staff) |
| API | None official (see Urban Institute §1.6; ELSI table tool for manual extracts) |
| Licensing | U.S. public domain (17 U.S.C. §105); no attribution required |
| Reliability | T1 — the national system of record for public schools |
| Recommended use | **Primary spine of the entire Globaly school DB.** NCESSCH/LEAID = canonical IDs |
| Limitations | ~1-year lag; no performance/programs/tuition; magnet flag no longer carried (2023-24+); membership file large (192 MB zip) |

### 1.2 NCES EDGE Geocodes & Geography [V]
| | |
|---|---|
| Organization | NCES (with U.S. Census Bureau) |
| URL | https://nces.ed.gov/programs/edge/geographic/schoollocations; file verified: https://nces.ed.gov/programs/edge/data/EDGE_GEOCODE_PUBLICSCH_2425.zip |
| Data category | Lat/long, county, NCES locale code (11–43), CBSA/CSA, congressional + state legislative districts |
| Coverage | All CCD schools — **100% join rate on NCESSCH verified (102,178/102,178)** |
| Level | School + LEA; also district boundary composites (TIGER/SDRP) |
| Years | 2015-16 → 2024-25, annual |
| Format | Pipe-delimited TXT + XLSX + shapefile; ArcGIS Open Data services |
| Licensing | Public domain |
| Reliability | T1 |
| Recommended use | All geography: distance search, locale classification, maps |
| Limitations | **SABS attendance boundaries discontinued after 2015-16** — no national catchment data |

### 1.3 NCES Private School Universe Survey (PSS) [V]
| | |
|---|---|
| Organization | NCES |
| URL | https://nces.ed.gov/surveys/pss/pssdata.asp; file verified: https://nces.ed.gov/surveys/pss/zip/pss2122_pu_csv.zip |
| Data category | Private school universe: identity, address, lat/long, religious affiliation/orientation, level, enrollment (by grade/race/sex), teachers FTE, student/teacher ratio, coed status, hours, association memberships (incl. TABS boarding proxy) |
| Coverage | **22,344 private schools (2021-22, verified by download)** |
| Level | School |
| Years | Biennial 1989-90 → 2021-22; **2023-24 not yet posted as of 2026-08-25** ("spring 2026" promised) |
| Format | ZIP of CSV/SAS/SPSS; 459 columns (88 weights) |
| API | None |
| Licensing | Public domain |
| Reliability | T1 |
| Recommended use | Primary spine for private schools (PPIN = private-school ID) |
| Limitations | **No tuition**; 2-4 year staleness between waves; nonresponse imputation (F_ flags); voluntary survey — small % of schools missing |

### 1.4 Civil Rights Data Collection (CRDC) [V by agent]
| | |
|---|---|
| Organization | Office for Civil Rights, U.S. Dept. of Education |
| URL | https://civilrightsdata.ed.gov/ |
| Data category | AP/IB/dual enrollment offerings + participation, advanced math/science courses, gifted programs, counselors/teachers (certification, novice %), enrollment by race×sex, EL, IDEA/504, discipline, harassment, restraint, **magnet flag** |
| Coverage | Every public school (mandatory) |
| Years | Biennial; latest public **2021-22 (released 2025-01-16)**; 2023-24 collected but unreleased as of 2026-08-25 |
| Format | Flat files (CSV) + documentation |
| Licensing | Public domain |
| Reliability | T1 for course/staffing counts; self-reported — discipline data has known quality issues (zero-inflation) |
| Recommended use | Program availability (AP/IB/gifted), counselor ratios, magnet flag |
| Limitations | 2-4 year lag; chronic absenteeism removed after 2017-18 (use ED Data Express); discipline fields display-with-caution only |

### 1.5 EDFacts / ED Data Express (assessment + ACGR) [S]
| | |
|---|---|
| Organization | U.S. Dept. of Education |
| URL | https://eddataexpress.ed.gov/download/data-library (successor to ed.gov EDFacts files) |
| Data category | State assessment proficiency (math/RLA/science) and 4-year ACGR graduation rate, school/LEA/SEA levels |
| Years | EDFacts files 2009-10 → 2018-19 on ed.gov; later years via ED Data Express |
| Format | CSV/ZIP |
| Licensing | Public domain |
| Reliability | T1 (data as reported by states) |
| Recommended use | National-coverage graduation rate; assessment backfill |
| Limitations | **Site returned 403 to our environment (2026-08-25) — re-verify from another network.** Proficiency NOT comparable across states; heavy suppression ranges (e.g. "80-84%") in school-level files |

### 1.6 Urban Institute Education Data Portal [U — blocked]
| | |
|---|---|
| Organization | Urban Institute (nonprofit) |
| URL | https://educationdata.urban.org/ — `api/v1/schools/ccd/directory/{year}/` |
| Data category | Harmonized API over CCD, CRDC, EDFacts, SAIPE, IPEDS |
| Format | REST JSON; R/Stata packages |
| Licensing | Open license with attribution (verify current terms for commercial use) |
| Reliability | T5 (faithful mirror of T1 data) |
| Recommended use | Convenience/backfill layer only; raw federal files remain system of record |
| Limitations | **Cloudflare blocked ALL access from our environment (curl + real browser, 2026-08-25)**; availability not guaranteed for production |

### 1.7 Education Data Center / Zelma (EDFacts archive) [V]
| | |
|---|---|
| Organization | Education Data Center (nonprofit) |
| URL | https://www.eddatacenter.org/edfacts (zelma.ai redirects here) |
| Data category | Archived school-level EDFacts math/RLA proficiency CSVs; harmonized state assessment results |
| Years | 2009-10 → 2021-22 (no 2019-20/COVID) |
| Format | CSV on Google Cloud Storage, free |
| Reliability | T5 mirror of T1 |
| Recommended use | Historical assessment backfill; hedge against ED Data Express access problems |

### 1.8 SEVP Certified School List (DHS) [V by agent]
| | |
|---|---|
| Organization | Student and Exchange Visitor Program, U.S. Immigration and Customs Enforcement |
| URL | https://studyinthestates.dhs.gov/ — dated files `certified-school-list-MM-DD-YY.pdf` (latest found: 2026-08-05) |
| Data category | Schools certified to enroll F-1/M-1 international students: school name, campus, certification type, city, state, campus ID |
| Update frequency | ~Weekly-monthly |
| Format | PDF (generated from spreadsheet) — parse required |
| Licensing | Public domain |
| Reliability | T1 |
| Recommended use | **`accepts_international` flag — core Globaly differentiator** |
| Limitations | PDF parsing; site 403s non-browser agents; no NCES ID — entity resolution by name+city+state |

### 1.9 Other federal
- **NCES ELSI** (https://nces.ed.gov/ccd/elsi/) — manual table extracts of CCD/PSS; QA use only. [U]
- **Census SAIPE** — district-level poverty estimates; context signal. [U]
- **College Board AP / CEEB codes** — CEEB school codes are licensed, not open; do not ingest without agreement. [U]

---

## 2. State sources (summary matrix)

Full per-state detail with every URL: `research/states_01_AL-GA.md` … `states_05_SD-WY_DC_territories.md`.

| State | Agency | School directory | Report card / data | Formats & API | Notes / risk |
|---|---|---|---|---|---|
| AL | ALSDE | LookUp tool [S] | reportcard.alsde.edu [S] | PDF-heavy; no API | **All hosts blocked bots; weakest verified state** |
| AK | DEED | eeddirectory lookup [V] | education.alaska.gov/reportcard | XLSX 1989-2025; no API | No bulk school CSV |
| AZ | ADE | not verified (403) | azreportcards.azed.gov [V] | XLSX; no API | azed.gov 403; some data behind login |
| AR | DESE | adedata.arkansas.gov [V] | myschoolinfo.arkansas.gov [V] | Web apps w/ exports | Fragmented across ~8 apps |
| CA | CDE | pubschls.asp TXT (daily) [S]; data.ca.gov CSV [V] | caschooldashboard + DataQuest | CSV/TXT; **CKAN API** | cde.ca.gov WAF; n<11 suppression |
| CO | CDE | cdereval mailing labels XLSX [S] | SchoolView; ed.cde.state.co.us CMAS XLSX [V] | XLSX; OData [S] | www host refuses bots; n<16 subgroups |
| CT | CSDE | data.ct.gov Education Directory (CSV/API) [V] | EdSight | **Socrata SODA API** | <6 suppression |
| DE | DDOE | data.delaware.gov Org Directory w/ lat-long (CSV/API) [V] | reportcard.doe.k12.de.us | **Socrata SODA API** | ~79% assessment rows redacted |
| FL | FDOE | eds.fldoe.org MSID (HTML, no export) [V] | edudata.fldoe.org [V] | XLS/PDF/HTML; no API | fldoe.org 403s bots |
| GA | GaDOE/GOSA | download.gosa.ga.gov CSV repo 2004-2025 [V] | goews.georgia.gov | Flat CSV, predictable URLs | Excellent for scripting |
| HI | HIDOE | List-of-Schools.xlsx [V] | Strive HI / ARCH | XLSX + JS dashboards | Single statewide district; JS apps |
| ID | SDE | via idahoreportcard.org datafiles | idahoreportcard.org | Downloads; no API | No standalone directory; no private registry |
| IL | ISBE | Directory of Educational Entities XLSX, **nightly, incl. non-public** [V] | illinoisreportcard.com; Report Card Public Data Set XLSX [V] | XLSX bulk | Best-in-class |
| IN | IDOE | 2025-26 School Directory XLSX [V] | indianagps.doe.in.gov (403) | Flat XLSX | Data Center comprehensive |
| IA | DoE | educate.iowa.gov directories XLSX (2026-27!) [V] | iaschoolperformance.gov | XLSX; **data.iowa.gov Socrata API** | Profiles site scraper-hostile |
| KS | KSDE | datacentral.ksde.gov — **unreachable (TLS)** | ksreportcard.ksde.gov — unreachable | Report generator | Nothing directly verifiable |
| KY | KDE | openhouse.education.ky.gov/directory | kyschoolreportcard.com; ~717 historical SRC files | XLSX/CSV | 403s bots; phased releases |
| LA | LDOE | SPS database [S] | louisianaschools.com (blocked); LEAP SY25-26 files posted | XLSX | Aggressive bot-blocking |
| ME | DOE | NEO reports (incl. private) [V] | ESSA dashboard; Data Warehouse | Queryable + XLSX/PDF | Formats inconsistent |
| MD | MSDE | no bulk file; NSAB nonpublic lists [V] | reportcard.msde.maryland.gov (blocked) | Angular downloads | Strong nonpublic directory |
| MA | DESE | profiles.doe.mass.edu (export, incl. private) [V] | Same; MCAS 2017-2025, grad 2006-2025 | Excel exports; E2C hub | **Best in nation contender** |
| MI | MDE/CEPI | cepi.state.mi.us/eem (Excel+XML) [S] | mischooldata.org data files | Excel/XML bulk | Both sites 403 bots |
| MN | MDE | MDE-ORG [S] | rc.education.mn.gov; MDEAnalytics Excel | Excel/tab | Student-level needs login |
| MS | MDE | **none verified (gap)** | msrc.mdek12.org | Excel/PDF | All hosts block bots; weakest posture |
| MO | DESE | school-directory data-downloads (weekly) [S] | MCDS report builder | CSV/Excel extracts | 403s bots |
| MT | OPI | Schools Directory (PDF+Excel) [S] | GEMS dashboards | Dashboard exports | GEMS blocks bots |
| NE | NDE | educdirsrc.education.ne.gov (incl. private) [S] | nep.education.ne.gov (JS app) | Data-file export | Directory refused bots |
| NV | NDE | **none verified (gap)** | nevadareportcard.nv.gov | Report-builder exports | Ratings lag (2023-24; next update Sept 2026) |
| NH | DOE | iPlatform lists (incl. nonpublic) [S] | my.doe.nh.gov/iPlatform | Dashboard exports | 403s bots; small-N suppression |
| NJ | NJDOE | homeroom5 directory [S] | SPR bulk Excel/Access 2015-16→2024-25 [V] | Excel + Access | 2024-25 released May 2026 |
| NM | PED | web.ped.nm.gov directory CSV [V] | nmvistas.org | CSV/XLSX | Assessment files masked; grad/enrollment bulk gaps |
| NY | NYSED | SEDREF + school directory, **nightly, incl. nonpublic** [V] | data.nysed.gov; 2024-25 full DBs | **MS Access zips** | Best directory; awkward format |
| NC | DPI | EDDIE [V] | ncreports.ondemand.sas.com | Excel (disrupted) | Site mid-reorg; "Coming Soon" |
| ND | NDDPI | falldir25-26.xlsx [V] | insights.nd.gov | Excel; dashboards | <10 masking; no bulk assessment |
| OH | DEW | OEDS | reportcard.education.ohio.gov/download (SPA) | Excel/CSV via SPA | WAF blocks bots |
| OK | OSDE | FY26 state directory XLSX [V] | oklaschools.com/archive.html **CSV 2018-2025** [V] | CSV | Excellent archive; OPSAC private list |
| OR | ODE | ode.state.or.us/instid (daily) [V] | oregon.gov/ode/transparency XLSX/CSV | XLSX/CSV | Fall membership 2009-2025 |
| PA | PDE | edna.pa.gov (incl. nonpublic) [V] | futurereadypa.org DataFiles 2016-17→2024-25 | Excel; **data.pa.gov Socrata** | Only real API path in its batch |
| RI | RIDE | datacenter.ride.ri.gov (search only) | reportcard.ride.ri.gov/DataFiles XLSX 2017-18→2024-25 [V] | XLSX | Clean hub; directory export needs login |
| SC | SCDE | ed.sc.gov (blocked) | screportcards.com data files (blocked) | Excel (historic) | **All SC sites refused connections** |
| SD | DOE | edudir.aspx Excel [V] | sdschools.sd.gov (SPA) | Excel/PDF | Report card hard to scrape |
| TN | TDOE | tnschooldirectory.tnedu.gov Excel [V] | data-downloads XLSX 2024-25 [V] | XLSX | Comprehensive flat files |
| TX | TEA | **AskTED daily delimited** [V] | TAPR campus CSV/XLSX 2024-25 [V]; TXschools.gov | CSV/XLSX + **ArcGIS open data** | Best-in-class breadth |
| UT | USBE | online directory (no bulk) | schools.utah.gov reports XLSX | XLSX | Data Gateway blocks bots; $60/hr requests |
| VT | AOE | fragmented | Vermont Education Dashboard datasets 2018-2025 | CSV/XLSX | Heavy suppression (small state) |
| VA | VDOE | via **data.virginia.gov CKAN (197 datasets)** [V] | schoolquality.virginia.gov (TLS error) | XLSX/CSV + CKAN API | Agency sites 403; open-data copies lag |
| WA | OSPI | eds.ospi + **data.wa.gov dataset** [V] | reportcard.ospi.k12.wa.us; data.wa.gov Report Card CSVs | **Socrata SODA API** | Best API access |
| WV | WVDE | not verifiable (403) | ZoomWV (refused) | Dashboard-only | **Poorest availability**; request form for extracts |
| WI | DPI | schooldirectory portal | WISEdash download-files **CSV ZIPs incl. private, 2025-26 posted** [V] | CSV ZIPs | Excellent |
| WY | WDE | directory PDF only | wyoadvances.com (SPA) | Mostly PDF | Weak |
| DC | OSSE | no single file; report card + enrollment audit XLSX 2018-2026 [V] | schoolreportcard.dc.gov | XLSX | Fragmented across per-year pages |

**Territories**: PR — datos.estadisticas.pr has machine-readable directories (2020-21 vintage, stale); GU/CNMI PDF-only; USVI HTML list; AS essentially nothing. **Use CCD as the source for all five** (CCD covers them).

---

## 3. Private-school / association sources

Full detail: `research/private_school_sources.md`.

| Source | Org | Category | Format | Access | Tier | Use |
|---|---|---|---|---|---|---|
| PSS (§1.3) | NCES | Universe | CSV | Free | T1 | Spine |
| SEVP list (§1.8) | DHS | International certification | PDF | Free | T1 | F-1 flag |
| NAIS DASL | Nat'l Assoc. of Independent Schools | Benchmarks incl. tuition | Web | **Member-only** | T4 | QA only; do not scrape |
| TABS / boardingschools.com | The Association of Boarding Schools | Boarding profiles | Web profiles | Public pages (ranges only; no exact tuition/international %) | T4 | Boarding flag corroboration |
| NCEA directory | Nat'l Catholic Educational Assoc. | Catholic school directory | Web | Public lookup | T4 | Affiliation corroboration |
| Cognia / ICAISA / NIPSA / state assoc. | Accreditors | Accreditation status | Web lists | Public lookup, no bulk | T4 | `accreditation` field, manual/slow |
| State nonpublic registries | SEAs | State-registered private schools | Varies (IL, WI, NY, NE, MD, ME verified to include private) | Free | T2 | Coverage cross-check vs PSS |
| School websites | Schools | **Tuition, admissions, programs** | HTML | Crawl (respect robots/ToS) | T3 | The only viable current-tuition source |
| Private School Review, Niche, GreatSchools | Commercial | Aggregated profiles | Web | **ToS-restricted; do NOT scrape** | T5 | Product reference only |

---

## 4. Source priority (conflict resolution)

When sources conflict for the same field and year:

1. **Federal (NCES CCD/PSS/EDGE, CRDC, ED Data Express, SEVP)** — wins for identity, enrollment, staff, geography, program counts, F-1 certification.
2. **State education agency** — wins for performance metrics (their own tests/ratings), operational status changes mid-year (fresher than CCD), state IDs.
3. **District official** — wins for attendance zones, calendars, contact info.
4. **School official (website)** — wins for tuition, admissions requirements, programs offered *now*, facilities.
5. **Association/accreditor** — wins for accreditation and membership facts.
6. **Reputable third party** — backfill only, flagged LOW confidence.
7. **User-generated (Globaly reviews)** — never overrides facts; separate subsystem.

Exception rule: a *fresher* lower-tier source beats a *staler* higher-tier source only for volatile operational fields (status, website, phone, tuition) — and the row keeps both `source_id` and `collected_at` so the decision is auditable.
