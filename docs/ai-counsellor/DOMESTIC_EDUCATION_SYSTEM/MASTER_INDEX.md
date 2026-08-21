# Domestic Education Systems — Master Index

**Research project:** GlobalyApp AI Counselling — domestic education system knowledge base
**Research date:** 2026-08-21 (two passes — see below)
**Countries:** 8 (United States, Australia, Canada, United Kingdom, India, Nepal, China, Bangladesh)
**Status:** Research documentation only. **No code, schema, API, prompt, UI, RAG, embedding or vector-database work was performed or is implied by this repository.**

> ## ✅ SECOND PASS COMPLETE — 2026-08-21
>
> A second research pass retried the failed retrievals and worked the priority gaps.
>
> **Retrievals:** the **AQF Second Edition PDF** was obtained via the Internet Archive ✅ · the **BNQF** government copy remains TLS-blocked but was already available via the ILO mirror ⚠ · **chsi.com.cn is permanently blocked to automated access** (HTTP 412 domain-wide across four attempts) and requires manual browser retrieval ❌
>
> **Gaps: 8 of 10 Tier-1 blockers resolved or downgraded, plus 6 Tier-2 items.** Full detail and the list of **corrections to first-pass claims** is in [RESEARCH_GAPS.md](RESEARCH_GAPS.md); the structured record is in `artifacts/country_profiles.json` under `research_updates_2026_08_21b`.
>
> **Seven first-pass claims were found to be wrong or too strong and have been corrected in place** — most consequentially the CBSE grading model (positional for *both* Class 10 and Class 12, not just Class 12), Bangladesh's higher-education grading (a national UGC scheme *does* exist), and Canada's sub-degree frameworks (Ontario *has* a 13-level framework).

---

## What this repository answers

> **What exactly does a student's education mean within their own domestic education system — what qualification, grade, level and institution type does it represent, how is it structured, what terminology is used, what examinations and grading systems apply, and what authoritative sources support each piece of knowledge?**

Each country is treated as **its own education system**. No assumption is made that "Grade 10", "Grade 12", "High School", "Diploma", "Bachelor's", "Master's", "College", "University" or "Certificate" means the same thing across countries — and §"Complexity Summary" in each document documents where they demonstrably do not.

**Cross-country equivalency is deliberately out of scope.** This repository describes each system on its own terms so that comparison work can later be done on a sound basis.

---

## Country documents

| Country | Document | Size | Sections | Distinct source URLs | Research gaps logged |
|---------|----------|-----:|---------:|---------------------:|---------------------:|
| 🇳🇵 Nepal | [NEPAL.md](NEPAL.md) | 109 KB | 31 | 21 | 17 |
| 🇮🇳 India | [INDIA.md](INDIA.md) | 122 KB | 31 | 31 | 17 |
| 🇧🇩 Bangladesh | [BANGLADESH.md](BANGLADESH.md) | 104 KB | 31 | 12 | 20 |
| 🇨🇳 China (mainland) | [CHINA.md](CHINA.md) | 99 KB | 29 | 37 | 22 |
| 🇦🇺 Australia | [AUSTRALIA.md](AUSTRALIA.md) | 96 KB | 31 | 41 | 20 |
| 🇨🇦 Canada | [CANADA.md](CANADA.md) | 87 KB | 27 | 32 | 23 |
| 🇬🇧 United Kingdom | [UNITED_KINGDOM.md](UNITED_KINGDOM.md) | 82 KB | 34 | 38 | 21 |
| 🇺🇸 United States | [UNITED_STATES.md](UNITED_STATES.md) | 85 KB | 26 | 33 | 21 |
| **Total** | | **787 KB** | | **245** \* | **161** |

\* Sum of the per-country distinct counts. **Globally distinct URLs across all eight documents: 243** (two are cited in more than one country document).

## Consolidated documents

