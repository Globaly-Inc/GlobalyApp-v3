# Education Counselling Books & Professional Resources — RAG Sources

**Owner:** AI Counsellor knowledge base
**Companion documents:**
- [`COUNTRY_STUDENT_VISA_RAG_SOURCES.md`](./COUNTRY_STUDENT_VISA_RAG_SOURCES.md) — visa and immigration sources
- [`COUNTRY_INTERNATIONAL_STUDENT_GUIDELINES_RAG_SOURCES.md`](./COUNTRY_INTERNATIONAL_STUDENT_GUIDELINES_RAG_SOURCES.md) — studying, living, working, rights

**Last verification pass:** 2026-08-21

---

## Purpose

The other two source documents tell the AI counsellor **what is true** about a country. This one is about **how to counsel** — the frameworks, evidence and professional standards that let the system reason from a student's situation to a defensible recommendation instead of reciting facts or defaulting to popular destinations.

The distinction is the whole point:

| Without this layer | With this layer |
|---|---|
| "Australia requires AUD X and allows 48 hours a fortnight." | "Given your funding constraint, your family's expectations, and your stated career goal, here is why Australia may or may not fit — and here is what would change that answer." |
| Ranks countries by popularity | Reasons from student profile → destination suitability |
| Answers the question asked | Notices the question that should have been asked |

---

## Scope

**In scope:** counselling and advising frameworks · student profiling and needs assessment · destination, university and course selection reasoning · career development theory · student decision-making evidence · international student success and transition · intercultural competence · counselling ethics · inclusive and special-population advising · family influence · wellbeing and referral practice.

**Out of scope:** country-specific rules, visa policy, fees, thresholds, institutional data. Those live in the companion documents and must never be sourced from a book — books go stale, governments do not stop changing rules.

---

## Source Selection Criteria

A resource earned a place here only if it met all four:

1. **Credible authorship** — a recognised professional association, an established academic publisher, a government or intergovernmental body, or peer review.
2. **Counselling-relevant** — it changes how an adviser reasons, not just what they know.
3. **Verifiable** — publisher, year, edition and identifier confirmed, or explicitly marked `Not verified`. **A second verification pass on 2026-08-21 resolved 11 of 12 outstanding items; the single exception is recorded as confirmed-absent rather than unchecked.**
4. **Legally usable in some form** — even if only as a reference the system cites rather than ingests.

**Excluded on principle:** generic study-abroad trade paperbacks, self-published counselling books without credible authorship, education agent manuals, university promotional material, SEO listicles, forum content, and any shadow-library or pirated copy regardless of how convenient.

---

## Resource Authority Tiers

| Tier | Definition | Examples in this registry |
|---|---|---|
| **1** | Professional international education associations — the bodies that set practice standards | NAFSA · The Forum on Education Abroad · NACADA · EAIE |
| **2** | Established academic publishers and peer-reviewed journals | SAGE · Wiley · Jossey-Bass · Springer · Routledge · JIS · JSIE |
| **3** | Government and intergovernmental bodies | UNESCO · OECD · IIE · British Council |
| **4** | Peer-reviewed primary research and systematic reviews | Mazzarol & Soutar · SCCT · acculturation and mental-health reviews |

---

## Resource Type Classification

Each entry is typed, because type determines how the system should use it:

| Type | Use |
|---|---|
| **Framework** | A model the counsellor reasons *with* |
| **Practitioner Guide** | Practical advising method |
| **Reference Book** | Broad domain knowledge |
| **Research** | Evidence about how students actually behave |
| **Student Guide** | Written for students; useful for phrasing |
| **Policy/Professional Resource** | Standards, ethics, competencies |

---

## ⚠️ Read this before planning any ingestion

**Almost every high-value resource in this document is commercially copyrighted and must not be ingested as full text.** This is not a minor caveat — it is the defining architectural constraint of this layer, and it is a good thing rather than a blocker, for a reason worth stating plainly:

> **Frameworks are ideas. Ideas are not copyrightable; their expression is.**

The AI counsellor does not need Brown & Lent's *text* to reason with Social Cognitive Career Theory. It needs the model: self-efficacy → outcome expectations → interests → choice goals. That structure can be encoded as a **curated internal framework note** — written by your team, citing the source — and ingested freely. The book stays a **reference the system cites**, never a corpus it copies.

**And a second constraint, confirmed by licence verification on 2026-08-21:** *free to download* is not *free to reuse*. Several resources that read as open — the Journal of International Students, IIE Open Doors, both Forum documents — grant access but expressly reserve reuse rights, or licence under terms (`NonCommercial`, `NoDerivatives`) that a commercial AI product does not satisfy. **Verify the licence, not the price.**

This gives three legitimate ingestion routes:

1. **Verified-licence material** — ingest directly. After verification this is **OECD (CC BY 4.0)** and probably UNESCO, not the longer list the first pass assumed.
2. **Team-authored framework notes** — your own summary of a copyrighted model, citing the source. Fully ingestible. **This is where most of the value in this document will actually come from.**
3. **Licensed access** — where a subscription or a written permission exists and its terms permit. **Worth actively requesting** for the Journal of International Students.

**Never:** scrape a publisher preview, reconstruct a book from chapter samples, or use a shadow-library copy. Beyond the legal exposure, a counselling system whose provenance cannot be defended is not one you can sell to institutions.

### Ingestion classification used below

| Label | Meaning |
|---|---|
| `OPEN_ACCESS` | Freely licensed for reuse — ingest |
| `FULL_TEXT_ALLOWED` | Free and permitted, though licence terms should be read |
| `OFFICIAL_PREVIEW_ONLY` | Publisher-provided sample only — do not reconstruct |
| `METADATA_ONLY` | Cite the resource; encode the framework yourself |
| `LICENSE_REQUIRED` | Ingestible only under a purchased licence |
| `DO_NOT_INGEST` | Copyrighted commercial text, no permitted route |

---

# International Education & Advising

### Resource: The International Education Handbook: Principles and Practices of the Field, Second Edition

- **Resource Type:** Reference Book · Practitioner Guide
- **Author(s):** **Katherine Punteney** (single-authored, not an edited volume)
- **Publisher / Organization:** NAFSA: Association of International Educators
- **Publication Year:** 2026 (published 21 May 2026)
- **Edition:** Second
- **ISBN:** 978-1-942719-68-7
- **Extent:** 438 pages, 10 chapters
- **URL:** `https://www.nafsa.org/bookstore/international-education-handbook-second-edition`
- **DOI:** None — **confirmed no DOI assigned** (NAFSA does not DOI its books)
- **Price:** USD 54.00 print / USD 40.50 eBook (list)
- **Authority Tier:** 1
- **Primary Topic:** International education practice — the field as a whole
- **Secondary Topics:** International student recruitment and advising · education abroad models · global competence · experiential learning · citizen diplomacy
- **Intended Audience:** International education professionals; new entrants to the field
- **International Student Relevance:** High
- **Counselling Relevance:** High
- **RAG Priority:** **Highest** — the single best orientation to the profession
- **Full Text Available:** No — commercially sold
- **Legally Accessible Full Text:** No
- **Scrape/Index:** **No**
- **Copyright / Licensing Notes:** `METADATA_ONLY`. Commercially sold by NAFSA. **Purchase one copy** and derive internal framework notes; do not ingest.
- **Key Counselling Use:** Establishes the professional frame the AI should operate inside — what an international educator is *for*, and what good practice looks like.
- **Useful For:**
  - What does professional international education advising actually involve?
  - What competencies define good advising practice?
  - How do recruitment, advising and support functions relate to each other?
  - What is the ethical posture of the field?
- **Limitations:**
  - US-centric in places; European and Asia-Pacific practice differs.
  - 438 pages across 10 chapters — broad rather than deep on any one counselling task.
  - Newly published, so little independent review exists yet.
- **Last Verified:** 2026-08-21 (**fetched** — author, edition, year, ISBN, page count, formats and absence of a DOI confirmed on the NAFSA product page)
- **Notes:**
  - **Authorship correction:** frequently assumed to be an edited volume because of its handbook framing. It is **single-authored by Katherine Punteney**, which makes it more coherent than a typical multi-contributor handbook but narrower in perspective.

### Resource: NAFSA's Guide to Education Abroad for Advisers and Administrators, Fifth Edition

- **Resource Type:** Practitioner Guide
- **Author(s):** Margaret Wiedenhoeft and Corrine Henke (eds.)
- **Publisher / Organization:** NAFSA
- **Publication Year:** 2022 (published 15 March 2022)
- **Edition:** Fifth
- **ISBN:** 978-1-942719-47-2
- **Extent:** 431 pages
- **Price:** USD 100.00 print / USD 50.00 eBook (list)
- **URL:** `https://www.nafsa.org/bookstore/nafsas-guide-education-abroad-advisers-and-administrators-fifth-edition`
- **DOI:** N/A
- **Authority Tier:** 1
- **Primary Topic:** Education abroad advising
- **Secondary Topics:** Programme design · risk management · student preparation · re-entry
- **Intended Audience:** Education abroad advisers and administrators
- **International Student Relevance:** Moderate — written mainly for outbound advising
- **Counselling Relevance:** High — advising *method* transfers well
- **RAG Priority:** High
- **Full Text Available:** No
- **Legally Accessible Full Text:** No
- **Scrape/Index:** **No**
- **Copyright / Licensing Notes:** `METADATA_ONLY`
- **Key Counselling Use:** The most developed treatment of pre-departure preparation and expectation-setting available from a Tier 1 body.
- **Useful For:**
  - How should a student prepare before departure?
  - How do advisers set realistic expectations?
  - What does structured advising conversation look like?
- **Limitations:**
  - **Directionally inverted for our use case.** Written for US students going out, not international students coming in. The *advising craft* transfers; the regulatory and cultural content does not.
  - **2022** — predates the current restriction cycle across all four destination countries.
- **Last Verified:** 2026-08-21 (**fetched** — editors, year, ISBN, page count and pricing confirmed on the NAFSA product page)

### Resource: Standards of Good Practice for Education Abroad, Sixth Edition

- **Resource Type:** Policy/Professional Resource · Framework
- **Author(s):** Standards Update Working Group and Consensus Body
- **Publisher / Organization:** The Forum on Education Abroad
- **Publication Year:** 2020 (first printing; took effect 1 July 2020) · Enhanced Sixth Edition 2022 · minor updates 2023
- **Edition:** Sixth
- **✅ CANONICAL ARTEFACT (decided 2026-08-21):** the **current free download from `forumea.org`**. Its internal edition statement is the authoritative version marker and **must be recorded at download time** — see the pending action below.
- **ISBN (version history only, not canonical):** 9781952376009 (2020 trade paperback, 45 pp) · 9781952376245 (Enhanced Sixth Edition, 2022 — **excluded**)
- **URL:** `https://forumea.org/resources/standards-of-good-practice/`
- **DOI:** N/A
- **Authority Tier:** 1
- **Primary Topic:** Professional standards for education abroad
- **Secondary Topics:** Programme quality · ethics · student welfare · inclusive practice
- **Intended Audience:** Programme providers, institutions, advisers
- **International Student Relevance:** Moderate
- **Counselling Relevance:** **High** — it defines what "quality" means, which is exactly what a counsellor must help a student evaluate
- **RAG Priority:** **Highest among freely available resources**
- **Full Text Available:** **Yes** — freely available to members and non-members, in English, Spanish and French
- **Legally Accessible Full Text:** **Free to read. NOT free to reuse.**
- **Scrape/Index:** **No — permission required**
- **Copyright / Licensing Notes:** **`METADATA_ONLY`** *(corrected 2026-08-21 — previously misclassified as `FULL_TEXT_ALLOWED`)*. The Forum states **"© The Forum on Education Abroad. All Rights Reserved."** with no reuse licence. Free download **behind a short form** is access, not a licence. **Read it and encode the quality criteria in your own words**, or request written permission from the Forum.
- **Key Counselling Use:** Gives the AI an authoritative, non-commercial definition of programme quality — the antidote to ranking-based reasoning.
- **Useful For:**
  - What makes an education abroad programme good quality?
  - What should a student expect a provider to deliver?
  - What are the minimum standards a programme must meet?
  - How should quality be evaluated rather than assumed?
