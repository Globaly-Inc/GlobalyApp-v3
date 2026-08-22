# Country-Wise International Student Guidelines — RAG Sources (US · AU · CA · UK)

**Owner:** AI Counsellor knowledge base
**Companion document:** [`COUNTRY_STUDENT_VISA_RAG_SOURCES.md`](./COUNTRY_STUDENT_VISA_RAG_SOURCES.md) — visa and immigration sources
**Scope:** studying, living, working, accessing services, and knowing your rights as an international student
**Last verification pass:** 2026-08-21

---

## Purpose

This is a **source registry** for the non-visa half of the AI counsellor's knowledge base. It answers the question a student asks *after* the visa question:

> "I have my place and my visa. What do I actually need to know about studying and living there?"

The visa document answers *can I go and on what terms*. This document answers *what happens once I'm going*.

### In scope

Education system and qualifications · academic responsibilities and progression · tuition and fees · cost of living · accommodation and tenancy · healthcare · working while studying and employment rights · tax and banking · transport · consumer and student rights · safety and emergencies · student support and wellbeing · cultural integration · academic integrity · post-study transition (non-immigration aspects).

### Out of scope — see the visa document

Visa eligibility · visa application process and documents · visa conditions · immigration status · proof of funds for the visa · post-study **work visas**.

### The overlap boundary

Three topics legitimately appear in both documents. The split is:

| Topic | Visa document owns | This document owns |
|---|---|---|
| **Work** | How many hours the *visa* permits; the legal condition | Employment *rights*: minimum wage, contracts, payslips, exploitation reporting |
| **Health insurance** | Whether cover is a *visa requirement* (AU OSHC, UK IHS) | How to *access healthcare*: registering with a doctor, what's covered, emergencies, mental health |
| **Money** | The proof-of-funds threshold for the *visa* | Real cost of living, tuition payment rules, banking, tax |

A retrieval that crosses this line should return both documents' chunks and label which is which.

---

## Source Priority Rules

| Tier | Definition | Retrieval treatment |
|---|---|---|
| **Tier 1** | National government departments and agencies — the body that makes or administers the rule | Primary. Always cited. |
| **Tier 2** | Official education agencies, regulators, qualification authorities, government-backed international education bodies | Authoritative within their remit (quality, qualifications, provider standards). |
| **Tier 3** | Official state / province / devolved-nation government resources | **Authoritative, but only for that jurisdiction.** Mandatory `scope` tag. |
| **Tier 4** | Universities and institutions | Only where genuinely unique. This registry contains **none** — see below. |
| **Tier 5** | Reputable non-government bodies (charities, national advisory bodies) | Fallback only, explicitly labelled. Three entries in this registry. |

### Hard rules

1. **No agent blogs, migration consultants, SEO sites, Reddit, Quora, forums, or "10 things to know" articles.** Not downgraded — excluded.
2. **A regional rule must never be presented as a national rule.** This is the single largest failure mode for this corpus. Healthcare, tenancy, employment standards, and transport concessions all vary by state/province/nation in at least three of the four countries. Every regional chunk carries `scope: region` and the region code, and the counsellor must name the region in its answer.
3. **No Tier 4 university sources.** Every category below is adequately covered by government or regulator sources. Adding university orientation pages would bloat the corpus with institution-specific content that cannot be generalised — and the counsellor would present one university's rule as a country rule. Where an answer genuinely depends on the institution, the correct response is *"this is set by your institution — check with them"*, not a scraped page from a different university.
4. **Suppression, not reranking.** When a Tier 1/2/3 chunk and a Tier 5 chunk both answer the same question, drop the Tier 5 chunk from context.

### Rule-class labels

Every chunk carries a class, because it determines the counsellor's phrasing:

| Class | Meaning |
|---|---|
| `national` | Applies country-wide |
| `region` | State / province / territory / devolved nation only — **must name the region** |
| `institution` | Set by the provider — counsellor redirects rather than answers |
| `temporary` | Time-limited policy or pilot — state the end date |
| `subject_to_change` | Known to move regularly (rates, thresholds, concessions) |

---

## Fetchability

Verified by direct fetch 2026-08-21:

| Domain group | Result |
|---|---|
| `gov.uk`, `nhs.uk`, `acas.org.uk`, `scqf.org.uk`, `qaa.ac.uk`, `oiahe.org.uk`, `ukcisa.org.uk` | ✅ Fetches cleanly |
| `education.gov.au`, `aqf.edu.au` | ⏱️ Timeout |
| `ombudsman.gov.au` | ❌ 403 |
| `irs.gov`, `dol.gov`, `hud.gov`, `ed.gov`, `canada.ca`, `ontario.ca`, `www2.gov.bc.ca` | ❌ 403 (consistent with the visa document's findings) |

As with the visa corpus: **most government sites outside the UK block plain crawlers.** A browser-based fetcher is a prerequisite. Sources marked *Index-confirmed* had URL and ownership verified via search index but their bodies were not read.

---

# United States

**Structural fact that shapes everything below:** the US has **no national education ministry with authority over institutions**, and no federal law on tenancy, most employment conditions beyond the federal floor, or health insurance for students. Quality assurance runs through **private accreditors recognised by the Department of Education**. Housing, most employment specifics, driving, and transport are **state law**.

The counsellor's default posture for the US must therefore be: *federal floor + "check your state" + "check your institution"*. Presenting a single national answer for housing or healthcare is wrong.

## A. Education System & Accreditation

### Source: Accreditation in the United States

- **Country:** United States
- **Region/State/Province:** National
- **Category:** Education system / quality assurance / accreditation
- **Authority:** Tier 1
- **Organization:** U.S. Department of Education, Office of Postsecondary Education
- **Source Type:** Official Government
- **URL:** `https://www.ed.gov/laws-and-policy/higher-education-laws-and-policy/college-accreditation/accreditation-postsecondary-education-institutions`
- **RAG Priority:** High
- **International Student Specific:** No
- **Scrape/Index:** Yes
- **Update Frequency:** Low (`subject_to_change` — accreditor recognition changes)
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - What accreditation is and why it matters
  - The role of recognised accrediting agencies versus the federal government
  - Institutional versus programmatic accreditation
- **Useful Questions:**
  - Is my US university properly accredited?
  - Who regulates universities in the United States?
  - What is the difference between institutional and programmatic accreditation?
  - Why does accreditation matter for my degree's recognition back home?
- **Notes:**
  - **Critical concept for international students**: the US federal government does not accredit institutions. It recognises the *accreditors*. Students from countries with a single national regulator find this genuinely confusing, and it is the root of most "is this university real" questions.

### Source: Database of Accredited Postsecondary Institutions and Programs (DAPIP)

- **Country:** United States
- **Region/State/Province:** National
- **Category:** Education system / provider verification
- **Authority:** Tier 1
- **Organization:** U.S. Department of Education, Office of Postsecondary Education
- **Source Type:** Official Government — searchable database
- **URL:** `https://ope.ed.gov/dapip/#/home`
- **RAG Priority:** High
- **International Student Specific:** No
- **Scrape/Index:** **No** — interactive database. Referral target.
- **Update Frequency:** Continuous
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - ~6,900 accredited postsecondary institutions and programs
  - Which accrediting or state approval agency accredits a given institution
- **Useful Questions:**
  - Is this specific US college accredited?
  - Which body accredits my university?
- **Notes:**
  - **Referral target, not a corpus source.** Do not scrape a database of 6,900 records into a vector store.
  - ED publishes an explicit disclaimer that the reported information is **not audited** and it cannot guarantee accuracy or currency. The counsellor should reproduce that caveat when pointing a student here.

### Source: College Navigator

- **Country:** United States
- **Region/State/Province:** National
- **Category:** Tuition and education costs / institution data
- **Authority:** Tier 1
- **Organization:** National Center for Education Statistics (NCES), U.S. Department of Education
- **Source Type:** Official Government — searchable tool
- **URL:** `https://nces.ed.gov/collegenavigator/`
- **RAG Priority:** High
- **International Student Specific:** No
- **Scrape/Index:** **No** — interactive tool. Referral target.
- **Update Frequency:** Annual (IPEDS cycle)
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Published tuition and required fees for 7,000+ institutions
  - Total cost of attendance (tuition + fees + books + weighted room, board and other expenses)
  - Net price, campus safety data, accreditation, graduation rates
- **Useful Questions:**
  - How much does this US university cost?
  - What is included in "cost of attendance"?
  - How do tuition costs compare between US institutions?
- **Notes:**
  - **The only official comparative institutional-cost source in the US**, and directly relevant to international students because the **I-20 financial figure is derived from cost of attendance** — cross-reference the visa document.
  - **Important caveat:** *net price* subtracts federal, state and institutional grant aid that most international students are **not eligible for**. The counsellor must quote *published cost of attendance*, not net price, for international students. Getting this wrong understates cost dramatically.

## B. Academic Responsibilities

### Source: Maintaining Status (Study in the States)

- **Country:** United States
- **Region/State/Province:** National
- **Category:** Academic responsibilities / enrolment / progression
- **Authority:** Tier 1
- **Organization:** DHS — Student and Exchange Visitor Program
- **Source Type:** Official Government
- **URL:** `https://studyinthestates.dhs.gov/students/maintaining-status`
- **RAG Priority:** High
- **International Student Specific:** **Yes**
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Full course of study obligation
  - Reporting obligations to the Designated School Official (DSO)
  - Consequences of falling out of status
- **Useful Questions:**
  - What are my academic responsibilities as an international student in the US?
  - What happens if I drop below full-time enrolment?
  - Who is my DSO and when must I contact them?
- **Notes:**
  - **Overlaps with the visa document by design.** Cross-reference rather than duplicate. This document uses it for the *academic obligation*; the visa document uses it for *visa conditions*.
  - `Authoritative source not identified` for a US federal source on attendance rules, grading, or credit systems — these are **institution-set**. The counsellor must redirect.

## C. Working While Studying — Employment Rights

### Source: Worker Rights — Wage and Hour Division

- **Country:** United States
- **Region/State/Province:** National (federal floor)
- **Category:** Employment rights / minimum wage / workplace protections
- **Authority:** Tier 1
- **Organization:** U.S. Department of Labor, Wage and Hour Division
- **Source Type:** Official Government
- **URL:** `https://www.dol.gov/agencies/whd/workers`
- **URL (minimum wage):** `https://www.dol.gov/agencies/whd/minimum-wage`
- **URL (immigrant workers):** `https://www.dol.gov/agencies/whd/immigration`
- **RAG Priority:** High
- **International Student Specific:** No — but directly applicable
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate (`subject_to_change` — wage rates)
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Federal minimum wage, overtime, recordkeeping under the FLSA
  - **That WHD enforces the law without regard to a worker's immigration status**
  - How to file a wage complaint, free of charge
- **Useful Questions:**
  - What is the minimum wage I must be paid in the US?
  - My employer is underpaying me — who do I report it to?
  - Do I have employment rights as an international student?
- **Notes:**
  - Verified 2026-08-21 via index: federal minimum wage **USD 7.25/hour effective 24 July 2009**; complaints via **1-866-4USWAGE**, free.
  - **`region` warning: many states set a higher minimum wage than the federal floor, and the higher rate applies.** The counsellor must never quote $7.25 as "the US minimum wage" without saying the state rate may be higher. `Authoritative source not identified` for a single consolidated state-rate page verified this pass — DOL publishes a state minimum wage map; **flag for manual verification.**
  - DOL's stated position that enforcement is immigration-status-blind is **high-value reassurance content** for students afraid to report exploitation.

## D. Taxes & Banking

### Source: Foreign Students, Scholars, Teachers, Researchers and Exchange Visitors

- **Country:** United States
- **Region/State/Province:** National
- **Category:** Tax obligations
- **Authority:** Tier 1
- **Organization:** Internal Revenue Service
- **Source Type:** Official Government
- **URL:** `https://www.irs.gov/individuals/international-taxpayers/foreign-students-scholars-teachers-researchers-and-exchange-visitors`
- **URL (nonresident aliens):** `https://www.irs.gov/individuals/international-taxpayers/taxation-of-nonresident-aliens`
- **URL (Publication 519):** `https://www.irs.gov/publications/p519`
- **URL (Form 8843):** `https://www.irs.gov/forms-pubs/about-form-8843`
- **URL (exempt individual — student):** `https://www.irs.gov/individuals/international-taxpayers/exempt-individual-who-is-a-student`
- **RAG Priority:** **Highest for US tax**
- **International Student Specific:** **Yes**
- **Scrape/Index:** Yes — whole cluster
- **Update Frequency:** Annual (tax year)
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Nonresident alien tax status and the substantial presence test
  - The "exempt individual" rule for F, J, M and Q visa holders
  - Form 8843 filing obligation
  - Tax treaty benefits
- **Useful Questions:**
  - Do I need to file a US tax return as an international student?
  - What is Form 8843 and do I have to file it if I earned nothing?
  - Am I a resident or nonresident for US tax purposes?
  - Does my country have a tax treaty with the US?
- **Notes:**
  - **The single highest-value US non-visa source.** Verified 2026-08-21 via index: **all nonresident aliens excluding days of presence under the substantial presence test must file Form 8843 even with no income.** Almost no student knows this, and almost no agent tells them.
  - Also verified: there is **no minimum income threshold** triggering a filing requirement for a nonresident alien.
  - **`subject_to_change`** — filing addresses, thresholds and treaty tables change annually. Re-verify each tax year.
  - Tax residency for *tax* purposes is **distinct from** immigration status. The counsellor must never conflate them. Cross-reference the visa document explicitly.

### Source: Consumer Financial Protection Bureau

- **Country:** United States
- **Region/State/Province:** National
- **Category:** Banking / consumer financial protection
- **Authority:** Tier 1
- **Organization:** Consumer Financial Protection Bureau
- **Source Type:** Official Government
- **URL:** `https://www.consumerfinance.gov/`
- **RAG Priority:** Medium
- **International Student Specific:** No
- **Scrape/Index:** Yes — consumer guidance sections
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Consumer complaints about bank accounts and financial services
  - Published findings on **college-sponsored banking products carrying higher-than-market fees**
- **Useful Questions:**
  - How do I complain about a US bank?
  - Is the bank account my college recommends a good deal?
- **Notes:**
  - CFPB research found campus-partnered student banking products are often **more costly than what students would find in the open market**. Genuinely useful, non-obvious guidance.
  - `Authoritative source not identified` for a US government guide to **opening a bank account as a foreign student**. Requirements (SSN or ITIN, passport, I-20, proof of address) are bank-set. Compare Canada, which has an explicit federal right-to-open-an-account framework. **Real gap.**

## E. Accommodation & Housing

### Source: State Information — Tenant Rights, Laws and Protections

- **Country:** United States
- **Region/State/Province:** **All 50 states — one page per state**
- **Category:** Accommodation / tenancy rights
- **Authority:** Tier 1 (federal portal to state law)
- **Organization:** U.S. Department of Housing and Urban Development
- **Source Type:** Official Government
- **URL (hub):** `https://www.hud.gov/states`
- **URL (pattern):** `https://www.hud.gov/states/<state>/renting/tenantrights`
- **RAG Priority:** High
- **International Student Specific:** No
- **Scrape/Index:** Yes — **enumerate per state**
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed; hub and one state page confirmed)
- **Covers:**
  - State-by-state tenant rights, laws and protections
  - Fair housing / anti-discrimination protections