| Document | Contents |
|----------|----------|
| [SOURCE_DIRECTORY.md](SOURCE_DIRECTORY.md) | Every official source identified, by country and authority tier |
| [RESEARCH_PAPERS.md](RESEARCH_PAPERS.md) | Academic literature and grey-literature framework documents, with an honest assessment of coverage |
| [RESEARCH_GAPS.md](RESEARCH_GAPS.md) | All 161 logged gaps, ranked into a single cross-country priority list |

## Structured artifacts

| File | Format | Rows | Purpose |
|------|--------|-----:|---------|
| [artifacts/qualifications.csv](artifacts/qualifications.csv) | CSV, 21 columns | **150** | Every qualification identified: level, grade/year, age range, duration, framework level, institution type, examination, admission requirement, progression, official and common terms, credit requirement, verification status, source |
| [artifacts/grading_systems.csv](artifacts/grading_systems.csv) | CSV, 17 columns | **138** | Grade-by-grade detail: label, grade point, marks range, interpretation, pass threshold, who sets it, verification status |
| [artifacts/credit_systems.csv](artifacts/credit_systems.csv) | CSV, 12 columns | 33 | Every credit unit found, with notional hours per unit and units per year — including the cross-country comparison warning |
| [artifacts/terminology.csv](artifacts/terminology.csv) | CSV, 11 columns | 76 | Terminology dictionary with **ambiguity risk rating** and a **disambiguating question** per term |
| [artifacts/country_profiles.json](artifacts/country_profiles.json) | JSON (validated) | 8 country objects + 15 gap-resolution records | Nested profiles: governance model, frameworks with level maps, authorities, recognition tests, statistics, AI rules, top gaps — plus `cross_country_rules` (anti-fabrication rules) and `research_updates_2026_08_21b` (second-pass resolutions and supersessions) |

All four CSVs parse cleanly with consistent column counts; the JSON validates. **Second-pass additions:** 15 qualification rows (all 9 remaining Canadian jurisdictions, the four Ontario college credentials, Australia's Higher Doctorate and SSCE volume) and 54 grading rows (CBSE's official positional grades, five Indian state boards, Bangladesh's school bands and UGC higher-education scheme, Ofqual's GCSE anchors, the A level scale, UK degree classifications). Rows that the second pass proved wrong are **marked `SUPERSEDED ROW - CORRECTED`** in place rather than deleted, so the correction is auditable.

---

## Coverage matrix

Legend: **●** covered in depth · **◐** covered with flagged gaps · **○** identified but largely unresearched