- **Limitations:**
  - Written for programme providers, not students — needs translation into student-facing language.
  - Education abroad focus; not all standards map onto full-degree international study.
- **Last Verified:** 2026-08-21 (**fetched** — edition, free availability and three languages confirmed; both ISBNs and the 2020/2022/2023 version history confirmed via index)
- **Notes:**
  - The Forum is **officially recognised by the U.S. Department of Justice and Federal Trade Commission as the Standards Development Organization for education abroad** — an unusually strong authority claim, and worth surfacing when a student asks how to judge a provider.
  - **Version history and the canonical decision.** Three artefacts carry the "sixth edition" label: the 2020 first printing (ISBN 9781952376009, 45 pp, effective 1 July 2020), the 2022 **Enhanced** Sixth Edition (ISBN 9781952376245), and a 2023 minor update broadening inclusion of diverse learning experiences, particularly internships.
    - **Canonical = the current free forumea.org download.** It is free, is the Forum's own live distribution, and post-dates the 2023 update.
    - **9781952376009 — retained as version history only.** Do not read or cite.
    - **9781952376245 (Enhanced, 2022) — excluded.** No documented changelog, costs money, and predates the 2023 update. Buying it would be worse than free-and-current.
    - **Never hold two sixth-edition artefacts in the corpus simultaneously.** Two near-identical quality frameworks retrievable side by side creates exactly the ambiguity the suppression rules exist to prevent.
  - ⏳ **PENDING ONE-TIME ACTION:** download the Standards from `forumea.org` (short form, choose English), open it, and record the **edition statement printed on its title/copyright page** in this entry. That single line resolves the version question permanently and is the only thing standing between this decision and a fully closed citation.
  - The 6th edition places **equity, diversity and inclusion** as cornerstones of programme design, and adds guidance on collaboration, transparency and post-programme integration.
  - The separate **Code of Ethics** is now verified — see the Ethical Counselling section.

### Resource: The SAGE Handbook of International Higher Education

- **Resource Type:** Reference Book
- **Author(s):** Darla K. Deardorff, Hans de Wit, John D. Heyl, Tony Adams (eds.)
- **Publisher / Organization:** SAGE Publications
- **Publication Year:** 2012
- **Edition:** First
- **ISBN:** 9781412999212
- **URL:** `https://us.sagepub.com/en-us/nam/the-sage-handbook-of-international-higher-education/book236747`
- **DOI:** `10.4135/9781452218397`
- **Authority Tier:** 2
- **Primary Topic:** Internationalisation of higher education
- **Secondary Topics:** Student mobility · comparative education systems · policy
- **Intended Audience:** Researchers, administrators, senior practitioners
- **International Student Relevance:** High
- **Counselling Relevance:** Moderate — contextual rather than operational
- **RAG Priority:** Medium
- **Full Text Available:** No
- **Legally Accessible Full Text:** No
- **Scrape/Index:** **No**
- **Copyright / Licensing Notes:** `METADATA_ONLY`
- **Key Counselling Use:** Explains *why* international education is structured as it is — useful for framing, not for advising a specific student.
- **Useful For:**
  - How do national higher education systems differ structurally?
  - What drives internationalisation policy?
- **Limitations:**
  - **2012 — materially dated.** Predates the post-2020 policy tightening across all four of our destination countries. **Do not let it inform any current-conditions answer.**
  - No second edition identified this pass.
- **Last Verified:** 2026-08-21 (year, editors, ISBN, DOI and publisher URL confirmed)

---

# International Student Advising

### Resource: Fostering International Student Success in Higher Education, Second Edition

- **Resource Type:** Practitioner Guide
- **Author(s):** Shawna Shapiro, Raichle Farrelly, Zuzana Tomaš
- **Publisher / Organization:** TESOL Press, co-published with NAFSA
- **Publication Year:** 2023
- **Edition:** Second
- **ISBN:** 9781953745064
- **URL:** `https://www.nafsa.org/bookstore/fostering-international-student-success-higher-education-second-edition`
- **DOI:** N/A · **ERIC ID:** ED627179
- **Authority Tier:** 1 / 2 (dual professional-body and academic-press provenance)
- **Primary Topic:** International student academic success and support
- **Secondary Topics:** Academic transition · language and literacy · faculty practice · inclusive pedagogy
- **Intended Audience:** Faculty, advisers, student support staff
- **International Student Relevance:** **Very high — the core audience**
- **Counselling Relevance:** High
- **RAG Priority:** **Highest for student success**
- **Full Text Available:** No
- **Legally Accessible Full Text:** No
- **Scrape/Index:** **No**
- **Copyright / Licensing Notes:** `METADATA_ONLY`. Commercially sold.
- **Key Counselling Use:** The best-sourced answer to "what will actually be hard when I get there, and what helps" — grounded in practice rather than anecdote.
- **Useful For:**
  - What academic challenges do international students commonly face?
  - How does academic culture differ and what does that mean for a student?
  - What support should a student look for at an institution?
  - How should students prepare academically before arrival?
- **Limitations:**
  - Written for **educators**, not students — reframing required.
  - Strong language/literacy emphasis reflecting its TESOL provenance; less on career or destination choice.
  - US higher education context predominates.
- **Last Verified:** 2026-08-21 (authors, publisher, edition, ISBN, ERIC ID confirmed)
- **Notes:**
  - **Correcting a common misattribution:** this title is sometimes credited to Andrade or to ACE. The verified second-edition authorship is **Shapiro, Farrelly and Tomaš**, co-published by **TESOL Press and NAFSA**.

### Resource: Addressing Mental Health Issues Affecting International Students

- **Resource Type:** Practitioner Guide
- **Author(s):** Patricia Burak (ed.)
- **Publisher / Organization:** NAFSA
- **Publication Year:** 2019 (published 17 May 2019)
- **ISBN:** 978-1-942719-32-8
- **Extent:** 115 pages
- **URL:** `https://www.nafsa.org/bookstore/addressing-mental-health-issues-affecting-international-students`
- **Authority Tier:** 1
- **Primary Topic:** International student mental health
- **Secondary Topics:** Referral practice · cultural dimensions of help-seeking · adviser checklists
- **Intended Audience:** International student advisers
- **International Student Relevance:** **Very high**
- **Counselling Relevance:** High
- **RAG Priority:** High
- **Full Text Available:** No · **Legally Accessible Full Text:** No · **Scrape/Index:** **No**
- **Copyright / Licensing Notes:** `METADATA_ONLY`
- **Key Counselling Use:** Defines the **adviser's** role in wellbeing — which is recognition and referral, not treatment. This is the boundary our AI must hold.
- **Useful For:**
  - What mental health pressures are specific to international students?
  - When should a counsellor refer rather than advise?
  - How do cultural attitudes to mental health affect help-seeking?
- **Limitations:**
  - **Do not use to build any diagnostic or therapeutic capability.** The AI's role stops at recognising signals and routing to real support.
  - **2019 — predates the pandemic-era shift in student mental health**, and predates the systematic review evidence catalogued under Student Wellbeing below. Pair the two rather than relying on this alone.
- **Last Verified:** 2026-08-21 (**fetched** — editor, year, ISBN, page count and formats confirmed on the NAFSA product page)

### Resource: Advising International Students with Disabilities, Second Edition

- **Resource Type:** Practitioner Guide
- **Author(s):** Cory Owen
- **Publisher / Organization:** NAFSA
- **Publication Year:** 2020 (published 4 May 2020) · **Edition:** Second · **ISBN:** 978-1-942719-37-3
- **Extent:** 78 pages · Digital download only
- **URL:** `https://www.nafsa.org/bookstore/advising-international-students-disabilities-second-edition`
- **Authority Tier:** 1
- **Primary Topic:** Inclusive advising — disability
- **Intended Audience:** International student advisers
- **International Student Relevance:** **Very high — an underserved intersection**
- **Counselling Relevance:** High
- **RAG Priority:** High within inclusive advising
- **Full Text Available:** No · **Legally Accessible Full Text:** No · **Scrape/Index:** **No**
- **Copyright / Licensing Notes:** `METADATA_ONLY`. Digital download, commercially sold.
- **Key Counselling Use:** Covers the intersection of disability and international student status, where accommodation entitlements, disclosure norms and support structures differ by country and are rarely addressed together.
- **Useful For:**
  - What should a student with a disability consider when choosing a destination?
  - How do disability accommodations differ across countries?
  - What should a student ask an institution before committing?
- **Limitations:**
  - US-focused (arrival and campus integration framing).
  - **78 pages** — a short guide, not a comprehensive treatment. Supplement with primary research from JIS.
- **Last Verified:** 2026-08-21 (**fetched** — author, year, ISBN, page count and format confirmed on the NAFSA product page)

### Resource: Crisis Management in International Education — International Student and Scholar Services, Volume 1

- **Resource Type:** Practitioner Guide
- **Author(s):** Teri J. Albrecht and Jason Hope (series editors)
- **Publisher / Organization:** NAFSA
- **Publication Year:** 2026 (published 13 April 2026) · **ISBN:** **not published on the product page — see notes**
- **Format:** Digital download · **Price:** USD 16.00
- **URL:** `https://www.nafsa.org/bookstore/crisis-management-international-education-international-student-and-scholar-services-0`
- **Authority Tier:** 1
- **Primary Topic:** Crisis response for international students
- **Secondary Topics:** Campus violence · community crises · home-country events affecting students
- **International Student Relevance:** High · **Counselling Relevance:** Moderate
- **RAG Priority:** Medium
- **Full Text Available:** No · **Scrape/Index:** **No** · **Copyright:** `METADATA_ONLY`
- **Key Counselling Use:** Useful for understanding what institutional support *should* exist, and for recognising when a student's situation exceeds ordinary advising.
- **Useful For:**
  - What happens if there's a crisis in my home country while I'm abroad?
  - What support should my institution provide in an emergency?
- **Limitations:**
  - Institution-facing.
  - **Volume 1 of a three-part ISSS series rolling out across 2026** — the set is incomplete, so treat any coverage claim as partial until the remaining volumes publish.
  - An older companion title exists (*Crisis Management in a Cross-Cultural Setting: International Student and Scholar Services*). **Relationship between the old title and the new series remains unverified** — likely superseded, but do not assume.
- **Last Verified:** 2026-08-21 (**fetched** — series editors, publication date, format and price confirmed; **ISBN is not published on the NAFSA product page**, so it cannot be recorded rather than being an oversight)

### Resource: NAFSA Adviser's Manual 360 (AM 360)

- **Resource Type:** Policy/Professional Resource
- **Publisher / Organization:** NAFSA
- **Publication Year:** Continuously updated
- **URL:** `https://www.nafsa.org/professional-resources/advisers-manual-360`
- **Authority Tier:** 1
- **Primary Topic:** US immigration law, policy and procedure for international student advisers
- **Intended Audience:** Designated School Officials and international student services staff
- **International Student Relevance:** High · **Counselling Relevance:** Moderate
- **RAG Priority:** **Low for this document — see notes**
- **Full Text Available:** Yes, under licence
- **Legally Accessible Full Text:** **Only with a purchased licence**
- **Scrape/Index:** **No**
- **Copyright / Licensing Notes:** **`LICENSE_REQUIRED`.** One-year licence: **USD 445 non-member, USD 315 member**. **Not included in NAFSA membership.** Licence terms almost certainly prohibit machine ingestion — **read them before any use beyond human reference.**
- **Key Counselling Use:** The authoritative practitioner reference on US student immigration procedure.
- **Useful For:**
  - Detailed US regulatory procedure questions