- **Useful Questions:**
  - What are my rights as a renter in California / New York / Texas?
  - Can my landlord evict me without notice?
  - Is my landlord discriminating against me illegally?
- **Notes:**
  - **`scope: region` — mandatory, per state.** US tenancy law is state law. There is no national answer. A chunk from the Texas page presented to a student in New York is actively harmful.
  - HUD's own *tenant rights* content is largely about **HUD-assisted housing**, which most international students are not in. The value here is the **state-level links**, not the federal content. Ingest the state pages; treat the federal pages as context only.
  - **`Authoritative source not identified`** for federal guidance on private-market student rentals, security deposit limits, or lease terms. All state law.

## F. Consumer Rights, Safety & Support

### Source: Title IX and Sex Discrimination

- **Country:** United States
- **Region/State/Province:** National
- **Category:** Student rights / anti-discrimination / harassment
- **Authority:** Tier 1
- **Organization:** U.S. Department of Education, Office for Civil Rights
- **Source Type:** Official Government
- **URL:** `https://www.ed.gov/laws-and-policy/civil-rights-laws/title-ix-and-sex-discrimination`
- **URL (FAQ):** `https://www.ed.gov/laws-and-policy/civil-rights-laws/frequently-asked-questions-sex-discrimination`
- **RAG Priority:** High
- **International Student Specific:** No — but **explicitly protects all students regardless of nationality**
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate (`subject_to_change` — Title IX regulations have changed repeatedly)
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Prohibition of sex-based discrimination at any institution receiving federal financial assistance
  - Sex-based harassment, sexual violence, pregnancy discrimination, retaliation
  - Institutions' obligation to take immediate and effective steps to end harassment
  - How to file a complaint with OCR
- **Useful Questions:**
  - What protections do I have against harassment or discrimination at my US university?
  - I was sexually assaulted — what is my university required to do?
  - Where do I complain if my university ignored my report?
- **Notes:**
  - Verified 2026-08-21 via index: Title IX protects **"everyone who interacts with a school"** — students, employees, applicants, parents. International students are covered.
  - **`subject_to_change` — high volatility.** Title IX regulations have been amended and litigated repeatedly. Re-verify before relying on any specific procedural requirement.
  - OCR also enforces Title VI (race, colour, national origin) — relevant to international students facing national-origin discrimination. **Confirm the Title VI page URL — not verified this pass.**

### Source: 988 Suicide & Crisis Lifeline

- **Country:** United States
- **Region/State/Province:** National
- **Category:** Mental health / crisis support / emergency
- **Authority:** Tier 1
- **Organization:** SAMHSA (federal) / 988 Lifeline
- **Source Type:** Official Government-backed
- **URL:** `https://988lifeline.org/`
- **URL (SAMHSA):** `https://www.samhsa.gov/mental-health/988`
- **RAG Priority:** **Highest for crisis** — must be retrievable with zero latency
- **International Student Specific:** No
- **Scrape/Index:** Yes
- **Update Frequency:** Low
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Free, confidential 24/7 crisis support by call, text or chat
  - Available across the US and its territories
- **Useful Questions:**
  - I'm in crisis in the US — who do I call?
  - Is there free mental health support for students?
  - Can I get help in my own language?
- **Notes:**
  - Verified 2026-08-21 via index: call/chat/text in **English and Spanish**, with interpreter-supported calls in **more than 240 languages** — directly relevant to international students.
  - **Crisis content must bypass normal retrieval ranking.** Any query indicating crisis should surface this immediately alongside the local emergency number (**911** in the US).

## US Coverage Summary

| Category | Status | Primary source |
|---|---|---|
| Education system / accreditation | ✅ | ED accreditation pages + DAPIP |
| Academic responsibilities | ⚠️ | Maintaining Status (federal); grading/attendance are `institution` |
| Tuition & costs | ✅ | College Navigator (use *published* cost, not net price) |
| Cost of living | ⚠️ | Within College Navigator's cost of attendance; no standalone official estimator |
| Accommodation | ✅ | HUD state pages (`region`, all 50 states) |
| Healthcare | ❌ | `Authoritative source not identified` — no federal student health scheme; `institution` |
| Employment rights | ✅ | DOL Wage and Hour Division |
| Tax | ✅ | IRS foreign students cluster |
| Banking | ⚠️ | CFPB (complaints); no official account-opening guide for foreign students |
| Transport | ❌ | `Authoritative source not identified` — state/municipal; no national resource |
| Consumer & student rights | ✅ | ED OCR / Title IX |
| Safety & emergency | ✅ | 911; 988 Lifeline |
| Student support | ✅ | 988 Lifeline; institution-level otherwise |
| Academic integrity | ❌ | `Authoritative source not identified` — no federal standard; `institution` |
| Post-study guidance | ⚠️ | Cross-reference visa document (OPT/STEM OPT); no non-visa federal careers resource |

---

# Australia

**Australia has the strongest international-student protection framework of the four**, and it is statutory. The **ESOS framework** — the Education Services for Overseas Students Act 2000 plus the National Code of Practice 2018 — creates enforceable obligations on providers *specifically toward international students*, backed by a dedicated ombudsman and a statutory tuition-protection scheme.

This makes Australia the richest country in this registry for **Tier 1, internationally-student-specific** content. Most of what follows exists nowhere else.

**Regional caveat:** tenancy, transport concessions and consumer affairs are **state matters**. Transport concession eligibility for international students differs sharply by state and is a common source of wrong advice.

## A. Education System & Quality

### Source: Australian Qualifications Framework (AQF)

- **Country:** Australia
- **Region/State/Province:** National
- **Category:** Education system / qualification framework
- **Authority:** Tier 2
- **Organization:** Australian Qualifications Framework Council / Department of Education
- **Source Type:** Official education framework
- **URL:** `https://www.aqf.edu.au/`
- **URL (levels):** `https://www.aqf.edu.au/framework/aqf-levels`
- **URL (qualifications):** `https://www.aqf.edu.au/framework/aqf-qualifications`
- **URL (TEQSA view):** `https://www.teqsa.gov.au/how-we-regulate/acts-and-standards/australian-qualifications-framework`
- **RAG Priority:** High
- **International Student Specific:** No
- **Scrape/Index:** Yes
- **Update Frequency:** Low — `stable`
- **Last Verified:** 2026-08-21 (index-confirmed; direct fetch timed out)
- **Covers:**
  - The 10-level national qualifications framework
  - Which qualification types sit at which level
- **Useful Questions:**
  - What is an AQF level and where does my qualification sit?
  - Is an Australian Graduate Diploma higher than a Bachelor degree?
  - What level is a Masters degree in Australia?
- **Notes:**
  - Verified 2026-08-21 via index: **10 levels**, Certificate I (level 1) to Doctoral Degree (level 10); higher education awards span **levels 5–10**. Diploma = level 5; **Bachelor Honours, Graduate Certificate and Graduate Diploma all sit at level 8**; Masters = level 9; Doctoral = level 10.
  - The level-8 cluster surprises students: a Graduate Certificate and a Bachelor Honours degree are the same AQF level despite very different length and purpose. Worth an explicit disambiguation chunk.
  - `aqf.edu.au` timed out on direct fetch — use the TEQSA mirror as a fallback ingestion path.

### Source: TEQSA — Tertiary Education Quality and Standards Agency

- **Country:** Australia
- **Region/State/Province:** National
- **Category:** Education quality / regulator / academic integrity
- **Authority:** Tier 2
- **Organization:** TEQSA
- **Source Type:** Official Government regulator
- **URL:** `https://www.teqsa.gov.au/`
- **RAG Priority:** High
- **International Student Specific:** No
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Regulation of Australian higher education providers
  - Higher Education Standards Framework
- **Useful Questions:**
  - Who regulates Australian universities?
  - Is my Australian provider properly registered?
- **Notes:**
  - TEQSA regulates **higher education**; **ASQA** regulates vocational education and training (VET). Students moving between VET and higher education need both. **ASQA URL not verified this pass — flag.**

## B. International Student Protections — the ESOS framework

### Source: ESOS Framework

- **Country:** Australia
- **Region/State/Province:** National
- **Category:** International student protections / provider obligations / consumer rights
- **Authority:** Tier 1
- **Organization:** Australian Government Department of Education
- **Source Type:** Official Government
- **URL:** `https://www.education.gov.au/esos-framework`
- **URL (legislative framework):** `https://www.education.gov.au/esos-framework/esos-legislative-framework`
- **URL (National Code 2018):** `https://www.education.gov.au/esos-framework/national-code-practice-providers-education-and-training-overseas-students-2018`
- **URL (legislation):** `https://www.legislation.gov.au/Details/F2017L01182`
- **URL (factsheet):** `https://www.education.gov.au/esos-framework/resources/general-factsheet`
- **RAG Priority:** **Highest for Australia**
- **International Student Specific:** **Yes — explicitly and exclusively**
- **Scrape/Index:** Yes — whole cluster
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed; direct fetch timed out)
- **Covers:**
  - The ESOS Act 2000 and the National Code of Practice 2018
  - Nationally consistent standards providers must meet for overseas students
  - Provider obligations: written agreements, complaints and appeals, course progress, transfers, welfare
  - The basis of tuition protection