| Topic | NP | IN | BD | CN | AU | CA | UK | US |
|-------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Complete education hierarchy | ● | ● | ● | ● | ● | ● | ● | ● |
| Governance (national vs sub-national) | ● | ● | ● | ● | ● | ● | ● | ● |
| Early childhood education | ● | ◐ | ◐ | ○ | ◐ | ○ | ◐ | ○ |
| Primary education | ● | ◐ | ◐ | ◐ | ◐ | ◐ | ● | ◐ |
| Lower secondary education | ● | ● | ● | ● | ◐ | ◐ | ● | ◐ |
| **Upper secondary education** | ● | ● | ● | ● | ● | ● | ● | ● |
| National / regional examinations | ● | ● | ● | ● | ◐ | ◐ | ● | ◐ |
| Education / examination boards | ● | ● | ● | n/a | ● | ◐ | ● | ○ |
| Vocational & technical education | ● | ● | ● | ● | ● | ○ | ◐ | ○ |
| **Qualification framework** | ● | ● | ● | ◐* | ● | ◐* | ● | ◐* |
| Post-secondary / higher education | ● | ● | ● | ● | ● | ● | ● | ● |
| **Grading systems** | ● | ● | ◐ | ● | ● | ◐ | ● | ● |
| GPA / CGPA systems | ● | ● | ● | ● | ● | ◐ | ● | ● |
| Academic transcripts | ◐ | ● | ◐ | ● | ◐ | ◐ | ◐ | ◐ |
| **Credit systems** | ● | ● | ● | ○ | ● | ● | ● | ● |
| Institution types | ● | ● | ● | ● | ● | ◐ | ● | ● |
| Public vs private education | ● | ● | ◐ | ○ | ◐ | ◐ | ◐ | ○ |
| Accreditation & quality assurance | ● | ● | ◐ | ◐ | ● | ● | ● | ● |
| University admission (domestic) | ◐ | ● | ● | ◐ | ● | ◐ | ◐ | ◐ |
| Entrance examinations | ○ | ◐ | ◐ | ● | ◐ | ○ | ◐ | ○ |
| Academic pathways | ● | ● | ● | ● | ● | ● | ● | ● |
| Vocational → university pathways | ● | ◐ | ● | ● | ● | ○ | ◐ | ○ |
| International recognition context | ● | ● | ● | ● | ● | ● | ● | ● |
| **Terminology dictionary** | ● | ● | ● | ● | ● | ● | ● | ● |
| **Common student descriptions** | ● | ● | ● | ● | ● | ● | ● | ● |
| Regional / state variations | ● | ● | ● | ● | ● | ◐ | ● | ◐ |
| Official source directory | ● | ● | ● | ● | ● | ● | ● | ● |
| Research papers | ◐ | ● | ○ | ◐ | ◐ | ◐ | ● | ◐ |
| Data freshness classification | ● | ● | ● | ● | ● | ● | ● | ● |
| AI knowledge extraction | ● | ● | ● | ● | ● | ● | ● | ● |

**\* Framework caveats:**
- **China** — no numbered national qualifications framework was found; qualifications are defined by law (Degrees Law 2024, Vocational Education Law 2022), the zhuanke/benke distinction, the discipline catalogue and the dual-credential system. **The absence was not positively confirmed.**
- **Canada** — the CDQF covers **degrees only**. Nothing pan-Canadian places college diplomas, CEGEP DECs or trade credentials relative to degrees.
- **United States** — no national qualifications framework; the federally defined **credit hour** (34 CFR § 600.2) is the one precise national academic unit. **The absence was not positively confirmed.**

---

## Qualification frameworks at a glance

| Country | Framework(s) | Levels | Covers school? | Covers VET? | Credit defined in hours? | Verification |
|---------|--------------|-------:|:--------------:|:-----------:|:------------------------:|--------------|
| **Nepal** | NQF (dual NQ + NVQ columns) | 8 | yes | yes | no | ✅ read directly |
| **India** | NHEQF (higher ed) + NCrF (all) + NSQF (VET) + NCF (school) | NHEQF 4.5–8; NCrF 1–8 | yes | yes | **yes — 30 hrs/credit, 40 credits/year** | ✅ read directly |
| **Bangladesh** | BNQF | 10 | yes | yes | **yes — 40/60/80 hrs by activity type** | ✅ read directly |
| **China (mainland)** | none identified | — | — | — | no | ⚠ absence unconfirmed |
| **Australia** | AQF | 10 + SSCE entry | yes | yes | no (uses **volume of learning** / EFTSL) | ✅ level map read; volumes unverified |
| **Canada** | CDQF (degrees only) | 3 degree categories | **no** | **no** | no (uses **semesters**) | ✅ read directly |
| **United Kingdom** | RQF (Eng/NI) · FHEQ (Eng/NI/Wales) · SCQF (Scotland) · CQFW (Wales) · FQHEIS | RQF 8+3 · FHEQ 4–8 · SCQF 12 | yes | yes | **yes — 10 hrs/credit (CATS and SCQF)** | ✅ read directly |
| **United States** | none | — | — | — | **yes — federal credit hour, ~45 hrs/semester credit** | ✅ regulation read; framework absence unconfirmed |