- **Limitations:**
  - **Overlaps almost entirely with the visa source document**, which draws the same rules from free primary government sources (USCIS Policy Manual, State, SEVP). **Recorded here for completeness, not recommended for purchase on RAG grounds** — you would be paying for a curated view of material you already have.
  - US-only. Nothing for Australia, Canada or the UK.
- **Last Verified:** 2026-08-21 (pricing and licence model confirmed via NAFSA index)

---

# Student Profiling & Needs Assessment

### Resource: NACADA Academic Advising Core Competencies Model

- **Resource Type:** Framework · Policy/Professional Resource
- **Publisher / Organization:** NACADA: The Global Community for Academic Advising (Kansas State University)
- **Publication Year:** **2017** (model released); **Core Competencies Guide, Second Edition** available separately
- **URL:** `https://nacada.ksu.edu/resources/pillars/corecompetencies.aspx`
- **URL (guide):** `https://my.nacada.ksu.edu/Resources/Product-Details?ProductsDetails=yes&ID=PG23`
- **Authority Tier:** 1
- **Primary Topic:** Advising competencies
- **Secondary Topics:** Conceptual, informational and relational advising components
- **Intended Audience:** Academic advisers
- **International Student Relevance:** Moderate — generic, but directly applicable
- **Counselling Relevance:** **Very high**
- **RAG Priority:** **Highest for advising method**
- **Full Text Available:** Model overview freely readable on the NACADA site; the **Guide** is commercially sold
- **Legally Accessible Full Text:** Overview yes; Guide no
- **Scrape/Index:** **Overview pages: Yes.** Guide: **No**
- **Copyright / Licensing Notes:** `OFFICIAL_PREVIEW_ONLY` for the site content — ingest the publicly published competency descriptions only; `METADATA_ONLY` for the Guide.
- **Key Counselling Use:** **The single most transferable framework in this document.** NACADA splits advising competency into *conceptual* (what advising is), *informational* (what you must know), and *relational* (how you engage). That decomposition maps almost perfectly onto our three-document architecture — and tells the AI that knowing facts is only one third of the job.
- **Useful For:**
  - What does competent advising actually require?
  - How should a counsellor structure an advising conversation?
  - What should a counsellor know versus what should they ask?
  - How should the AI evaluate its own advising quality?
- **Limitations:**
  - Designed for US academic advising within an institution; international *pre-departure* advising has different constraints (no ongoing relationship, no institutional record).
  - 2017 — stable, but predates generative AI in advising entirely.
- **Last Verified:** 2026-08-21 (**2017 release year, three-element structure and Guide 2nd edition confirmed** via NACADA)

### Resource: Academic Advising: A Comprehensive Handbook, Second Edition

- **Resource Type:** Reference Book · Practitioner Guide
- **Author(s):** Virginia N. Gordon, Wesley R. Habley, Thomas J. Grites (eds.)
- **Publisher / Organization:** Jossey-Bass, for NACADA
- **Publication Year:** 2008
- **Edition:** **Second — no third edition identified**
- **ISBN:** 9780470371701
- **Authority Tier:** 1 / 2
- **Primary Topic:** Academic advising theory and practice
- **Secondary Topics:** Advising models · student diversity · service delivery · adviser training · assessment
- **Intended Audience:** Academic advisers and administrators
- **International Student Relevance:** Moderate
- **Counselling Relevance:** High — **foundational**
- **RAG Priority:** Medium–High, as foundational theory
- **Full Text Available:** No · **Legally Accessible Full Text:** No · **Scrape/Index:** **No**
- **Copyright / Licensing Notes:** `METADATA_ONLY`
- **Key Counselling Use:** The field's standard reference on advising models — developmental, prescriptive, appreciative, intrusive. These distinctions directly shape how the AI should behave: prescriptive advising tells, developmental advising asks.
- **Useful For:**
  - What advising models exist and when is each appropriate?
  - How should advising adapt to different student populations?
  - What distinguishes advising from information delivery?
- **Limitations:**
  - **2008 and no newer edition found this pass.** Mark **foundational, not current**. Its theoretical content on advising models remains standard; its technology, demographic and policy content is obsolete.
  - Almost entirely US-centric.
- **Last Verified:** 2026-08-21 (edition, year, editors, publisher, ISBN confirmed; **absence of a third edition confirmed by search** — treat as a finding, not an omission)

---

# Country & Destination Selection

### Resource: "Push-pull" factors influencing international student destination choice

- **Resource Type:** Research · Framework
- **Author(s):** Tim Mazzarol, Geoffrey N. Soutar
- **Publisher / Organization:** Emerald — *International Journal of Educational Management*
- **Publication Year:** 2002 (1 April 2002)
- **Volume/Issue/Pages:** Vol. 16, No. 2, pp. 82–90
- **DOI:** `10.1108/09513540210418403`
- **URL:** `https://www.emerald.com/ijem/article/16/2/82/124983/Push-pull-factors-influencing-international`
- **ERIC ID:** EJ647436
- **Authority Tier:** 4
- **Primary Topic:** International student destination choice
- **Secondary Topics:** Student mobility drivers · comparative destination evaluation
- **International Student Relevance:** **Very high**
- **Counselling Relevance:** **Very high**
- **RAG Priority:** **Highest for destination reasoning**
- **Full Text Available:** No — **paywalled** (abstract free; £29.00 pay-per-view)
- **Legally Accessible Full Text:** Abstract only, without a subscription
- **Scrape/Index:** **No**
- **Copyright / Licensing Notes:** `METADATA_ONLY`. **Encode the push-pull model as an internal framework note citing the DOI.** The model itself is an idea and freely usable; Emerald's text is not.
- **Key Counselling Use:** **The foundational model for destination reasoning**, and the direct antidote to popularity-based recommendation. It separates *push* factors (conditions in the home country driving a student out) from *pull* factors (what attracts them to a specific destination), across political, cultural, educational and economic dimensions.
- **Useful For:**
  - Why is this student considering studying abroad at all?
  - What is actually pulling them toward a particular country?
  - Which of their stated reasons are push factors that any destination would satisfy?
  - How should destinations be compared on a like-for-like basis?
- **Limitations:**
  - **2002 — the empirical findings are dated.** Based on studies in Indonesia, Taiwan, China and India; **Nepal, our likely primary market, is not represented.**
  - **Use the framework, not the findings.** The push/pull *structure* remains standard; the specific factor weightings from 2002 do not describe 2026 students.
  - Predates online education, post-study work competition, and the current restriction cycle.
- **Last Verified:** 2026-08-21 (**fetched** — title, authors, journal, volume, issue, pages, year, DOI and paywall status confirmed)

### Resource: Education at a Glance 2025: OECD Indicators

- **Resource Type:** Research · Reference
- **Publisher / Organization:** OECD
- **Publication Year:** 2025 (published 9 September 2025)
- **Edition:** 2025 — **the current edition; there is no 2026 edition**
- **URL:** `https://www.oecd.org/en/publications/2025/09/education-at-a-glance-2025_c58fc9ae.html`
- **URL (PDF):** `https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/09/education-at-a-glance-2025_c58fc9ae/1c0d9c79-en.pdf`
- **URL (mobility indicator):** `https://www.oecd.org/en/data/indicators/international-student-mobility.html`
- **Authority Tier:** 3
- **Primary Topic:** Comparative education system data
- **Secondary Topics:** International student mobility · tertiary attainment · education financing · graduate outcomes
- **International Student Relevance:** High
- **Counselling Relevance:** High — for comparing systems on evidence rather than reputation
- **RAG Priority:** **Highest among Tier 3**
- **Full Text Available:** **Yes** — official PDF
- **Legally Accessible Full Text:** **Yes**
- **Scrape/Index:** **Yes**
- **Copyright / Licensing Notes:** **`OPEN_ACCESS` — verified, and the only resource in this registry that fully survived the licence check.** OECD's default licence is **Creative Commons Attribution 4.0 (CC BY 4.0)**, which permits copying, redistribution and transformation **including for commercial purposes**. Two obligations apply: **cite the work**, and if you adapt it, add the OECD's required disclaimer — *"This is an adaptation of an original work by the OECD. The opinions expressed and arguments employed in this adaptation should not be reported as representing the official views of the OECD or of its Member countries"*. Content published **before 1 July 2024** falls under the older OECD terms, which are similar but not identical — **Education at a Glance 2025 (September 2025) is post-cutoff and therefore CC BY 4.0.**
- **Key Counselling Use:** Lets the AI compare education systems using consistent international indicators instead of marketing claims or rankings.
- **Useful For:**
  - How do these education systems compare on measurable indicators?
  - What are the actual graduate outcomes in this country?
  - Where are international students concentrated by level and field?
  - How is education financed and what does that mean for cost?
- **Limitations:**
  - **Annual — the edition year is part of the citation.** Diarise each September.
  - OECD member focus; data lags by 1–3 years.
  - System-level, not institution-level. Cannot answer "is this university good".
- **Last Verified:** 2026-08-21 (2025 edition confirmed as current; **explicitly confirmed no 2026 edition exists**)
- **Notes:**
  - The 2025 edition includes a dedicated chapter on student mobility trends and a new indicator on the concentration of internationally mobile students. Verified via index: students from Asia were **58% of all internationally mobile students across the OECD in 2023**, with concentration in doctoral programmes and STEM.

### Resource: Open Doors Report on International Educational Exchange · Project Atlas

- **Resource Type:** Research · Reference
- **Publisher / Organization:** Institute of International Education (IIE), sponsored by the U.S. Department of State
- **Publication Year:** Annual — 2024/25 data most recent
- **URL (Open Doors):** `https://opendoorsdata.org/`
- **URL (Project Atlas):** `https://www.iie.org/research-initiatives/project-atlas/`
- **Authority Tier:** 3
- **Primary Topic:** International student mobility data
- **Secondary Topics:** Origin and destination flows · fields of study · enrolment trends
- **International Student Relevance:** High
- **Counselling Relevance:** Moderate — descriptive, not prescriptive
- **RAG Priority:** Medium–High
- **Full Text Available:** **Yes** — data and reports published freely
- **Legally Accessible Full Text:** **Free to read. NOT free to reuse.**
- **Scrape/Index:** **No — written consent required**
- **Copyright / Licensing Notes:** **`METADATA_ONLY`** *(corrected 2026-08-21 — previously misclassified as `OPEN_ACCESS`)*. IIE's Terms and Conditions state: *"you agree not to copy, distribute, modify or make derivative works of any materials shown on or available through IIE Websites without the prior written consent of the owner of such materials"*, and *"no license is granted to you and no rights are conveyed by virtue of accessing or using IIE Websites."* The site footer carries **"© 2026 Institute of International Education, Inc. All rights reserved."** **Cite the statistics; do not ingest the reports.** Data questions and permissions: `opendoors@iie.org`.
- **Key Counselling Use:** Grounds mobility claims in actual numbers, and lets the counsellor say what students from a given origin country actually do — not what agents claim they do.
- **Useful For:**
  - How many students from my country go where?
  - What fields do international students actually study?
  - Are enrolments from my region rising or falling?
- **Limitations:**
  - **Open Doors is US-inbound only.** Project Atlas covers 30+ partner countries but with less depth.
  - **Descriptive, not advisory.** Popularity is not suitability — the AI must never turn a flow statistic into a recommendation. **This is the resource most at risk of being misused that way.**
  - Annual lag.
- **Last Verified:** 2026-08-21 (index-confirmed: **1,177,766 international students in US higher education in 2024/25, a 5% increase**; Project Atlas launched 2001, 30+ partner countries)

### Resource: EAIE Barometer, Third Edition