- **Useful Questions:**
  - What is my Australian education provider legally required to do for me?
  - What rules protect international students in Australia?
  - My provider is not delivering what my written agreement promised — what are my rights?
  - Can my provider refuse to let me transfer to another institution?
- **Notes:**
  - **The most valuable single source in this entire document.** It is Tier 1, statutory, and written *specifically about international students* — a combination that does not exist for the US, Canada or the UK.
  - Verified 2026-08-21 via index: the National Code 2018 **commenced 1 January 2018**; providers must comply to keep CRICOS registration. The Department's own framing: *"Consumer protection must be appropriate for overseas students who usually cannot evaluate the quality of a course before purchase."*
  - The National Code is structured as **numbered Standards** — ideal chunking. Ingest the legislation.gov.au version for clause-level citation and the education.gov.au version for plain-language explanation.
  - Cross-reference the visa document: CRICOS registration is also a visa prerequisite.

### Source: Overseas Students Ombudsman

- **Country:** Australia
- **Region/State/Province:** National
- **Category:** Complaints / dispute resolution / student rights
- **Authority:** Tier 1
- **Organization:** Commonwealth Ombudsman
- **Source Type:** Official Government
- **URL:** `https://www.ombudsman.gov.au/complaints/international-student-complaints`
- **URL (for students):** `https://www.ombudsman.gov.au/complaints/international-student-complaints/information-international-students`
- **RAG Priority:** **Highest for complaints**
- **International Student Specific:** **Yes**
- **Scrape/Index:** Yes
- **Update Frequency:** Low
- **Last Verified:** 2026-08-21 (index-confirmed; 403 to direct fetch)
- **Covers:**
  - Free complaints service for international students
  - What can be complained about and the required internal-process-first sequence
- **Useful Questions:**
  - Where can I complain about my Australian education provider?
  - My provider withheld my results / didn't deliver services in my agreement — who helps?
  - Is complaining free? Will it affect my visa?
- **Notes:**
  - **Critical jurisdictional limit, verified 2026-08-21 via index: the Overseas Students Ombudsman covers complaints about *private* registered education providers.** Students at **public universities** go to their **state ombudsman** instead. Getting this wrong sends a student to the wrong body and wastes weeks.
  - `⚠️` **`Authoritative source not identified` for a consolidated list of state ombudsmen covering public universities.** Flag for manual work — this is a real and closable gap.
  - Sequence matters: internal provider complaints process **first**, then the Ombudsman. Free; phone 1300 362 072.
  - The Ombudsman also publishes international-student factsheets on **attendance** and **education agents** — both directly useful and both `international student specific`.

### Source: Tuition Protection Service (TPS)

- **Country:** Australia
- **Region/State/Province:** National
- **Category:** Tuition / consumer protection / provider default
- **Authority:** Tier 1
- **Organization:** Australian Government Department of Education
- **Source Type:** Official Government
- **URL:** `https://www.education.gov.au/tps`
- **URL (international students):** `https://www.education.gov.au/tps/international-students`
- **RAG Priority:** High
- **International Student Specific:** **Yes**
- **Scrape/Index:** Yes
- **Update Frequency:** Low
- **Last Verified:** 2026-08-21 (redirect verified by direct fetch)
- **Covers:**
  - Statutory protection when a provider fails to start or complete a course
  - Placement in an alternative course, or a refund
- **Useful Questions:**
  - What happens to my money if my Australian college closes?
  - My course was cancelled — can I get a refund or be placed elsewhere?
- **Notes:**
  - **URL change verified 2026-08-21: `https://tps.gov.au/` returns `301 Moved Permanently` to `https://education.gov.au/tps`.** Use the education.gov.au path as canonical. Any indexed content under `tps.gov.au` should be re-pointed.
  - Statutory, not discretionary — a genuine safety net with no equivalent in the US, Canada or the UK. Worth surfacing proactively when students ask about provider risk.

## C. Employment Rights

### Source: Fair Work Ombudsman — International Students

- **Country:** Australia
- **Region/State/Province:** National
- **Category:** Employment rights / workplace protections / exploitation
- **Authority:** Tier 1
- **Organization:** Fair Work Ombudsman
- **Source Type:** Official Government
- **URL (fact sheet):** `https://www.fairwork.gov.au/tools-and-resources/fact-sheets/rights-and-obligations/international-students`
- **URL (visa holders hub):** `https://www.fairwork.gov.au/find-help-for/visa-holders-migrants`
- **URL (Assurance Protocol):** `https://www.fairwork.gov.au/find-help-for/visa-holders-migrants/visa-protections-the-assurance-protocol`
- **RAG Priority:** **Highest for AU employment**
- **International Student Specific:** **Yes — dedicated fact sheet**
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate (`subject_to_change` — award rates change annually)
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - That international students have the **same entitlements and protections under the Fair Work Act as any other employee, regardless of migration status**
  - National Employment Standards (NES) minimum entitlements
  - Pay, payslips, record-keeping
  - The Assurance Protocol for visa holders reporting exploitation
- **Useful Questions:**
  - Am I being underpaid at my job in Australia?
  - Will my visa be cancelled if I report my employer?
  - What is a payslip and am I entitled to one?
  - Where do I get help with workplace exploitation?
- **Notes:**
  - Verified 2026-08-21 via index: FWO states **"You can't get into trouble or have your visa cancelled for contacting the Fair Work Ombudsman"** — this is the **single most important reassurance in the Australian corpus**. Fear of visa consequences is the main reason exploited students stay silent. Weight this chunk heavily.
  - **Strict boundary with the visa document:** FWO answers *what you must be paid and what rights you have*. Home Affairs answers *how many hours you may work*. Never let FWO content answer a work-hours question.
  - Infoline: 13 13 94.

## D. Tax

### Source: ATO — Studying in Australia

- **Country:** Australia
- **Region/State/Province:** National
- **Category:** Tax obligations / tax file number
- **Authority:** Tier 1
- **Organization:** Australian Taxation Office
- **Source Type:** Official Government
- **URL:** `https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/coming-to-australia/studying-in-australia`
- **URL (residency):** `https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/your-tax-residency`
- **URL (residency tool):** `https://www.ato.gov.au/calculators-and-tools/tax-return-work-out-your-tax-residency`
- **URL (apply for TFN):** `https://www.ato.gov.au/individuals-and-families/tax-file-number/apply-for-a-tfn`
- **RAG Priority:** High
- **International Student Specific:** **Yes**
- **Scrape/Index:** Yes — guidance pages. Residency **tool** is a referral target, not a chunk.
- **Update Frequency:** Annual
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Tax residency for international students
  - Temporary resident status and foreign income treatment
  - Applying for a Tax File Number (TFN)
- **Useful Questions:**
  - Do I need a Tax File Number in Australia?
  - Am I an Australian resident for tax purposes as a student?
  - Do I have to declare income from my home country?
  - Do I get the tax-free threshold?
- **Notes:**
  - Verified 2026-08-21 via index: a student enrolled in a course **lasting 6 months or more may be an Australian resident for tax purposes**, which grants the tax-free threshold. Students who are **temporary residents and Australian residents** generally do **not** declare most foreign income.
  - **This is counter-intuitive and frequently answered wrongly.** "Resident for tax purposes" is not the same as immigration residency, and being a *temporary resident* changes the foreign-income answer. Encode all three concepts as distinct.
  - Without a TFN, tax is withheld at the top rate — a concrete financial consequence worth stating.

## E. Safety, Scams & Online Harm

### Source: Scamwatch

- **Country:** Australia
- **Region/State/Province:** National
- **Category:** Fraud / scams / safety
- **Authority:** Tier 1
- **Organization:** Australian Competition and Consumer Commission (ACCC)
- **Source Type:** Official Government
- **URL:** `https://www.scamwatch.gov.au/`
- **URL (report):** `https://www.scamwatch.gov.au/report-a-scam`
- **RAG Priority:** High
- **International Student Specific:** No — but students are a heavily targeted group
- **Scrape/Index:** Yes
- **Update Frequency:** **Frequent** — scam types evolve constantly
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - How to recognise, avoid and report scams
  - Threat scams — including impersonation of immigration and tax authorities
- **Useful Questions:**
  - Someone claiming to be from immigration says I must pay a fine — is this a scam?
  - How do I report a scam in Australia?
- **Notes:**
  - **International students are a primary target for immigration-impersonation scams.** The counsellor should proactively surface this whenever a student describes an unexpected demand for payment from "the government".
  - **`subject_to_change` — high refresh priority.** Scam typologies change monthly.

### Source: eSafety Commissioner

- **Country:** Australia
- **Region/State/Province:** National
- **Category:** Online safety / harassment / image-based abuse
- **Authority:** Tier 1
- **Organization:** eSafety Commissioner
- **Source Type:** Official Government regulator
- **URL:** `https://www.esafety.gov.au/`
- **URL (report):** `https://www.esafety.gov.au/report`
- **URL (online scams):** `https://www.esafety.gov.au/key-topics/staying-safe/online-scams`
- **RAG Priority:** Medium
- **International Student Specific:** No
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Australia's national independent regulator for online safety
  - Complaints about cyberbullying, image-based abuse, illegal online content, and content takedown
- **Useful Questions:**
  - Someone shared intimate images of me without consent — what can I do in Australia?
  - I'm being harassed online — is there a government body that can help?
- **Notes:**
  - **A genuine regulator with takedown powers**, not just an advice site. No equivalent exists in the other three countries at this level.

## F. State-Specific Resources (Tier 3)

> **Every source in this section is `scope: region`.** The counsellor must name the state and must never generalise these to Australia as a whole.

### Source: Consumer Affairs Victoria — International Students

- **Country:** Australia
- **Region/State/Province:** **Victoria (AU-VIC)**
- **Category:** Consumer rights / tenancy
- **Authority:** Tier 3
- **Organization:** Consumer Affairs Victoria
- **Source Type:** Official State Government
- **URL:** `https://www.consumer.vic.gov.au/resources-and-tools/international-students`
- **URL (renters guide):** `https://www.consumer.vic.gov.au/housing/renting/starting-and-changing-rental-agreements/resources-and-guides-for-renters/renters-guide`
- **RAG Priority:** High (within Victoria)
- **International Student Specific:** **Yes — dedicated page**
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Renting rights and consumer rights specifically framed for international students in Victoria
  - The Renters Guide: every stage from applying to moving out
- **Useful Questions:**
  - What are my rights renting in Melbourne?
  - How much bond can a Victorian landlord ask for?
  - What consumer rights do I have as an international student in Victoria?

### Source: NSW Government — Consumer Rights Information for International Students

- **Country:** Australia
- **Region/State/Province:** **New South Wales (AU-NSW)**
- **Category:** Consumer rights / tenancy
- **Authority:** Tier 3
- **Organization:** NSW Fair Trading / NSW Government
- **Source Type:** Official State Government
- **URL:** `https://www.nsw.gov.au/legal-and-justice/consumer-rights-and-protection/services/education-and-training/information-for-international-students`
- **RAG Priority:** High (within NSW)
- **International Student Specific:** **Yes — dedicated page**
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Consumer and tenancy rights for international students in NSW
  - Tenant information statement requirement; bond rules; rent bidding prohibition
- **Useful Questions:**
  - What are my rights renting in Sydney?
  - How much bond can be charged in NSW and who holds it?
  - Is rent bidding allowed in NSW?
- **Notes:**
  - Verified 2026-08-21 via index: in NSW a **bond cannot exceed four weeks' rent**, is fully refundable at tenancy end, and **all bonds must be lodged with NSW Fair Trading**; **rent bidding is prohibited**. `scope: region` — these figures are NSW-only and differ in other states.

### Source: Transport for NSW — Tertiary and TAFE Student Concessions