**Best framework sources actually read in this research:** UK ENIC's *Guide to the Education Systems of the UK* (2023), Bangladesh's **BNQF** (2021), India's **NHEQF** and **NCrF**, Nepal's **NQF Short Explanation** (CTEVT/NSTB 2019), Canada's **CDQF** (CMEC 2007), and **34 CFR § 600.2** (US federal credit hour).

---

## The cross-country credit-unit table

**This is the single most important anti-fabrication artefact in the repository.**

| System | Notional hours per credit | Credits per year | Verification |
|--------|--------------------------:|-----------------:|--------------|
| **UK — CATS / SCQF** | **10** | 120 (360-credit 3-yr degree) | ✅ |
| **ECTS** (referenced by UK institutions) | **25–30** | 60 | ✅ |
| **India — NCrF** | **30** | **40** | ✅ |
| **Bangladesh — BNQF** | **40** lecture / 60 lab / 80 workplace | not fixed | ✅ |
| **United States — federal credit hour** | **~45** (1 hr instruction + 2 hrs out-of-class × ~15 weeks) | ~30 | ✅ |
| **Australia** | uses **EFTSL** (1.0 = one full-time year); credit points institution-set | — | ⚠ |
| **Canada** | **not defined in notional hours**; CDQF reasons in **semesters** | 90–120 credits for a degree | ✅ (absence confirmed) |
| **Nepal** | not defined nationally | ~27 reported for Grade 11 | ⚠ |
| **China (mainland)** | **not established** | — | ❌ |

> **A US 120-credit bachelor's degree, a UK 360-credit bachelor's honours degree and an Indian 120-credit bachelor's degree are all legitimate first degrees whose credit numbers are not comparable.** The US and Indian figures are *identical numbers representing different volumes*; the US and UK figures are *different numbers representing broadly comparable study*.
>
> **Never compare raw credit counts across countries.** Reason in years of full-time study or notional hours, state the assumption, and defer the formal judgement to the destination institution or a recognised evaluator.

---

## The highest-risk facts across all eight countries