- **Resource Type:** Research
- **Publisher / Organization:** European Association for International Education (EAIE)
- **Publication Year:** 2024
- **Edition:** Third
- **URL:** `https://www.eaie.org/resources/barometer.html`
- **Authority Tier:** 1
- **Primary Topic:** Internationalisation in the European Higher Education Area
- **Secondary Topics:** Practitioner perspectives · institutional strategy · impact measurement
- **International Student Relevance:** Moderate
- **Counselling Relevance:** Moderate
- **RAG Priority:** Medium
- **Full Text Available:** **Yes**
- **Legally Accessible Full Text:** **Yes** — free download
- **Scrape/Index:** **Yes**
- **Copyright / Licensing Notes:** `FULL_TEXT_ALLOWED`. Free download; check attribution terms.
- **Key Counselling Use:** The only large-scale practitioner-perspective dataset on internationalisation in Europe. Useful for understanding institutional priorities behind the student-facing message.
- **Useful For:**
  - What are European institutions actually prioritising in internationalisation?
  - How is the sector changing?
- **Limitations:**
  - **Europe only — none of our four destination countries except the UK, and the UK's EHEA participation is now complicated.** Low direct relevance to a US/AU/CA/UK counsellor.
  - Practitioner perceptions, not student outcomes.
- **Last Verified:** 2026-08-21 (index-confirmed: 3rd edition 2024, **2,817 responses from 46 EHEA countries**, free download)

### Resource: Study UK student journey and decision-making research

- **Resource Type:** Research
- **Publisher / Organization:** British Council
- **Publication Year:** Ongoing annual series
- **URL:** `https://opportunities-insight.britishcouncil.org/short-articles/opportunities/student-journey-and-decision-making-international-students-sector-0`
- **Authority Tier:** 3
- **Primary Topic:** International student decision-making
- **Secondary Topics:** Motivation to choose a destination · decision touchpoints · information sources students trust
- **International Student Relevance:** **Very high**
- **Counselling Relevance:** **High**
- **RAG Priority:** High
- **Full Text Available:** Partially — some reports free, some gated
- **Legally Accessible Full Text:** Varies by report
- **Scrape/Index:** **Case by case** — verify per report
- **Copyright / Licensing Notes:** `OFFICIAL_PREVIEW_ONLY` as a default; some reports are freely downloadable. **Check each individually.**
- **Key Counselling Use:** Among the few sources describing **the actual decision journey** — when students decide, what they consult, and which touchpoints change their minds. Directly informs where a counsellor can add value.
- **Useful For:**
  - When in the journey do students actually make their decision?
  - What information sources do students trust?
  - What motivates destination choice in practice?
- **Limitations:**
  - **UK-inbound focus, and produced by a body with a UK promotional remit.** Treat findings about the UK's attractiveness with appropriate scepticism — this is research by an interested party.
  - Report-level URLs move; the insight portal is reorganised periodically.
- **Last Verified:** 2026-08-21 (research programme confirmed; **individual report URLs not verified — flag**)

---

# University & Course Selection

> **Finding: this is the weakest evidence area in the entire registry.**
>
> There is no authoritative, non-commercial framework for how an international student should select a university or a course. The literature that exists is either institutional marketing, ranking methodology published by commercial ranking companies, or research about *recruitment* rather than *selection*.

### Resource: `Authoritative source not identified` — international university selection framework

- **Status:** **Genuine gap.**
- **What was searched:** professional association publications, academic press catalogues, government education portals.
- **What exists but does not qualify:**
  - **Commercial rankings (QS, THE, ARWU)** — methodologically contested, commercially motivated, and structurally biased toward research output rather than student outcomes or teaching quality. **Do not ingest as an authority.** They may be *mentioned* as something students will encounter, with their limitations stated.
  - **University marketing** — excluded by the selection criteria.
- **Partial substitutes already in the corpus:**
  - **The Forum Standards of Good Practice** — defines programme quality independently of reputation. The closest thing to a quality framework available.
  - **OECD Education at a Glance** — system-level outcome indicators.
  - **NCES College Navigator** (see the guidelines document) — official US institutional cost and outcome data.
  - **Accreditation and quality regulator sources** (DAPIP, TEQSA, QAA) — establish legitimacy, not fit.
- **Recommendation:** **Build this framework internally rather than sourcing it.** Compose institutional-fit reasoning from: accreditation status (legitimacy) → programme structure and prerequisites (academic fit) → published cost of attendance (affordability) → graduate outcome data where it exists (career fit) → student support provision (success likelihood) → location and cost-of-living (practical fit). Cite the underlying government sources for each component. **This is the highest-value original work available to this project**, precisely because no one has published it.
- **Last Verified:** 2026-08-21

---

# Career Counselling

### Resource: Career Development and Counseling: Putting Theory and Research to Work, Third Edition

- **Resource Type:** Reference Book · Framework
- **Author(s):** Steven D. Brown, Robert W. Lent (eds.)
- **Publisher / Organization:** John Wiley & Sons
- **Publication Year:** 2020
- **Edition:** Third
- **ISBN:** 9781119580355 (print) · 9781119580348 (e-text)
- **Authority Tier:** 2
- **Primary Topic:** Career development theory and practice
- **Secondary Topics:** Career assessment · interventions across the lifespan · diversity and social factors in career development
- **Intended Audience:** Career counsellors, researchers, graduate students
- **International Student Relevance:** Moderate — theory is universal, examples are Western
- **Counselling Relevance:** **Very high**
- **RAG Priority:** **Highest for career reasoning**
- **Full Text Available:** No · **Legally Accessible Full Text:** No · **Scrape/Index:** **No**
- **Copyright / Licensing Notes:** `METADATA_ONLY`. **Buy one copy; encode the theories as internal framework notes.**
- **Key Counselling Use:** **The authoritative synthesis of career development theory.** Course and career advice without a theory base is guesswork dressed as confidence. This is the correction.
- **Useful For:**
  - How do people actually form career interests and make career choices?
  - How should a counsellor help a student who doesn't know what they want?
  - How do social and economic constraints shape realistic career options?
  - What career assessment approaches exist and what are their limits?
- **Limitations:**
  - **Predominantly Western, individualist assumptions.** Many of our students come from contexts where career choice is a family decision, not an individual one — see the Parent & Family Influence section. **This is a real limitation, not a minor caveat.**
  - Academic register; requires translation for student-facing use.
  - 2020 — predates the current AI-driven labour market shift.
- **Last Verified:** 2026-08-21 (authors, publisher, edition, both ISBNs confirmed)

### Resource: Social Cognitive Career Theory (SCCT)

- **Resource Type:** Framework · Research
- **Author(s):** Robert W. Lent, Steven D. Brown, Gail Hackett
- **Publication Year:** 1994 (original); extensively developed since
- **Authority Tier:** 4
- **Primary Topic:** How career interests, choices and performance develop
- **International Student Relevance:** Moderate–High
- **Counselling Relevance:** **Very high**
- **RAG Priority:** **Highest — encode as a core reasoning framework**
- **Full Text Available:** Primary papers largely paywalled; **secondary summaries widely available**
- **Legally Accessible Full Text:** Varies by paper
- **Scrape/Index:** **No** — encode the model
- **Copyright / Licensing Notes:** `METADATA_ONLY`. The **model** is freely usable; individual papers are not.
- **Key Counselling Use:** **The most directly operational career framework here.** Its causal chain — self-efficacy → outcome expectations → interests → choice goals — tells the counsellor precisely where to intervene. A student who has ruled out a field because they believe they *can't* do it (low self-efficacy) needs something entirely different from one who believes they can but doesn't think it will pay (low outcome expectations). Most advice conflates the two.
- **Useful For:**
  - Why has this student ruled out an option?
  - Is the barrier belief in their own ability, or belief about the outcome?
  - How do we distinguish genuine disinterest from low confidence?
  - What would change this student's choice set?
- **Limitations:**
  - Requires careful, non-leading elicitation to apply — an AI can easily mistake politeness for preference.
  - Cross-cultural validity is established but **contested in strongly collectivist contexts**.
  - Verified effect sizes are moderate: choice goals relate to interests (.60), self-efficacy (.40), outcome expectations (.42). **Predictive, not deterministic — never present as certainty.**
- **Last Verified:** 2026-08-21 (originators, year, core structure and reported correlations confirmed via index)

### Resource: Career Construction Counseling Manual

- **Resource Type:** Practitioner Guide · Framework
- **Author(s):** Mark L. Savickas
- **Publisher / Organization:** **Self-published by the author** — see notes
- **Publication Year:** 2019
- **ISBN:** 9781734117820
- **Authority Tier:** 2
- **Primary Topic:** Narrative career counselling (career construction / life design)
- **International Student Relevance:** Moderate
- **Counselling Relevance:** High
- **RAG Priority:** Medium–High
- **Full Text Available:** No · **Scrape/Index:** **No** · **Copyright:** `METADATA_ONLY`
- **Key Counselling Use:** Offers the **narrative** alternative to matching-based career advice. Where SCCT models belief and expectation, career construction asks the student to tell their story and builds meaning from it — better suited to students who cannot articulate a goal in the terms an assessment expects.
- **Useful For:**
  - How do you counsel a student who genuinely doesn't know what they want?
  - How do you surface motivation the student hasn't articulated?
  - How do you help a student make meaning of a transition?
- **Limitations:**
  - A revision and expansion of the earlier *Life Design Counseling Manual* — **confirm you are citing the current title.**
  - Narrative methods are hard to operationalise in a short AI conversation; better as a **posture** (ask for the story) than a protocol.
  - **Self-published.** This registry otherwise excludes self-published counselling books — this one is admitted as a deliberate exception because Savickas *originated* career construction theory and is its definitive authority. The exception rests entirely on the author, not the imprint, and should not be treated as precedent.
- **Last Verified:** 2026-08-21 (author, year, ISBN, self-publication and relationship to the Life Design manual confirmed)

---

# Student Decision-Making

Covered principally by **Mazzarol & Soutar** (push-pull) and the **British Council** decision-journey research above. Two structural observations for the RAG design:

1. **Stated reasons are not actual reasons.** The push-pull literature exists because students report destination choices in terms of quality and career, while the variance is often explained by cost, migration prospects, family, and where their peers went. The AI should treat a student's first answer as an opening position, not a specification.
2. **The decision is usually already partly made.** British Council journey research indicates students arrive at advising with a shortlist. The counsellor's value is in **testing** that shortlist against the student's actual constraints, not generating a new one from scratch.

### Resource: Journal of International Students (JIS)

- **Resource Type:** Research (journal)
- **Publisher / Organization:** STAR Scholars / OJED, Baltimore, MD
- **Publication Year:** Ongoing (quarterly, rolling publication)
- **ISSN:** 2162-3104 (print) · 2166-3750 (online)
- **URL:** `https://www.ojed.org/jis`
- **Authority Tier:** 2 / 4
- **Primary Topic:** Research on international students across educational settings
- **Secondary Topics:** Adjustment · success · mobility · policy · practice
- **International Student Relevance:** **Very high — the only journal dedicated entirely to this population**
- **Counselling Relevance:** **Very high**
- **RAG Priority:** **Highest ingestible research source**
- **Full Text Available:** **Yes** — free to read, immediately on publication
- **Legally Accessible Full Text:** **Free to read. Reuse is restricted — see below.**
- **Scrape/Index:** **No, not for a commercial product, without permission**
- **Copyright / Licensing Notes:** **`LICENSE_REQUIRED`** *(corrected 2026-08-21 — previously and wrongly classified `OPEN_ACCESS`)*. Articles are published under **Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 (CC BY-NC-ND 4.0)**. Two clauses bite:
  - **NC — NonCommercial.** GlobalyApp is a commercial product. Commercial use is **not** granted by this licence.
  - **ND — NoDerivatives.** A RAG system that generates summaries and paraphrases is arguably producing and distributing derivative works, which this licence does not permit.
  **"Open access" here means free to read, not free to reuse commercially.** Either request written permission from OJED / STAR Scholars, or use JIS the same way as the copyrighted books — read it and write your own synthesis. **Facts and findings are not copyrightable; the authors' expression is.**