- **Country:** Australia
- **Region/State/Province:** **New South Wales (AU-NSW)**
- **Category:** Transport / student concessions
- **Authority:** Tier 3
- **Organization:** Transport for NSW / Service NSW
- **Source Type:** Official State Government
- **URL:** `https://transportnsw.info/tickets-fares/eligibility-concessions/tertiary-tafe-students`
- **URL (eligibility hub):** `https://transportnsw.info/tickets-fares/eligibility-concessions`
- **URL (apply):** `https://www.service.nsw.gov.au/transaction/apply-concession-opal-card-tertiary-or-tafe-student`
- **RAG Priority:** High (within NSW)
- **International Student Specific:** Partially
- **Scrape/Index:** Yes
- **Update Frequency:** **Frequent** (`subject_to_change`)
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Who qualifies for a concession Opal card
  - International student eligibility rules and proof of entitlement
- **Useful Questions:**
  - Do international students get discounted public transport in Sydney?
  - Can I get a concession Opal card?
- **Notes:**
  - **The most misreported fact in Australian student advice, and verified 2026-08-21 via index: most international students in NSW are NOT eligible for concession Opal fares.** Eligibility on the Opal network is limited to international students on an **Endeavour Scholarship, Australia Awards Scholarship, or Research Training Program (RTP) Scholarship**. Eligible international students *are* entitled to concession fares on **NSW TrainLink Regional** services with valid proof of entitlement.
  - **Victoria's rules differ sharply — and in the opposite direction.** Victoria runs a dedicated international-student travel pass (iUSEpass, 50% off an annual myki); see the Victoria entry above. The counsellor must never answer a transport-concession question without establishing the state.

### Source: International Student Travel Pass (iUSEpass) — Victoria

- **Country:** Australia
- **Region/State/Province:** **Victoria (AU-VIC)**
- **Category:** Transport / student concessions
- **Authority:** Tier 3
- **Organization:** Public Transport Victoria / Transport Victoria
- **Source Type:** Official State Government
- **URL:** `https://www.ptv.vic.gov.au/tickets/myki/concessions-and-free-travel/children-and-students/international-students`
- **URL (institutions):** `https://www.ptv.vic.gov.au/tickets/fares/concession/tertiary-students/international-students/iusepass-for-institutions/`
- **URL (portal):** `https://internationalstudent.ptv.vic.gov.au/`
- **RAG Priority:** High (within Victoria)
- **International Student Specific:** **Yes — exclusively**
- **Scrape/Index:** Guidance pages **Yes**. `internationalstudent.ptv.vic.gov.au` **No** — authenticated purchase portal, referral target.
- **Update Frequency:** **Frequent** (`subject_to_change` — fares and participating institutions)
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - The iUSEpass: a discounted annual myki for international undergraduate students
  - Which students are eligible and which are excluded
  - That participation depends on the institution joining the scheme
- **Useful Questions:**
  - Do international students get discounted public transport in Melbourne?
  - What is an iUSEpass and how do I get one?
  - My institution isn't in the scheme — am I still eligible for a concession?
- **Notes:**
  - Verified 2026-08-21 via index: international **undergraduate** students can save **50% on an annual myki** with an iUSEpass, giving unlimited travel on trains, trams and buses in the institution's zone. **The institution must be part of the program**, and the student obtains an iUSEpass code from them.
  - Explicitly **excluded from iUSEpass** because they already hold discounted travel: international **exchange** students, students with refugee status, and **Australia Awards Scholarship** recipients. New Zealand students are eligible.
  - **This is the sharpest regional contrast in the entire registry.** Victoria runs a dedicated international-student travel pass; NSW restricts concession Opal eligibility to a narrow scholarship-holder set. **Same question, opposite answers, 900km apart.** Retrieval that omits the state here produces a confidently wrong answer either way.
  - Postgraduate eligibility is not stated in the indexed content — **`Not verified`.** The counsellor should not assert that postgraduates qualify.

### Source: Study Melbourne · Study NSW · StudyAdelaide

- **Country:** Australia
- **Region/State/Province:** **Victoria · New South Wales · South Australia**
- **Category:** Student support / wellbeing / community integration
- **Authority:** Tier 3
- **Organization:** Victorian Government · NSW Government · Government of South Australia
- **Source Type:** Official State Government international-student portals
- **URL:** `https://studymelbourne.vic.gov.au/`
- **URL:** `https://www.study.nsw.gov.au/`
- **URL:** `https://studyadelaide.com/study/student-support`
- **RAG Priority:** Medium (High within their state)
- **International Student Specific:** **Yes — exclusively**
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - State-funded international student support programs and services
  - Free legal advice, professional development, networking and social events (Study Melbourne)
  - Accommodation help, academic support, counselling and health services (StudyAdelaide)
- **Useful Questions:**
  - Where can I get free legal advice as an international student in Melbourne?
  - What support services exist for international students in my Australian state?
  - How do I meet other international students / integrate locally?
- **Notes:**
  - **These are the best cultural-integration and wellbeing sources in the whole registry**, in any country — state-funded, international-student-exclusive, and practical.
  - `scope: region` — a Study Melbourne service is not available to a student in Brisbane.
  - **`Authoritative source not identified` for Queensland and Western Australia equivalents this pass.** Study Queensland and StudyPerth are believed to exist; **domains unconfirmed — flag.**

## G. Academic Integrity

### Source: TEQSA — Academic Integrity Toolkit

- **Country:** Australia
- **Region/State/Province:** National
- **Category:** Academic integrity
- **Authority:** Tier 2
- **Organization:** TEQSA
- **Source Type:** Official Government regulator
- **URL:** `https://www.teqsa.gov.au/guides-resources/protecting-academic-integrity`
- **URL (toolkit):** `https://www.teqsa.gov.au/guides-resources/protecting-academic-integrity/academic-integrity-toolkit`
- **URL (contract cheating):** `https://www.teqsa.gov.au/preventing-contract-cheating`
- **RAG Priority:** High
- **International Student Specific:** No
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Academic integrity frameworks, contract cheating, commercial academic cheating
  - **Risks to academic integrity from generative AI**, assessment design and security
- **Useful Questions:**
  - What counts as academic misconduct in Australia?
  - Is using an essay-writing service illegal in Australia?
  - Can I use AI tools in my assignments?
- **Notes:**
  - **The only national-regulator academic integrity resource in this registry** — the US, Canada and the UK leave this to institutions or a non-regulator body.
  - Verified 2026-08-21 via index: the revised toolkit includes sections on **generative AI risks** and guides on **detecting AI in texts**. Directly relevant to a live student question.
  - **Important limit:** TEQSA sets sector expectations. **Actual penalties and disciplinary processes are `institution` scope.** The counsellor explains the principle and redirects for the process.

## Australia Coverage Summary

| Category | Status | Primary source |
|---|---|---|
| Education system / qualifications | ✅ | AQF (10 levels) + TEQSA |
| Academic responsibilities | ✅ | National Code 2018 (course progress, attendance, transfers) |
| Tuition & fee protection | ✅ | ESOS + Tuition Protection Service |
| Cost of living | ⚠️ | Study Australia estimates; cross-reference visa document's staleness warning |
| Accommodation | ✅ | `region` — Consumer Affairs VIC, NSW Fair Trading |
| Healthcare | ✅ | OSHC — cross-reference visa document |
| Employment rights | ✅ | Fair Work Ombudsman international students fact sheet |
| Tax | ✅ | ATO Studying in Australia |
| Banking | ❌ | `Authoritative source not identified` |
| Transport | ✅ | `region` — NSW and VIC verified (and opposite); QLD/WA/SA not |
| Consumer & student rights | ✅ | ESOS + Overseas Students Ombudsman |
| Safety & emergency | ✅ | 000; Scamwatch; eSafety Commissioner |
| Student support | ✅ | `region` — Study Melbourne / Study NSW / StudyAdelaide |
| Academic integrity | ✅ | TEQSA Academic Integrity Toolkit |
| Post-study guidance | ⚠️ | Cross-reference visa document (subclass 485) |


---

# Canada

**Education in Canada is a provincial responsibility under the Constitution Act 1867.** There is no federal department of education. This is not a technicality — it is the defining fact of the Canadian corpus, and it means that **healthcare, tenancy, employment standards, and consumer protection all differ by province**, sometimes drastically.

The federal government owns: immigration (see the visa document), tax, banking regulation, and national fraud reporting. Everything else in this document is provincial.

**Consequence for retrieval:** a Canadian answer that does not establish the province is usually wrong. The counsellor must ask.

## A. Education System

### Source: Education in Canada — An Overview

- **Country:** Canada
- **Region/State/Province:** National (describing provincial structure)
- **Category:** Education system
- **Authority:** Tier 2
- **Organization:** Council of Ministers of Education, Canada (CMEC)
- **Source Type:** Official intergovernmental education body
- **URL:** `https://www.cmec.ca/299/education-in-canada-an-overview/index.html`
- **URL (postsecondary):** `https://www.cmec.ca/158/Postsecondary_Education.html`
- **RAG Priority:** High
- **International Student Specific:** No
- **Scrape/Index:** Yes
- **Update Frequency:** Low — `stable`
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - That provinces and territories hold exclusive constitutional authority over education
  - Structure of the postsecondary sector: universities, colleges, CÉGEPs, polytechnics, institutes of technology
  - The limited federal role (fiscal transfers, research funding, student financial assistance)
- **Useful Questions:**
  - How does the Canadian education system work?
  - What is the difference between a Canadian university and a college?
  - What is a CÉGEP?
  - Who regulates education in Canada?
- **Notes:**
  - **The foundational Canadian chunk.** Every other Canadian answer depends on the student understanding that rules vary by province. Retrieve this alongside any provincial answer as framing.
  - Verified 2026-08-21 via index: the **Constitution Act 1867** granted provinces exclusive power over education; universities are treated as autonomous but state-supported.
  - The **university / college / CÉGEP** distinction is a top-five confusion point for international students, who often assume "college" means what it means in the US.

### Source: CICIC — Canadian Information Centre for International Credentials

- **Country:** Canada
- **Region/State/Province:** National
- **Category:** Qualification recognition / professional registration
- **Authority:** Tier 2
- **Organization:** CICIC (a unit of CMEC)
- **Source Type:** Official information centre
- **URL:** `https://www.cicic.ca/`
- **RAG Priority:** Medium
- **International Student Specific:** Partially
- **Scrape/Index:** Yes
- **Update Frequency:** Low
- **Last Verified:** 2026-08-21 (index-confirmed via CMEC linkage)
- **Covers:**
  - Recognition of qualifications in Canada
  - Regulated professions and where to seek registration
- **Useful Questions:**
  - Will my Canadian qualification be recognised for professional registration?
  - How do I get my foreign credentials assessed in Canada?
  - Is my intended profession regulated in Canada?
- **Notes:**
  - **Post-study relevance:** many Canadian professions are provincially regulated, and graduating does not confer the right to practise. Genuinely important and consistently under-communicated.
  - **Not verified by direct fetch this pass — flag for manual verification.**

### Source: EduCanada

- **Country:** Canada
- **Region/State/Province:** National
- **Category:** Student life / costs / healthcare / working — official portal
- **Authority:** Tier 2
- **Organization:** Global Affairs Canada
- **Source Type:** Official Government education portal
- **URL:** `https://www.educanada.ca/index.aspx?lang=eng`
- **URL (healthcare):** `https://www.educanada.ca/study-plan-etudes/before-avant/health-care-assurance-maladie.aspx?lang=eng`
- **URL (wellness):** `https://www.educanada.ca/study-plan-etudes/during-pendant/wellness-bien-etre.aspx?lang=eng`
- **URL (costs):** `https://www.educanada.ca/programs-programmes/education_cost-cout_education.aspx?lang=eng`
- **URL (live and work):** `https://www.educanada.ca/live-work-vivre-travailler/index.aspx?lang=eng`
- **RAG Priority:** High
- **International Student Specific:** **Yes — exclusively**
- **Scrape/Index:** Yes — whole cluster
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Study costs, healthcare, wellness, working, and life in Canada — framed for international students
- **Useful Questions:**
  - How much does it cost to study in Canada?
  - Do international students get free healthcare in Canada?
  - What support is available for my wellbeing as an international student?
- **Notes:**
  - **The best single Canadian entry point**, and the only Tier 2 federal source written exclusively for international students.
  - Verified 2026-08-21 via index, and important: EduCanada states that **provinces offering health coverage to international students may impose a residency waiting period**, and that **where no provincial coverage exists the institution will require private insurance** — citing Ontario's UHIP as the example. This confirms the provincial-variance framing.
  - Tier 2 — it summarises provincial rules rather than making them. **Always retrieve the relevant provincial source alongside it.**

