# Country-Wise Student Visa RAG Sources — US · AU · CA · UK

**Owner:** AI Counsellor knowledge base
**Supersedes:** `docs/research/country-rag-source-audit.md` — 12-country immigration + living-costs audit, 2026-08-20. That file has been removed; this document replaces it.
**Scope of this document:** authoritative **student visa** sources only, for four destinations
**Last full verification pass:** 2026-08-21

---

## Purpose

This is a **source registry**, not a knowledge base. It tells the RAG ingestion pipeline *which pages to fetch, how much to trust them, and what questions each one is allowed to answer.*

It exists because the AI counsellor answers immigration questions, and an immigration answer that is confidently wrong is a liability. Every entry below names an official government page, states why it is in the corpus, and states what it is authorised to answer.

**In scope:** student visa category, eligibility, application process, documents, finances, English (visa layer), health insurance, medicals, biometrics, character, fees, processing, conditions, work rights, dependants, duration, extension, provider/course change, arrival, post-study work transition.

**Out of scope** (belongs in separate country-education knowledge documents): why study in country X, rankings, lifestyle, generic cost-of-living, tuition price comparison, admission/academic entry requirements, credential equivalency, intakes and deadlines.

---

## Source Priority Rules

| Tier | Definition | Retrieval treatment |
|---|---|---|
| **Tier 1** | The department that **makes or administers** the visa rule — Home Affairs, IRCC, UKVI/Home Office, DHS/USCIS/ICE/State | Primary. Always retrievable. Always cited. |
| **Tier 2** | Official government body that **publishes but does not make** the rule — Study Australia (Austrade), EduCanada, EducationUSA | Supporting. Use for plain-language phrasing and process narrative. Never the sole basis for a number. |
| **Tier 3** | Institutional (a university's own visa page) | Only where genuinely unique. **This registry contains none** — see §"Why there are no Tier 3 sources". |
| **Tier 4** | Reputable non-government secondary | Fallback only, explicitly labelled. **One entry** in this registry (UKCISA). |

### Hard rules

1. **Suppression, not reranking.** When a Tier 1 chunk and a Tier 3/4 chunk both answer the same country+topic question, drop the lower-tier chunk from the context entirely. A weaker chunk left in the prompt is a hallucination invitation.
2. **No agent, blog, consultant, forum or SEO source enters the corpus.** Not downgraded — excluded.
3. **Numbers are not embedded.** Thresholds, fees and hour caps live in a structured rules table with `effective_from` and `verified_on`. Prose chunks say "the current requirement", never the figure. See "RAG Ingestion Recommendations".
4. **Visa-layer English ≠ institution-layer English.** The visa English requirement (CEFR B2, IELTS thresholds) is in scope. What a university asks for is not, and the two must never be merged in one answer.
5. **Provider/course legitimacy rules are in scope; provider lookups are not.** "The course must be CRICOS-registered" is a visa rule and is included. Checking whether a named college qualifies is not covered by this registry.

---

## Fetchability — read this before building the crawler

Verified 2026-08-21 by direct fetch:

| Domain | Automated fetch | Consequence for ingestion |
|---|---|---|
| `gov.uk` | ✅ 200 | Fetches cleanly. The UK corpus can be built with a plain crawler today. |
| `studyaustralia.gov.au` | ✅ 200 | Only Australian government domain in this registry that fetches. |
| `immi.homeaffairs.gov.au` | ❌ **403** | URL existence confirmed via search index only. Content never read by this pass. |
| `canada.ca` / `ircc.canada.ca` | ❌ **403** | Same. |
| `travel.state.gov` | ❌ **403** | Same. |
| `uscis.gov` | ❌ **403** | Same. |
| `studyinthestates.dhs.gov` | ❌ **403** | Same. |
| `ice.gov` | ❌ **403** | Same. |

**A naive crawler produces an empty or error-page corpus for the US, Australia and Canada, silently.** Budget a browser-based/stealth fetcher before ingestion. This is the single highest-priority engineering prerequisite in this document.

Every `Scrape/Index: Yes` below is conditional on solving this.

---

## Verification legend

Each entry carries a **Verification** note:

- **Fetched** — page body retrieved and read on the stated date.
- **Index-confirmed** — URL and ownership confirmed via search index; body not readable (403). URL is live, content is second-hand.
- **Not verified** — carried forward from the prior audit, not re-confirmed this pass. Treat as a to-do.

Facts marked `Not verified` or `Authoritative source not identified` must never be presented by the counsellor as fact.

---

# United States

**Authority split.** The **Department of State** owns the *visa* (eligibility, DS-160, interview, issuance). **DHS** owns the *status* — SEVP/SEVIS, the I-20, maintaining status, and work authorisation, split across USCIS (adjudication and policy), ICE (SEVIS and the I-901 fee) and Study in the States (SEVP guidance).

**Structural facts the counsellor must encode:**
- There is **no federally set financial threshold** for F-1. The required amount is the cost of attendance on the school's Form I-20. Any specific dollar figure quoted as "the US requirement" is wrong.
- **The interview is a discretionary decision point.** Consular officers assess non-immigrant intent under INA 214(b). There is no published points test. The counsellor must not imply a checklist guarantees approval.

## Official Immigration / Visa Sources (Tier 1)

### Source: USCIS Policy Manual, Volume 2, Part F — Students (F, M)

- **Country:** United States
- **Category:** Student visa status / eligibility / practical training / employment / change of status
- **Authority:** U.S. Citizenship and Immigration Services (DHS)
- **Source Type:** Official Government — policy manual
- **URL:** `https://www.uscis.gov/policy-manual/volume-2-part-f`
- **RAG Priority:** Tier 1 — **highest retrieval priority for the US**
- **Scrape/Index:** Yes — ingest all chapters
- **Useful For:**
  - F and M eligibility requirements (Ch. 2)
  - Full course of study, reduced course load (Ch. 3)
  - School transfer / changing education provider (Ch. 4)
  - Practical training — CPT, OPT, STEM OPT (Ch. 5)
  - Employment (Ch. 6)
  - Absences from the United States (Ch. 7)
  - Change of status, extension of stay, length of stay (Ch. 8)
- **Notes:**
  - The best-structured US source in existence for retrieval: numbered chapters, legal citations, explicit version history. **The chapter section is the natural chunk.**
  - Confirmed chapters 1–8. The prior audit referenced a "Chapter 9 — Dependents"; **not confirmed this pass** — treat F-2/M-2 dependant rules as sourced from Study in the States instead until verified.
  - 403 to automated fetch.
- **Verification:** Index-confirmed 2026-08-21 (chapter list confirmed via USCIS index)
- **Last Verified:** 2026-08-21

### Source: Student Visa (F/M) — Department of State

- **Country:** United States
- **Category:** Visa application process / interview / fees / documents
- **Authority:** U.S. Department of State, Bureau of Consular Affairs
- **Source Type:** Official Government
- **URL:** `https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - The consular half of the process — DS-160, interview, issuance
  - What the F visa is versus F status
  - Required documents at the interview
  - Visa versus entry (a visa does not guarantee admission)
- **Notes:**
  - Pairs with USCIS Policy Manual: State = getting the visa, USCIS/SEVP = keeping the status. Retrieval should return both for "how do I get a US student visa".
  - 403 to automated fetch.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: DS-160 Online Nonimmigrant Visa Application

- **Country:** United States
- **Category:** Application portal / forms
- **Authority:** U.S. Department of State
- **Source Type:** Official Government — application portal + guidance
- **URL (guidance):** `https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/forms/ds-160-online-nonimmigrant-visa-application.html`
- **URL (FAQ):** `https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/forms/ds-160-online-nonimmigrant-visa-application/ds-160-faqs.html`
- **URL (portal):** `https://ceac.state.gov/genniv/`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Guidance + FAQ **Yes**. Portal **No** — link only.
- **Useful For:**
  - How the US application is actually submitted
  - DS-160 confirmation page requirement for the interview
  - Interview scheduling is arranged with the specific embassy/consulate, not centrally
- **Notes:**
  - `ceac.state.gov/genniv/` is an interactive session-based form. **Never scrape.** Use strictly as a referral link at the end of an answer.
  - The FAQ is natively Q&A-shaped — good chunk boundaries.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: I-901 SEVIS Fee

- **Country:** United States
- **Category:** Visa fees / additional government charges
- **Authority:** U.S. Immigration and Customs Enforcement (DHS)
- **Source Type:** Official Government
- **URL:** `https://www.ice.gov/sevis/i901`
- **URL (FAQ):** `https://www.ice.gov/sevis/i901/faq`
- **URL (SEVP guidance):** `https://studyinthestates.dhs.gov/students/prepare/paying-the-i-901-sevis-fee`
- **URL (payment portal):** `https://www.fmjfee.com`
- **RAG Priority:** Tier 1
- **Scrape/Index:** ICE pages + SEVP page **Yes**. `fmjfee.com` **No** — payment portal, link only.
- **Useful For:**
  - Which fee is which — the I-901 SEVIS fee is separate from the MRV visa application fee
  - When it must be paid (before the visa interview)
  - Who is exempt
- **Notes:**
  - **Fee amounts are volatile — store in the rules table, never in an embedded chunk.**
  - Verified 2026-08-21: **USD 350** for F and M; **USD 220** for most J; **USD 35** for J au pair / camp counselor / summer work-travel.
  - Students routinely confuse this with the MRV fee. Worth an explicit disambiguation chunk.
- **Verification:** Index-confirmed 2026-08-21 (amounts confirmed via ICE index snippets)
- **Last Verified:** 2026-08-21

### Source: Fees for Visa Services (MRV)

- **Country:** United States
- **Category:** Visa application fees
- **Authority:** U.S. Department of State
- **Source Type:** Official Government
- **URL:** `https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/fees/fees-visa-services.html`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - The MRV (visa application) fee for student and exchange visitor visas
  - Reciprocity / visa issuance fees, which are nationality-dependent
- **Notes:**
  - Verified 2026-08-21: MRV fee for student and exchange visitor visas is **USD 185**.
  - **Reciprocity fees vary by nationality** — the counsellor must direct to the reciprocity table (`https://travel.state.gov/content/travel/en/us-visas/Visa-Reciprocity-and-Civil-Documents-by-Country.html`) rather than quote a total.
  - **"Visa Integrity Fee" (USD 250): `Not verified`.** The prior audit recorded a statutory USD 250 fee effective 1 Oct 2025 with uneven consular collection. **This pass could not confirm it on any State Department page.** Do not let the counsellor state this fee. Flag for manual check.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Maintaining Status (Study in the States)

- **Country:** United States
- **Category:** Visa conditions / duration of status / compliance
- **Authority:** DHS — Student and Exchange Visitor Program
- **Source Type:** Official Government
- **URL:** `https://studyinthestates.dhs.gov/students/maintaining-status`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - What conditions an F-1 must meet after arrival
  - Full course of study obligation
  - Consequences of falling out of status
  - The "duration of status" concept — F-1 admission is not a fixed expiry date on the I-94 in the traditional sense
- **Notes:**
  - The closest US equivalent to Australia's "visa conditions" page. High question volume.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: F/M Student Employment (SEVIS Help Hub)

- **Country:** United States
- **Category:** Work rights during study / work-hour restrictions
- **Authority:** DHS — SEVP
- **Source Type:** Official Government — DSO-facing operational guidance
- **URL (hub):** `https://studyinthestates.dhs.gov/sevis-help-hub/student-records/fm-student-employment`
- **URL (overview):** `.../fm-student-employment/student-employment-overview`
- **URL (CPT):** `.../fm-student-employment/f-1-curricular-practical-training-cpt`
- **URL (OPT):** `.../fm-student-employment/f-1-optional-practical-training-opt`
- **URL (STEM OPT):** `.../fm-student-employment/f-1-stem-optional-practical-training-opt`
- **URL (off-campus):** `.../fm-student-employment/f-1-off-campus-employment-and-international`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — whole cluster
- **Useful For:**
  - On-campus versus off-campus versus CPT versus OPT — the distinction students conflate most
  - Off-campus employment requires one completed academic year **and** demonstrated economic hardship
  - DSO recommendation in SEVIS versus USCIS work-permit application — two separate steps
- **Notes:**
  - Written for Designated School Officials, which makes it **more precise than the student-facing pages**. This is where CPT versus OPT is actually defined.
  - On-campus work hour cap is a rules-table value, not an embedded number.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: OPT and STEM OPT Extension (USCIS)

- **Country:** United States
- **Category:** Post-study work transition
- **Authority:** USCIS
- **Source Type:** Official Government
- **URL (OPT):** `https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students`
- **URL (STEM OPT):** `https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-extension-for-stem-students-stem-opt`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - "What can I do after I graduate in the US?"
  - STEM OPT hard gates: degree on the STEM Designated Degree Program List, employer enrolled and in good standing with **E-Verify**, filing windows
  - The distinction between pre-completion and post-completion OPT
- **Notes:**
  - The US has **no separate post-study work visa**. OPT is work authorisation within F-1 status, not a new visa. The counsellor must not describe it as one — this is a common agent-sourced error.
  - Durations and filing windows are rules-table values.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Bringing Dependants (F-2 / M-2)

- **Country:** United States
- **Category:** Dependants / family rules
- **Authority:** DHS — SEVP
- **Source Type:** Official Government
- **URL:** `https://studyinthestates.dhs.gov/students/get-started/bringing-dependents-to-the-united-states`
- **URL:** `https://studyinthestates.dhs.gov/students/dependents/managing-dependents-overview`
- **URL:** `https://studyinthestates.dhs.gov/students/f-2-m-2-part-time-study-guidance`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - Who qualifies as an F-2/M-2 dependant
  - **F-2 and M-2 dependants may not work** — the single most frequently misstated US rule in agent marketing
  - Dependant study rules: full-time K–12 permitted; post-secondary study restrictions apply
- **Notes:**
  - Prior audit stated "full-time higher education requires a change of status" for F-2. Directionally consistent with the part-time study guidance page but **not re-verified this pass** — retrieve the page rather than asserting the rule.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: H-1B Cap-Gap Extension of OPT

- **Country:** United States
- **Category:** Post-study work transition / status continuity
- **Authority:** USCIS
- **Source Type:** Official Government
- **URL:** `https://www.uscis.gov/working-in-the-united-states/temporary-workers/h-1b-specialty-occupations/extension-of-post-completion-optional-practical-training-opt-and-f-1-status-for-eligible-students`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - "What happens after OPT runs out?"
  - How F-1 status and OPT can be extended while an H-1B petition is pending
- **Notes:**
  - The real answer to the most common US long-term question, and almost never handled correctly by counsellors. Worth deliberate retrieval weighting.
- **Verification:** Not verified this pass — carried forward from prior audit. **Manual check required.**
- **Last Verified:** 2026-08-20 (prior audit)

## Official Education-Government Sources (Tier 2)

### Source: EducationUSA

- **Country:** United States
- **Category:** Country-specific application guidance / interview logistics
- **Authority:** U.S. Department of State — Bureau of Educational and Cultural Affairs
- **Source Type:** Official Government education portal
- **URL:** `https://educationusa.state.gov`
- **URL (country sites):** `https://educationusa.state.gov/<country>` — e.g. `/india`
- **RAG Priority:** Tier 2
- **Scrape/Index:** Yes — **including the country subpages for target markets**
- **Useful For:**
  - Origin-country-specific advising: local document norms, interview logistics, advising centre locations
  - Plain-language process narrative
- **Notes:**
  - **This is the US origin-country overlay.** Federal visa rules are nationality-blind; the local *process* is not. Tag these chunks with `origin_country`.
  - Never let an EducationUSA chunk override a State/USCIS rule statement.
- **Verification:** Not verified this pass. **Manual check required** — confirm the country subpath pattern is still `/<country>` and enumerate which target markets (NP, IN, BD, LK, PK) have live pages.
- **Last Verified:** 2026-08-20 (prior audit)

### Source: Exchange Visitor (J-1) Visa

- **Country:** United States
- **Category:** Visa type disambiguation
- **Authority:** U.S. Department of State
- **Source Type:** Official Government
- **URL:** `https://travel.state.gov/content/travel/en/us-visas/study/exchange.html`
- **RAG Priority:** Tier 2 (Tier 1 body, supporting role here)
- **Scrape/Index:** Yes
- **Useful For:**
  - Distinguishing F, M and J — students conflate these constantly
  - Flagging the J-1 two-year home residency requirement as a thing that exists and must be checked
- **Notes:**
  - Include specifically so the counsellor can *disambiguate*, not so it can advise on J-1.
- **Verification:** Not verified this pass. **Manual check required.**
- **Last Verified:** 2026-08-20 (prior audit)

## US Source Coverage Summary

| Topic | Covered | Primary source |
|---|---|---|
| Student visa type/category | ✅ | State — Student Visa (F/M); USCIS PM Vol 2 Part F |
| Eligibility requirements | ✅ | USCIS PM Vol 2 Part F Ch. 2 |
| Academic admission relationship | ✅ | I-20 / SEVP — admission precedes the visa |
| Application process | ✅ | State Student Visa + DS-160 guidance |
| Required documents | ✅ | State Student Visa |
| Proof of funds | ⚠️ | **No federal threshold.** Governed by the school's I-20 cost of attendance |
| English requirements (visa layer) | ❌ | `Authoritative source not identified` — no federal visa-layer English test requirement exists; it is an institutional requirement, out of scope |
| Health insurance | ❌ | `Authoritative source not identified` — not a federal F-1 visa condition; typically an institutional requirement |
| Health examination | ⚠️ | Vaccination/medical requirements are consular- and post-specific; no single authoritative F-1 page identified |
| Biometrics | ⚠️ | Collected at the consular interview; no dedicated F-1 biometrics page identified |
| Police/character | ⚠️ | Handled via DS-160 declarations and INA inadmissibility grounds; no student-specific page |
| Visa application fees | ✅ | State Fees for Visa Services (MRV); ICE I-901 |
| Additional government charges | ✅ | ICE I-901 SEVIS fee. *Visa Integrity Fee `Not verified`* |
| Processing times | ⚠️ | Consular post-specific; no single authoritative student page |
| Visa conditions | ✅ | Study in the States — Maintaining Status |
| Work rights / hour restrictions | ✅ | SEVIS Help Hub — F/M Student Employment |
| Dependants | ✅ | Study in the States — Bringing Dependents |
| Visa duration | ✅ | USCIS PM Part F Ch. 8; Maintaining Status (duration of status) |
| Extension / renewal | ✅ | USCIS PM Part F Ch. 8 |
| Changing education provider | ✅ | USCIS PM Part F Ch. 4 (School Transfer) |
| Post-study work transition | ✅ | USCIS OPT / STEM OPT; H-1B cap-gap |
| Genuine student / intent | ⚠️ | INA 214(b) non-immigrant intent is assessed at interview with **no published test** — encode as an explicit uncertainty, not a checklist |

---

# Australia

**Authority.** **Department of Home Affairs** owns everything that matters: subclass 500, the Genuine Student requirement, financial capacity, conditions, dependants and the subclass 485 Temporary Graduate visa. **Austrade / Study Australia** is the student-facing portal and the only Australian government domain in this registry that fetches cleanly.

**Distinctive asset:** Australian visa rules are backed by **citable legislation and published ministerial directions**, and the **Evidence Levels framework is explicitly nationality-aware** — the same course with a different passport can carry a different document burden.

## Official Immigration / Visa Sources (Tier 1)

### Source: Subclass 500 Student Visa

- **Country:** Australia
- **Category:** Student visa / eligibility / conditions / fees / processing
- **Authority:** Australian Government — Department of Home Affairs
- **Source Type:** Official Government
- **URL:** `https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500`
- **RAG Priority:** Tier 1 — **highest retrieval priority for Australia**
- **Scrape/Index:** Yes — all tabs (Eligibility, Step by step, When you have this visa, Cost, Processing time)
- **Useful For:**
  - Student visa eligibility
  - Required documents
  - Visa application charge
  - Visa conditions and work rights
  - Visa duration and dependants
- **Notes:**
  - Tabbed content — **the tabs are separate URL fragments and a naive fetch captures only the first tab.** Ingest each tab explicitly.
  - 403 to automated fetch. Requires a browser-based fetcher.
  - **Volatile.** Fee and financial requirements moved in the last 24 months.
- **Verification:** Index-confirmed 2026-08-21 (403 to direct fetch; URL and ownership confirmed)
- **Last Verified:** 2026-08-21

### Source: Genuine Student (GS) Requirement

- **Country:** Australia
- **Category:** Genuine student requirement
- **Authority:** Department of Home Affairs
- **Source Type:** Official Government
- **URL:** `https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500/genuine-student-requirement`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - What the GS requirement asks and how it is assessed
  - What supporting evidence to attach
  - Why student visas are refused
- **Notes:**
  - **The largest single refusal driver** and the hardest thing for a counsellor to explain well.
  - Applies to applications lodged **on or after 23 March 2024**. Earlier applications were assessed under the Genuine Temporary Entrant (GTE) requirement — keep both retrievable and tag GTE content as superseded rather than deleting it; students still ask about GTE by name.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Ministerial Direction No. 106 — Assessing the Genuine Entry and Stay Requirements

- **Country:** Australia
- **Category:** Genuine student requirement / policy & legislation
- **Authority:** Department of Home Affairs — Ministerial Direction
- **Source Type:** Official Government — PDF, numbered clauses
- **URL:** `https://immi.homeaffairs.gov.au/Visa-subsite/files/direction-no-106.pdf`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — **excellent chunking; the numbered clause is the chunk**
- **Useful For:**
  - How a decision-maker actually reasons about GS
  - The specific factors weighed: personal circumstances, immigration history, compliance history
  - Why an application was refused
- **Notes:**
  - This is the decision-maker's own instruction set. It answers "why was I refused" better than any student-facing page.
  - Related: **Direction No. 108** (`.../direction-no-108.pdf`) covers the GTE criterion for other visa types; **Direction No. 115** (`https://immi.homeaffairs.gov.au/support-subsite/files/ministerial-direction-115.pdf`) sets the **processing priority order for offshore subclass 500 applications lodged on or after 14 November 2025**. Ingest 115 for processing-order questions.
  - PDF — extract text, preserve clause numbering as chunk metadata.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Genuine Access to Funds

- **Country:** Australia
- **Category:** Proof of funds / financial requirements
- **Authority:** Department of Home Affairs
- **Source Type:** Official Government
- **URL:** `https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500/genuine-access-to-funds`
- **Related:** `https://immi.homeaffairs.gov.au/help-text/evidence/Pages/et-h0185.aspx` (Evidence of financial capacity — Student)
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - What counts as genuine access to funds
  - Acceptable evidence types
  - Who may be a financial sponsor
  - The alternative annual-income evidence route
- **Notes:**
  - **Financial capacity amount: `Not verified`.** The prior audit recorded AUD 29,710 (up from AUD 24,505). This pass could not confirm the current figure from any readable official page. **Do not let the counsellor state this number until a human or browser-based fetch confirms it.** Highest-priority manual verification item for Australia.
  - Search-index snippets referenced an annual-income alternative of AUD 60,000 (student alone) / AUD 70,000 (with family) — **also `Not verified`.**
  - Financial evidence requirements interact with the Evidence Levels framework (below): whether evidence is required *at lodgement at all* depends on citizenship × provider.
- **Verification:** Index-confirmed 2026-08-21 (URL live; figures not readable)
- **Last Verified:** 2026-08-21

### Source: Evidence Framework and Evidence Levels

- **Country:** Australia
- **Category:** Required documents — **origin-country differentiated**
- **Authority:** Department of Home Affairs — Education Program
- **Source Type:** Official Government
- **URL:** `https://immi.homeaffairs.gov.au/what-we-do/education-program/what-we-do/evidence-framework`
- **URL:** `https://immi.homeaffairs.gov.au/what-we-do/education-program/what-we-do/evidence-levels`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - "What documents do I need to lodge, as a Nepali/Indian/Bangladeshi applicant?"
  - Whether financial and English evidence must be supplied at lodgement
  - Why two students on the same course face different document burdens
- **Notes:**
  - **The single biggest differentiator available to this product.** It is a published matrix of country of citizenship × education provider. Commercial competitors treat visa rules as nationality-blind.
  - Ingest with an explicit `origin_country` metadata field so a Nepali student's answer is genuinely different from a Chinese student's.
  - Evidence levels are reviewed periodically — treat as frequently changing.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Visa Conditions List (8105, 8202, 8501, 8104)

- **Country:** Australia
- **Category:** Visa conditions / work-hour restrictions / health insurance
- **Authority:** Department of Home Affairs
- **Source Type:** Official Government
- **URL:** `https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/conditions-list`
- **URL (per-visa view):** `https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/see-your-visa-conditions?vcid=21`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - Condition 8105 — work limitation
  - Condition 8202 — course enrolment and academic progress
  - Condition 8501 — maintain adequate health insurance
  - Condition 8104 — work limitation (dependants)
- **Notes:**
  - **The condition number is the ideal chunk key.** Students and providers both refer to these by number.
  - Verified 2026-08-21 via index: since 1 July 2023, student visa holders may work **no more than 48 hours per fortnight while their course is in session**; no work restriction when the course is not in session; students who have **commenced a masters by research or doctoral degree** are not subject to the 48-hour limit. Store the hour cap in the rules table.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Work Restrictions for Student Visa Holders

- **Country:** Australia
- **Category:** Work rights during study
- **Authority:** Department of Home Affairs
- **Source Type:** Official Government
- **URL:** `https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500/temporary-relaxation-of-working-hours-for-student-visa-holders`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - Current work-hour cap and when it applies
  - "In session" versus "not in session"
  - Consequences of breach (visa cancellation)
- **Notes:**
  - **Legacy slug warning.** The URL still says "temporary relaxation" from the pandemic-era uncapped-hours policy, but the page now carries the current restriction. **Do not infer policy from the URL.** Record this as a known misleading-slug case; if the department renames it, follow the redirect.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Temporary Graduate Visa (Subclass 485)

- **Country:** Australia
- **Category:** Post-study work transition
- **Authority:** Department of Home Affairs
- **Source Type:** Official Government
- **URL:** `https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485`
- **Related paths:** `/post-higher-education-work`, `/post-vocational-education-work`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — all streams
- **Useful For:**
  - Post-study work rights after an Australian qualification
  - Stream eligibility and stay periods
  - Age limit and English threshold for 485
- **Notes:**
  - **Volatile.** Streams, age limits and stay durations have all moved recently. Duration and age values belong in the rules table with `effective_from`.
  - Prior audit recorded an IELTS 6.5 threshold for 485 — **`Not verified` this pass.**
  - 403 to automated fetch.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: English Language Requirements (Visa Layer)

- **Country:** Australia
- **Category:** English requirements — **visa layer only**
- **Authority:** Department of Home Affairs
- **Source Type:** Official Government
- **URL:** `https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/english-language`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - Which English tests Home Affairs accepts for visa purposes
  - Test validity periods
  - Score levels defined in migration terms (Functional / Vocational / Competent / Proficient / Superior)
- **Notes:**
  - **Must be kept strictly separate from institution admission English requirements.** Tag every chunk `layer: visa_english`. A retrieval that mixes the two produces a wrong answer with a citation attached, which is worse than no answer.
- **Verification:** Not verified this pass. **Manual check required.**
- **Last Verified:** 2026-08-20 (prior audit)

### Source: Document Checklist Tool

- **Country:** Australia
- **Category:** Required documents
- **Authority:** Department of Home Affairs
- **Source Type:** Official Government — interactive tool
- **URL:** `https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool`
- **RAG Priority:** Tier 1
- **Scrape/Index:** **No** — interactive, state-dependent
- **Useful For:**
  - Producing the applicant's personalised document list
- **Notes:**
  - **Referral target only.** Every Australian document-list answer should end with a link to this tool. Attempting to scrape it yields a form shell, not a checklist.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Applying for a Student Visa — Check Twice, Submit Once

- **Country:** Australia
- **Category:** Application process / common errors
- **Authority:** Department of Home Affairs
- **Source Type:** Official Government
- **URL:** `https://immi.homeaffairs.gov.au/check-twice-submit-once/student-visa`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - The most common application mistakes, from the department itself
  - Pre-submission checks
- **Notes:**
  - Unusually high-value for a counsellor: it is the department stating what applicants get wrong. Prioritise for "how do I avoid refusal" queries.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: ImmiAccount — Applying Online

- **Country:** Australia
- **Category:** Application portal
- **Authority:** Department of Home Affairs
- **Source Type:** Official Government — guidance + portal
- **URL (guidance):** `https://immi.homeaffairs.gov.au/help-support/applying-online-or-on-paper/online`
- **URL (create):** `https://immi.homeaffairs.gov.au/help-support/applying-online-or-on-paper/online/create-your-immiaccount`
- **URL (portal):** `https://online.immi.gov.au/lusc/login`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Guidance pages **Yes**. Portal **No** — authenticated, link only.
- **Useful For:**
  - How the subclass 500 application is lodged
  - Where the Confirmation of Enrolment (CoE) is uploaded
  - Post-lodgement: checking status, updating details, withdrawing
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Global Visa Processing Times / Student Visa Processing Priorities

- **Country:** Australia
- **Category:** Processing times
- **Authority:** Department of Home Affairs
- **Source Type:** Official Government
- **URL:** `https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-processing-times/global-visa-processing-times`
- **URL:** `https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-processing-times/visa-processing-priorities/student-visa`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — **but treat all figures as rules-table values, never embedded**
- **Useful For:**
  - Indicative processing times for subclass 500
  - Why some applications are processed ahead of others
- **Notes:**
  - **Updated monthly.** Any embedded processing-time number is wrong within weeks.
  - Offshore subclass 500 applications lodged on or after 14 November 2025 are ordered under **Ministerial Direction 115**, with two priority levels (Priority 2 = Standard). Index-confirmed 2026-08-21.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

## Official Education-Government Sources (Tier 2)

### Source: Study Australia — Student Visa (Subclass 500) Guide

- **Country:** Australia
- **Category:** Visa overview / fees / work restrictions
- **Authority:** Australian Government — Austrade
- **Source Type:** Official Government education portal
- **URL:** `https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas/student-visa-subclass-500`
- **URL (hub):** `https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas`
- **URL (485):** `https://www.studyaustralia.gov.au/en/plan-your-move/your-guide-to-visas/temporary-graduate-visa-subclass-485`
- **RAG Priority:** Tier 2
- **Scrape/Index:** Yes — **operationally important because it is fetchable when Home Affairs is not**
- **Useful For:**
  - Plain-language subclass 500 and 485 overviews
  - Visa application charge
  - Work-hour restrictions in student-friendly phrasing
- **Notes:**
  - **Fetched 2026-08-21.** States: *"From 1 July 2026, student visa fees are from AUD$2,500 per visa application"*, with the page noting *"Prices are correct at July 2026"*.
  - **Does not publish the financial capacity amount** — it defers to Home Affairs. Confirmed by direct fetch. **This page is not a substitute for Home Affairs on financial requirements.**
  - Use for prose and fees. Never as the sole authority for eligibility or financial thresholds.
- **Verification:** **Fetched 2026-08-21**
- **Last Verified:** 2026-08-21

### Source: Change to Evidence of Financial Capacity for Student Visas

- **Country:** Australia
- **Category:** Financial requirements — change notice
- **Authority:** Austrade — Study Australia news
- **Source Type:** Official Government education portal
- **URL:** `https://www.studyaustralia.gov.au/en/tools-and-resources/news/change-to-evidence-of-financial-capacity-for-student-visas`
- **Related (Home Affairs notice):** `https://immi.homeaffairs.gov.au/news-media/archive/article?itemId=1196`
- **RAG Priority:** Tier 2
- **Scrape/Index:** Yes
- **Useful For:**
  - When the financial capacity requirement last changed and by how much
  - Change-detection signal for the rules table
- **Notes:**
  - Treat as a **change feed**, not as the current value. The Home Affairs news article is the Tier 1 counterpart.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Overseas Student Health Cover (OSHC)

- **Country:** Australia
- **Category:** Health insurance requirement (visa condition 8501)
- **Authority:** Department of Health, Disability and Ageing (privatehealth.gov.au) · Austrade (Study Australia)
- **Source Type:** Official Government
- **URL:** `https://www.privatehealth.gov.au/health_insurance/overseas/overseas_student_health_cover.htm`
- **URL:** `https://www.studyaustralia.gov.au/en/plan-your-move/overseas-student-health-cover-oshc`
- **URL (fact sheet PDF):** `https://www.health.gov.au/resources/publications/overseas-student-health-cover-oshc-fact-sheet`
- **URL (Home Affairs help text):** `https://immi.homeaffairs.gov.au/help-text/eplus/Pages/elp-h1636.aspx`
- **RAG Priority:** Tier 2 (privatehealth.gov.au and Home Affairs help text are Tier 1 on the requirement itself)
- **Scrape/Index:** Yes
- **Useful For:**
  - Whether health insurance is mandatory (it is — condition 8501)
  - That **OSHC is the only insurance type that satisfies the student visa requirement**
  - That cover must be purchased **before arrival** and maintained for the whole visa period
  - What OSHC covers: medical, hospital, ambulance, limited pharmaceuticals
- **Notes:**
  - Index-confirmed 2026-08-21. This is one of the clearest yes/no visa rules in the corpus and should be answered decisively.
  - Prices are commercial and vary by insurer — **the counsellor must not quote an OSHC price.**
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Fair Work Ombudsman — Visa Holders and Migrants

- **Country:** Australia
- **Category:** Work rights during study — employment law layer
- **Authority:** Fair Work Ombudsman
- **Source Type:** Official Government (Tier 1 on employment law, Tier 2 relative to visa rules)
- **URL:** `https://www.fairwork.gov.au/find-help-for/visa-holders-migrants`
- **RAG Priority:** Tier 2
- **Scrape/Index:** Yes
- **Useful For:**
  - Minimum wage and workplace rights for international students
  - That visa status does not reduce workplace entitlements
  - What to do about underpayment
- **Notes:**
  - Distinct from the *visa* work limit. Keep the two topics separate: Home Affairs answers "how many hours may I work", FWO answers "what must I be paid".
- **Verification:** Not verified this pass. **Manual check required.**
- **Last Verified:** 2026-08-20 (prior audit)

## Australia Source Coverage Summary

| Topic | Covered | Primary source |
|---|---|---|
| Student visa type/category | ✅ | Subclass 500 |
| Eligibility requirements | ✅ | Subclass 500 (Eligibility tab) |
| Academic admission relationship | ✅ | Subclass 500 — CoE required; course must be CRICOS-registered |
| Application process | ✅ | Subclass 500 (Step by step) + ImmiAccount |
| Required documents | ✅ | Document Checklist Tool + Evidence Levels |
| Proof of funds | ⚠️ | Genuine Access to Funds — **current threshold `Not verified`** |
| English requirements (visa layer) | ⚠️ | Home Affairs English language page — not re-verified |
| Health insurance | ✅ | OSHC — condition 8501 |
| Health examination | ⚠️ | Referenced within subclass 500 health requirement; no dedicated page verified |
| Biometrics | ⚠️ | Not separately verified |
| Police/character | ⚠️ | Character requirement referenced in subclass 500; no dedicated page verified |
| Visa application fees | ✅ | Subclass 500 (Cost); Study Australia |
| Processing times | ✅ | Global visa processing times + Direction 115 |
| Visa conditions | ✅ | Conditions list (8105, 8202, 8501, 8104) |
| Work rights / hour restrictions | ✅ | Work restrictions page + condition 8105 |
| Dependants | ⚠️ | Subclass 500 family provisions; dedicated dependant page not re-verified |
| Age-related requirements | ⚠️ | 485 age limit referenced; value `Not verified` |
| Genuine student requirement | ✅ | GS requirement page + Ministerial Direction 106 |
| Visa duration | ✅ | Subclass 500 |
| Extension / renewal | ⚠️ | Handled as a new application; no dedicated page verified |
| Changing course/provider | ✅ | Condition 8202 |
| Post-study work transition | ✅ | Subclass 485 |
| Origin-country differentiation | ✅ | **Evidence Levels — a genuine competitive asset** |

---

# Canada

**Three gates, not one.** Canada is the most procedurally complex destination here:

1. **Federal (IRCC)** — the study permit, work rights, PGWP.
2. **Provincial** — the Provincial/Territorial Attestation Letter (PAL/TAL) against an allocation cap.
3. **Quebec** — an entirely parallel selection step (**CAQ**, via MIFI) that must complete *before* the federal permit.

Plus **DLI status**, which remains a permit prerequisite.

Canada is also the most **volatile** destination in this registry. In under two years: PAL introduced, intake caps applied, off-campus work moved 20→24 h, the Student Direct Stream abolished, PGWP language and field-of-study requirements introduced, spouse open work permits narrowed, cost-of-living raised twice.

> **Operating assumption: any Canadian content older than twelve months is presumed wrong.**

## Official Immigration / Visa Sources (Tier 1)

### Source: Guide 5269 — Applying for a Study Permit Outside Canada

- **Country:** Canada
- **Category:** Application process / documents / fees / biometrics / medicals — comprehensive
- **Authority:** Immigration, Refugees and Citizenship Canada (IRCC)
- **Source Type:** Official Government — instruction guide
- **URL:** `https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides/guide-5269-applying-study-permit-outside-canada.html`
- **RAG Priority:** Tier 1 — **if you ingest one Canadian document, ingest this**
- **Scrape/Index:** Yes — full document
- **Useful For:**
  - Eligibility, field by field
  - Required documents
  - Biometrics
  - Medical examination
  - Fees
  - Refusal grounds
  - How to complete the application form
- **Notes:**
  - The official instruction guide, sectioned field-by-field. **Section headings are natural chunk boundaries.** The single best-formed Canadian source.
  - 403 to automated fetch.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Study Permit — Who Can Apply

- **Country:** Canada
- **Category:** Eligibility requirements
- **Authority:** IRCC
- **Source Type:** Official Government
- **URL:** `https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/eligibility.html`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - Core eligibility: DLI acceptance, proof of funds, no criminal record (police certificate if required), good health (medical exam if required), intent to leave at end of authorised stay
  - Whether a study permit is needed at all
- **Notes:**
  - Verified 2026-08-21 via index that the page states the obey-the-law / police certificate and good-health / medical exam conditions.
  - **Volatile.**
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Proof of Financial Support

- **Country:** Canada
- **Category:** Proof of funds / financial requirements
- **Authority:** IRCC
- **Source Type:** Official Government
- **URL:** `https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/financial-support.html`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - The cost-of-living amount required, by family size
  - That the amount is **in addition to** first-year tuition and travel costs
  - Acceptable forms of proof
- **Notes:**
  - **Highly volatile — rules-table value only.** Verified 2026-08-21 via index: the single-applicant cost-of-living requirement rose to **CAD 22,895 on 1 September 2025**, and is adjusted **every 1 September** in line with Statistics Canada's Low-Income Cut-Off (LICO).
  - **A 1 September 2026 adjustment is due or has just occurred. Re-verify before this document is used in production.** Highest-priority manual verification item for Canada.
  - The figure applies **outside Quebec**. Quebec sets its own — see the Quebec cluster.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Provincial/Territorial Attestation Letter (PAL/TAL)

- **Country:** Canada
- **Category:** Required documents — provincial gate
- **Authority:** IRCC
- **Source Type:** Official Government
- **URL:** `https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/provincial-attestation-letter.html`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - Whether a PAL/TAL is required for a given applicant
  - Who issues it and how it is obtained
  - Which applicants are exempt
- **Notes:**
  - **The newest and least-understood gate.** Introduced with the intake cap. Issued by the *province*, not IRCC, and typically requires accepting the offer and paying tuition in part or in full first.
  - **`scope: province_rule`.** Never present PAL requirements as a uniform national rule — issuance processes differ by province.
  - Volatile: allocation caps change.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Study Permit — Get the Right Documents (hub) + IMM 5483 Checklist

- **Country:** Canada
- **Category:** Required documents
- **Authority:** IRCC
- **Source Type:** Official Government — hub page + PDF checklist
- **URL (hub):** `https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents.html`
- **URL (IMM 5483 PDF):** `https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5483/01-12-2024/imm5483e.pdf`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — both
- **Useful For:**
  - The generic document checklist
  - Letter of acceptance, PAL/TAL, proof of funds, identity documents
- **Notes:**
  - The IMM 5483 PDF path is **version-dated** (`01-12-2024`). **A newer version will live at a different path.** Do not hard-code; resolve the current checklist from the hub page on every refresh, and record the version date as chunk metadata.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Visa-Office-Specific Document Checklists

- **Country:** Canada
- **Category:** Required documents — **origin-country differentiated**
- **Authority:** IRCC
- **Source Type:** Official Government — PDF
- **URL (example, Accra):** `https://ircc.canada.ca/english/pdf/kits/forms/IMM5815E.pdf`
- **URL (example, further checklist):** `https://ircc.canada.ca/english/pdf/kits/forms/IMM5826E.pdf`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — **but must be enumerated per visa office**
- **Useful For:**
  - Extra documents demanded by the office serving the applicant's region
  - "What does the visa office for my country actually want?"
- **Notes:**
  - Layered **on top of** the generic IMM 5483, not instead of it. Both must be retrieved together.
  - **This is Canada's origin-country overlay.** Tag with `origin_country`.
  - **Gap:** the specific visa-office checklist covering **Nepal** has not been identified. Enumerate the full IMM 58xx series and map office → served countries before ingestion. Flagged for manual work.
- **Verification:** Index-confirmed 2026-08-21 (two example checklists confirmed live; series not enumerated)
- **Last Verified:** 2026-08-21

### Source: Work Off Campus as an International Student

- **Country:** Canada
- **Category:** Work rights during study / work-hour restrictions
- **Authority:** IRCC
- **Source Type:** Official Government
- **URL:** `https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/work-off-campus.html`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - The off-campus work-hour cap
  - **Eligibility preconditions, which matter more than the number** — full-time student at a DLI, programme started, valid study permit, programme at least 6 months leading to a degree/diploma/certificate, and the work condition printed on the permit
  - Unlimited hours during scheduled breaks
  - Consequences of breach: loss of student status, future refusals, possible removal
- **Notes:**
  - Verified 2026-08-21 via index: **24 hours per week while classes are in session**; unlimited during scheduled breaks. Rules-table value.
  - The permit must carry the condition text referencing **IRPR paragraph 186(v)**. Students without that condition printed are not eligible regardless of the general rule — a frequently missed detail.
  - **Volatile.**
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Post-Graduation Work Permit (PGWP) cluster

- **Country:** Canada
- **Category:** Post-study work transition
- **Authority:** IRCC
- **Source Type:** Official Government
- **URL (about):** `https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation/about.html`
- **URL (eligibility):** `.../after-graduation/eligibility.html`
- **URL (field of study):** `.../after-graduation/eligibility/field-of-study.html`
- **URL (currently eligible CIP codes):** `.../after-graduation/eligibility/field-of-study/currently-eligible.html`
- **URL (documents):** `.../after-graduation/get-documents.html`
- **URL (how to apply):** `.../after-graduation/apply.html`
- **URL (Guide 5580):** `https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides/guide-5580-applying-work-permit-student-guide.html`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — whole cluster. **Exception:** the CIP code list.
- **Useful For:**
  - Whether a graduate qualifies for a PGWP
  - The language requirement
  - The field-of-study requirement and who it applies to
  - PGWP length and how it relates to programme length
- **Notes:**
  - Verified 2026-08-21 via index: **language requirement** — CLB/NCLC **7** for bachelor's, master's and doctoral graduates; CLB/NCLC **5** for other college/polytechnic/non-university programmes; **no** language requirement for applications submitted **before 1 November 2024**. **Field-of-study requirement** applies to non-degree programmes only; there is **no** field-of-study requirement for bachelor's, master's or doctoral graduates.
  - **The "currently eligible CIP codes" page is a list of hundreds of coded fields. Do not embed it as prose.** Load it into the rules table keyed on CIP code and answer by exact lookup. A vector search over that list will produce confident wrong matches.
  - Eligible fields change with labour-market needs. Treat as volatile.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Help Your Spouse or Common-Law Partner Work in Canada

- **Country:** Canada
- **Category:** Dependants / family work rights
- **Authority:** IRCC
- **Source Type:** Official Government
- **URL:** `https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/help-your-spouse-common-law-partner-work-canada.html`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - Whether a student's spouse can get an open work permit
  - Which programmes qualify the student's spouse
- **Notes:**
  - **Volatile and recently narrowed.** The prior audit recorded a narrowing effective 21 January 2025 limiting spousal open work permits to spouses of students in master's programmes of at least 16 months, doctoral programmes, and select professional degree programmes. **`Not verified` this pass — re-check before production.**
  - Divergence across destinations is sharp here: Canada narrowed, the UK largely barred dependants, the US never permitted F-2 work. A comparison answer must cite each country's own page.
- **Verification:** Index-confirmed 2026-08-21 (URL live; current rule text not read)
- **Last Verified:** 2026-08-21

### Source: Medical Exams for Visitors, Students and Workers

- **Country:** Canada
- **Category:** Health examination requirements
- **Authority:** IRCC
- **Source Type:** Official Government
- **URL:** `https://www.canada.ca/en/immigration-refugees-citizenship/services/application/medical-police/medical-exams/requirements-temporary-residents.html`
- **URL (hub):** `https://www.canada.ca/en/immigration-refugees-citizenship/services/application/medical-police.html`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - Whether a medical exam is required, and when
  - That only an **IRCC-approved panel physician** may perform it — a personal doctor cannot
- **Notes:**
  - Index-confirmed 2026-08-21. A temporary public policy exempting certain foreign nationals already in Canada from the immigration medical exam was referenced with an end date of **5 October 2029** — **`Not verified`, and it is a temporary policy, not a permanent rule.** Tag accordingly if ingested.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Police Certificates

- **Country:** Canada
- **Category:** Police / character requirements
- **Authority:** IRCC
- **Source Type:** Official Government
- **URL (per-country how-to):** `https://www.canada.ca/en/immigration-refugees-citizenship/services/application/medical-police/police-certificates/how/<country>.html` — e.g. `/india.html`
- **URL (help centre):** `https://ircc.canada.ca/english/helpcentre/answer.asp?qnum=472&top=4`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — **enumerate the per-country pages for target markets**
- **Useful For:**
  - Whether a police certificate is needed
  - **How to obtain one in the applicant's own country** — genuinely origin-specific
  - Validity windows
- **Notes:**
  - **A second Canadian origin-country overlay.** IRCC publishes a distinct page per country. Tag with `origin_country`. Confirm a Nepal page exists.
  - Index-confirmed 2026-08-21: certificates for the country of current residence must be issued no more than 6 months before submission; for other countries, issued after the last stay of 6+ consecutive months. **Values not read directly — re-verify.**
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: IRCC Help Centre — study and work answers

- **Country:** Canada
- **Category:** Cross-cutting Q&A
- **Authority:** IRCC
- **Source Type:** Official Government — Q&A knowledge base
- **URL pattern:** `https://ircc.canada.ca/english/helpcentre/answer.asp?qnum=<n>&top=<t>`
- **Confirmed relevant:** `qnum=503` (unlimited hours?), `qnum=499` (work during scheduled breaks), `qnum=1181` (work while awaiting PGWP), `qnum=486` (study permit processing time), `qnum=472` (police certificate timing), `qnum=029` (application status)
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — **harvest the study/work subset systematically**
- **Useful For:**
  - Precise edge-case answers the main pages gloss over
- **Notes:**
  - **The best-formed RAG chunks in the entire Canadian corpus** — natively question-shaped, one answer per URL, individually dated. One page = one chunk, no splitting needed.
  - Enumerate by topic index (`https://ircc.canada.ca/english/helpcentre/results-by-topic.asp?st=3.2` for processing times) rather than guessing `qnum` values.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Check Current IRCC Processing Times

- **Country:** Canada
- **Category:** Processing times
- **Authority:** IRCC
- **Source Type:** Official Government — interactive tool
- **URL:** `https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html`
- **RAG Priority:** Tier 1
- **Scrape/Index:** **No** — interactive and updated weekly. Referral target.
- **Useful For:**
  - Current study permit processing time for the applicant's country
- **Notes:**
  - Index-confirmed 2026-08-21: **updated weekly**, and IRCC states the times are neither a maximum nor a guarantee.
  - **Never embed a Canadian processing time.** Always link. This is the clearest case in the registry for referral-over-retrieval.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Quebec cluster — CAQ and provincial selection

- **Country:** Canada (Quebec)
- **Category:** Province-specific gate — eligibility, documents, costs
- **Authority:** Gouvernement du Québec (MIFI)
- **Source Type:** Official Government — provincial
- **URL:** `https://www.quebec.ca/en/education/study-quebec/required-conditions`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - That Quebec requires a **CAQ before** the federal study permit
  - Quebec-specific financial requirements
  - Quebec-specific documents and costs
- **Notes:**
  - **`scope: province_rule` — mandatory.** Presenting Quebec rules as Canadian rules, or Canadian rules to a Quebec applicant, is the most damaging Canada error available.
  - The prior audit noted a nationality quirk: proof of financial means *at the CAQ stage* is required only from residents of a specific listed set of countries. **`Not verified`.**
  - CAQ fee and processing time from the prior audit (~20 business days, CAD 126 in 2025) are **`Not verified`**.
- **Verification:** Not verified this pass. **Manual check required** — the four related quebec.ca sub-paths in the prior audit were not re-confirmed.
- **Last Verified:** 2026-08-20 (prior audit)

### Source: IRCC Notices — change feed

- **Country:** Canada
- **Category:** Change detection
- **Authority:** IRCC
- **Source Type:** Official Government
- **URL:** `https://www.canada.ca/en/immigration-refugees-citizenship/news/notices.html`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — **poll this, do not just index it**
- **Useful For:**
  - Detecting rule changes before the corpus rots
- **Notes:**
  - **This is infrastructure, not content.** Every hit should trigger re-verification of the affected rules-table rows. Given Canada's volatility, this is the highest-value single feed in the registry.
- **Verification:** Index-confirmed 2026-08-21
- **Last Verified:** 2026-08-21

### Source: Student Direct Stream (SDS) — closed

- **Country:** Canada
- **Category:** Superseded scheme
- **Authority:** IRCC
- **Source Type:** Official Government — operational bulletin
- **URL:** `https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/operational-bulletins-manuals/temporary-residents/study-permits/direct-stream.html`
- **RAG Priority:** Tier 1 — **ingest as a negative fact**
- **Scrape/Index:** Yes
- **Useful For:**
  - "Can I apply through SDS?" → No. It closed on **8 November 2024 at 14:00 EST**.
- **Notes:**
  - **Keep superseded schemes retrievable.** Students, and the agent ecosystem they read, still reference SDS constantly. "That closed on 8 November 2024; here is what applies now" is a far better answer than a blank.
  - Tag `status: closed` and `supersedes` → current study permit process, so retrieval returns the replacement alongside.
- **Verification:** Not verified this pass. **Manual check required** (URL path carried forward).
- **Last Verified:** 2026-08-20 (prior audit)

## Official Education-Government Sources (Tier 2)

### Source: EduCanada

- **Country:** Canada
- **Category:** Government scholarship portal / student guidance
- **Authority:** Global Affairs Canada
- **Source Type:** Official Government education portal
- **URL:** `https://www.educanada.ca/scholarships-bourses/index.aspx?lang=eng`
- **RAG Priority:** Tier 2
- **Scrape/Index:** Yes — scholarship pages only
- **Useful For:**
  - Government scholarship schemes with explicit country eligibility
- **Notes:**
  - **Marginal for a visa-focused corpus.** Included only because scholarship funding interacts with the proof-of-funds requirement. Do not expand EduCanada coverage beyond that.
- **Verification:** Not verified this pass. **Manual check required.**
- **Last Verified:** 2026-08-20 (prior audit)

## Canada Source Coverage Summary

| Topic | Covered | Primary source |
|---|---|---|
| Student visa type/category | ✅ | Study permit — Who can apply |
| Eligibility requirements | ✅ | Study permit eligibility + Guide 5269 |
| Academic admission relationship | ✅ | Letter of acceptance from a DLI is a prerequisite |
| Application process | ✅ | Guide 5269 |
| Required documents | ✅ | Get the right documents + IMM 5483 + visa-office checklists |
| Proof of funds | ✅ | Proof of financial support — **value volatile, re-verify 1 Sep annually** |
| Provincial attestation (PAL/TAL) | ✅ | PAL page — `scope: province_rule` |
| English requirements (visa layer) | ❌ | `Authoritative source not identified` — no general study-permit English test requirement since SDS closed; language requirement applies at **PGWP** stage |
| Health insurance | ❌ | `Authoritative source not identified` — not a federal study permit condition; provincial/institutional. Out of scope here |
| Health examination | ✅ | Medical exams — temporary residents |
| Biometrics | ✅ | Guide 5269 |
| Police/character | ✅ | Police certificates (per-country) |
| Visa application fees | ⚠️ | Guide 5269 + IRCC fee pages — **not separately verified this pass** |
| Processing times | ✅ | Check processing times tool (referral only) |
| Visa conditions | ✅ | Conditions printed on the permit (IRPR 186(v)) |
| Work rights / hour restrictions | ✅ | Work off campus |
| Dependants | ⚠️ | Spouse open work permit page — **current narrowed scope `Not verified`** |
| Visa duration | ⚠️ | Covered within Guide 5269; not separately verified |
| Extension / renewal | ⚠️ | Referenced in eligibility page; no dedicated page verified |
| Changing institution | ⚠️ | Change-of-DLI reporting obligation exists; **authoritative page not identified this pass** |
| Post-study work transition | ✅ | PGWP cluster + Guide 5580 |
| Province-specific rules | ✅ | Quebec cluster (`Not verified`); PAL (all provinces) |
| Origin-country differentiation | ✅ | Visa-office checklists + per-country police certificate pages |

---

# United Kingdom

**The best-structured destination in this registry**, for a structural reason: UK rules are published as **numbered, cross-referenced legal appendices** alongside **dated caseworker-guidance documents**. You get the rule (Appendix Student), the evidential standard (Appendix Finance), the decision-maker's operating manual (Student and Child Student guidance) and the plain-language summary (gov.uk/student-visa) — all versioned, all dated, and all **fetchable by a plain crawler**.

Build the UK corpus first. It is the only one that can be ingested today without solving the 403 problem.

**Current direction of travel:** restriction. Dependants barred for most taught master's since January 2024; the Graduate route drops to 18 months for applications on or after 1 January 2027.

## Official Immigration / Visa Sources (Tier 1)

### Source: Immigration Rules — Appendix Student

- **Country:** United Kingdom
- **Category:** Student visa rules — the primary legal instrument
- **Authority:** UK Home Office / UK Visas and Immigration
- **Source Type:** Official Government — Immigration Rules
- **URL:** `https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-student`
- **RAG Priority:** Tier 1 — **highest retrieval priority for the UK**
- **Scrape/Index:** Yes — **the numbered ST clause is the chunk**
- **Useful For:**
  - Validity and suitability requirements (ST 1–2)
  - Eligibility: entry clearance, tuberculosis, application timing, genuine student assessment (ST 3–27)
  - CAS, course, qualification level and study location (ST 7–11)
  - Financial and English language requirements (ST 12–13)
  - Academic progress (ST 14)
  - Maximum study periods (ST 19)
  - Work and study conditions (ST 26–27)
  - Dependants — partner and child requirements, financial thresholds, permission periods (ST 28–39)
- **Notes:**
  - **Fetched and read 2026-08-21. Updated 3 August 2026.**
  - The route is scored on a **70-point** basis: 50 study + 10 financial + 10 English.
  - The Rules state explicitly: *"The Student route is not a route to settlement"* — an important expectation-setting chunk.
  - Applies to students aged 16+ studying with a licensed sponsor.
  - Clause numbering must be preserved in metadata so answers can cite "ST 12" rather than a page.
- **Verification:** **Fetched 2026-08-21**
- **Last Verified:** 2026-08-21

### Source: Student and Child Student — Caseworker Guidance

- **Country:** United Kingdom
- **Category:** Decision-making guidance / genuine student / credibility
- **Authority:** UK Visas and Immigration
- **Source Type:** Official Government — caseworker guidance (HTML + 110pp PDF)
- **URL (publication):** `https://www.gov.uk/government/publications/student-route-caseworker-guidance`
- **URL (accessible HTML):** `https://www.gov.uk/government/publications/student-route-caseworker-guidance/student-and-child-student-accessible`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — prefer the **accessible HTML** version over the PDF
- **Useful For:**
  - How UKVI actually decides a Student application
  - Credibility assessment
  - Switching restrictions
  - TB certificate triggers
  - How financial evidence is scrutinised in practice
- **Notes:**
  - **Fetched 2026-08-21.** Title *"Student route: caseworker guidance"*, latest update **3 August 2026**, first published 15 November 2013. Contains "Student and Child Student (accessible)" (HTML) and a 110-page PDF.
  - This is the closest UK analogue to Australia's Ministerial Direction 106 — the decision-maker's own manual. **Best source for "why might I be refused".**
  - The publication page is the stable URL; the guidance document URL changes with versions. **Resolve the current document from the publication page on every refresh.**
- **Verification:** **Fetched 2026-08-21**
- **Last Verified:** 2026-08-21

### Source: Immigration Rules — Appendix Finance

- **Country:** United Kingdom
- **Category:** Proof of funds / financial evidence standard
- **Authority:** UK Home Office
- **Source Type:** Official Government — Immigration Rules
- **URL:** `https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-finance`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - What forms of funds are acceptable: money in a qualifying bank or building society account; official financial sponsorship; student loans
  - Requirements for financial institutions — regulatory approval in their country of operation, electronic record keeping, verifiable by the decision-maker
  - Student loan letter requirements, including that it must be dated **no more than 6 months** before the date of application
  - Official financial sponsor categories: HM Government, national governments, British Council, international organisations, companies, universities, independent schools
- **Notes:**
  - **Fetched and read 2026-08-21. Updated 3 August 2026.**
  - **Correction to the prior audit.** The prior document claimed Appendix Finance contains country-specific rules on which financial institutions are acceptable. **This is not the case.** The Appendix sets *universal* institutional criteria. The only country-specific content found is **currency conversion guidance for Syrian Pounds, Mongolian Tugrik and Iranian Rials** — not institutional acceptability by country.
  - Any list of financial institutions whose evidence is not accepted, if it exists, lives elsewhere (likely the caseworker guidance). **`Authoritative source not identified` — flag for manual check.**
- **Verification:** **Fetched 2026-08-21**
- **Last Verified:** 2026-08-21

### Source: Student Visa — Money You Need

- **Country:** United Kingdom
- **Category:** Financial requirements — the actual amounts
- **Authority:** UK Home Office
- **Source Type:** Official Government
- **URL:** `https://www.gov.uk/student-visa/money`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — **but the amounts go to the rules table, not into an embedding**
- **Useful For:**
  - Maintenance amounts for London and outside London
  - How many months of maintenance are required
  - The 28-day holding period rule
- **Notes:**
  - **Fetched and read 2026-08-21.** Current stated amounts: **£1,529/month for up to 9 months for courses in London**; **£1,171/month for up to 9 months for courses outside London**. Funds must be held **for at least 28 days in a row**, and *"the end date of the 28-day period must be within 31 days of the date you apply for your visa"*.
  - **These figures have changed since the prior audit**, which recorded £1,483 / £1,136. That audit was dated 2026-08-20 — one day before this pass — which tells you how fast these values move and why they must never be embedded.
  - **Basis of calculation is where you *study*, not where you live.** London versus outside London follows the institution.
- **Verification:** **Fetched 2026-08-21**
- **Last Verified:** 2026-08-21

### Source: Student Visa — Overview (fees, work rights, conditions)

- **Country:** United Kingdom
- **Category:** Visa overview / fees / work rights / conditions
- **Authority:** UK Home Office
- **Source Type:** Official Government
- **URL:** `https://www.gov.uk/student-visa`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — all sub-pages
- **Useful For:**
  - Application fees
  - What the visa permits and prohibits
  - Entry dates and duration
- **Notes:**
  - **Fetched and read 2026-08-21.** Application fee: **£558** to apply from outside the UK, and **£558** to extend or switch from inside the UK.
  - Verified permitted activities include study and working as a student union sabbatical officer; work amount *"depends on what you're studying and whether you're working in or out of term-time"*.
  - Verified prohibitions: cannot work as a **professional sportsperson or sports coach**, cannot be **self-employed**, cannot **claim public funds (benefits) or pensions**.
  - Cleanest plain-language entry point in the whole registry. Good source for phrasing; defer to Appendix Student for the rule.
- **Verification:** **Fetched 2026-08-21**
- **Last Verified:** 2026-08-21

### Source: Student Visa — Documents You Must Provide

- **Country:** United Kingdom
- **Category:** Required documents
- **Authority:** UK Home Office
- **Source Type:** Official Government
- **URL:** `https://www.gov.uk/student-visa/documents-you-must-provide`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - The mandatory document list
  - Which documents are conditional
- **Notes:**
  - **Fetched and read 2026-08-21.** Mandatory: *"a current passport or other valid travel documentation"* and *"a Confirmation of Acceptance for Studies (CAS) from your course provider"*.
  - Conditional: proof of sufficient funds; *"a valid ATAS certificate"*; parental consent if under 18; *"your tuberculosis test results"*; financial sponsor consent.
  - **Biometrics are not listed on this page** — the page instead refers to proving identity as part of the application. Retrieve alongside the application-process page for a complete biometrics answer.
- **Verification:** **Fetched 2026-08-21**
- **Last Verified:** 2026-08-21

### Source: Student Visa — Knowledge of English

- **Country:** United Kingdom
- **Category:** English language requirements — **visa layer**
- **Authority:** UK Home Office
- **Source Type:** Official Government
- **URL:** `https://www.gov.uk/student-visa/knowledge-of-english`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - Required CEFR level by course level
  - What evidence is accepted
  - Who is exempt
- **Notes:**
  - **Fetched and read 2026-08-21.** **CEFR B2** for degree level or above; **CEFR B1** for below degree level.
  - Accepted evidence: a UK school qualification (GCSE/A level/Scottish qualifications in English); a degree from a UK institution; a degree taught in English from an institution outside the UK (requiring **Ecctis** assessment); or passing a **Secure English Language Test (SELT)** from an approved provider.
  - Exemption for citizens of a listed set of majority-English-speaking countries and territories, and for applicants who previously proved English in an earlier visa application. **This is origin-differentiated** — tag with `origin_country`.
  - **This is the visa requirement, not the university's.** Sponsors may self-assess at degree level, which is why a student can face a higher institutional IELTS than the visa rule implies. Never conflate.
- **Verification:** **Fetched 2026-08-21**
- **Last Verified:** 2026-08-21

### Source: Student Visa — Your Partner and Children

- **Country:** United Kingdom
- **Category:** Dependants / family rules
- **Authority:** UK Home Office
- **Source Type:** Official Government
- **URL:** `https://www.gov.uk/student-visa/family-members`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - Who counts as a dependant
  - Which courses permit dependants
- **Notes:**
  - **Fetched and read 2026-08-21.** Eligible dependants: *"your husband, wife or civil partner"*, *"your unmarried partner"*, *"your child under 18 years old - including if they were born in the UK during your stay"*.
  - Dependants are permitted only if the student is *"a government-sponsored student starting a course that lasts longer than 6 months"* **or** *"a full-time student on a postgraduate level course (RQF level 7 or above) that lasts 9 months or longer"* — and for postgraduate courses **beginning on or after 1 January 2024**, the course must be a **PhD/doctorate (RQF level 8) or a research-based higher degree**.
  - **This is the single most consequential UK rule for the taught-master's market.** Most taught master's students can no longer bring dependants. Retrieval must surface this without hedging.
- **Verification:** **Fetched 2026-08-21**
- **Last Verified:** 2026-08-21

### Source: Immigration Health Surcharge (IHS)

- **Country:** United Kingdom
- **Category:** Additional government charges / health insurance equivalent
- **Authority:** UK Home Office
- **Source Type:** Official Government
- **URL:** `https://www.gov.uk/healthcare-immigration-application/how-much-pay`
- **URL (who pays):** `https://www.gov.uk/healthcare-immigration-application`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — amounts to the rules table
- **Useful For:**
  - How much the IHS costs and for how long it must be paid
  - That it is paid upfront, per year of visa, and grants NHS access
- **Notes:**
  - **Fetched and read 2026-08-21.** *"£776 per year for students, their dependants, and those on a Youth Mobility Scheme visa"*; *"£1,035 per year for all other visa and immigration applications"*.
  - **The UK's answer to "do I need health insurance" is structurally different from Australia's.** The UK charges a surcharge granting NHS access rather than requiring private cover. The counsellor must not describe the IHS as insurance a student buys from a provider.
  - The **dependant** IHS is charged per dependant per year — a large, frequently-underestimated cost.
- **Verification:** **Fetched 2026-08-21**
- **Last Verified:** 2026-08-21

### Source: Graduate Visa

- **Country:** United Kingdom
- **Category:** Post-study work transition
- **Authority:** UK Home Office
- **Source Type:** Official Government
- **URL:** `https://www.gov.uk/graduate-visa`
- **URL (partner and children):** `https://www.gov.uk/graduate-visa/your-partner-and-children`
- **URL (Appendix Graduate):** `https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-graduate`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - Post-study stay duration
  - Application fee and healthcare surcharge
  - Eligibility after completing a UK course
- **Notes:**
  - **Fetched and read 2026-08-21.** Duration: *"2 years if you apply on or before 31 December 2026"*; *"18 months if you apply on or after 1 January 2027"*; **3 years** for PhD or other doctoral qualification holders. Application fee **£937**; healthcare surcharge *"usually £1,035 for each year you'll be in the UK"*.
  - **This is a date-conditional rule and must be encoded as one**, not as prose. A student applying in December 2026 and one applying in January 2027 get materially different answers. The rules table needs `effective_from` / `effective_until` on this row, and the counsellor must ask when the student expects to apply.
  - Note the surcharge asymmetry: **£776/yr on the Student route, £1,035/yr on the Graduate route.** Students routinely miss this jump.
  - On the Graduate route, only *existing* Student-route dependants may extend. **`Not verified` this pass** — retrieve the partner-and-children page rather than asserting.
- **Verification:** **Fetched 2026-08-21**
- **Last Verified:** 2026-08-21

### Source: Graduate Route — Caseworker Guidance

- **Country:** United Kingdom
- **Category:** Post-study work — decision-making guidance
- **Authority:** UK Visas and Immigration
- **Source Type:** Official Government — caseworker guidance
- **URL:** `https://www.gov.uk/government/publications/graduate-caseworker-guidance`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes
- **Useful For:**
  - How Graduate route applications are assessed
  - Edge cases: study abroad periods, course completion confirmation timing
- **Notes:**
  - Prior audit recorded a 3 August 2026 republication, consistent with the Student route guidance verified this pass. **Publication page URL `Not verified` this pass** — confirm the exact slug.
- **Verification:** Not verified this pass. **Manual check required.**
- **Last Verified:** 2026-08-20 (prior audit)

### Source: ATAS — Academic Technology Approval Scheme

- **Country:** United Kingdom
- **Category:** Additional clearance requirement — **a hard visa gate**
- **Authority:** Foreign, Commonwealth and Development Office
- **Source Type:** Official Government
- **URL (guidance):** `https://www.gov.uk/guidance/academic-technology-approval-scheme`
- **URL (do I need one):** `https://www.gov.uk/guidance/find-out-if-you-require-an-atas-certificate`
- **URL (portal):** `https://www.academic-technology-approval.service.gov.uk`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Guidance pages **Yes**. Portal **No** — application service, link only.
- **Useful For:**
  - Whether an ATAS certificate is needed, keyed on the **CAH3 code on the offer letter** and nationality
  - How long ATAS takes, and why it must be started early
- **Notes:**
  - **Confirmed as a conditional document requirement by the gov.uk documents page fetched 2026-08-21** (*"a valid ATAS certificate"*).
  - **Timeline destroyer when discovered late.** Prior audit recorded a minimum of 20 working days, rising to 30 between April and September — **`Not verified` this pass.**
  - Disproportionately relevant to engineering and physical-science postgraduates from South Asia. Worth proactive surfacing rather than waiting to be asked.
- **Verification:** Not verified this pass (URLs carried forward; requirement itself confirmed). **Manual check required.**
- **Last Verified:** 2026-08-20 (prior audit)

### Source: Immigration Rules index + Appendix Tuberculosis

- **Country:** United Kingdom
- **Category:** Health examination requirements — **origin-country differentiated**
- **Authority:** UK Home Office
- **Source Type:** Official Government — Immigration Rules
- **URL (index):** `https://www.gov.uk/guidance/immigration-rules`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — index plus the appendices Appendix Student depends on
- **Useful For:**
  - Which countries require a TB certificate
  - Resolving cross-references from Appendix Student
- **Notes:**
  - Appendix Student (fetched 2026-08-21) explicitly references tuberculosis screening, and the documents page lists TB test results as conditional. **The country list itself lives in Appendix Tuberculosis, reached via the index.**
  - **Tag with `origin_country`.** This is a clean origin-differentiated rule and a good early win for personalised answers.
  - The exact Appendix Tuberculosis URL was not fetched this pass — resolve from the index rather than hard-coding.
- **Verification:** Index page pattern confirmed via Appendix Student and Appendix Finance fetches 2026-08-21; Appendix Tuberculosis itself **Not verified**
- **Last Verified:** 2026-08-21

### Source: Statements of Changes in Immigration Rules — change feed

- **Country:** United Kingdom
- **Category:** Change detection
- **Authority:** UK Home Office
- **Source Type:** Official Government
- **URL:** `https://www.gov.uk/government/collections/immigration-rules-statement-of-changes`
- **RAG Priority:** Tier 1
- **Scrape/Index:** Yes — **poll**
- **Useful For:**
  - Detecting Immigration Rules changes at source, with plain-English explanatory memoranda
- **Notes:**
  - Each Statement of Changes ships with an explanatory memorandum written in plain English — **unusually good change-detection input**, better than diffing the Rules themselves.
  - The prior audit cited HC 259 (9 Jul 2026) and HC 1333 (14 Oct 2025). **Collection URL `Not verified` this pass** — confirm the slug.
- **Verification:** Not verified this pass. **Manual check required.**
- **Last Verified:** 2026-08-20 (prior audit)

## Non-Government Secondary (Tier 4) — the only one in this registry

### Source: UKCISA — Fee Status and Student Work Rights

- **Country:** United Kingdom
- **Category:** Fee status / work rights explanation
- **Authority:** UK Council for International Student Affairs — **non-government charity**
- **Source Type:** **Non-government secondary**
- **URL:** `https://www.ukcisa.org.uk/student-advice/fees/`
- **URL (Scotland):** `https://www.ukcisa.org.uk/student-advice/fees/scotland-he-fee-status/`
- **URL (work):** `https://www.ukcisa.org.uk/student-advice/working/student-work/`
- **RAG Priority:** **Tier 4 — lower authority, explicitly marked**
- **Scrape/Index:** Yes, **with a mandatory `authority_tier: 4` tag and suppression rule active**
- **Useful For:**
  - Home versus overseas **fee status**, which materially changes cost and is genuinely not well explained on gov.uk
  - Scotland's distinct fee regime (`scope: region_rule`, GB-SCT)
  - Practical interpretation of term-time work limits
- **Notes:**
  - **Retained deliberately, as the single exception to the government-only rule**, because fee status is a real question with no adequate official student-facing source. Every other non-government source from the prior audit was removed.
  - **Suppression applies:** if a gov.uk chunk answers the same question, drop the UKCISA chunk from context entirely.
  - **Never let UKCISA be the source of a visa rule, fee, or threshold.** It is admitted for *explanation*, not authority.
- **Verification:** Not verified this pass. **Manual check required.**
- **Last Verified:** 2026-08-20 (prior audit)

## UK Source Coverage Summary

| Topic | Covered | Primary source |
|---|---|---|
| Student visa type/category | ✅ | Appendix Student; gov.uk/student-visa |
| Eligibility requirements | ✅ | Appendix Student ST 3–27 (70-point framework) |
| Academic admission relationship | ✅ | CAS from a licensed sponsor is mandatory |
| Application process | ✅ | gov.uk/student-visa |
| Required documents | ✅ | Documents you must provide |
| Proof of funds | ✅ | Money you need + Appendix Finance |
| English requirements (visa layer) | ✅ | Knowledge of English (B2 / B1) |
| Health insurance | ✅ | IHS — structurally a surcharge, not private insurance |
| Health examination | ✅ | TB test (conditional, origin-differentiated) |
| Biometrics | ⚠️ | Identity-proving referenced; no dedicated page verified |
| Police/character | ⚠️ | Suitability requirements in Appendix Student ST 2; no dedicated student page |
| Visa application fees | ✅ | gov.uk/student-visa (£558) |
| Additional government charges | ✅ | IHS (£776/yr students) |
| Processing times | ⚠️ | Not verified this pass — gov.uk publishes visa processing times, URL not confirmed |
| Visa conditions | ✅ | Appendix Student ST 26–27; gov.uk/student-visa |
| Work rights / hour restrictions | ⚠️ | Prohibitions verified; **term-time hour cap not verified** — retrieve, do not assert |
| Dependants | ✅ | Your partner and children — **taught master's largely barred** |
| Visa duration | ✅ | Appendix Student ST 19 (maximum study periods) |
| Extension / renewal | ✅ | gov.uk/student-visa (£558 to extend/switch in-UK) |
| Changing course/institution | ⚠️ | Academic progress (ST 14) and switching restrictions in caseworker guidance; no dedicated page |
| Post-study work transition | ✅ | Graduate visa — **date-conditional, 1 Jan 2027 cliff** |
| ATAS clearance | ✅ | Requirement confirmed; timelines `Not verified` |
| Origin-country differentiation | ✅ | English exemption list; Appendix Tuberculosis |

---

# Cross-Country Source Coverage Matrix

`✅` authoritative source identified and verified this pass · `⚠️` partial, indirect, or source identified but not verified · `❌` authoritative coverage not identified (including where the requirement does not exist)

| Topic | US | Australia | Canada | UK |
|---|---|---|---|---|
| Student visa type/category | ✅ | ✅ | ✅ | ✅ |
| Eligibility requirements | ✅ | ✅ | ✅ | ✅ |
| Academic admission relationship | ✅ | ✅ | ✅ | ✅ |
| Application process | ✅ | ✅ | ✅ | ✅ |
| Official application portal | ✅ | ✅ | ⚠️ | ⚠️ |
| Required documents | ✅ | ✅ | ✅ | ✅ |
| Proof of funds / financial requirements | ⚠️ | ⚠️ | ✅ | ✅ |
| Tuition payment requirement (visa-relevant) | ⚠️ | ⚠️ | ⚠️ | ❌ |
| English requirements (visa layer) | ❌ | ⚠️ | ❌ | ✅ |
| Health insurance | ❌ | ✅ | ❌ | ✅ |
| Health examination / medicals | ⚠️ | ⚠️ | ✅ | ✅ |
| Biometrics | ⚠️ | ⚠️ | ✅ | ⚠️ |
| Police / character requirements | ⚠️ | ⚠️ | ✅ | ⚠️ |
| Visa application fees | ✅ | ✅ | ⚠️ | ✅ |
| Additional government charges | ⚠️ | ⚠️ | ⚠️ | ✅ |
| Processing times | ⚠️ | ✅ | ✅ | ⚠️ |
| Visa conditions | ✅ | ✅ | ✅ | ✅ |
| Work rights during study | ✅ | ✅ | ✅ | ⚠️ |
| Work-hour restrictions | ✅ | ✅ | ✅ | ⚠️ |
| Dependants / family rules | ✅ | ⚠️ | ⚠️ | ✅ |
| Age-related requirements | ❌ | ⚠️ | ❌ | ⚠️ |
| Genuine student / intent requirement | ⚠️ | ✅ | ⚠️ | ✅ |
| Visa duration | ✅ | ✅ | ⚠️ | ✅ |
| Extension / renewal | ✅ | ⚠️ | ⚠️ | ✅ |
| Changing course / education provider | ✅ | ✅ | ⚠️ | ⚠️ |
| Arrival requirements | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Post-study work transition | ✅ | ✅ | ✅ | ✅ |
| Official policy / legislation source | ✅ | ✅ | ⚠️ | ✅ |
| Origin-country differentiated guidance | ✅ | ✅ | ✅ | ✅ |
| Official change feed | ❌ | ⚠️ | ✅ | ✅ |
| Machine-fetchable without stealth crawler | ❌ | ⚠️ | ❌ | ✅ |

### Reading the matrix

Three patterns matter more than any individual cell:

1. **The UK is the only column that is both well-covered and fetchable.** Build it first; it de-risks the pipeline while the crawler problem is solved for the others.
2. **`❌` sometimes means "the requirement does not exist"**, not "we failed to find it." US visa-layer English (`❌`), US health insurance (`❌`) and Canada visa-layer English (`❌`) are all genuine absences — the requirement lives at the institution, not the visa. **The counsellor must say "this is not a visa requirement in this country" rather than "I don't know."** Encode these as explicit negative facts.
3. **Arrival requirements are the weakest row across all four.** No destination has a verified authoritative student-arrival page in this registry. Either fill this gap or scope it out of the counsellor's remit.

---

# RAG Ingestion Recommendations

## The two-layer split

Every retained category is dominated by **single values with effective dates**, and this pass alone caught a UK maintenance figure that had moved within 24 hours of the prior audit being written. Do not put numbers in the vector store.

```
Layer A — Rules Table (structured, exact lookup, NOT vectors)
  country | region | topic | rule_key | value | unit
        | effective_from | effective_until | status
        | confidence | source_url | verified_on

  Injected into the prompt as facts. Owned by a scheduled
  re-verification job, not by the crawler.

Layer B — Vector store (the RAG corpus)
  Visa procedures, evidence rules, conditions, work restrictions,
  post-study eligibility, dependant rules, health and character
  requirements, application steps.

  Chunks say "the current requirement" and let Layer A supply
  the number. A chunk that states a threshold is a bug.
```

### Rules-table rows this pass verified

| Country | Rule | Value | Effective | Confidence |
|---|---|---|---|---|
| UK | Maintenance, London | £1,529/month, up to 9 months | current at 2026-08-21 | **High — fetched** |
| UK | Maintenance, outside London | £1,171/month, up to 9 months | current at 2026-08-21 | **High — fetched** |
| UK | Funds holding period | 28 consecutive days; period end within 31 days of application | current | **High — fetched** |
| UK | Student visa fee | £558 (outside UK); £558 (extend/switch in UK) | current | **High — fetched** |
| UK | IHS | £776/year students and dependants; £1,035/year others | current | **High — fetched** |
| UK | Visa English | CEFR B2 (degree+); CEFR B1 (below degree) | current | **High — fetched** |
| UK | Graduate route duration | 2 years if applying on/before 2026-12-31; 18 months if on/after 2027-01-01; 3 years for doctoral | **date-conditional** | **High — fetched** |
| UK | Graduate route fee | £937 + IHS ~£1,035/year | current | **High — fetched** |
| UK | Dependants | Only government-sponsored (>6mo) or PG RQF7+ (≥9mo); for PG courses starting on/after 2024-01-01, must be PhD/RQF8 or research-based higher degree | current | **High — fetched** |
| AU | Student visa application charge | from AUD 2,500 | from 2026-07-01 | **Medium — Tier 2 fetched (Study Australia)** |
| AU | Work limit | 48 hours/fortnight while course in session; unrestricted out of session; exempt if commenced masters by research or doctoral | from 2023-07-01 | **Medium — index only** |
| AU | Health insurance | OSHC mandatory (condition 8501); only OSHC qualifies; buy before arrival | current | **Medium — index only** |
| AU | Genuine Student requirement | applies to applications lodged on/after 2024-03-23 (GTE before) | current | **Medium — index only** |
| AU | Offshore 500 processing order | Ministerial Direction 115, two priority levels, for applications lodged on/after 2025-11-14 | current | **Medium — index only** |
| CA | Cost-of-living, single, outside Quebec | CAD 22,895 | from 2025-09-01, indexed annually each 1 Sep to LICO | **Medium — index only; 2026-09-01 update due** |
| CA | Off-campus work | 24 hours/week in session; unlimited during scheduled breaks | current | **Medium — index only** |
| CA | PGWP language | CLB/NCLC 7 (bachelor/master/doctoral); CLB/NCLC 5 (other programmes); none if applied before 2024-11-01 | current | **Medium — index only** |
| CA | PGWP field of study | required for non-degree programmes only | current | **Medium — index only** |
| US | I-901 SEVIS fee | USD 350 (F/M); USD 220 (most J); USD 35 (J au pair/camp/summer work-travel) | current | **Medium — index only** |
| US | MRV visa application fee | USD 185 (student and exchange visitor) | current | **Medium — index only** |
| US | Financial threshold | **none set federally** — governed by the school's I-20 cost of attendance | structural | **High** |
| US | F-2 / M-2 work | **not authorised** | structural | **Medium — index only** |

Every `Medium — index only` row needs a browser-based re-fetch before production.

### Rules-table rows explicitly NOT populated

Do not guess these. The counsellor must say it cannot confirm them.

| Country | Rule | Status |
|---|---|---|
| AU | Financial capacity amount (savings) | **`Not verified`** — prior audit said AUD 29,710; unconfirmed |
| AU | Annual-income alternative | **`Not verified`** — prior audit implied AUD 60,000 / 70,000; unconfirmed |
| AU | Subclass 485 age limit and English threshold | **`Not verified`** |
| US | "Visa Integrity Fee" USD 250 | **`Not verified`** — not found on any State Department page this pass |
| CA | Spouse open work permit current scope | **`Not verified`** — narrowing recorded 2025-01-21, unconfirmed |
| CA | CAQ fee and processing time | **`Not verified`** |
| UK | Term-time work-hour cap | **`Not verified`** — prohibitions verified, hour cap not |
| UK | ATAS processing time | **`Not verified`** |
| All | Arrival requirements | **`Authoritative source not identified`** |

## Retrieval priority

1. **Tier 1 immigration department pages, always first.** Home Affairs, IRCC, UKVI, DHS/USCIS/State. These are the only sources authorised to establish a rule.
2. **Decision-maker guidance ranks above student-facing summaries** for "why was I refused" and "how will this be assessed": Ministerial Direction 106, UKVI caseworker guidance, USCIS Policy Manual, IRCC Guide 5269.
3. **Numbered-clause sources rank above prose** where both exist. Appendix Student clause ST 12 beats a gov.uk paragraph for a rules question, and cites better.
4. **Tier 2 portals for phrasing, never for authority.** Study Australia and EducationUSA make good answers readable; they do not make them true.
5. **Tier 4 (UKCISA) only when no government source answers the question**, and always labelled.

## What to scrape and index

**Index (with a browser-based fetcher):** everything marked `Scrape/Index: Yes` above.

**Never scrape — link only:**

| Source | Why |
|---|---|
| `ceac.state.gov/genniv/` (DS-160) | Session-based interactive form |
| `online.immi.gov.au/lusc/login` (ImmiAccount) | Authenticated portal |
| `immi.homeaffairs.gov.au/visas/web-evidentiary-tool` | Interactive, state-dependent output |
| IRCC processing times tool | Interactive, weekly updates |
| `academic-technology-approval.service.gov.uk` | Application service |
| `fmjfee.com` | Payment portal |
| IRCC off-campus work eligibility tool | Interactive |

These are **referral targets**. The correct pattern is: answer from the corpus, then link the tool for the personalised output.

**Special handling:**

| Content | Handling |
|---|---|
| Canada PGWP eligible CIP code list | Load into the rules table keyed on CIP code. **Never embed.** Vector search over a coded list produces confident wrong matches. |
| Ministerial Direction 106 / 115 (PDF) | Extract text; preserve clause numbers as chunk metadata. |
| UKVI caseworker guidance | Prefer the accessible HTML over the PDF. Resolve the current document from the publication page each refresh. |
| IMM 5483 and IMM 58xx checklists | Version-dated PDF paths. Resolve from the hub page; record version date in metadata. |
| Australian subclass 500 tabbed pages | Each tab is a separate fetch. A single fetch captures only the first tab. |

## Refresh cadence

| Class | Content | Recheck | Rule |
|---|---|---|---|
| **Volatile** | Funds thresholds, visa fees, work-hour caps, post-study durations, PAL/intake caps, PGWP eligible fields, spouse work-permit scope, processing times | **Monthly**, plus on every change-feed hit | Rules table only. **Stale beyond 60 days → the counsellor must refuse the number and link the source.** |
| **Frequent** | Visa page bodies, caseworker guidance, document checklists | Quarterly | Re-embed changed chunks; bump `verified_on`. |
| **Moderate** | Visa-layer English requirements, dependant policy, health insurance rules, condition texts | Half-yearly | — |
| **Stable** | Immigration Rules appendices, ministerial directions, USCIS Policy Manual structure | Annually | Safe long-lived embeddings. **Build the corpus here first.** |

**Diarised checks:**
- **1 September, every year** — Canada's cost-of-living requirement re-indexes to LICO. Non-negotiable.
- **1 January 2027** — the UK Graduate route drops to 18 months. The rules table must flip automatically on application date, not on calendar date.
- **1 July, every year** — Australian visa charges typically move with the financial year.

**Change feeds to poll** (infrastructure, not content):
- IRCC Notices — `https://www.canada.ca/en/immigration-refugees-citizenship/news/notices.html` ✅ verified
- UK Statements of Changes — collection URL `Not verified`
- Home Affairs news/media — `https://immi.homeaffairs.gov.au/news-subsite/Pages/News-page.aspx` ✅ index-confirmed
- **US: no equivalent single feed identified.** `❌` Gap.

## Handling conflicts

Apply in order:

1. **Tier beats similarity.** A Tier 1 statement wins over a Tier 2/4 statement regardless of which is the closer semantic match. Drop the lower-tier chunk from context — do not include both and hope.
2. **More recent `verified_on` wins**, at the same tier.
3. **The rule-making instrument beats the summary.** Appendix Student over gov.uk prose. Ministerial Direction over the Home Affairs overview page.
4. **Legal instrument beats guidance beats portal**, within Tier 1.
5. **When two Tier 1 sources genuinely conflict and neither is clearly newer — say so and link both.** Do not synthesise a compromise. A hedge with two official links is a good answer; an averaged invention is not.
6. **Provincial/regional never overrides national, and never masquerades as it.** Quebec and Scotland content must carry `scope: province_rule` / `region_rule` and be presented as such.

## Handling outdated indexed documents

- **Label, do not hide.** A stale Volatile chunk that is suppressed blanks out exactly the most-asked questions the week the refresh job slips. Surface it with its `verified_on` and an explicit staleness warning.
- **Keep closed schemes retrievable** with `status: closed` and a `supersedes` pointer. SDS, GTE, and pre-2025 UK maintenance rates all still get asked about by name. "That closed on X; here is what applies now" beats a blank.
- **Never silently serve a stale number.** If `verified_on` exceeds the class threshold, the counsellor states the requirement exists, refuses the figure, and links the official page.

## Distinguishing visa information from general education information

Every chunk carries `topic`. Visa topics are:

```
student_visa · visa_eligibility · visa_application_process · visa_documents
financial_requirements · visa_english · health_insurance · health_examination
biometrics · character_requirements · visa_fees · processing_times
visa_conditions · work_rights · dependants · visa_duration
visa_extension · provider_change · post_study_work
```

Anything outside this list is not in this corpus. Two boundaries need active enforcement:

- **`financial_requirements` (the visa minimum) must never merge with cost-of-living estimates.** Governments publish a mandatory minimum that is deliberately below real cost. Blending them is the most common counselling error there is. Cost of living belongs in the separate country-education knowledge base.
- **`visa_english` must never merge with institutional admission English.** A student can satisfy CEFR B2 for the visa and still fail the university's IELTS requirement. Tag `layer: visa_english` and refuse to answer institutional English from this corpus.

## Rule-class labelling

Every chunk and rules-table row must carry a class, because the counsellor's confidence language depends on it:

| Class | Meaning | Counsellor phrasing |
|---|---|---|
| `current_rule` | In force now | State it, with the source. |
| `date_conditional` | Depends on application date | **Ask when they will apply, then answer.** E.g. UK Graduate route. |
| `temporary_policy` | Pilot or time-limited | Say it is temporary and give the end date. E.g. Canada's medical-exam exemption policy. |
| `province_rule` / `region_rule` | Sub-national | Name the province/region. Never present as national. E.g. Quebec CAQ, Scotland fee status. |
| `institution_rule` | Set by the provider | **Out of scope. Refuse and redirect.** E.g. university IELTS, US financial threshold on the I-20. |
| `general_immigration` | Applies beyond students | Note it is not student-specific. |
| `closed` | Superseded | State the closure date and point to the replacement. E.g. SDS, GTE. |

---

# Verification / Maintenance

## What this pass verified

**Fetched and read directly (2026-08-21):**
- `gov.uk/student-visa` — fee £558
- `gov.uk/student-visa/money` — maintenance £1,529 / £1,171, 28-day rule
- `gov.uk/student-visa/documents-you-must-provide` — document list
- `gov.uk/student-visa/knowledge-of-english` — B2 / B1, evidence types, exemptions
- `gov.uk/student-visa/family-members` — dependant eligibility and course restrictions
- `gov.uk/graduate-visa` — 2yr / 18mo / 3yr, £937
- `gov.uk/healthcare-immigration-application/how-much-pay` — IHS £776 / £1,035
- `gov.uk/guidance/immigration-rules/immigration-rules-appendix-student` — updated 3 Aug 2026, ST clause structure
- `gov.uk/guidance/immigration-rules/immigration-rules-appendix-finance` — updated 3 Aug 2026
- `gov.uk/government/publications/student-route-caseworker-guidance` — updated 3 Aug 2026, 110pp
- `studyaustralia.gov.au/.../student-visa-subclass-500` — AUD 2,500 from 1 Jul 2026
- `studyaustralia.gov.au/.../your-guide-to-visas` — hub structure

**Index-confirmed (URL and ownership live; body unreadable due to 403):** all `immi.homeaffairs.gov.au`, `canada.ca`, `ircc.canada.ca`, `travel.state.gov`, `uscis.gov`, `studyinthestates.dhs.gov`, `ice.gov`, `privatehealth.gov.au` URLs marked as such above.

## Corrections made to the prior audit

| Prior claim | Status after this pass |
|---|---|
| UK maintenance £1,483 London / £1,136 outside | **Wrong — now £1,529 / £1,171.** Changed within a day of the prior audit's date. |
| Appendix Finance is origin-differentiated (per-country acceptable financial institutions) | **Refuted.** Appendix Finance sets universal institutional criteria. The only country-specific content is currency conversion guidance for SYP, MNT and IRR. |
| USCIS Policy Manual Part F has a "Chapter 9 — Dependents" | **Unconfirmed.** Chapters 1–8 verified. Dependant guidance sourced from Study in the States instead. |
| US Visa Integrity Fee, USD 250 | **`Not verified`.** Not found on any State Department page this pass. |
| AU financial capacity AUD 29,710 | **`Not verified`.** Not confirmable from any readable official page. |

## Still requiring manual verification

Ordered by how much damage a wrong answer does:

1. **Australia — financial capacity amount.** The most-asked Australian question, and the number is unconfirmed. Requires a browser-based fetch of the Home Affairs subclass 500 and Genuine Access to Funds pages.
2. **Canada — cost-of-living requirement post-1 September 2026.** The annual LICO re-index is due or has just occurred. CAD 22,895 may already be stale.
3. **US — Visa Integrity Fee.** Either confirm it and its collection status, or remove it from institutional memory entirely.
4. **Canada — spouse open work permit current scope.** High-consequence for the married-applicant segment.
5. **UK — term-time work-hour cap.** Prohibitions verified, the cap itself was not.
6. **Australia — subclass 485 age limit and English threshold.**
7. **UK — ATAS processing timelines.** Wrecks timelines when discovered late; disproportionately affects South Asian engineering postgraduates.
8. **Canada — Quebec/CAQ cluster.** Four quebec.ca sub-paths carried forward unverified.
9. **Canada — visa-office checklist series.** Enumerate IMM 58xx and map office → served countries. **Specifically identify the office covering Nepal.**
10. **US — EducationUSA country subpath pattern.** Confirm `/nepal`, `/india`, `/bangladesh` etc. resolve.
11. **UK — Statements of Changes collection URL, Graduate caseworker guidance slug, Appendix Tuberculosis URL.**
12. **Australia — Home Affairs visa-layer English page; Fair Work Ombudsman page.**
13. **Arrival requirements, all four countries.** `Authoritative source not identified` across the board.

## Known structural gaps

| Gap | Impact |
|---|---|
| **No stealth-capable fetcher** | US, AU and CA corpora cannot be built at all. **Blocking.** |
| **No US change feed identified** | US rule changes will be detected late or not at all. |
| **Nepal-specific official coverage is thin** | The likely primary market has no dedicated page on most destination sites. Mitigations: Canada's per-country police-certificate pages, the visa-office checklist covering Nepal, EducationUSA Nepal, and Australia's Evidence Levels matrix. |
| **Arrival requirements unsourced** | Either fill or explicitly scope out of the counsellor's remit. |
| **Institution-set requirements are out of scope by design** | US financial thresholds and all admission English requirements live on the I-20 / with the university. The counsellor must refuse these deliberately, not improvise. |

## Before ingestion — do these in order

1. **Solve the fetch problem.** Home Affairs, IRCC, USCIS, State, SEVP and ICE all return 403. Without a browser-based fetcher, three of four country corpora are empty or full of error pages, **and nothing tells you.**
2. **Build the UK corpus first.** It is fully fetchable today, the best-structured, and de-risks the pipeline while (1) is solved.
3. **Build the rules table before the vector store.** Populate the verified rows above; leave the unverified ones explicitly empty with a `Not verified` status the counsellor can read and act on.
4. **Write the refusals.** The counsellor must decline, by design: credential equivalency, provider legitimacy lookups, intakes and deadlines, institutional English requirements, institutional tuition and cost comparisons, and any `Not verified` figure. An AI that confidently guesses an immigration threshold is worse than one that says it does not know.