- **Key Counselling Use:** Still the most valuable body of evidence available — but as **human-read input to team-authored framework notes**, not as a bulk ingestion target. It is the only large peer-reviewed, international-student-specific literature covering adjustment, decision-making, success, wellbeing and support across dozens of countries.
- **Useful For:**
  - What does the evidence say about international student adjustment?
  - What actually predicts international student success?
  - What challenges recur across national contexts?
  - How do students from specific origin countries experience study abroad?
- **Limitations:**
  - **Variable study quality** — a lot of small-sample qualitative work. Weight systematic reviews and larger studies above single-institution case studies.
  - Anglophone destination bias.
  - Individual findings are not policy. **The AI must not generalise a single study's finding into advice.**
  - **The licence is the binding constraint, not the content.** If a permission agreement with OJED can be obtained, this immediately becomes the highest-value ingestion target in the project. **Worth asking — it is one email.**
- **Last Verified:** 2026-08-21 (both ISSNs, publisher, indexing and article count confirmed; **CC BY-NC-ND 4.0 licence confirmed** — a correction to the previous pass)

### Resource: Journal of Studies in International Education (JSIE)

- **Resource Type:** Research (journal)
- **Publisher / Organization:** SAGE Publications, for the Association for Studies in International Education
- **Publication Year:** Established 1997; quarterly
- **ISSN:** 1028-3153 (print) · 1552-7808 (online)
- **URL:** `https://journals.sagepub.com/home/jsi`
- **Authority Tier:** 2
- **Primary Topic:** Internationalisation of higher education
- **Secondary Topics:** Policy and strategy · curriculum internationalisation · international student issues · cross-border education
- **International Student Relevance:** High · **Counselling Relevance:** Moderate–High
- **RAG Priority:** Medium
- **Full Text Available:** No — **subscription**
- **Legally Accessible Full Text:** Abstracts only without a subscription
- **Scrape/Index:** **No**
- **Copyright / Licensing Notes:** `METADATA_ONLY` (or `LICENSE_REQUIRED` with institutional access)
- **Key Counselling Use:** The senior journal in the field. Higher average methodological quality than JIS, but paywalled — use for targeted questions where a licence exists.
- **Useful For:**
  - What is the state of research on internationalisation?
  - How do institutional and national policies shape student experience?
- **Limitations:**
  - **Paywalled**, which materially limits its usefulness to us versus JIS.
  - More institution- and policy-facing than student-facing.
  - `sagepub.com` returned **403 to automated fetch** — bibliographic detail confirmed via index instead.
- **Last Verified:** 2026-08-21 (publisher, founding year, both ISSNs, editors, scope confirmed via index)

---

# International Student Success & Transition

### Resource: Counseling Adults in Transition, Fifth Edition (Schlossberg's Transition Theory · the 4S Model)

- **Resource Type:** Framework · Practitioner Guide
- **Author(s):** Mary L. Anderson, Jane Goodman, Nancy K. Schlossberg
- **Publisher / Organization:** Springer Publishing Company
- **Publication Year:** 2021 (published 24 August 2021) · fourth edition 2012 · third edition 2006
- **Edition:** Fifth
- **ISBN:** 9780826135469 (paperback) · 9780826135476 (eBook)
- **URL:** `https://www.springerpub.com/counseling-adults-in-transition-fifth-edition-9780826135469.html`
- **Authority Tier:** 2
- **Primary Topic:** Adult transition and coping
- **Secondary Topics:** Resilience · sociocultural context of coping · culturally sensitive intervention
- **International Student Relevance:** **High — studying abroad is a textbook major transition**
- **Counselling Relevance:** **Very high**
- **RAG Priority:** **Highest for transition support**
- **Full Text Available:** No · **Scrape/Index:** **No** · **Copyright:** `METADATA_ONLY`
- **Key Counselling Use:** **The 4S model — Situation, Self, Support, Strategies — is the most practically usable transition framework available**, and it maps cleanly onto pre-departure counselling. It gives the AI a structured way to assess readiness that isn't a checklist: What is the situation? What does this person bring? What support will they have? What strategies can they use?
- **Useful For:**
  - Is this student ready for the transition they're planning?
  - What support will they need and will it be available?
  - How do we assess coping capacity without being intrusive?
  - Why do some students struggle when their circumstances look fine on paper?
- **Limitations:**
  - Developed for adults in transition generally, not international students specifically. Cultural adjustment needs supplementing from Berry and the intercultural literature.
  - **Schlossberg is the third-listed author on the current edition.** Cite the model as Schlossberg's, but cite the *book* as Anderson, Goodman & Schlossberg (2021) — getting this wrong in a professional context is noticeable.
- **Last Verified:** 2026-08-21 (**fetched** — full authorship, publication date, both ISBNs and publisher confirmed on the Springer Publishing product page)

### Resource: Berry's Acculturation Model

- **Resource Type:** Framework · Research
- **Author(s):** John W. Berry
- **Canonical citation:** Berry, J. W. (1997). Immigration, acculturation, and adaptation. *Applied Psychology: An International Review*, 46(1), 5–34.
- **DOI:** `10.1111/j.1464-0597.1997.tb01087.x`
- **Publisher:** Wiley, for the International Association of Applied Psychology
- **Publication Year:** 1997 (canonical statement); developed from the 1980s
- **Authority Tier:** 4
- **Primary Topic:** Acculturation strategies
- **International Student Relevance:** **Very high**
- **Counselling Relevance:** High
- **RAG Priority:** High
- **Full Text Available:** Varies — primary papers largely paywalled; **open educational summaries exist**
- **Legally Accessible Full Text:** Varies
- **Scrape/Index:** **No** for primary papers — encode the model
- **Copyright / Licensing Notes:** `METADATA_ONLY`. The four-strategy model is freely usable as a concept.
- **Key Counselling Use:** Gives the counsellor language for what "fitting in" actually means, along two independent axes: maintaining heritage culture, and engaging with the host culture. The four resulting strategies — **integration, assimilation, separation, marginalisation** — let a counsellor set realistic expectations without prescribing assimilation.
- **Useful For:**
  - What does cultural adjustment actually involve?
  - What are realistic expectations for the first year?
  - Why do some students isolate themselves and what helps?
  - How should a student think about maintaining their own culture abroad?
- **Limitations:**
  - **Descriptive, not prescriptive.** Evidence associates integration with lower stress and better adaptation, but the AI must not moralise about how a student "should" acculturate — that is the student's choice and is heavily shaped by how the host environment treats them.
  - The model has been criticised for treating acculturation as a static individual choice rather than a dynamic, structurally constrained process. **Note the critique when using it.**
  - **Page-range caveat:** secondary sources cite both `46(1), 5–34` and `46, 5–61`. The **article** is 5–34; the longer range appears to include the peer commentaries and Berry's reply published in the same issue. **Use 5–34.**
  - A parallel book-chapter version exists: Berry, J. W. (1997), in Berry, Segall & Kagitcibasi (Eds.), *Handbook of Cross-Cultural Psychology, Vol. 3* (pp. 291–326), Allyn & Bacon. Do not cite both as if they were separate findings.
- **Last Verified:** 2026-08-21 (canonical citation, journal, volume, issue, page range and DOI confirmed; page-range discrepancy investigated and resolved)

---

# Cross-Cultural & Intercultural Advising

### Resource: The SAGE Handbook of Intercultural Competence

- **Resource Type:** Reference Book · Framework
- **Author(s):** Darla K. Deardorff (ed.)
- **Publisher / Organization:** SAGE Publications
- **Publication Year:** 2009
- **Edition:** First
- **ISBN:** 9781412960458 (print) · 9781483342894 (e-text)
- **Authority Tier:** 2
- **Primary Topic:** Intercultural competence — definition, models, assessment
- **International Student Relevance:** High · **Counselling Relevance:** High
- **RAG Priority:** Medium–High
- **Full Text Available:** No · **Scrape/Index:** **No** · **Copyright:** `METADATA_ONLY`
- **Key Counselling Use:** Deardorff's **Process Model of Intercultural Competence** — moving from attitudes through knowledge and skills to internal and external outcomes — gives the AI a defensible definition of a term that is otherwise used loosely. It also underpins how the counsellor itself should communicate across cultural difference.
- **Useful For:**
  - What is intercultural competence and how does it develop?
  - How should a counsellor communicate across cultural difference?
  - What should a student expect to find difficult, and why?
- **Limitations:**
  - **2009 — dated**, though the models remain standard.
  - Heavily academic; needs translation into practice.
  - Predates most of the current literature on digital and remote intercultural interaction.
- **Last Verified:** 2026-08-21 (editor, year, both ISBNs, process model confirmed)

---

# Ethical Counselling

> **This section matters more for our system than any other, and it is the one where the literature is thinnest relative to need.**

The commercial structure of international education creates a standing conflict of interest: most advice students receive is given by parties paid by the institutions they recommend. An AI counsellor inherits that suspicion by default and must be built to defeat it.

### Resource: Code of Ethics for Education Abroad, Third Edition

- **Resource Type:** Policy/Professional Resource · Framework
- **Publisher / Organization:** The Forum on Education Abroad
- **Publication Year:** 2020
- **Edition:** Third
- **URL:** `https://forumea.org/resources/standards-of-good-practice/code-of-ethics/`
- **URL (direct PDF):** `https://www.forumea.org/uploads/1/4/4/6/144699749/code_1-22.pdf`
- **ISBN:** 978-1-952376-08-5
- **DOI:** `10.36366/G.978-1-952376-08-5`
- **Authority Tier:** 1
- **Primary Topic:** Ethical practice in education abroad
- **Secondary Topics:** Conflicts of interest · transparency · pricing · equity · student welfare · accountability
- **International Student Relevance:** Moderate · **Counselling Relevance:** **Very high**
- **RAG Priority:** **High — ingest**
- **Full Text Available:** **Yes** — free PDF, no form or membership required
- **Legally Accessible Full Text:** **Free to read. NOT free to reuse.**
- **Scrape/Index:** **No — permission required**
- **Copyright / Licensing Notes:** **`METADATA_ONLY`** *(corrected 2026-08-21 — previously misclassified as `FULL_TEXT_ALLOWED`)*. The PDF carries **"© 2020 The Forum on Education Abroad. All rights reserved."** No Creative Commons or reuse licence is granted. Free download is an access permission, not a reuse licence. **Read it, encode the four guiding questions in your own words, cite the DOI.**
- **Key Counselling Use:** **The most directly applicable ethical framework available**, from a body with formal DOJ/FTC recognition as the field's Standards Development Organization. It is structured as shared values plus principles of professional practice, and closes with **four questions to guide ethical decision-making** — the closest thing to a runnable ethical check the AI can apply to its own output.
- **Useful For:**
  - What are the ethical obligations of an education adviser?
  - How should conflicts of interest be disclosed?
  - What constitutes a misleading promise?
  - Is this recommendation in the learner's interest, or ours?
- **Covers:**
  - **Shared values:** learner responsibility · truthfulness · equity · reciprocity
  - **Principles of professional practice:** educational quality · advocacy · health and safety · pricing · partnerships · privacy · cultural respect · sustainability · accountability
  - **Four guiding questions** on learner interest, fairness, equity and community reciprocity
- **Limitations:**
  - Written for education abroad providers, not commercial advisers; adaptation required.
  - 2020 — predates AI-delivered counselling entirely, so it says nothing about disclosure of automated advice.
  - Voluntary. It binds Forum members, not the wider commercial agent ecosystem.