## B. Healthcare — provincial (Tier 3)

> **This is the highest-risk category in the Canadian corpus.** International student healthcare eligibility differs by province in kind, not just degree: some provinces cover students, some impose waiting periods, some exclude them entirely and require institutional private insurance.

### Source: Health Care Coverage for Students and International Students (Alberta)

- **Country:** Canada
- **Region/State/Province:** **Alberta (CA-AB)**
- **Category:** Healthcare
- **Authority:** Tier 3
- **Organization:** Government of Alberta — AHCIP
- **Source Type:** Official Provincial Government
- **URL:** `https://www.alberta.ca/ahcip-students`
- **URL (temporary residents):** `https://www.alberta.ca/ahcip-temporary-residents`
- **RAG Priority:** High (within Alberta)
- **International Student Specific:** **Yes**
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - AHCIP eligibility for international students
- **Useful Questions:**
  - Do I get provincial health coverage as an international student in Alberta?
  - I transferred to Alberta from another province — am I covered?
- **Notes:**
  - Verified 2026-08-21 via index: international students may be eligible for AHCIP with a **12-month study permit** for an Alberta institution and intent to reside in Alberta for 12+ months; or with a valid study permit for another province with **6+ months remaining** if transferring to an Alberta school with registrar confirmation of full-time attendance.
  - `scope: region` — Alberta only.

### Source: Health Fee for International Students / MSP (British Columbia)

- **Country:** Canada
- **Region/State/Province:** **British Columbia (CA-BC)**
- **Category:** Healthcare
- **Authority:** Tier 3
- **Organization:** Province of British Columbia — Medical Services Plan
- **Source Type:** Official Provincial Government
- **URL:** `https://www2.gov.bc.ca/gov/content/health/accessing-health-care/health-fee-international-students`
- **URL (apply for MSP):** `https://www2.gov.bc.ca/gov/content/health/health-drug-coverage/msp/bc-residents/eligibility-and-enrolment/apply-for-msp`
- **RAG Priority:** High (within BC)
- **International Student Specific:** **Yes**
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate (`subject_to_change` — the health fee amount)
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Mandatory MSP enrolment for international students
  - The waiting period and the need for private cover to bridge it
  - The health fee levied on international students
- **Useful Questions:**
  - Do I have to enrol in MSP in British Columbia?
  - How long until my BC health coverage starts?
  - Do I need private insurance when I first arrive in BC?
- **Notes:**
  - Verified 2026-08-21 via index: international students with a study permit valid **six months or more are required to apply for MSP on arrival**. The wait period is **the balance of the month residency is established plus two months**, and students **should carry private insurance until coverage begins**.
  - **The waiting-period gap is a real financial exposure** and one of the most useful concrete facts in this document. Surface proactively for BC-bound students.
  - `scope: region` — BC only. The **health fee amount is `subject_to_change`** and must live in a rules table, not an embedding.

### Source: OHIP (Ontario) — and the UHIP exception

- **Country:** Canada
- **Region/State/Province:** **Ontario (CA-ON)**
- **Category:** Healthcare
- **Authority:** Tier 3
- **Organization:** Government of Ontario
- **Source Type:** Official Provincial Government
- **URL:** `https://www.ontario.ca/page/apply-ohip-and-get-health-card`
- **RAG Priority:** High (within Ontario)
- **International Student Specific:** No — the page is general
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - OHIP eligibility and application
- **Useful Questions:**
  - Am I covered by OHIP as an international student in Ontario?
  - What is UHIP?
- **Notes:**
  - **⚠️ Verification caveat, stated plainly.** Search-index results this pass indicated that visitors to Ontario from outside Canada do not qualify for OHIP, and EduCanada separately states that **in Ontario all international students must have coverage through the University Health Insurance Plan (UHIP)**. The Ontario page did **not** yield explicit international-student eligibility criteria this pass. **Marked `Not verified` — a browser-based fetch of the Ontario eligibility page is required before the counsellor answers this authoritatively.**
  - **Do not let the counsellor state Ontario's international-student OHIP position until this is confirmed.** The safe answer is to cite EduCanada's UHIP statement and direct to the institution.
  - `Authoritative source not identified` for an official UHIP administrator page verified this pass — UHIP is administered through Ontario universities. **Flag.**

## C. Accommodation — provincial (Tier 3)

### Source: Renting in Ontario — Your Rights

- **Country:** Canada
- **Region/State/Province:** **Ontario (CA-ON)**
- **Category:** Accommodation / tenancy rights
- **Authority:** Tier 3
- **Organization:** Government of Ontario / Landlord and Tenant Board (Tribunals Ontario)
- **Source Type:** Official Provincial Government
- **URL:** `https://www.ontario.ca/page/renting-ontario-your-rights`
- **URL (LTB):** `https://tribunalsontario.ca/ltb/`
- **URL (RTA guide):** `https://tribunalsontario.ca/documents/ltb/Brochures/Guide%20to%20RTA%20(English).html`
- **URL (legislation):** `https://www.ontario.ca/laws/statute/06r17`
- **RAG Priority:** High (within Ontario)
- **International Student Specific:** No
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate (`subject_to_change` — the annual rent increase guideline)
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Rights and responsibilities under the Residential Tenancies Act 2006
  - Rent increase guideline; eviction rules and required notice forms
  - Protection from landlord harassment
  - Dispute resolution through the Landlord and Tenant Board
- **Useful Questions:**
  - What are my rights renting in Toronto?
  - Can my landlord raise my rent by any amount?
  - My landlord is trying to force me out — is that legal?
  - Where do I take a dispute with my landlord in Ontario?
- **Notes:**
  - Verified 2026-08-21 via index: the RTA came into effect **31 January 2007** and covers apartments, houses, condos, basement apartments, rooming/boarding house rooms, care and retirement homes, mobile home parks. **Landlord harassment to force a tenant out is an offence under the RTA.** LTB toll-free **1-888-332-3234**.
  - The **rent increase guideline is an annual number — rules table, not embedding.**
  - `scope: region` — Ontario only.

### Source: Residential Tenancies (British Columbia)

- **Country:** Canada
- **Region/State/Province:** **British Columbia (CA-BC)**
- **Category:** Accommodation / tenancy rights
- **Authority:** Tier 3
- **Organization:** Province of British Columbia — Residential Tenancy Branch
- **Source Type:** Official Provincial Government
- **URL:** `https://www2.gov.bc.ca/gov/content/housing-tenancy/residential-tenancies`
- **URL (tenant rights):** `https://www2.gov.bc.ca/gov/content/housing-tenancy/residential-tenancies/during-a-tenancy/tenant-rights`
- **URL (deposits):** `https://www2.gov.bc.ca/gov/content/housing-tenancy/residential-tenancies/starting-a-tenancy/deposits-fees`
- **URL (dispute resolution):** `https://www2.gov.bc.ca/gov/content/housing-tenancy/residential-tenancies/solving-problems/dispute-resolution`
- **RAG Priority:** High (within BC)
- **International Student Specific:** No
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Tenant rights, quiet enjoyment, deposits, dispute resolution
- **Useful Questions:**
  - How much security deposit can a landlord charge in BC?
  - How do I get my damage deposit back in Vancouver?
  - How do I dispute a tenancy problem in BC?
