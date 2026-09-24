# US K-12 School Data Research

Deep research project for **Globaly/Wonjala**: what data is needed to build a comprehensive U.S. K-12 school database powering school search, comparison, recommendations, eligibility matching, and AI counselling — with Niche.com used as the product-breadth reference (never as a data source).

**Research date:** 2026-08-25. All record counts below come from files actually downloaded and inspected on that date — nothing is estimated.

## Deliverables

| File | Contents |
|---|---|
| [US_K12_SCHOOL_DATA_RESEARCH.md](US_K12_SCHOOL_DATA_RESEARCH.md) | Main research report: landscape, Niche analysis, all source layers, data models, quality/legal frameworks, architecture, MVP→Phase 3 plan, final Q&A |
| [US_K12_SCHOOL_DATA_DICTIONARY.md](US_K12_SCHOOL_DATA_DICTIONARY.md) | ~140-field data dictionary (type, level, source, frequency, AI-use, confidence per field) |
| [US_K12_DATA_SOURCE_REGISTRY.md](US_K12_DATA_SOURCE_REGISTRY.md) | Every source: federal (9), all 50 states + DC + territories matrix, private/association sources, conflict-resolution hierarchy |
| [US_K12_DATA_EXTRACTION_ROADMAP.md](US_K12_DATA_EXTRACTION_ROADMAP.md) | 7-phase extraction plan with volumes, methods, refresh calendar, build order |
| [schemas/globaly_k12_schema.sql](schemas/globaly_k12_schema.sql) | Recommended PostgreSQL schema (append-only history, metric store, provenance on every row) |
| `research/` | Raw research: verified federal sources, 5 state-batch files (all 50 states + DC + territories, per-state URLs with [V]erified/[S]earch flags), Niche data-model inventory (92 fields + methodology), private-school sources, CRDC + legal risk register |
| `data/` | Downloaded datasets, extraction script, and sample extracts |

## What was actually extracted (verified 2026-08-25)

| Dataset | File | Records |
|---|---|---|
| NCES CCD school directory SY 2024-25 | `data/ccd_2425_directory/` | **102,178 public schools** (NCESSCH 100% unique) |
| NCES CCD LEA directory SY 2024-25 | `data/ccd_2425_lea/` | **19,629 districts** |
| NCES CCD school staff SY 2024-25 | `data/ccd_2425_staff/` | 100,237 schools (98.1% join vs directory) |
| NCES CCD school characteristics SY 2024-25 | `data/ccd_2425_characteristics/` | NSLP/virtual/shared-time flags (magnet confirmed absent) |
| NCES CCD lunch/FRL SY 2024-25 | `data/ccd_2425_lunch/` | school-level FRL + direct certification (long format) |
| NCES CCD membership (enrollment) SY 2024-25 | `data/raw/ccd_sch_052_2425_l_1a_073025.zip` | grade × race × sex enrollment, long format (192 MB zip) |
| NCES EDGE geocodes SY 2024-25 | `data/edge_geocode_2425/` | lat/long + county + locale + CBSA + CD — **100% join with CCD on NCESSCH** |
| NCES PSS private schools 2021-22 | `data/pss_2122/` | **22,344 private schools**, 459 columns |
| Samples | `data/sample_*.csv` | 500-row CCD sample; 2,575-school joined NJ extract (directory+geo); 300-row PSS sample |

## Reproducing the extraction

```bash
powershell -ExecutionPolicy Bypass -File data/download_and_extract.ps1
```

The script downloads all federal files from their verified NCES URLs and extracts them. For a new school year, bump the year token (`2425` → `2526`) and release-date suffix — current filenames are always discoverable at https://nces.ed.gov/ccd/files.asp.

## Strongest authoritative sources (build on these)

1. **NCES CCD** — public-school universe; the spine; annual; public domain.
2. **NCES EDGE** — geography; joins CCD perfectly.
3. **NCES PSS** — private-school universe; biennial.
4. **CRDC** — AP/IB/gifted/counselors/magnet; biennial.
5. **DHS SEVP certified-school list** — the "accepts international F-1 students" flag; Globaly's differentiator; ~weekly.
6. **State DOE files** — assessments/ratings/graduation; 51 adapters; best-in-class: TX, IL, WI, GA, OK, MA, WA (API), CT/DE/IA/PA/VA (API).

## What remains unavailable

- **Tuition & admissions details** — no public dataset anywhere; must crawl official school websites (Phase 5).
- **Attendance boundaries** — national SABS survey discontinued after 2015-16.
- **Comparable cross-state test performance** — structurally impossible; store per-state.
- **PSS 2023-24 and CRDC 2023-24** — not yet released as of 2026-08-25; refresh when they land.
- **Blocked-from-automation sources** — ED Data Express (403), Urban Institute API (Cloudflare), ~15 state DOE portals: need manual runbooks or alternate networks.
- **College destinations, per-school SAT/ACT nationally** — licensed (NSC/College Board) or state-partial.

## Recommended next steps

1. Load Phase 1 (already-downloaded federal files) into the provided schema → nationwide school search MVP.
2. Parse the SEVP list + match to PSS/CCD → international-ready filter.
3. Build the first 5 state adapters (CA, TX, NY, MA, WA) for performance data.
4. Stand up the school-website tuition/admissions crawler for the SEVP∩PSS private-school set.
5. Re-check PSS 2023-24 and CRDC 2023-24 releases quarterly.