- **Last Verified:** 2026-08-21 (**fetched** — edition, year, structure, nine practice principles, four guiding questions and free PDF availability all confirmed)
- **Notes:**
  - **This was the highest-priority unverified item in the previous pass and is now fully resolved** — including its copyright position, read directly from the PDF.
  - The four guiding questions remain the single most directly implementable artefact in this document. **Encode them as an output check in your own wording**, citing the DOI — do not paste the Code's text.

### Resource: `Authoritative source not identified` — ethics of commercial international student recruitment and advising

- **Status:** **Significant gap.**
- **What is missing:** a widely-adopted, enforceable ethical code governing commissioned education agents and commercial advising, applicable across our four destination countries.
- **What partially exists:** Australia's **National Code 2018** imposes enforceable obligations on providers regarding agent conduct (see the guidelines document), and the Commonwealth Ombudsman publishes an international-student factsheet on education agents. **This is the strongest instrument identified in any of our four countries** — and it is regulatory, not professional.
- **Recommendation:** Since no adequate external code exists, **write an explicit ethical operating policy for the AI counsellor** and treat it as a first-class corpus document. At minimum it should commit the system to: recommending against a course of action when the evidence warrants it; disclosing when information is uncertain or unverified; declining to answer where the honest answer is "your institution decides this"; never ranking destinations by commercial relationship; and surfacing trade-offs rather than resolving them silently in the student's absence.
- **Last Verified:** 2026-08-21

---

# Inclusive Advising

Principally covered by **Advising International Students with Disabilities** (NAFSA, second edition) above.

### Resource: `Authoritative source not identified` — first-generation and low-income international student advising

- **Status:** **Gap.**
- **Note:** Substantial literature exists on first-generation *domestic* students, particularly in the US. **The intersection with international student status is not well covered by any professional-body publication identified this pass.** Given that a large share of students from South Asian markets are first-generation university attendees financing study through family borrowing, this is a commercially and ethically significant gap for us specifically.
- **Partial substitute:** the **Journal of International Students** carries relevant primary research and is open access. **Searching JIS for this intersection is the recommended next step.**
- **Last Verified:** 2026-08-21

---

# Parent & Family Influence

### Resource: `Authoritative source not identified` — family influence in international education decision-making

- **Status:** **Significant gap, and the most consequential one in this document for our market.**
- **What was searched:** professional association publications, academic press catalogues, career development literature.
- **Why it matters:** the dominant career development frameworks in this registry — SCCT, career construction, and most of Brown & Lent — assume an **individual decision-maker**. For a large share of students from South Asia, East Asia and the Middle East, destination, institution and course are **family decisions**, often family-financed, with the student's stated preference sometimes being the family's. An AI applying individualist career theory unmodified to these students will misread the situation, and may push a student toward conflict with their family without meaning to.
- **What partially exists:**
  - **Mazzarol & Soutar's push-pull model** treats family and reference-group influence as a pull factor, but does not develop it.
  - **British Council decision-journey research** identifies influencers in the decision process.
  - **Brown & Lent's third edition** covers "the roles of diversity, individual differences, and social factors in career development" — **the closest thing available, and still framed around the individual.**
  - **Journal of International Students** carries relevant primary research and is open access.
- **Recommendation:** **Treat this as a first-class design requirement, not a gap to fill later.** The counsellor should be built to ask who else is part of the decision, to distinguish the student's own goals from those they have been given, and to help articulate trade-offs to a family audience — **without positioning itself against the family or presuming that individual autonomy is the correct outcome.** Encode this as an explicit behavioural policy and source supporting evidence from JIS.
- **Last Verified:** 2026-08-21

---

# Student Wellbeing

### Resource: Systematic reviews on international student mental health and help-seeking

- **Resource Type:** Research (systematic reviews and meta-analyses)
- **Publication Year:** 2024–2025 (multiple reviews)
- **Authority Tier:** 4
- **Primary Topic:** International student mental health prevalence, challenges, and barriers to help-seeking
- **International Student Relevance:** **Very high** · **Counselling Relevance:** High
- **RAG Priority:** High
- **Full Text Available:** **Mixed — several are open access** (PMC and ERIC-hosted copies identified)
- **Legally Accessible Full Text:** **Yes for the open-access subset**
- **Scrape/Index:** **Yes for confirmed open-access articles only** — verify licence per article
- **Copyright / Licensing Notes:** `OPEN_ACCESS` for the PMC/ERIC subset; `METADATA_ONLY` for paywalled reviews (e.g. ScienceDirect-hosted).
- **Key Counselling Use:** Establishes, with pooled evidence rather than anecdote, that international students experience **high prevalence of anxiety, depression and stress** while being **less likely to seek help** — and identifies why.
- **Useful For:**
  - What wellbeing pressures should a student prepare for?
  - Why do international students underuse mental health services?
  - What should a student look for in institutional support?
  - When should a counsellor route a student to real support?
- **Limitations:**
  - **Hard boundary: this evidence informs recognition and referral only.** The AI must never screen, assess, diagnose, or offer therapeutic intervention. It should recognise signals, state plainly that it is not a mental health service, and route to the crisis and support resources catalogued in the guidelines document.
  - Prevalence figures vary widely by population and instrument. **Do not quote a single prevalence number as fact.**
  - Individual review URLs and DOIs **not verified** — three barriers were consistently identified across reviews: **stigma, awareness of mental health issues, and availability of culturally sensitive services.**
- **Last Verified:** 2026-08-21 (findings confirmed across multiple 2024–2025 reviews via index; **individual citations not verified — flag**)

---

# Top Resources for the AI Counsellor

Ranked by weighted counselling relevance, authority, practical usefulness, evidence quality, international student relevance, recency and legal accessibility.

| # | Resource | Tier | Ingestion | Why the AI counsellor should know this |
|---|---|---|---|---|
| **1** | **Journal of International Students** | 2/4 | **`LICENSE_REQUIRED`** | The only large international-student-specific peer-reviewed literature. **CC BY-NC-ND 4.0 blocks commercial ingestion** — read it and write your own synthesis, or request a licence from OJED. Still the highest-value *evidence* source. |
| **2** | **NACADA Core Competencies Model** | 1 | Partial `OPEN_ACCESS` | Decomposes advising into conceptual, informational and relational competence — telling the system that knowing facts is one third of the job. Directly shapes AI behaviour. |
| **3** | **Mazzarol & Soutar push-pull model** | 4 | `METADATA_ONLY` | The foundational destination-choice framework, and the direct antidote to popularity-based recommendation. Encode the model. |
| **4** | **Social Cognitive Career Theory** | 4 | `METADATA_ONLY` | The most operational career framework here: distinguishes "I can't" from "it won't pay", which most advice conflates. |
| **5** | **NAFSA International Education Handbook, 2nd ed (2026)** | 1 | `METADATA_ONLY` | The current, authoritative orientation to the profession. Most recent major publication in the field. |
| **6** | **Schlossberg 4S transition model** | 2 | `METADATA_ONLY` | Structured readiness assessment that isn't a checklist. Studying abroad is a textbook major transition. |
| **7** | **Forum Standards of Good Practice, 6th ed** | 1 | **`METADATA_ONLY`** | A free-to-read, non-commercial definition of programme quality from a DOJ/FTC-recognised standards body. **All rights reserved** — encode the criteria in your own words. |
| **8** | **Fostering International Student Success, 2nd ed (2023)** | 1/2 | `METADATA_ONLY` | Best-sourced account of what is actually hard after arrival, and what helps. |
| **9** | **Brown & Lent, Career Development and Counseling, 3rd ed (2020)** | 2 | `METADATA_ONLY` | The authoritative career theory synthesis. Course advice without it is guesswork. |
| **10** | **OECD Education at a Glance 2025** | 3 | **`OPEN_ACCESS` (CC BY 4.0, verified)** | Compare education systems on consistent indicators instead of rankings. **The only resource here with a verified commercial-reuse licence — ingest it first.** |
| **11** | **Berry's acculturation model** | 4 | `METADATA_ONLY` | Gives adjustment a vocabulary along two axes, without prescribing assimilation. |
| **12** | **International student mental health systematic reviews (2024–25)** | 4 | Partial `OPEN_ACCESS` | Evidence for recognition and referral, and for why students don't ask for help. |
| **13** | **British Council Study UK decision-journey research** | 3 | Mixed | Describes when students actually decide and what they trust — where a counsellor can add value. |
| **14** | **Deardorff, SAGE Handbook of Intercultural Competence (2009)** | 2 | `METADATA_ONLY` | A defensible definition of intercultural competence, and a model for how the counsellor itself should communicate. |
| **15** | **NAFSA Addressing Mental Health Issues Affecting International Students** | 1 | `METADATA_ONLY` | Defines the adviser's boundary: recognition and referral, not treatment. |
| **16** | **Academic Advising: A Comprehensive Handbook, 2nd ed (2008)** | 1/2 | `METADATA_ONLY` | Standard reference on advising models — developmental vs prescriptive shapes whether the AI tells or asks. **Foundational, not current.** |
| **17** | **Forum Code of Ethics, 3rd ed (2020)** | 1 | **`METADATA_ONLY`** | The most applicable ethical framework available. Its **four guiding questions** are the most implementable artefact here — encode them **in your own wording**, citing DOI `10.36366/G.978-1-952376-08-5`. |
| **18** | **IIE Open Doors / Project Atlas** | 3 | **`METADATA_ONLY`** | Grounds mobility claims in real numbers. **Terms forbid reuse without written consent — cite figures, don't ingest reports.** |
| **19** | **Savickas Career Construction Counseling Manual** | 2 | `METADATA_ONLY` | The narrative alternative for students who cannot articulate a goal. |
| **20** | **NAFSA Advising International Students with Disabilities, 2nd ed** | 1 | `METADATA_ONLY` | An underserved intersection with real practical consequences for destination choice. |
| **21** | **Journal of Studies in International Education** | 2 | `METADATA_ONLY` | Higher average methodological quality than JIS, but paywalled — targeted use only. |
| **22** | **UNESCO Global Convention on Recognition of Qualifications** | 3 | `OPEN_ACCESS` | The international legal framework for whether a qualification will be recognised — a real post-study question. |
| **23** | **NAFSA's Guide to Education Abroad, 5th ed** | 1 | `METADATA_ONLY` | Best treatment of pre-departure preparation, despite its outbound orientation. |
| **24** | **EAIE Barometer, 3rd ed (2024)** | 1 | **Unverified** | Free, large-scale practitioner data — but Europe-only, and **no licence is stated anywhere. Check the PDF's copyright page.** |
| **25** | **NAFSA Crisis Management in International Education, Vol 1** | 1 | `METADATA_ONLY` | What institutional support should exist when things go badly wrong. |

**Not recommended:** NAFSA Adviser's Manual 360 (`LICENSE_REQUIRED`, USD 445/year) — it duplicates material the visa document already sources free from primary government sites, and is US-only.

---

# Counselling Knowledge Coverage Matrix

`✅` strong resources · `⚠️` partial coverage · `❌` significant gap