- **Notes:**
  - Verified 2026-08-21 via index: in BC a **security deposit can be no more than half of the first month's rent**; monetary dispute claims are capped at **$35,000**.
  - **Contrast with NSW (four weeks' rent) and Ontario — deposit rules differ by jurisdiction in every country in this registry.** Never generalise a deposit rule.
  - `scope: region` — BC only.

## D. Employment Standards — provincial (Tier 3)

### Source: Employment Standards (Ontario and British Columbia)

- **Country:** Canada
- **Region/State/Province:** **Ontario (CA-ON) · British Columbia (CA-BC)**
- **Category:** Employment rights / minimum wage
- **Authority:** Tier 3
- **Organization:** Government of Ontario · Province of British Columbia
- **Source Type:** Official Provincial Government
- **URL (ON guide):** `https://www.ontario.ca/document/your-guide-employment-standards-act-0`
- **URL (ON minimum wage):** `https://www.ontario.ca/document/your-guide-employment-standards-act-0/minimum-wage`
- **URL (BC):** `https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards`
- **URL (federal, for federally regulated sectors):** `https://www.canada.ca/en/services/jobs/workplace/federal-labour-standards.html`
- **RAG Priority:** High
- **International Student Specific:** No
- **Scrape/Index:** Yes
- **Update Frequency:** **Frequent** (`subject_to_change` — minimum wage changes at least annually)
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Minimum wage, hours of work, overtime, public holidays, vacation, termination
  - That ESA rights **cannot be waived by agreement** and that employers may not penalise employees for exercising them
- **Useful Questions:**
  - What is the minimum wage in Ontario / British Columbia?
  - Can my employer make me sign away my overtime rights?
  - How many hours is a standard work week?
  - My employer is retaliating because I asked about my pay — is that legal?
- **Notes:**
  - Verified 2026-08-21 via index: **BC minimum wage $18.25/hour as of 1 June 2026**. Ontario's *amount* was not readable this pass — **`Not verified`, do not state it** — but the cadence was confirmed: **Ontario rates change each 1 October, indexed to the Ontario Consumer Price Index.** BC and Ontario therefore move on different dates; a single annual refresh will miss one of them.
  - Ontario's ESA position is strong and worth surfacing: **no employee can agree to waive ESA rights; any such agreement is null and void**, and employers are prohibited from penalising employees for exercising them.
  - **`scope: region` — mandatory.** Minimum wage differs by province and there is no meaningful national figure. The federal standards page applies only to **federally regulated sectors** (banking, telecoms, interprovincial transport) — a minority of student jobs, but not zero.
  - Cross-reference the visa document for the **work-hour limit** (24 h/week off campus), which is federal immigration law and entirely separate from provincial employment standards.

## E. Tax, Banking & Fraud — federal (Tier 1)

### Source: Taxes for International Students Studying in Canada

- **Country:** Canada
- **Region/State/Province:** National
- **Category:** Tax obligations
- **Authority:** Tier 1
- **Organization:** Canada Revenue Agency
- **Source Type:** Official Government
- **URL:** `https://www.canada.ca/en/revenue-agency/services/tax/international-non-residents/individuals-leaving-entering-canada-non-residents/international-students-studying-canada.html`
- **URL (P105 Students and Income Tax):** `https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/p105/p105-students-income-tax.html`
- **URL (residency folio S5-F1-C1):** `https://www.canada.ca/en/revenue-agency/services/tax/technical-information/income-tax/income-tax-folios-index/series-5-international-residency/folio-1-residency/income-tax-folio-s5-f1-c1-determining-individual-s-residence-status.html`
- **RAG Priority:** High
- **International Student Specific:** **Yes — dedicated page**
- **Scrape/Index:** Yes
- **Update Frequency:** Annual
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - Residency status for tax purposes: resident, deemed resident, non-resident
  - Significant residential ties and the 183-day rule
  - The SIN requirement for filing
- **Useful Questions:**
  - Do I have to file a Canadian tax return as an international student?
  - Am I a resident or non-resident for Canadian tax purposes?
  - Do I need a SIN to file?
  - Should I file even if I earned nothing?
- **Notes:**
  - Verified 2026-08-21 via index: **non-resident** if no significant residential ties and under 183 days in Canada; **deemed resident** if no significant ties but 183+ days and not treaty-resident elsewhere. CRA states international students **may need to file whether part-time or year-round, even with no Canadian income** — filing can unlock benefit and credit payments.
  - Tax residency ≠ immigration status. Keep strictly separate from the visa document.

### Source: Opening a Bank Account — Know Your Rights (FCAC)

- **Country:** Canada
- **Region/State/Province:** National
- **Category:** Banking
- **Authority:** Tier 1
- **Organization:** Financial Consumer Agency of Canada
- **Source Type:** Official Government
- **URL:** `https://www.canada.ca/en/financial-consumer-agency/services/banking/opening-bank-account.html`
- **URL (rights):** `https://www.canada.ca/en/financial-consumer-agency/services/rights-responsibilities/rights-banking/accounts-rights-responsibilities.html`
- **RAG Priority:** High
- **International Student Specific:** Partially — newcomers explicitly addressed
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - The **right** to open a personal bank account, and the limited grounds on which a bank may refuse
  - Identification requirements
  - Fee disclosure obligations
  - Low-cost and no-cost account eligibility
- **Useful Questions:**
  - Can a Canadian bank refuse to open an account for me?
  - What ID do I need to open a bank account in Canada?
  - Are there free bank accounts for newcomers?
- **Notes:**
  - **The strongest banking source in this registry, by a wide margin.** Canada is the only one of the four countries with a federal, enforceable right-to-open-an-account framework aimed partly at newcomers. Verified 2026-08-21 via index: accounts costing **$0 per month** are available to more groups **including newcomers to Canada in their first year**.
  - Banks may refuse only on specified grounds (suspected illegal/fraudulent use, relevant history in the last 7 years, knowingly false information) — useful when a student is turned away and does not know it can be challenged.

### Source: Canadian Anti-Fraud Centre

- **Country:** Canada
- **Region/State/Province:** National
- **Category:** Fraud / scams / safety
- **Authority:** Tier 1
- **Organization:** Canadian Anti-Fraud Centre (RCMP / Competition Bureau / OPP partnership)
- **Source Type:** Official Government
- **URL:** `https://antifraudcentre-centreantifraude.ca/index-eng.htm`
- **URL (report):** `https://reportcyberandfraud.canada.ca/`
- **URL (victim guidance):** `https://antifraudcentre-centreantifraude.ca/scams-fraudes/victim-victime-eng.htm`
- **RAG Priority:** High
- **International Student Specific:** No — but students are heavily targeted
- **Scrape/Index:** Yes
- **Update Frequency:** **Frequent**
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - How to report fraud and cybercrime
  - Fraud types by medium; what to do as a victim
- **Useful Questions:**
  - I think I've been scammed in Canada — where do I report it?
  - Someone claiming to be from CRA or immigration demanded payment — is it a scam?
- **Notes:**
  - **International students are a documented target for CRA-impersonation and immigration-impersonation scams.** Pair with IRCC's own fraud reporting page (`https://www.canada.ca/en/immigration-refugees-citizenship/services/protect-fraud/report-fraud.html`) when the scam impersonates immigration authorities.

### Source: 9-8-8 Suicide Crisis Helpline (Canada)

- **Country:** Canada
- **Region/State/Province:** National
- **Category:** Mental health / crisis support
- **Authority:** Tier 1 (government-funded)
- **Organization:** Centre for Addiction and Mental Health (CAMH), funded by the Government of Canada
- **Source Type:** Official Government-backed
- **URL:** `https://988.ca/`
- **RAG Priority:** **Highest for crisis**
- **International Student Specific:** No
- **Scrape/Index:** Yes
- **Update Frequency:** Low
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - National three-digit crisis line, phone and text, available anywhere in Canada
- **Useful Questions:**
  - I'm in crisis in Canada — who do I call?
- **Notes:**
  - **Same number as the US (988) but a different service and organisation.** Do not let a US 988 chunk answer a Canada question or vice versa — tag both with `country` and enforce it. Emergency number in Canada is **911**.

## Canada Coverage Summary

| Category | Status | Primary source |
|---|---|---|
| Education system | ✅ | CMEC — provincial responsibility, sector structure |
| Academic responsibilities | ❌ | `Authoritative source not identified` — `institution` scope |
| Tuition & costs | ⚠️ | EduCanada cost pages; no official comparative tool |
| Cost of living | ⚠️ | Cross-reference visa document's IRCC cost-of-living figure (a visa minimum, **not** a real cost estimate) |
| Accommodation | ✅ | `region` — Ontario RTA/LTB, BC RTB |
| Healthcare | ⚠️ | `region` — Alberta ✅, BC ✅, **Ontario `Not verified`** |
| Employment rights | ✅ | `region` — Ontario ESA, BC Employment Standards |
| Tax | ✅ | CRA international students |
| Banking | ✅ | FCAC — the strongest banking source in this registry |
| Transport | ❌ | `Authoritative source not identified` — municipal; no provincial or national resource |
| Consumer & student rights | ⚠️ | Provincial consumer protection; no international-student-specific federal framework (contrast Australia's ESOS) |
| Safety & emergency | ✅ | 911; Canadian Anti-Fraud Centre |
| Student support | ✅ | 988.ca; EduCanada wellness |
| Academic integrity | ❌ | `Authoritative source not identified` — `institution` scope |
| Post-study guidance | ⚠️ | CICIC (professional registration); cross-reference visa document for PGWP |

---

# United Kingdom

**Four nations, not one country, for most of this document.** Education, healthcare (NHS England / NHS Scotland / NHS Wales / HSC Northern Ireland), housing law, and student complaints bodies all differ across England, Scotland, Wales and Northern Ireland. Employment law and tax are largely UK-wide.

The most consequential divergence for this document: **the OIA covers England and Wales only**, and **Scotland uses a 12-level SCQF against the 8-level RQF** used elsewhere.

**Operational advantage:** as with the visa corpus, UK sources are almost entirely **fetchable by a plain crawler**. Build this country first.

## A. Education System & Qualifications

### Source: What Qualification Levels Mean

- **Country:** United Kingdom
- **Region/State/Province:** **England, Wales, Northern Ireland** (Scotland separate)
- **Category:** Education system / qualification framework
- **Authority:** Tier 1
- **Organization:** UK Government
- **Source Type:** Official Government
- **URL:** `https://www.gov.uk/what-different-qualification-levels-mean`
- **RAG Priority:** High
- **International Student Specific:** No
- **Scrape/Index:** Yes — including the linked level-detail pages
- **Update Frequency:** Low — `stable`
- **Last Verified:** 2026-08-21 (**fetched**)
- **Covers:**
  - Qualification difficulty levels and how they compare
  - Separate signposting for England/Wales/NI versus Scotland
- **Useful Questions:**
  - What level is a UK Master's degree?
  - How do UK qualification levels compare to my country's?
- **Notes:**
  - **Fetched 2026-08-21.** The landing page is an overview only — the actual level detail sits on linked pages. **Ingest the children, not just the parent**, or the corpus will contain a page that answers nothing.
  - Explicitly structures content as "England, Wales and Northern Ireland" versus Scotland, and signposts **Skills Development Scotland**, **Careers Wales** and **NI Direct** separately. `scope: region` applies.

### Source: Scottish Credit and Qualifications Framework (SCQF)

- **Country:** United Kingdom
- **Region/State/Province:** **Scotland (GB-SCT)**
- **Category:** Education system / qualification framework
- **Authority:** Tier 2
- **Organization:** SCQF Partnership
- **Source Type:** Official qualifications framework body
- **URL:** `https://scqf.org.uk/`
- **RAG Priority:** High (within Scotland)
- **International Student Specific:** No
- **Scrape/Index:** Yes
- **Update Frequency:** Low — `stable`
- **Last Verified:** 2026-08-21 (**fetched**)
- **Covers:**
  - Scotland's **12-level** qualifications framework
  - Comparison between SCQF and RQF levels
- **Useful Questions:**
  - What is an SCQF level and how does it compare to England?
  - Why is my Scottish degree described differently?
- **Notes:**
  - **Fetched 2026-08-21: the SCQF has 12 levels**, against the RQF's 8. A student comparing a "level 10" qualification across the border is comparing two different things.
  - Scotland also has **four-year undergraduate degrees** as standard against three elsewhere — a material cost and duration difference for international students. `Authoritative source not identified` for a single official page stating this comparison — **flag.**
  - `scope: region` — Scotland only. **This is the clearest example in the registry of why regional tagging is not optional.**

### Source: Quality Assurance Agency for Higher Education (QAA)

- **Country:** United Kingdom
- **Region/State/Province:** UK-wide (with nation-specific arrangements)
- **Category:** Education quality / academic integrity / qualification frameworks
- **Authority:** Tier 2
- **Organization:** QAA — independent charity and quality body
- **Source Type:** Official quality assurance body
- **URL:** `https://www.qaa.ac.uk/`
- **RAG Priority:** High
- **International Student Specific:** No
- **Scrape/Index:** Yes — Quality Code, FHEQ, academic integrity resources
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (**fetched**)
- **Covers:**
  - The **UK Quality Code** (2024 version) with advice and guidance
  - **Framework for Higher Education Qualifications (FHEQ)**
  - **Academic integrity** resources, including guidance on AI
  - Subject Benchmark Statements
- **Useful Questions:**
  - What standards must UK universities meet?
  - What is the FHEQ and where does my degree sit?
  - What are the UK expectations on academic integrity and AI use?
- **Notes:**
  - **Fetched 2026-08-21.** Confirmed to publish both academic integrity guidance and the FHEQ.
  - **The UK's closest analogue to TEQSA's academic integrity toolkit**, though QAA is a charity and membership body rather than a statutory regulator. Tier 2, not Tier 1.
  - **Actual misconduct penalties remain `institution` scope.**

## B. Student Rights & Complaints

### Source: Office of the Independent Adjudicator for Higher Education (OIA)

- **Country:** United Kingdom
- **Region/State/Province:** **England and Wales only**
- **Category:** Student complaints / dispute resolution / student rights
- **Authority:** Tier 2
- **Organization:** OIA
- **Source Type:** Independent statutory student complaints body
- **URL:** `https://www.oiahe.org.uk/`
- **RAG Priority:** High (England and Wales)
- **International Student Specific:** No — but covers international students
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (**fetched**)
- **Covers:**
  - Free, independent review of student complaints about higher education providers
  - Academic appeals, institutional procedures, student experience complaints
- **Useful Questions:**
  - I've exhausted my university's complaints process — who else can I go to?
  - Can I appeal an academic decision beyond my university?
  - Is complaining free?
- **Notes:**
  - **Fetched 2026-08-21.** Confirmed: **"the independent, free, student complaints body"**, covering **England and Wales**.
  - **`scope: region` — critical.** A student in **Scotland** goes to the **Scottish Public Services Ombudsman**; a student in **Northern Ireland** has different arrangements. **`Authoritative source not identified` for both this pass — flag as a real gap.** Sending a Scottish student to the OIA wastes their time and may run down a complaint deadline.
  - Sequence: exhaust the provider's internal process first, then the OIA. Same pattern as Australia's Ombudsman.

### Source: UKCISA — UK Council for International Student Affairs

- **Country:** United Kingdom
- **Region/State/Province:** UK-wide
- **Category:** Cross-cutting international student advice
- **Authority:** **Tier 5 — non-government charity**
- **Organization:** UKCISA (registered charity 1095294)
- **Source Type:** **Non-government national advisory body**
- **URL:** `https://www.ukcisa.org.uk/`
- **RAG Priority:** **Low — fallback only, explicitly labelled**
- **International Student Specific:** **Yes — exclusively**
- **Scrape/Index:** Yes, **with a mandatory `authority_tier: 5` tag and suppression active**
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (**fetched**)
- **Covers:**
  - Fees and fee status · working · finances · life in the UK · accommodation
- **Useful Questions:**
  - What is my fee status and why am I charged overseas fees?
  - What practical things do I need to sort out on arrival in the UK?
- **Notes:**
  - **Fetched 2026-08-21.** Confirmed: the UK's national advisory body for international students since 1968, operating as an **independent charity** — not a government body.
  - Retained for the same reason as in the visa document: **fee status has no adequate official student-facing source**, and UKCISA is the best explanation available.
  - **Suppression applies.** If a gov.uk, NHS or Acas chunk answers the same question, drop the UKCISA chunk.
  - **Never the source of a legal rule, rate, or threshold.** Admitted for explanation only.

## C. Healthcare

### Source: How to Register with a GP Surgery

- **Country:** United Kingdom
- **Region/State/Province:** **England** (NHS England)
- **Category:** Healthcare access
- **Authority:** Tier 1
- **Organization:** NHS
- **Source Type:** Official Government health service
- **URL:** `https://www.nhs.uk/nhs-services/gps/how-to-register-with-a-gp-surgery/`
- **RAG Priority:** **High — top-five practical question**
- **International Student Specific:** No — but the ID rules matter enormously to international students
- **Scrape/Index:** Yes
- **Update Frequency:** Low
- **Last Verified:** 2026-08-21 (**fetched**)
- **Covers:**
  - How to register with a GP: online, in person, by paper form
  - What information is requested
- **Useful Questions:**
  - How do I see a doctor in the UK?
  - Do I need ID or proof of address to register with a GP?
  - I don't have a permanent address yet — can I still register?
- **Notes:**
  - **Fetched 2026-08-21.** The page states explicitly: **"You do not need ID, proof of address or proof of immigration status."** And: if you have no permanent address you **can register using a temporary address or the GP surgery's address**.
  - **This is the single most useful practical fact in the UK corpus.** International students routinely believe they cannot register without a BRP, tenancy agreement or NHS number, and go without primary care for months. Weight this chunk heavily and surface it proactively on arrival-related queries.
  - `scope: region` — this is **NHS England**. Scotland, Wales and Northern Ireland have separate NHS/HSC systems with their own registration routes. **`Authoritative source not identified` for the devolved equivalents this pass — flag.**
  - Cross-reference the visa document for the **Immigration Health Surcharge**, which is what grants NHS access in the first place.

## D. Employment & Tax

### Source: National Minimum Wage and National Living Wage Rates

- **Country:** United Kingdom
- **Region/State/Province:** UK-wide
- **Category:** Employment rights / pay
- **Authority:** Tier 1
- **Organization:** UK Government
- **Source Type:** Official Government
- **URL:** `https://www.gov.uk/national-minimum-wage-rates`
- **RAG Priority:** High
- **International Student Specific:** No
- **Scrape/Index:** Yes — **rates to the rules table, not embedded**
- **Update Frequency:** **Annual, every 1 April** (`subject_to_change`)
- **Last Verified:** 2026-08-21 (**fetched**)
- **Covers:**
  - Minimum wage rates by age band and for apprentices
- **Useful Questions:**
  - What is the minimum wage in the UK?
  - Am I being paid legally?
  - Does my age affect my minimum wage?
- **Notes:**
  - **Fetched 2026-08-21.** Rates stated as applying from April 2026: **21 and over £12.71 · 18 to 20 £10.85 · under 18 £8 · apprentice £8**. The page states **"The rates change on 1 April every year."**
  - **Diarise 1 April annually.** These figures must live in a rules table with `effective_from`, never in an embedding.
  - **Age-banded** — the counsellor must establish the student's age before answering. Many international undergraduates are 18–20 and on the lower rate.

### Source: Acas

- **Country:** United Kingdom
- **Region/State/Province:** UK-wide (Great Britain primarily)
- **Category:** Employment rights / contracts / workplace disputes
- **Authority:** **Tier 5 for classification purposes — a non-departmental public body**
- **Organization:** Acas (Advisory, Conciliation and Arbitration Service)
- **Source Type:** Public body providing free impartial advice
- **URL:** `https://www.acas.org.uk/`
- **RAG Priority:** Medium–High
- **International Student Specific:** No
- **Scrape/Index:** Yes — advice sections
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (**fetched**)
- **Covers:**
  - Free, impartial advice on workplace rights, rules and best practice
  - Employment contract templates and policy documents
  - Dispute resolution before employment tribunal
- **Useful Questions:**
  - What should be in my UK employment contract?
  - My employer isn't paying me correctly — what can I do?
  - How do I resolve a workplace dispute without going to tribunal?
- **Notes:**
  - **Fetched 2026-08-21.** Confirmed to give **"employees and employers free, impartial advice on workplace rights, rules and best practice"**.
  - The homepage did **not** state Acas's statutory basis. Acas is a Crown non-departmental public body — **treat as authoritative on employment advice but verify the statutory framing before asserting it.**
  - **Complements the visa document**, which owns the work-hour condition. Acas owns contracts, pay disputes and tribunals.

### Source: Apply for a National Insurance Number

- **Country:** United Kingdom
- **Region/State/Province:** UK-wide
- **Category:** Tax / working
- **Authority:** Tier 1
- **Organization:** UK Government / HMRC
- **Source Type:** Official Government
- **URL:** `https://www.gov.uk/apply-national-insurance-number`
- **RAG Priority:** High
- **International Student Specific:** Partially
- **Scrape/Index:** Yes
- **Update Frequency:** Low
- **Last Verified:** 2026-08-21 (**fetched**)
- **Covers:**
  - Who must apply for a National Insurance number
  - Whether you can start work before it arrives
  - Processing time
- **Useful Questions:**
  - Do I need a National Insurance number to work in the UK?
  - Can I start my job before my NI number arrives?
  - How long does an NI number take?
- **Notes:**
  - **Fetched 2026-08-21.** You must apply if you live in the UK, have the right to work, and are working, looking for work, or hold a job offer. **You can start work before the number arrives if you can prove your right to work.** It **can take up to 4 weeks**. The number **remains the same for life**.
  - **The "can I start work without it" answer is the one students actually need**, and it is commonly answered wrongly by employers as well as agents. Surface it proactively.

## E. Housing & Safety

### Source: Private Renting

- **Country:** United Kingdom
- **Region/State/Province:** **England**
- **Category:** Accommodation / tenancy
- **Authority:** Tier 1
- **Organization:** UK Government
- **Source Type:** Official Government
- **URL:** `https://www.gov.uk/private-renting`
- **RAG Priority:** High (England)
- **International Student Specific:** No
- **Scrape/Index:** Yes — **the guide's child pages, not just the landing page**
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (**fetched**)
- **Covers:**
  - Tenancy types (assured periodic, excluded, regulated)
  - Links to: rights and responsibilities, repairs, deposits, evictions
- **Useful Questions:**
  - What type of tenancy do I have in England?
  - What are my rights as a private tenant?
  - How is my deposit protected?
  - Can my landlord evict me?
- **Notes:**
  - **Fetched 2026-08-21.** The landing page **only categorises tenancy types** — rights, repairs, deposits and evictions are all on separate child pages. **Ingesting the parent alone yields a chunk that cannot answer any of the useful questions above.** Enumerate and ingest the children.
  - `scope: region` — content is **England-specific**; the page itself references "evictions in England". **Scotland, Wales and Northern Ireland have materially different tenancy regimes.** `Authoritative source not identified` for the devolved equivalents this pass — **flag as a real gap.**
  - The page references a **National Code of practice for student housing** — worth confirming and ingesting separately. **Not verified this pass.**

### Source: Report Fraud (formerly Action Fraud)

- **Country:** United Kingdom
- **Region/State/Province:** **England, Wales and Northern Ireland** (Scotland differs)
- **Category:** Fraud / cybercrime / safety
- **Authority:** Tier 1
- **Organization:** City of London Police — national policing lead for fraud
- **Source Type:** Official Government / policing
- **URL:** `https://www.reportfraud.police.uk/`
- **URL (guide):** `https://www.actionfraud.police.uk/reporting-fraud-and-cyber-crime`
- **URL (police reporting):** `https://www.police.uk/pu/contact-us/what-and-how-to-report/how-to-report/`
- **RAG Priority:** High
- **International Student Specific:** No — but students are heavily targeted
- **Scrape/Index:** Yes
- **Update Frequency:** Moderate
- **Last Verified:** 2026-08-21 (index-confirmed)
- **Covers:**
  - National reporting centre for fraud and cybercrime
  - When to call 999 versus 101
- **Useful Questions:**
  - I've been scammed in the UK — where do I report it?
  - What's the difference between 999 and 101?
  - Someone claiming to be from the Home Office demanded payment — is this a scam?
- **Notes:**
  - **Brand/URL migration verified 2026-08-21 via index: the service now operates as "Report Fraud" at `reportfraud.police.uk`, with `actionfraud.police.uk` still resolving.** Prefer `reportfraud.police.uk` as canonical; keep the Action Fraud name as a retrieval alias since students and older guidance still use it.
  - **999** for emergencies, **101** for non-emergencies. Reporting line **0300 123 2040**.
  - `scope: region` — **in Scotland, fraud is reported to Police Scotland on 101**, not to the national centre. Do not generalise.
  - Immigration- and Home-Office-impersonation scams specifically target international students. Pair with the visa document when a student describes a demand for payment relating to their visa.

## UK Coverage Summary

| Category | Status | Primary source |
|---|---|---|
| Education system / qualifications | ✅ | gov.uk qualification levels + SCQF (Scotland) + QAA FHEQ |
| Academic responsibilities | ⚠️ | QAA Quality Code (sector expectations); specifics are `institution` |
| Tuition & fee status | ⚠️ | UKCISA (Tier 5) — no adequate official source. **Real gap.** |
| Cost of living | ⚠️ | gov.uk *Understanding student living costs* — cross-reference visa document; keep separate from the visa maintenance requirement |
| Accommodation | ⚠️ | gov.uk Private renting (**England only**); devolved nations unsourced |
| Healthcare | ✅ | NHS GP registration (**England**); IHS in visa document |
| Employment rights | ✅ | gov.uk minimum wage + Acas |
| Tax | ✅ | gov.uk National Insurance number |
| Banking | ❌ | `Authoritative source not identified` |
| Transport | ❌ | `Authoritative source not identified` — no national student concession; operator- and region-specific |
| Consumer & student rights | ⚠️ | OIA (**England and Wales only**); Scotland and NI unsourced |
| Safety & emergency | ✅ | 999 / 101; Report Fraud |
| Student support | ⚠️ | UKCISA (Tier 5); institution-level otherwise |
| Academic integrity | ✅ | QAA academic integrity resources |
| Post-study guidance | ⚠️ | Cross-reference visa document (Graduate route) |

---

# Cross-Country Source Coverage Matrix

`✅` authoritative source identified and verified · `⚠️` partial, indirect, regional-only, or identified but unverified · `❌` no suitable authoritative source identified

| Category | US | Australia | Canada | UK |
|---|---|---|---|---|
| Education system | ✅ | ✅ | ✅ | ✅ |
| Qualification framework | ⚠️ | ✅ | ⚠️ | ✅ |
| Quality assurance / accreditation | ✅ | ✅ | ⚠️ | ✅ |
| Academic responsibilities | ⚠️ | ✅ | ❌ | ⚠️ |
| Tuition & fee rules | ✅ | ✅ | ⚠️ | ⚠️ |
| Tuition protection / provider default | ❌ | ✅ | ❌ | ❌ |
| Cost of living | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Accommodation & tenancy | ✅ | ✅ | ✅ | ⚠️ |
| Healthcare access | ❌ | ✅ | ⚠️ | ✅ |
| Mental health / crisis | ✅ | ⚠️ | ✅ | ⚠️ |
| Employment rights | ✅ | ✅ | ✅ | ✅ |
| Employment exploitation reporting | ✅ | ✅ | ⚠️ | ✅ |
| Tax | ✅ | ✅ | ✅ | ✅ |
| Banking | ⚠️ | ❌ | ✅ | ❌ |
| Transport | ❌ | ✅ | ❌ | ❌ |
| Consumer & student rights | ✅ | ✅ | ⚠️ | ⚠️ |
| Complaints / dispute resolution | ✅ | ✅ | ⚠️ | ⚠️ |
| Safety & emergency | ✅ | ✅ | ✅ | ✅ |
| Fraud & scam reporting | ⚠️ | ✅ | ✅ | ✅ |
| Online safety regulator | ❌ | ✅ | ❌ | ❌ |
| Student support & wellbeing | ✅ | ✅ | ✅ | ⚠️ |
| Cultural / community integration | ❌ | ✅ | ⚠️ | ❌ |
| Academic integrity | ❌ | ✅ | ❌ | ✅ |
| Post-study (non-visa) | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| International-student-specific Tier 1 framework | ❌ | ✅ | ❌ | ❌ |
| Machine-fetchable without stealth crawler | ❌ | ⚠️ | ❌ | ✅ |

### Reading the matrix

Four patterns matter more than any individual cell:

1. **Australia is in a different class for international student protection.** It is the only country with a Tier 1, statutory, internationally-student-*specific* framework (ESOS + National Code + Overseas Students Ombudsman + Tuition Protection Service). The other three treat international students as a subset of students, or of migrants. Where an Australian answer exists, it is usually better sourced than its equivalent elsewhere.
2. **Transport is the weakest row across all four.** No country has a national student transport resource. It is state, provincial, municipal or operator-level everywhere. Either scope it out or accept region-only coverage.
3. **`❌` frequently means "the thing does not exist", not "we failed to find it."** There is no US federal student healthcare scheme, no Canadian or UK tuition protection statute, no US or Canadian national academic integrity standard. **The counsellor must say "this is not centrally regulated in this country — it is set by your institution / your state" rather than "I don't know."** Encode these as explicit negative facts.
4. **The UK is the only fetchable column**, exactly as in the visa document. Build it first for the same reason.

---

# RAG Ingestion Recommendations

## High-priority sources — always prefer these

Retrieval should weight these above everything else in their category:

| Country | Source | Why |
|---|---|---|
| **AU** | ESOS framework + National Code 2018 | Tier 1, statutory, international-student-specific. Nothing else in this registry matches it. |
| **AU** | Overseas Students Ombudsman | The authoritative answer to every "who do I complain to" question — with a jurisdictional caveat. |
| **AU** | Fair Work Ombudsman international students fact sheet | Carries the "you won't lose your visa for reporting" reassurance. |
| **US** | IRS foreign students cluster | The Form 8843 obligation is near-universally unknown and near-universally applicable. |
| **US** | DOL Wage and Hour Division | Enforcement is immigration-status-blind — high-value reassurance. |
| **CA** | CMEC education overview | Framing chunk. Retrieve alongside *every* provincial answer. |
| **CA** | FCAC banking rights | The strongest banking source in the registry. |
| **UK** | NHS GP registration | "You do not need ID, proof of address or proof of immigration status" — the highest-impact practical fact here. |
| **UK** | gov.uk National Insurance number | Answers "can I start work before it arrives", which employers get wrong. |
| **All** | Crisis lines (988 US, 988.ca CA, 999/101 UK, 000 AU) | **Must bypass normal ranking.** Any crisis-indicating query surfaces these immediately. |

## Frequently changing — high refresh priority

Re-scrape monthly or on change signal. **All numeric values belong in a rules table with `effective_from` and `verified_on`, never in an embedding.**

| Content | Country | Cadence |
|---|---|---|
| Minimum wage rates | All four | **UK: diarise 1 April.** **CA: provincial and staggered — BC 1 June, Ontario 1 October (CPI-indexed); one annual check will miss one.** US: federal static since 2009 but **state rates move**. AU: award rates, annual. |
| Transport concession eligibility and fares | AU (NSW Opal, VIC iUSEpass), CA, UK | Quarterly — eligibility rules and participating institutions change without notice |
| Provincial health coverage rules and fees | CA | Quarterly — BC health fee, AB permit thresholds |
| Rent increase guidelines, bond/deposit caps | AU (state), CA (province), UK | Annual minimum |
| Scam typologies | All four | **Monthly** — Scamwatch, CAFC, Report Fraud |
| Tuition and cost-of-attendance data | US (College Navigator) | Annual, IPEDS cycle |
| Title IX regulations | US | **On change signal** — repeatedly amended and litigated |
| Tax rules, thresholds, filing addresses | All four | Annual, per tax year |
| Employment standards | CA (provincial), AU | Annual |

## Static / reference — safe long-lived embeddings

Build the corpus here first; these are the stable foundation.

- AQF levels and qualification types (AU)
- SCQF and RQF level structures (UK)
- QAA Quality Code and FHEQ (UK)
- CMEC education system overview and provincial-responsibility framing (CA)
- US accreditation structure and the recognised-accreditor model
- ESOS Act and National Code 2018 clause text (AU) — the *framework*, not the guidance around it
- Residential Tenancies Act structure (CA-ON), Residential Tenancy Act structure (CA-BC)
- Emergency numbers (911 / 999 / 000)
- IRS "exempt individual" and substantial presence test concepts (US)

## Regional sources — mandatory tagging

**The RAG system must not retrieve a regional rule and present it as a country-wide rule.** Every source below carries `scope: region` plus a region code, and the counsellor must name the region in its answer or ask which region applies.

| Country | Regions with distinct rules in this registry | Categories affected |
|---|---|---|
| **US** | All 50 states | Tenancy (HUD state pages), minimum wage above federal floor, driving, transport |
| **Australia** | AU-VIC, AU-NSW, AU-SA (+ QLD, WA unsourced) | Tenancy, consumer rights, transport concessions, student support programs |
| **Canada** | CA-ON, CA-BC, CA-AB, CA-QC | **Healthcare, tenancy, employment standards, consumer protection** — i.e. almost everything |
| **UK** | GB-ENG, GB-SCT, GB-WLS, GB-NIR | Qualification framework, tenancy, healthcare system, student complaints body, fraud reporting |

### Three regional traps the counsellor must be built to avoid

1. **Australian transport concessions.** In **NSW** most international students are **not** eligible for concession Opal fares (only Endeavour, Australia Awards and RTP scholarship holders). In **Victoria** international undergraduates get a dedicated 50%-off annual pass (iUSEpass). Opposite answers to the same question. Never answer without the state.
2. **Canadian healthcare.** Alberta covers eligible students, BC requires MSP with a waiting period, Ontario appears to route students to UHIP instead. Three provinces, three different answers, same question.
3. **UK student complaints.** The OIA covers **England and Wales only**. Sending a Scottish student there may cost them their complaint window.

## Handling conflicts

1. **Tier beats similarity.** Drop the lower-tier chunk from context rather than including both.
2. **Regional beats national for a regional question** — but only when the region is established. If the student's region is unknown, **ask** rather than defaulting to the most common one.
3. **National beats regional for a question about the framework itself** (e.g. "how does Canadian education work" → CMEC, not Ontario).
4. **The rule-making body beats the summariser.** ESOS legislation over an education portal; provincial tenancy branch over EduCanada.
5. **When two sources genuinely conflict and neither is clearly newer, say so and link both.** Do not synthesise.
6. **`institution` scope always wins for institution-set matters** — and the correct answer is a redirect, not a guess. Academic integrity penalties, grading, attendance policies, and US financial thresholds all fall here.

## Cross-referencing the visa document

Retrieval should return **both** documents' chunks, clearly labelled, for these queries:

| Query type | This document | Visa document |
|---|---|---|
| "Can I work while studying?" | Employment rights, minimum wage, exploitation reporting | The hour limit and visa condition |
| "Do I need health insurance?" | How to access care, register, emergencies | Whether cover is a visa requirement (OSHC, IHS) |
| "How much money do I need?" | Real cost of living, tuition payment, banking | The proof-of-funds visa threshold |
| "What happens after I graduate?" | Professional registration, credential recognition, careers | Post-study work visa routes |
| "What are my responsibilities?" | Academic progression, provider obligations | Visa conditions and reporting |

**Never let this document answer a visa question, or the visa document answer a rights question.** The failure mode is subtle and damaging: quoting a visa *minimum* as a living-cost estimate, or a *work-rights* page as a work-hours limit.

---

# Verification / Maintenance

## What this pass verified

**Fetched and read directly (2026-08-21):**
`gov.uk/what-different-qualification-levels-mean` · `gov.uk/private-renting` · `gov.uk/national-minimum-wage-rates` · `gov.uk/apply-national-insurance-number` · `nhs.uk` GP registration · `ukcisa.org.uk` · `oiahe.org.uk` · `qaa.ac.uk` · `acas.org.uk` · `scqf.org.uk` · `tps.gov.au` (redirect confirmed)

**Index-confirmed** (URL and ownership live; body unreadable): all `education.gov.au`, `aqf.edu.au`, `ombudsman.gov.au`, `teqsa.gov.au`, `fairwork.gov.au`, `ato.gov.au`, `scamwatch.gov.au`, `esafety.gov.au`, `irs.gov`, `dol.gov`, `hud.gov`, `ed.gov`, `nces.ed.gov`, `consumerfinance.gov`, `canada.ca`, `ontario.ca`, `www2.gov.bc.ca`, `alberta.ca`, `cmec.ca`, `educanada.ca`, `consumer.vic.gov.au`, `nsw.gov.au`, `transportnsw.info` sources.

## URL changes recorded

| Old | Current | Evidence |
|---|---|---|
| `https://tps.gov.au/` | `https://education.gov.au/tps` | **301 Moved Permanently**, confirmed by direct fetch 2026-08-21 |
| `actionfraud.police.uk` (brand) | `reportfraud.police.uk` | Service now operates as "Report Fraud"; old domain still resolves. Keep "Action Fraud" as a retrieval alias. |

## Ingestion traps found this pass

Three sources will produce useless chunks if ingested naively:

1. **`gov.uk/private-renting`** — the landing page only categorises tenancy types. Rights, repairs, deposits and evictions are all child pages. Ingest the children.
2. **`gov.uk/what-different-qualification-levels-mean`** — an overview that defers all level detail to linked pages. Ingest the children.
3. **`ope.ed.gov/dapip`** and **`nces.ed.gov/collegenavigator`** — interactive databases. Referral targets, never scraped.

## Requiring manual verification

Ordered by how much damage a wrong answer does:

1. **Ontario OHIP eligibility for international students.** Conflicting signals: the Ontario page did not yield international-student criteria, while EduCanada states Ontario students must use UHIP. **The counsellor must not answer this until confirmed.**
2. **Ontario minimum wage amount.** BC verified ($18.25 from 1 June 2026). Ontario's rate could not be read this pass — but the cadence was confirmed: **Ontario rates change each 1 October, indexed to the Ontario Consumer Price Index.** Do not state the Ontario amount until fetched.
3. **Victorian iUSEpass postgraduate eligibility.** The 50% undergraduate concession is confirmed; whether postgraduates qualify is not stated in indexed content.
4. **State ombudsmen covering Australian public universities.** The Overseas Students Ombudsman covers *private* providers only. The public-university route is unsourced — a closable gap that currently sends students to the wrong body.
5. **Scottish and Northern Irish student complaints bodies.** The OIA covers England and Wales only.
6. **Devolved-nation NHS registration routes** (Scotland, Wales, Northern Ireland).
7. **Devolved-nation tenancy regimes** (Scotland, Wales, Northern Ireland).
8. **US state minimum wage consolidated page** — DOL publishes a state map; URL unconfirmed.
9. **ED Office for Civil Rights Title VI page** (national-origin discrimination) — directly relevant, URL unconfirmed.
10. **ASQA** (Australian VET regulator) — URL unconfirmed.
11. **Study Queensland and StudyPerth** — believed to exist, domains unconfirmed.
12. **CICIC** — not fetched directly.
13. **UK National Code of practice for student housing** — referenced by gov.uk, not verified.
14. **Scottish four-year degree structure** — no single official comparison page identified.

## Known structural gaps

| Gap | Impact |
|---|---|
| **No stealth-capable fetcher** | US, AU and CA corpora cannot be built. **Blocking**, same as the visa document. |
| **Transport, all four countries** | No national resource anywhere. Region-only or scope out. |
| **Banking for US, AU, UK** | Only Canada has a federal right-to-open-an-account framework. Elsewhere it is bank-set and unsourceable. |
| **Academic integrity for US and Canada** | No national standard exists. `institution` scope. Must be an explicit redirect, not a gap in the answer. |
| **Cost of living, all four** | Official figures are either visa minimums (deliberately below real cost) or institution-level. **Never blend a visa minimum with a living-cost estimate** — cross-reference the visa document's warning. |
| **Cultural integration outside Australia** | Australia's state portals are excellent; the US, Canada and UK have no government equivalent. |

## Before ingestion — do these in order

1. **Solve the fetch problem.** Same blocker as the visa document. One solution serves both corpora.
2. **Build the UK corpus first** — fully fetchable, and its child-page traps are now documented.
3. **Build the regional tagging schema before ingesting anything regional.** Canada in particular is unusable without it: healthcare, tenancy and employment standards are all provincial, and an untagged Canadian corpus will confidently give Ontario answers to BC students.
4. **Put every rate, threshold, fee and concession rule in a rules table.** Minimum wages, deposit caps, health fees, rent guidelines. None of them belong in an embedding.
5. **Wire the crisis-line bypass** before launch. A student in crisis must not be subject to normal retrieval ranking.
6. **Write the `institution` redirects.** Academic integrity penalties, grading, attendance, US financial thresholds, UHIP administration. The counsellor should say "your institution sets this — here is who to ask", not improvise.