| # | Country | Fact | Verification |
|--:|---------|------|--------------|
| 1 | 🇬🇧 UK | An **"MA (Hons)" from Aberdeen, Edinburgh, Glasgow or St Andrews is an UNDERGRADUATE degree** (SCQF 10 / FHEQ 6) | ✅ |
| 2 | 🇨🇳 China | China issues **two separate documents** for higher education — a **graduation certificate (毕业证书)** and a **degree certificate (学位证书)** — and *"it is possible to hold a graduation certificate without a degree certificate, and vice versa"* | ✅ |
| 3 | 🇨🇳 China | **Zhuanke (专科) is a 2–3 year programme yielding a graduation certificate but NO bachelor's degree** — yet students may call it "university" or "college diploma" | ✅ |
| 4 | 🇧🇩 Bangladesh | **School GPA is on a 5.00 scale; university CGPA is typically 4.00.** The same student holds both | ⚠ |
| 5 | 🇧🇩 Bangladesh | The **"4th subject" rule** means an SSC/HSC GPA is *not* a plain average of subject grade points | ⚠ |
| 6 | 🇨🇦 Canada | **Québec: 11 years of school (DES) + CEGEP (DEC) + a 3-year bachelor's degree, which is complete** | ✅ |
| 7 | 🇨🇦 Canada | **MD, DDS, LLB and JD are *"considered to be bachelor's programs in academic standing"*** in Canada's own framework | ✅ |
| 8 | 🇬🇧 UK | **UK medicine/dentistry/veterinary first degrees (MB BS, BDS, BVSc) are FHEQ 7 / SCQF 11 — master's level.** The exact opposite placement to Canada's | ✅ |
| 9 | 🇦🇺 Australia | The **ATAR is a RANK (0.00–99.95), not a mark.** ATAR 70 = top 30% of the cohort | ✅ |
| 10 | 🇦🇺 Australia | A **Bachelor Honours Degree is AQF Level 8 — a level ABOVE Bachelor Degree (AQF 7)** | ✅ |
| 11 | 🇮🇳 India | **Both 3-year (120-credit, NHEQF 5.5) and 4-year Honours (160-credit, NHEQF 6) bachelor's degrees are currently awarded**, and "(Hons)" is ambiguous between them | ✅ |
| 12 | 🇮🇳 India | **CISCE grades run 1 (best) to 9 (worst)** — the opposite direction to almost everything else | ⚠ |
| 13 | 🇬🇧 UK | **Northern Ireland's year numbering is offset by one** from England's — NI Year 12 is the GCSE year | ✅ |
| 14 | 🇬🇧 UK | **GCSE grading differs by nation:** 9–1 (England), A*–G (Wales/NI), plus **NI's C\* grade from 2019** sitting between C and B | ✅ |
| 15 | 🇺🇸 US | **A high school GPA above 4.0 is a weighted GPA.** College transcripts report the unweighted figure | ⚠ |
| 16 | 🇳🇵 Nepal | **"SLC" means the Grade 10 exam pre-2016 and the Grade 12 exam in NQF policy language** | ✅ |
| 17 | 🇳🇵 Nepal | **Two structurally different 4.0 GPA scales:** NEB school (0.4 steps) vs universities (US-style steps) | ⚠ |
| 18 | 🇧🇩 Bangladesh | The **BTEB Diploma is 4 years at BNQF Level 6 — a level ABOVE the HSC** | ✅ |
| 19 | 🇮🇳 India | **CBSE grades are POSITIONAL for both Class 10 and Class 12** — "A-1" means *top eighth of the passed candidates nationally in that subject*, **not 91%+**. Never convert a CBSE letter grade to a percentage; use the marks | ✅ |
| 20 | 🇮🇳 India | **"A1" means completely different things at different Indian boards** — top-eighth-of-passers at CBSE, but **91–100 marks** at Tamil Nadu. And pass marks range from **30% to 35%** across boards | ⚠ |
| 21 | 🇦🇺 Australia | An Australian **Juris Doctor is an AQF level 9 Masters Degree (Extended)**, and **"Doctor of…" at level 9 is permitted for exactly five professions** (medical practice, physiotherapy, dentistry, optometry, veterinary practice) — **none of these are AQF 10 doctorates** | ✅ |
| 22 | 🇬🇧 UK | **GCSE grade 9 has NO equivalent on the old A\*–G scale.** Ofqual's only anchors are 7↔A, 4↔C, 1↔G | ✅ |
| 23 | 🇧🇩 Bangladesh | The **4th-subject bonus is added to the numerator but the subject is excluded from the denominator** — so with five compulsory subjects an A+ in the 4th subject adds **+0.60** to the GPA. A **GPA of 5.00 does not necessarily mean A+ in every subject** | ⚠ |
| 24 | 🇨🇦 Canada | **Ontario Qualifications Framework levels are NOT comparable with other frameworks.** An "OQF level 8 Advanced Diploma" is **not** an "AQF level 8 Bachelor Honours Degree". Always name the framework with the level | ✅ |
| 25 | 🇨🇳 China | **The study mode is stated on the certificate itself** — regular, adult, or self-taught (自考) higher education. The AI does not have to infer the route; it should ask the student to read the wording | ⚠ |

### The word "college" means five different things

| Country | "College" means |
|---------|-----------------|
| 🇳🇵 Nepal | Usually a **Grades 11–12** institution ("+2 college") |
| 🇧🇩 Bangladesh | Either **Grades 11–12** or a National University-affiliated **degree college** |
| 🇮🇳 India | "Junior college"/"PU college" = **Classes 11–12**; otherwise a degree-awarding **affiliated college** |
| 🇬🇧 UK | Usually a **further education or sixth-form college** (post-16, not HE); in Scotland an FE/HE college; at Oxford/Cambridge/Durham/London a constituent college |
| 🇨🇦 Canada | A **career-focused post-secondary institution**, distinct from a university |
| 🇺🇸 US | **Higher education generally** — often interchangeable with "university" |