| Counselling Domain | Coverage | Strong Resources | Moderate Resources | Gap Notes |
|---|---|---|---|---|
| Advising method & competencies | ✅ | NACADA Core Competencies; Academic Advising Handbook | NAFSA IE Handbook | Handbook is 2008 — foundational only |
| Student profiling & needs assessment | ⚠️ | NACADA (relational competence); Schlossberg 4S | SCCT | No international-student-specific profiling instrument identified |
| Country / destination selection | ✅ | Mazzarol & Soutar; OECD EaG 2025 | British Council; IIE | 2002 findings dated; use the framework, not the numbers |
| University selection | ❌ | — | Forum Standards; OECD; accreditation bodies | **No authoritative selection framework exists. Build internally.** |
| Course / programme selection | ⚠️ | Brown & Lent; SCCT | AQF/RQF frameworks (guidelines doc) | Course-to-career alignment is under-theorised for international contexts |
| Career counselling | ✅ | Brown & Lent 3rd ed; SCCT; Savickas | — | Western individualist assumptions throughout |
| Student decision-making | ✅ | Mazzarol & Soutar; British Council; JIS | IIE Open Doors | Stated reasons ≠ actual reasons |
| International student success | ✅ | Fostering International Student Success; JIS | Schlossberg | Strong and recent |
| Cross-cultural / intercultural advising | ✅ | Deardorff Handbook; Berry model | JIS | Both core sources are 2009 or earlier |
| Student wellbeing | ✅ | Systematic reviews 2024–25; NAFSA mental health guide | JIS | Hard referral-only boundary required |
| Ethical counselling | ⚠️ | Forum Standards | Forum Code of Ethics (unverified); AU National Code | **No cross-country code for commercial advising. Write our own policy.** |
| Inclusive advising | ⚠️ | NAFSA Disabilities 2nd ed | JIS | **First-generation × international intersection uncovered** |
| Parent / family influence | ❌ | — | Push-pull (partial); Brown & Lent (social factors) | **Most consequential gap for our market. Design requirement, not a research task.** |
| Academic preparation | ⚠️ | Fostering International Student Success | QAA/TEQSA (guidelines doc) | Educator-facing; needs reframing for students |
| Post-study / qualification recognition | ⚠️ | UNESCO Global Convention | CICIC (guidelines doc) | Professional registration is jurisdiction-specific |

---

# RAG Ingestion & Copyright Classification

## Summary by classification

**A full licence verification pass was run on 2026-08-21. It changed four of the eight open classifications.** The headline finding:

> **Free to download is not free to reuse.** Almost every "open" resource here grants an *access* permission, not a *reuse licence* — and several explicitly reserve all rights.

| Classification | Count | Resources |
|---|---|---|
| **`OPEN_ACCESS`** | **1 verified + 1 probable** | **OECD *Education at a Glance 2025* — CC BY 4.0, commercial use permitted (verified).** UNESCO Global Convention — UNESCO's default is CC BY-SA 3.0 IGO, but **the Convention page states no licence; treat as probable, verify on unesdoc before ingesting** |
| **`FULL_TEXT_ALLOWED`** | **0** | *(was 3 — all three downgraded on verification)* |
| **`OFFICIAL_PREVIEW_ONLY`** | 2 | NACADA competency overview pages · British Council reports *(per-report)* |
| **`METADATA_ONLY`** | **17** | All commercially published books, **plus Forum Standards, Forum Code of Ethics and IIE Open Doors** — all three carry "all rights reserved" |
| **`LICENSE_REQUIRED`** | **3** | **Journal of International Students — CC BY-NC-ND 4.0** · NAFSA Adviser's Manual 360 · Journal of Studies in International Education |
| **`DO_NOT_INGEST`** | 0 | *No resource is prohibited outright — but only OECD has a verified commercial-reuse licence* |

### What the licence check changed

| Resource | Previously | Verified position |
|---|---|---|
| **Journal of International Students** | `OPEN_ACCESS` — "build this first" | **CC BY-NC-ND 4.0.** **NC** excludes commercial use; **ND** excludes derivative works. Our product is commercial and RAG output is arguably derivative. → `LICENSE_REQUIRED` |
| **IIE Open Doors / Project Atlas** | `OPEN_ACCESS` | Terms expressly forbid copying, distributing, modifying or making derivatives **without prior written consent**; "no license is granted". → `METADATA_ONLY` |
| **Forum Standards of Good Practice** | `FULL_TEXT_ALLOWED` | "© The Forum on Education Abroad. **All Rights Reserved.**" No reuse licence. → `METADATA_ONLY` |
| **Forum Code of Ethics** | `FULL_TEXT_ALLOWED` | "© 2020 The Forum on Education Abroad. **All rights reserved.**" (read from the PDF). → `METADATA_ONLY` |
| **EAIE Barometer** | `FULL_TEXT_ALLOWED` | **No licence stated anywhere on the page**; site carries "© 2026 EAIE". → **unverified; check the PDF's own copyright page before use** |
| **OECD Education at a Glance 2025** | `OPEN_ACCESS` | **Confirmed CC BY 4.0** — copy, redistribute and transform, including commercially, with attribution and an adaptation disclaimer. **Holds.** |

### The consequence

**The "just ingest the open stuff" path is much narrower than the first pass implied — essentially OECD alone, plus UNESCO pending verification.**

This does not reduce the value of the other resources; it changes how you extract it. The route that works for the copyrighted books works identically for JIS, the Forum documents and Open Doors: **read them, and write your own synthesis.** Findings, facts, statistics and ideas are not protected by copyright — only the authors' particular expression is. A team-authored note saying *"peer-reviewed evidence indicates international students under-use mental health services, with stigma, awareness and culturally sensitive provision the three recurring barriers (see JIS; systematic reviews 2024–25)"* is your own writing and fully ingestible.

**One email is worth sending:** OJED / STAR Scholars may well grant a licence for JIS. If they do, it immediately becomes the highest-value ingestion target in the project.

## Recommended initial ingestion

**Phase 1 — verified licence, ingest directly:**
1. **OECD *Education at a Glance 2025*** — CC BY 4.0. Official PDF. Attribution + adaptation disclaimer required. **The only fully verified commercial-reuse licence in the registry.**
2. **UNESCO Global Convention + Operational Guidelines** — UNESCO's default is CC BY-SA 3.0 IGO (commercial use permitted, ShareAlike, derivative disclaimer required, UNESCO logo prohibited). **Verify on the unesdoc record first** — the Convention page itself states no licence.
3. **NACADA publicly published competency descriptions** (2017 model) — public web content; `OFFICIAL_PREVIEW_ONLY`, so ingest the published descriptions only, not the paid Guide.
4. **Retrieve the Forum Standards + Code of Ethics** — **canonical artefact decided: the free `forumea.org` download.** Both are all-rights-reserved, so this is a *read-and-paraphrase* step, not an ingest step. **Record the Standards' internal edition statement on retrieval** to close the version question permanently.

**Phase 1b — permission requests worth making (one email each):**
- **OJED / STAR Scholars** for a commercial-use licence to the Journal of International Students. Highest potential payoff in the project.
- **The Forum on Education Abroad** for reuse of the Standards and Code of Ethics.
- **IIE** (`opendoors@iie.org`) for Open Doors data reuse.

**Phase 2 — team-authored framework notes** ⭐ **now the critical path.** With no book purchase pending (Decision 2 → buy none), the counsellor's entire reasoning substrate depends on these seven notes. All are encodable from free secondary sources:

Write one internal note per framework, in your own words, citing the source. Ingest the notes. Priority order:
1. Push-pull destination model (Mazzarol & Soutar)
2. Social Cognitive Career Theory (Lent, Brown & Hackett)
3. Schlossberg 4S transition model
4. Berry's four acculturation strategies
5. NACADA conceptual/informational/relational decomposition
6. Deardorff's process model of intercultural competence
7. Advising model taxonomy — developmental, prescriptive, appreciative, intrusive

**Phase 3 — original work where nothing exists:**
1. **University/course selection framework** — composed from accreditation, cost, outcomes and support data.
2. **Ethical operating policy** for the counsellor.
3. **Family-inclusive decision-making policy.**

## What must never be ingested

Publisher previews reconstructed into whole chapters · any shadow-library copy · licensed material outside its licence terms · commercial ranking data presented as authority.

---

# Stable vs Time-Sensitive Knowledge

This is the architectural reason this document exists separately from the other two.

### Stable / foundational — safe long-lived embeddings

Career development theory · SCCT · career construction · Schlossberg transition theory · Berry acculturation · Deardorff intercultural competence · NACADA advising competencies · advising model taxonomy · push-pull structure · professional ethics principles · qualification framework structures.

**These change on a decade timescale.** Embed them once. They are the counsellor's reasoning substrate.

### Time-sensitive — never source from a book

Immigration policy · visa conditions · fees and thresholds · work rights · admission requirements · tuition costs · processing times · institutional policies · current mobility statistics.

**These change on a monthly-to-annual timescale**, and come exclusively from the companion source documents' rules table.

### The failure mode this prevents

> A 2012 handbook stating that a country offers a two-year post-study work visa is **not wrong** — it was true when written. But an AI that retrieves it and presents it as current has just given a student materially false information with an authoritative-sounding citation attached.

**Rule: no chunk originating from a book may ever answer a question about current rules, costs, or entitlements.** Tag every chunk from this document `layer: foundational` and hard-block it from regulatory queries. The other two documents own all current facts.

Two resources in this registry sit close to that line and need explicit tagging: **IIE Open Doors** (annual statistics) and **OECD Education at a Glance** (annual indicators). Both are genuinely time-stamped data, not timeless frameworks. Tag them `layer: dated_evidence` with the edition year, and require the counsellor to state the year.

---

# Recommended RAG Architecture

```
                          STUDENT INPUT
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 1 · STUDENT PROFILING            layer: foundational         │
│    NACADA relational competence · Schlossberg 4S             │
│    Push-pull: separate push motives from pull preferences    │
│    → What does THIS student actually need?                   │
│    → Who else is part of this decision?                      │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ 2 · CAREER & COURSE REASONING     layer: foundational        │
│    SCCT: self-efficacy vs outcome expectations               │
│    Career construction: narrative, for undecided students    │
│    Brown & Lent: theory base for interests and constraints   │
│    → Is the barrier belief in ability, or belief in payoff?  │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ 3 · DESTINATION REASONING         layer: foundational        │
│    Push-pull model · OECD system indicators                  │
│    → Student profile → destination suitability               │
│    → NEVER: popularity → recommendation                      │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ 4 · COUNTRY EDUCATION & LIVING KNOWLEDGE                     │
│    ► COUNTRY_INTERNATIONAL_STUDENT_GUIDELINES_RAG_SOURCES    │
│    Education systems · costs · housing · healthcare · rights │
│    scope tags enforced: national | region | institution      │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ 5 · UNIVERSITY / COURSE EVALUATION                           │
│    ⚠ NO PUBLISHED FRAMEWORK EXISTS — build internally        │
│    accreditation → programme fit → cost → outcomes →         │
│    support → location                                        │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ 6 · VISA & IMMIGRATION FEASIBILITY                           │
│    ► COUNTRY_STUDENT_VISA_RAG_SOURCES                        │
│    Rules table only. Volatile values with effective dates.   │
│    Stale beyond threshold → refuse the number, link source.  │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ 7 · TRANSITION & SUPPORT READINESS   layer: foundational     │
│    Schlossberg 4S · Berry · Fostering Success · wellbeing    │
│    → Will this student cope, and what support exists?        │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ 8 · ETHICAL GATE           ← applies to every step above     │
│    Forum Standards + our own operating policy                │
│    · State trade-offs, don't resolve them silently           │
│    · Say "not verified" rather than guess                    │
│    · Redirect institution-set questions                      │
│    · Recommend against, when the evidence warrants it        │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
                  COUNSELLING RECOMMENDATION
                  with cited sources + stated uncertainty
```

### Which resources serve which function

| Function | Resources |
|---|---|
| **Reasoning method** | NACADA competencies · Academic Advising Handbook (models) |
| **Decision frameworks** | Push-pull · SCCT · Schlossberg 4S · career construction |
| **Student profiling** | NACADA relational competence · Schlossberg 4S · SCCT elicitation |
| **Career guidance** | Brown & Lent · SCCT · Savickas |
| **Country comparison** | Push-pull · OECD EaG · guidelines document |
| **Course selection** | Brown & Lent · SCCT · qualification frameworks |
| **University selection** | **Internal framework** + accreditation and cost sources |
| **Student support** | Fostering Success · Schlossberg · Berry · wellbeing reviews · NAFSA mental health |
| **Ethics** | Forum Standards and Code · internal operating policy |