### The word "diploma" means five different things

| Country | "Diploma" means |
|---------|-----------------|
| 🇮🇳 India | Four possibilities: polytechnic (post-Class-10), NEP UG Diploma, PG Diploma, or PGDM |
| 🇳🇵 Nepal | Usually a **CTEVT 3-year diploma taken instead of Grades 11–12** |
| 🇧🇩 Bangladesh | A **4-year BTEB diploma at BNQF Level 6** — above the HSC |
| 🇦🇺 Australia | An **AQF Level 5** qualification (VET or higher education sector) |
| 🇬🇧 UK | DipHE (FHEQ 5), HND (FHEQ 5), Graduate Diploma (FHEQ 6) or PGDip (FHEQ 7) — all defined levels |
| 🇨🇳 China | A translated Chinese credential rendered "Diploma" may be the **graduation certificate of a 4–5 year benke programme** |
| 🇺🇸 US | **The certificate document itself** — not a qualification level at all |

---

## Recognition tests by country

The operative "is this qualification real / recognised?" check, per country:

| Country | Test | Public? |
|---------|------|:-------:|
| 🇳🇵 Nepal | Is the awarding **university** on UGC Nepal's recognised list? For technical awards, is the institution **CTEVT-affiliated**? | yes |
| 🇮🇳 India | Is the awarding **university UGC-recognised**? For technical programmes, **AICTE-approved**? (NAAC/NBA is a quality signal, not the recognition test) | yes |
| 🇧🇩 Bangladesh | School: one of the **11 boards**? Higher ed: **UGC Bangladesh-approved**? Technical: **BTEB-affiliated**? | partly |
| 🇨🇳 China | Is the credential **CHSI/CSSD-verifiable**? (Since Aug 2022, CHSI is the sole official portal for **both** graduation and degree certificates) | **yes — single portal** |
| 🇦🇺 Australia | Three public registers: **TEQSA** (higher ed), **training.gov.au** (VET scope of registration), **CRICOS** (international students) | **yes — three registers** |
| 🇨🇦 Canada | In **CICIC's Directory of Educational Institutions**? Provincial degree-granting authority? For international students, a **DLI**? (No national institutional accreditor) | yes |
| 🇬🇧 UK | Was the degree awarded by a **Recognised Body**? (A Listed Body delivers another body's degrees) | yes |
| 🇺🇸 US | Is the institution accredited by an accreditor **recognised by the U.S. Secretary of Education and/or CHEA**? (CHEA directories; ED's DAPIP) | **yes — and it can fail** |

---

## Data freshness summary

Every country document carries a **Data Freshness** section classifying each knowledge item. The cross-country picture:

### Stable (rarely changes)
Education structures and grade numbering · historical qualification definitions (SLC/HSEB, AQF 2007 Edition, QCF/NQF/NICATS, pre-2016 Nepali grading, pre-2025 Chinese degree regulations) · framework architectures once approved · the CDQF's degree categories · the UK's four-nation split · Canada's provincial jurisdiction · the US 10th-Amendment basis.

### Moderately changing (re-verify quarterly / per intake cycle)
Curriculum revisions · exact grade boundaries and pass criteria · qualification-framework implementation depth · institution-level pass marks and classification thresholds · per-university degree lengths and grading scales · national statistics (annual) · vocational programme durations and entry minima · accreditor recognition status.

### Frequently changing (re-verify monthly / per cycle)
Admission rules and cut-offs · entrance-examination eligibility, attempts and participating institutions · **Bangladesh's GST cluster thresholds and recency windows** · **China's provincial gaokao subject models** · **Welsh GCSE and Baccalaureate reform (2023–2027)** · **Ontario's OSSD compulsory-credit split (changed 2024-25)** · **India's state adoption of the 4-year UG programme** · **US test-optional policies** · **CRICOS course registrations (monthly)** · **Nepal's ministry structure and URLs (restructured May 2026)** · the SQA→Qualifications Scotland transition · the US regional/national accreditor distinction.

---

## Verification discipline used throughout

| Mark | Meaning | Total occurrences |
|------|---------|------------------:|
| ✅ | Confirmed against a Tier 1/Tier 2 source read during this research, named inline | ~2,011 |
| ⚠ | Well-attested but secondary-sourced, or the official source exists and was not read in full — **must be confirmed before the AI states it as a hard number** | ~2,240 |
| ❌ | `Information not found — requires further research.` | ~336 |

**Where sources disagreed, both are documented and the discrepancy explained rather than silently resolved.** Documented conflicts include: CBSE Class 12 positional vs absolute grading; Nepali SEE/Grade 12 pass criteria (three variants); ICSE pass marks; Nepal's recognised-university count (12 vs 24); Bangladesh's university counts (116 vs 105 private); AQF volumes of learning for Diploma and Advanced Diploma; the Zhongkao's administrative level; and Alberta's diploma subject requirements (internally inconsistent as reported).

**No qualification, grade conversion, equivalency, admission requirement, statistic, examination rule, government policy, URL or research paper in this repository is invented.** Where a bibliographic field could not be established it is marked `[to confirm]` rather than guessed.

---

## Major gaps (the honest summary)

Full detail in [RESEARCH_GAPS.md](RESEARCH_GAPS.md). The largest holes:

**Status shown after the second pass.**

| Rank | Gap | Country | Status |
|-----:|-----|---------|--------|
| 1 | A board-by-board grading matrix for ~30+ Indian state boards | 🇮🇳 | ⚠ **Downgraded** — five largest boards now documented (Maharashtra, UP, West Bengal, Tamil Nadu, Karnataka), and the *variation* is now proven with evidence |
| 2 | CBSE grading — positional vs absolute | 🇮🇳 | ✅ **RESOLVED** from CBSE's own documents. Positional for **both** Class 10 and Class 12 |
| 3 | Secondary diplomas of 9 of Canada's 13 jurisdictions | 🇨🇦 | ✅ **RESOLVED** — all 13 now have a credit total (range: **18 to 100**) |
| 4 | **Exact NEB grade boundaries and pass criteria** | 🇳🇵 | ❌ **STILL THE #1 BLOCKER — and the conflict widened.** A fourth pass-criteria variant emerged |
| 5 | Bangladesh SSC/HSC mark bands and the 4th-subject rule | 🇧🇩 | ✅ **RESOLVED** — bands documented and the formula established |
| 6 | China's credit system | 🇨🇳 | ⚠ **Partially resolved** — MOE's 2018 standards specify credit-hours across 587 disciplines; no single national hours-per-credit formula |
| 7 | US community college → university transfer | 🇺🇸 | ✅ **RESOLVED at policy level** — at least 31 states guarantee statewide transfer |
| 8 | Canadian college credential taxonomy | 🇨🇦 | ⚠ **Resolved for Ontario** (the largest sector); other 12 jurisdictions open |
| 9 | The AQF Second Edition PDF | 🇦🇺 | ✅ **OBTAINED** via the Internet Archive — all volumes of learning now official |
| 10 | The official 9–1 to A\*–G GCSE comparison | 🇬🇧 | ✅ **RESOLVED** — Ofqual's three anchors; **grade 9 has no old-scale equivalent** |
| 11 | Whether the US and China have national qualifications frameworks | 🇺🇸 🇨🇳 | ❌ **Still open** — absence still asserted by inference, not on authority |
| 12 | Confirmation that a CTEVT Diploma is Grade 12-equivalent | 🇳🇵 | ❌ **Still open** |
| 13 | Québec's R-score (cote R) | 🇨🇦 | ❌ **Still open** |
| 14 | BNQF placement of Fazil and Kamil; Qawmi recognition | 🇧🇩 | ❌ **Still open** |
| 15 | China's adult / self-study (自考) / online routes | 🇨🇳 | ✅ **RESOLVED** — three HEQC categories, and **the study mode is stated on the certificate** |

### The five highest-priority gaps remaining

| # | Gap | Country | Why |
|--:|-----|---------|-----|
| 1 | **NEB grade boundaries and pass criteria** (Letter Grading Directive 2078) — now with **four** conflicting pass-criteria variants | 🇳🇵 | Every Nepali GPA interpretation depends on them, and Nepal is a core GlobalyApp market |
| 2 | **Whether NEB grade sheets show marks at all** — a new second-pass finding suggests they show only letter grades | 🇳🇵 | Determines whether the AI can ever ask a Nepali student for a percentage |
| 3 | **The remaining ~25 Indian state boards** | 🇮🇳 | Coverage, not comprehension — the model of variation is now understood |
| 4 | **Québec's R-score**, and the other 12 Canadian jurisdictions' college taxonomies and grading | 🇨🇦 | Canada remains the most jurisdictionally incomplete country |
| 5 | **Positive confirmation that the US and China have no national qualifications framework** | 🇺🇸 🇨🇳 | "There is no framework" is a load-bearing fact and should be stated on authority |

**Structural gap across all eight countries:** peer-reviewed academic literature is thin. The searches consistently surfaced **official framework documents, regulator pages and credential-evaluation references** — which are more authoritative for this use case — rather than journal articles. Bangladesh in particular has **no** academic literature listed. See [RESEARCH_PAPERS.md](RESEARCH_PAPERS.md).

---

## How the AI knowledge team should use this

1. **Start with `artifacts/terminology.csv`.** It maps natural-language student input to structured concepts, and carries an **ambiguity risk rating** and a **disambiguating question** for each term. The high-risk rows are where an AI counsellor will actually go wrong.
2. **Use `artifacts/country_profiles.json` `cross_country_rules`** as the anti-fabrication ruleset: never compare raw credits, never convert GPAs between scales, never convert a rank or examination score, and never assert a framework level for a country that has none.
3. **Treat every ⚠ as a blocker on stating a number.** The documents are deliberately explicit about which figures are secondary-sourced. The pattern to follow is: state the *shape* of the system confidently, and the *numbers* only where marked ✅.
4. **Read the per-country "first question"** in the JSON `first_questions_by_country` block. Most misinterpretation is prevented by one question — usually "which board?", "which province?", "which nation?", "how many years?" or "do you have both documents?".
5. **Work the gap list before extending coverage.** Several gaps (Indian state boards, Canadian provincial diplomas, NEB grade boundaries, Bangladeshi mark bands) block correct interpretation of qualifications the AI will encounter constantly.

---

## Scope compliance

This research project was explicitly **documentation-only**. No GlobalyApp source code, database schema, migration, API, AI prompt or UI was modified. No RAG pipeline, embedding, vector database or knowledge graph was implemented. No packages were installed. Nothing was refactored.

The only files created are the eight country documents, three consolidated documents, five structured artifacts and this index, all under `docs/ai-counsellor/DOMESTIC_EDUCATION_SYSTEM/`.

**Relationship to existing repository content:** `docs/ai-counsellor/AI_KNOWLEDGE_COUNTRY_EDUCATION.md` covers **outbound recognition** (Nepal→Australia, India→UK etc.) in RAG-sized chunks. This repository covers the **domestic systems themselves**, and reuses that file's verification conventions (✅/⚠, [STABLE]/[PERIODIC]/[VOLATILE]) so the two remain compatible. Facts drawn from it are cited inline as "existing Globaly knowledge base".

---

*Master index. Research date 2026-08-21.*