**The ethical gate is not the last step — it constrains every step.** It is drawn at the bottom because that is where the recommendation emerges, but a system that only checks ethics at output has already made the biased choice upstream.

---

# Research Gaps

Ordered by consequence for our specific market.

1. **Family and parental influence in international education decisions.** No authoritative resource identified. Our dominant career frameworks assume an individual decision-maker; a large share of our students do not have one. **Treat as a design requirement.**
2. **University and course selection framework.** No authoritative, non-commercial framework exists. The vacuum is currently filled by commercial rankings, which are methodologically contested and commercially motivated. **The highest-value original work available to this project.**
3. **Ethics of commercial international education advising.** The Forum's Code of Ethics (2020) is now verified and ingestible, but it **binds Forum members and addresses education abroad providers** — not commissioned agents or commercial advisers, and it predates AI-delivered advice entirely. Australia's National Code 2018 remains the strongest binding instrument, and it is regulatory rather than professional. **Still write our own policy, but build it on the Forum's four guiding questions rather than from scratch.**
4. **First-generation × international student intersection.** Rich domestic literature, thin at the intersection — despite this describing a large share of South Asian applicants.
5. **Nepal-specific research.** Our likely primary market is absent from the foundational decision-making literature. Mazzarol & Soutar sampled Indonesia, Taiwan, China and India. **Search JIS for Nepal-specific studies as the next step.**
6. **Ageing of the core frameworks.** The three central reference works — Academic Advising Handbook (2008), SAGE Intercultural Competence (2009), SAGE International Higher Education (2012) — have no newer editions. Their *theory* holds; their context does not. Mark foundational and never let them speak to current conditions.
7. **Non-Anglophone destination literature.** Almost everything here is US/UK/AU/CA-centric — convenient for our current scope, limiting if we expand.
8. **AI in counselling and academic integrity.** TEQSA's toolkit (guidelines document) addresses generative AI in academic integrity. **No resource identified on the ethics of AI-delivered education counselling itself** — which is precisely what we are building.

---

# Verification & Maintenance

## What this pass verified

**Fetched and read directly (2026-08-21):**
`nafsa.org/professional-resources/publications` · `forumea.org/resources/standards-of-good-practice/` · `emerald.com` Mazzarol & Soutar article page (DOI and paywall status)

**Index-confirmed** (bibliographic detail verified via publisher or association index; full page not read): NAFSA bookstore titles · NACADA · Journal of International Students · Journal of Studies in International Education · SAGE handbooks · Brown & Lent · Savickas · Springer Publishing · OECD · IIE · EAIE · British Council · UNESCO · systematic reviews.

**`journals.sagepub.com` returned 403** to automated fetch — JSIE detail confirmed via index instead.

## Corrections made during this pass

| Assumption | Verified position |
|---|---|
| *Fostering International Student Success* is by Andrade / ACE | **Shapiro, Farrelly & Tomaš**; TESOL Press with NAFSA; ISBN 9781953745064; 2023 |
| A third edition of *Academic Advising: A Comprehensive Handbook* exists | **No third edition found.** Second edition, 2008, remains current — a notable finding about the field |
| OECD *Education at a Glance 2026* is available | **2025 is the current edition** (9 September 2025) |
| Mazzarol & Soutar is freely accessible as a classic | **Paywalled** — £29.00 pay-per-view; abstract only |

## Verification status after the second pass

**Two verification passes were run on 2026-08-21.**

- **Bibliographic pass** — all 12 outstanding items chased: **11 resolved, 1 confirmed unobtainable.**
- **Licence pass** — every reuse claim checked against publisher terms: **4 of 8 corrected**, all in the same direction (free-to-read had been read as free-to-reuse). See the RAG Ingestion & Copyright Classification section.

### Resolved this pass

| Item | Was | Now |
|---|---|---|
| **Forum Code of Ethics** | Existence only | **3rd edition, 2020.** **ISBN 978-1-952376-08-5 · DOI 10.36366/G.978-1-952376-08-5.** Nine practice principles + four guiding questions. Copyright read from the PDF: **all rights reserved** |
| **NAFSA IE Handbook, 2nd ed** | "Multiple contributors"; DOI unknown | **Single-authored by Katherine Punteney.** No DOI assigned — confirmed, not missing |
| **NAFSA Guide to Education Abroad, 5th ed** | Year and ISBN unknown | **2022 (15 March).** ISBN 978-1-942719-47-2. Eds Wiedenhoeft & Henke. 431 pp |
| **Forum Standards, 6th ed** | ISBN unknown | **Two ISBNs**: 9781952376009 (2020, 45 pp) and 9781952376245 (Enhanced, 2022). Effective 1 July 2020; minor updates 2023 |
| **SAGE Handbook of Int'l Higher Education** | DOI unknown | **DOI 10.4135/9781452218397** |
| **NAFSA Addressing Mental Health** | Year and ISBN unknown | **2019 (17 May).** ISBN 978-1-942719-32-8. Ed. Patricia Burak. 115 pp |
| **NAFSA Advising Students with Disabilities, 2nd ed** | Year and ISBN unknown | **2020 (4 May).** ISBN 978-1-942719-37-3. Cory Owen. 78 pp |
| **NACADA Core Competencies** | Year unknown | **2017** |
| **Savickas Career Construction Counseling Manual** | Year unknown | **2019.** Confirmed **self-published** — admitted as a deliberate, non-precedential exception |
| **Counseling Adults in Transition, 5th ed** | Authorship and year unknown | **Anderson, Goodman & Schlossberg (2021).** ISBNs 9780826135469 / 9780826135476 |
| **Berry acculturation** | No canonical citation | **Berry (1997), *Applied Psychology: An International Review*, 46(1), 5–34.** DOI 10.1111/j.1464-0597.1997.tb01087.x. Page-range discrepancy investigated and resolved |

### Confirmed unobtainable

| Item | Status |
|---|---|
| **NAFSA *Crisis Management in International Education: ISSS, Vol 1* — ISBN** | **NAFSA does not publish an ISBN for this title on its product page.** Publication date (13 April 2026), series editors, format and price are confirmed. This is a **digital-download series volume priced at USD 16.00**, and NAFSA appears not to assign ISBNs to this format. Recorded as absent rather than unverified. **No further action available without contacting NAFSA.** |

### Licence verification — completed 2026-08-21

Every licence claim in this document was verified against the publisher's own terms. **Four of eight were wrong**, all in the same direction: I had read *free to download* as *free to reuse*. The corrections are in the RAG Ingestion & Copyright Classification section; the short version is that only **OECD (CC BY 4.0)** carries a verified commercial-reuse licence, and the Journal of International Students — the previous pass's top ingestion recommendation — is **CC BY-NC-ND 4.0**, which a commercial product does not satisfy.

**Two licence items remain genuinely open**, both requiring a document that cannot be read from a web page:

| Item | What is needed |
|---|---|
| **EAIE Barometer, 3rd ed** | No licence stated on the page or in the site footer beyond "© 2026 EAIE". **Open the downloaded PDF's copyright page.** |
| **UNESCO Global Convention** | UNESCO's organisational default is CC BY-SA 3.0 IGO, but the Convention page states no licence. **Check the unesdoc catalogue record for this specific document.** Treaty texts are often more permissive than publications, so this will probably clear — but it is not yet confirmed. |

### Operational decisions — resolved 2026-08-21

Both outstanding operational decisions have been taken. They are recorded here so the reasoning survives staff turnover.

#### Decision 1 — Forum Standards canonical artefact: **the free forumea.org download**

| | |
|---|---|
| **Decision** | Use the **current free download from `forumea.org`** as the single canonical artefact |
| **Rationale** | Free, current, and the Forum's own live distribution; post-dates the 2023 minor update. Because the Standards are `METADATA_ONLY`, we read and paraphrase rather than ingest — so a fixed print ISBN buys nothing we need |
| **9781952376009 (2020)** | Retained as **version history only**. Not read, not cited |
| **9781952376245 (Enhanced, 2022)** | **Excluded.** No published changelog, costs money, predates the 2023 update |
| **Multiple versions** | **Rejected.** Two near-identical quality frameworks in one corpus is a retrieval-ambiguity risk, not a hedge |
| **Cost** | £0 |
| ⏳ **Open action** | Download once, open it, and **record the internal edition statement** in the Standards entry above. This is a task, not an unresolved decision |

#### Decision 2 — NAFSA book acquisition: **buy none for now**

| | |
|---|---|
| **Decision** | **Purchase none of the five NAFSA titles at this time.** Complete the Phase 2 framework notes first |
| **Rationale** | None of the five addresses our four largest gaps — family influence, university/course selection, ethics for commercial advising, Nepal-specific evidence. They are strongest where we are already covered and silent where we are weakest. The 15–25 hours a purchase would commit produces strictly more value spent on Phase 2 notes, which cost nothing |
| **Spend avoided now** | ~USD 130–155 digital (~USD 100–115 with NAFSA member discount) |
| **Revisit trigger** | Phase 2 framework notes complete **and** a named person has capacity |
| **Revisit order** | **1st — #4 *Advising International Students with Disabilities*** (~USD 25, 78 pp): the only title filling a gap with no free equivalent, and the cheapest and shortest.<br>**2nd — #1 *International Education Handbook, 2nd ed*** (USD 40.50 digital): only if broad professional orientation is actively wanted |
| **Permanently deprioritised** | **#2 Guide to Education Abroad** — most expensive and directionally inverted (outbound US students, not inbound international).<br>**#3 Addressing Mental Health** — 2019, superseded by the free 2024–25 systematic reviews.<br>**#5 Crisis Management Vol 1** — incomplete 3-part series, institution-facing |

**The precondition test, for whoever revisits this:** *is a named person scheduled to read the book and write the notes?* If no, the answer stays "buy none" regardless of budget. An unread book is a more expensive way of having no knowledge.

## Maintenance cadence

| Item | Cadence |
|---|---|
| OECD *Education at a Glance* | **Annually each September** — the edition year is part of every citation |
| IIE *Open Doors* | Annually |
| Journal of International Students | Quarterly — new open-access articles |
| NAFSA bookstore | Annually — check for new editions |
| Forum Standards | On change signal — currently 6th edition |
| EAIE Barometer | Every ~2 years |
| Framework notes (Phase 2) | Review every 2 years; the underlying theory is stable |

## Before ingestion — do these in order

1. **Do not bulk-ingest the Journal of International Students.** Its CC BY-NC-ND 4.0 licence does not permit commercial use or derivative works. Either request written permission from OJED, or treat it as human-read input to your own framework notes.
2. **Ingest OECD *Education at a Glance 2025* (CC BY 4.0)** — the only verified commercial-reuse licence here. Then UNESCO, once the unesdoc record confirms its licence.
3. **Retrieve the Forum Standards and Code of Ethics once** — canonical artefact decided (free `forumea.org` download). **Record the Standards' internal edition statement.** One-time action, closes the version question permanently.
4. **Write the Phase 2 framework notes.** ⭐ **The critical path.** With no purchase pending, the counsellor's reasoning substrate depends entirely on these seven: push-pull · SCCT · Schlossberg 4S · Berry · NACADA competencies · Deardorff process model · advising model taxonomy. Budget real time — seven notes written properly is worth more than any purchase or scrape.
5. **Write the ethical operating policy and the family-inclusive decision policy** before launch, not after. Both fill genuine gaps in the published literature, and both govern behaviour rather than content. Build the ethics policy on the Forum's four guiding questions rather than from scratch.
6. **Enforce `layer: foundational` tagging** on everything from this document, with a hard block against regulatory and cost queries. A book must never answer a visa question.
7. **Only then revisit the NAFSA purchase**, against the precondition test: *is a named person scheduled to read and write notes?* If yes — **#4 Disabilities first (~USD 25), then #1 IE Handbook (USD 40.50 digital)** if wanted. If no — the answer stays "buy none".
