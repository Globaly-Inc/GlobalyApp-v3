# Niche.com K-12 Data Model — Reverse-Engineered Field Inventory

**Research date:** 2026-08-25
**Purpose:** Catalog the field/feature structure of Niche's K-12 school discovery product to inform GlobalyApp's own K-12 data model. Field names and structure only — no Niche content, review text, or ranking values are reproduced here.
**Method:** Niche.com blocks automated fetches (PerimeterX). Structure was cataloged from Wayback Machine captures (Feb 2026 public-school profile, Jan 2026 private-school profile, Dec 2024 charter profile, May 2025 district profile, 2025-2026 methodology pages, 2025 search pages) plus Niche's public methodology documentation.

**Pages examined (structure only):**
- Public magnet HS profile: `niche.com/k12/thomas-jefferson-high-school-for-science-and-technology-alexandria-va/` (capture 2026-02)
- Private boarding HS profile: `niche.com/k12/phillips-exeter-academy-exeter-nh/` (capture 2026-01)
- Charter profile: `niche.com/k12/basis-scottsdale-scottsdale-az/` (capture 2024-12)
- District profile: `niche.com/k12/d/fairfax-county-public-schools-va/` (capture 2025-05)
- Rankings methodology hub: `niche.com/k12/rankings/methodology/` (2026 edition) + 10 per-grade methodology sub-pages under `niche.com/about/methodology/`
- Data sources: `niche.com/about/data/`
- Search: `niche.com/k12/search/best-schools/`, `.../best-private-high-schools/`

---

## (a) Profile Page Section Inventory

### School profile (public / charter) — section order as rendered

| # | Section | Contents |
|---|---------|----------|
| 1 | Header / hero | School name, claimed badge ("blue checkmark"), school-type chips (Public / Charter / Magnet / Private, Boarding), grades served (e.g. 9-12), city + state, star rating (x.xx / 5) + review count, headline ranking ("#N in <list>"), photos, map, Add to List button |
| 2 | Report Card | Overall Niche Grade + per-topic letter grades: Academics, Diversity, Teachers, College Prep, Clubs & Activities, Administration (public HS); Sports appears when data exists; links "How are grades calculated?" and "Data Sources"; "View Full Report Card" |
| 3 | Auto-generated summary sentence | Templated prose: "{Name} is a top rated, {type} school located in {city}. It has {N} students in grades {range} with a student-teacher ratio of {R} to 1. According to state test scores, {X}% of students are at least proficient in math and {Y}% in reading." |
| 4 | Compare CTA | "Compare {school} to Other Schools" |
| 5 | About | Website, phone, street address, "Claim Your School" CTA, feature tags (AP Offered, High School, Middle School, Magnet School, Charter School...), parent district link, state/neighborhood breadcrumbs |
| 6 | Rankings | Top 3 ranking placements ("#n of N" in named state/national lists) + "See All Rankings" |
| 7 | Academics | Percent Proficient Reading, Percent Proficient Math (with state-test caveat text and the specific state assessment named + year), Average Graduation Rate, Average SAT (+ response count), Average ACT (+ response count), AP Enrollment %, College Admissions Calculator CTA, Popular Colleges (top colleges users are interested in, each with its Niche college grade + student-interest count) |
| 8 | Map / boundary | School map, attendance-boundary disclaimer, Homes For Sale cross-sell |
| 9 | Living in the Area | Neighborhood name + Overall Niche Grade, Cost of Living grade, Good for Families grade, Housing grade, Median Household Income, Median Rent, Median Home Value (each with national benchmark) |
| 10 | Culture & Safety | Poll: % of students who feel safe; poll: % who like school / feel happy; student poll: favorite events/traditions (top answers with % shares, response counts) |
| 11 | Students | Diversity grade + definition, total enrollment, Free or Reduced Lunch %, student-character polls (% agree students are competitive / creative & artsy / athletic), link to full Students subpage (racial breakdown, gender split live there) |
| 12 | Teachers | Student-Teacher Ratio (+ national benchmark + class-size caveat), Average Teacher Salary (district-level value), Teachers in First/Second Year %, teacher-quality polls (engaging lessons / genuinely care / lead classroom) |
| 13 | Clubs & Activities | Clubs & Activities grade, Girls Athletic Participation (categorical: Very Low…Very High), Boys Athletic Participation (categorical), Expenses Per Student (+ national benchmark), club polls (plenty of clubs / funding / participation) |
| 14 | Similar Schools | Card list: name, grade, district, grades served, rating, review count |
| 15 | Reviews | Average rating, total count, 1-5 star histogram, individual reviews (star rating, text, reviewer role [Parent / Freshman…Senior / Alum / Works Here], relative date, topic tag e.g. "Overall Experience", helpful votes, report link), "Review this school" CTA |

### Private school profile — additional / different sections

| Section | Contents |
|---------|----------|
| Applying | Application Deadline, Application Fee, Interview Required (Y/N), Required/Recommended Tests (ISEE, SSAT...), How to Apply / Visit Campus / Learn More CTAs |
| Tuition | Yearly Tuition (highest grade offered), Boarding (Tuition + Boarding) price, % Received Financial Aid, Average Financial Aid |
| Boarding | Students Boarding %, Boarding Days Per Week (5-day/7-day), Top Countries represented, International Boarding Students % |
| From the School | School-authored marketing copy + links (claimed schools only) |
| Academic Spotlight | School-authored feature block (claimed/partner schools) |
| Upcoming Events | School-published events with dates (partner feature) |
| Connect / Request Info / Apply Now | Lead-generation CTAs (partner monetization) |
| Virtual Tour | Partner feature |
| Membership tags | NAIS Member, TABS Member, religion tags, Boarding School |
- Private profiles omit: Administration grade, Food grade, Free/Reduced Lunch, attendance-boundary map; Percent Proficient (no state testing).

### District profile (`/k12/d/{slug}`) — sections

| Section | Contents |
|---------|----------|
| Header | District name, city/state, #N in Best School Districts in {State}, Overall Grade, grades served (PK, K-12), star rating + review count, map |
| Report Card | Overall + Academics, Diversity, Teachers, College Prep, Clubs & Activities, Administration grades (Sports, Food, Resources & Facilities exist on full report card) |
| Templated summary | Same pattern as school: enrollment, S-T ratio, math/reading proficiency |
| About | Website, phone, HQ address, claim CTA, tags (AP Offered, IB Offered, Gifted Prog. Offered) |
| Rankings | Placements in district-level lists (Best School Districts, Best Districts for Athletes, Best Places to Teach) |
| Schools in district | Tabbed Elementary / Middle / High lists; each school card: name, grade, rating, review count; "See all N" |
| Academics | Same fields as school (proficiency, graduation rate, SAT/ACT user-reported, Popular Colleges) |
| Students | Enrollment, FRL %, Diversity grade |
| Teachers | S-T ratio, Average Teacher Salary, Teachers in First/Second Year % |
| Finances (district-only) | Expenses Per Student (+ natl), Education Expenses breakdown: Instruction % / Support Services % / Other % |
| Living in the Area | Same as school |
| Reviews | Same structure as school |

---

## (b) Full Field Inventory

Legend — **Level:** S = school, D = district, S/D = both. **Type:** Quant / Qual / Cat (categorical) / Text. **Source:** likely authoritative origin. **AI counselling:** yes = usable as structured input to counselling logic; display = show but don't reason on; no. **Calc:** derivable from other fields.

### 1. Identity & classification

| Field | Meaning | Level | Type | Likely source | AI counselling | Calc? |
|---|---|---|---|---|---|---|
| School/district name | Official name | S/D | Text | NCES CCD (public), PSS (private) | yes (identity) | no |
| NCES-style unique slug/ID | URL identity | S/D | Text | NCES CCD/PSS IDs | yes | no |
| School type | Public / Private | S | Cat | CCD (public), PSS (private) | yes | no |
| Public subtype | Traditional / Charter / Magnet | S | Cat | NCES CCD flags | yes | no |
| Boarding flag | Offers boarding | S | Bool | PSS / school-reported | yes | no |
| Religion affiliation | Catholic / Christian / Jewish / Islamic / none | S | Cat | PSS | yes | no |
| Specialty flags | Online, Special education, Montessori, Therapeutic | S | Cat multi | PSS / school-reported | yes | no |
| Program flags | AP Offered, IB Offered, Gifted Prog. Offered | S/D | Bool | CRDC (AP/IB), CCD, school-reported | yes | no |
| Level tags | High School / Middle School / Elementary | S | Cat multi | derived from grades served | yes | yes (from grade span) |
| Grades served | e.g. PK, K-12, 9-12 | S/D | Cat | NCES CCD / PSS | yes | no |
| Membership tags | NAIS Member, TABS Member | S (private) | Bool | Association lists / school-reported | display | no |
| District affiliation | Parent district link | S | Ref | NCES CCD (LEA ID) | yes | no |
| Address, city, state, ZIP | Location | S/D | Text | NCES CCD / PSS | yes | no |
| Phone | Contact | S/D | Text | NCES CCD / PSS | display | no |
| Website | Official site | S/D | Text | NCES CCD / PSS / school-reported | display | no |
| Geo coordinates / map pin | Lat-long | S/D | Quant | NCES EDGE geocodes | yes (distance calc) | no |
| Attendance boundary polygon | Which addresses feed the school | S | Geo | NCES SABS (+ district updates) | yes | no |
| Claimed status | School manages its profile | S/D | Bool | Niche proprietary | no | no |
| Neighborhood/place link | "Living in" place page | S/D | Ref | Census TIGER + Niche places | display | yes (geo join) |

### 2. Report card grades (Niche-computed)

| Field | Meaning | Level | Type | Source | AI counselling | Calc? |
|---|---|---|---|---|---|---|
| Overall Niche Grade | A+…D- composite z-score grade | S/D | Cat (ordinal) | Niche proprietary composite | display (methodology opaque, blends user data) | yes — from own factors if replicated |
| Academics grade | Composite of proficiency, colleges, grad rate, AP, S-T ratio, surveys | S/D | Cat | Niche composite | display | yes (public parts) |
| Diversity (Culture & Diversity) grade | Racial/economic/gender diversity + surveys | S/D | Cat | Niche composite | display | yes (public parts) |
| Teachers grade | Salary, absenteeism, experience, S-T ratio + surveys | S/D | Cat | Niche composite | display | yes (public parts) |
| College Prep grade | Top colleges, AP, college enrollment + surveys | S (HS)/D | Cat | Niche composite | display | partly |
| Clubs & Activities grade | Expenses, facilities, sports + surveys | S/D | Cat | Niche composite | display | partly |
| Administration grade | Surveys + expense ratios + absenteeism | S (public HS)/D | Cat | Niche composite | display | partly |
| Sports grade | Participation, # sports, championships + surveys | S/D | Cat | Niche composite | display | partly |
| Food grade | 80% surveys + expenses | S (public HS)/D | Cat | Niche composite (mostly UGC) | no | no |
| Resources & Facilities grade | S-T ratio, expenses, counselor ratio + surveys | S (public HS)/D | Cat | Niche composite | display | yes (public parts) |

### 3. Rankings

| Field | Meaning | Level | Type | Source | AI counselling | Calc? |
|---|---|---|---|---|---|---|
| Ranking placements | "#n of N" in named lists (national + per-state, per-category: Best Public HS, Best College Prep, Best for STEM, Most Diverse, Best for Athletes, Best Places to Teach, Best Districts...) | S/D | Quant (ordinal) | Niche proprietary | display only | yes — ordering of composite score |
| Ranking list membership | Which lists a school qualifies for | S/D | Cat multi | Niche eligibility rules (≥50% factor coverage) | no | yes |

### 4. Academics

| Field | Meaning | Level | Type | Source | AI counselling | Calc? |
|---|---|---|---|---|---|---|
| Percent Proficient — Reading | % at/above proficiency on state ELA assessment | S/D (public) | Quant | State DOE via EDFacts/ED (state-named on page, e.g. VA SOL 2023-24) | yes (with state caveat) | no |
| Percent Proficient — Math | Same for math | S/D (public) | Quant | State DOE via EDFacts/ED | yes | no |
| Assessment name + year | Which state test the numbers come from | S/D | Text | State DOE | yes (metadata) | no |
| Average Graduation Rate | % of 12th graders graduating | S/D | Quant | ED / state DOE (ACGR) | yes | no |
| Average SAT (+ response count) | User-reported composite /1600 | S/D | Quant | Niche user surveys | display (self-selected sample) | no |
| Average ACT (+ response count) | User-reported composite /36 | S/D | Quant | Niche user surveys | display | no |
| AP Enrollment % | % enrolled in ≥1 AP course | S | Quant | CRDC | yes | no |
| AP Test Pass Rate | % of AP students passing ≥1 exam | S | Quant | CRDC | yes | no |
| College Enrollment % | % of seniors going to 4-yr colleges | S/D | Quant | NCES + (2026) National Student Clearinghouse verification | yes | no |
| Top Colleges Score / Top Enrolled Colleges | Avg Niche grade of colleges students want/attend | S/D | Quant | Niche users + NSC (proprietary blend) | no | no |
| Popular Colleges list | Colleges users are most interested in, with counts | S/D | List | Niche user accounts | display | no |
| Student-Teacher Ratio | Students per FTE teacher (+ natl benchmark) | S/D | Quant | NCES CCD / PSS | yes | yes (enrollment / FTE teachers) |

### 5. Students & diversity

| Field | Meaning | Level | Type | Source | AI counselling | Calc? |
|---|---|---|---|---|---|---|
| Total enrollment | Student count | S/D | Quant | NCES CCD / PSS | yes | no |
| Free or Reduced Lunch % | Economic-need proxy | S/D (public) | Quant | NCES CCD | yes | no |
| Student Racial Diversity Index | Diversity measure of racial composition | S/D | Quant | derived from CCD/PSS race counts | yes | yes (e.g. Simpson index from race shares) |
| Racial/ethnic breakdown | % by race (full Students subpage) | S/D | Quant multi | NCES CCD / PSS | yes | no |
| Gender Diversity | % of most-represented gender | S/D | Quant | NCES CCD / PSS | yes | yes (from gender counts) |
| Economically Disadvantaged % | State-defined measure | S/D (public) | Quant | ED / state | yes | no |
| Student Absenteeism | % missing 15+ days/yr | S/D | Quant | CRDC | yes | no |

### 6. Teachers & staff

| Field | Meaning | Level | Type | Source | AI counselling | Calc? |
|---|---|---|---|---|---|---|
| Average Teacher Salary | District average | D (shown on S) | Quant | NCES CCD fiscal | yes | no |
| Teacher Salary Index | Salary normalized by county median income | D | Quant | NCES + Census ACS | yes | yes |
| Teachers in First/Second Year % | Inexperience measure | S/D | Quant | CRDC | yes | no |
| Teacher Absenteeism | % missing 10+ days | S/D | Quant | CRDC | yes | no |
| Student-Counselor Ratio | Students per FTE counselor | S/D | Quant | NCES CCD | yes | yes |

### 7. Finances (district-level, assigned down to schools)

| Field | Meaning | Level | Type | Source | AI counselling | Calc? |
|---|---|---|---|---|---|---|
| Expenses Per Student | Total expenses / enrollment, income-normalized (+ natl) | D (shown on S) | Quant | NCES F-33 finance survey | yes | yes |
| Education Expenses breakdown | Instruction % / Support Services % / Other % | D | Quant | NCES F-33 | yes | yes (shares of total) |
| Education-Administration Expense Ratio | $ education per $ admin | D | Quant | NCES F-33 | yes | yes |

### 8. Sports & activities

| Field | Meaning | Level | Type | Source | AI counselling | Calc? |
|---|---|---|---|---|---|---|
| Girls Athletic Participation | Categorical Very Low…Very High | S/D | Cat | CRDC (binned by Niche) | yes | yes (bin from CRDC counts) |
| Boys Athletic Participation | Same | S/D | Cat | CRDC | yes | yes |
| Number of Sports | Interscholastic sports offered | S | Quant | CRDC | yes | no |
| K12 Sports Championships | Championships won | S | Quant | State athletic associations ("varies by state") | display | no |
| Total High School Enrollment | Grades 9-12 headcount (sports-scale proxy) | S | Quant | NCES CCD | yes | yes (subset of enrollment) |

### 9. Private-school admissions & cost

| Field | Meaning | Level | Type | Source | AI counselling | Calc? |
|---|---|---|---|---|---|---|
| Yearly Tuition | Day tuition, highest grade | S | Quant | School-reported (partner portal) | yes | no |
| Boarding Tuition | Tuition + boarding | S | Quant | School-reported | yes | no |
| % Received Financial Aid | Aid penetration | S | Quant | School-reported | yes | no |
| Average Financial Aid | Mean award | S | Quant | School-reported | yes | no |
| Application Deadline | Date | S | Date | School-reported | yes | no |
| Application Fee | $ | S | Quant | School-reported | yes | no |
| Interview Required | Y/N | S | Bool | School-reported | yes | no |
| Required/Recommended Tests | ISEE, SSAT, etc. | S | Cat multi | School-reported | yes | no |
| Students Boarding % | Share who board | S | Quant | School-reported / PSS | yes | no |
| Boarding Days Per Week | 5-day / 7-day | S | Cat | School-reported | yes | no |
| International Boarding Students % | Share from abroad | S | Quant | School-reported | yes | no |
| Top Countries | Most-represented foreign countries | S | List | School-reported | display | no |

### 10. User-generated & survey content (Niche proprietary)

| Field | Meaning | Level | Type | Source | AI counselling | Calc? |
|---|---|---|---|---|---|---|
| Average star rating | Mean of reviews (x.xx/5) | S/D | Quant | Niche UGC | display | yes (from reviews) |
| Review count | Volume | S/D | Quant | Niche UGC | display | yes |
| Rating histogram | Counts per star 1-5 | S/D | Quant | Niche UGC | display | yes |
| Individual reviews | Text + star + reviewer role (Parent/grade-level/Alum/Works Here) + date + topic + helpful votes | S/D | Text | Niche UGC | no (do not copy) | no |
| Safety poll | % students feel safe (+ n) | S/D | Quant | Niche surveys | display | no |
| Happiness poll | % like school / feel happy | S/D | Quant | Niche surveys | display | no |
| Student-character polls | % agree students competitive / creative / athletic | S/D | Quant | Niche surveys | display | no |
| Teacher polls | engaging / caring / classroom control | S/D | Quant | Niche surveys | display | no |
| Clubs polls | plenty of clubs / funding / participation | S/D | Quant | Niche surveys | display | no |
| Traditions poll | Favorite events/traditions (top answers + %) | S | Cat | Niche surveys | no | no |
| Featured review snippet | One review surfaced on search cards | S/D | Text | Niche UGC | no | no |

### 11. Area / real-estate context

| Field | Meaning | Level | Type | Source | AI counselling | Calc? |
|---|---|---|---|---|---|---|
| Neighborhood Overall Grade + sub-grades | Cost of Living, Good for Families, Housing | Area | Cat | Niche places product (Census/FBI composite) | display | n/a |
| Median Household Income (+ natl) | Area income | Area | Quant | Census ACS | yes (context) | no |
| Median Rent (+ natl) | Area rent | Area | Quant | Census ACS | yes | no |
| Median Home Value (+ natl) | Area home value | Area | Quant | Census ACS | yes | no |
| Homes For Sale / View Nearby Homes | Realtor cross-sell | Area | Feature | Niche + listing partner | no | n/a |

### 12. Product / engagement features (not data fields)

Add to List (favorites), Compare tool (`/k12/compare/`), K-12 Quiz (fit matching), Schools Near You (geo search), College Admissions Calculator, Request Info / Apply Now lead-gen, Virtual Tour, From the School + Academic Spotlight + Upcoming Events + photos/video (partner content), Sponsored placements in search, Claim Your School flow, Similar Schools recommender, monthly "views" analytics for partners.

---

## (c) Search Filters (K-12 search, confirmed from live filter DOM, 2025-2026)

| Facet (internal name) | Options |
|---|---|
| Location | Place/state/district scope + "View on Map" (implicit geo facet) |
| `gradeLevel` | Pre-K, Elementary, Middle, High school, K-8 only, K-12 only |
| Type (`Public`) | Public → Traditional / Charter / Magnet; Private |
| `religion` | Catholic, Christian, Jewish, Islamic |
| `boardingStatus` | Offers boarding |
| `specialty` | Online, Special education, Montessori, Therapeutic |
| `academics` | AP program, IB program, Gifted/talented program |
| Ranking-list tabs | "Best schools", "Most diverse", + more (each list = pre-filtered ranked view) |

Search result card fields: ranking badge ("#N Best X in America"), name, claimed check, type, city/state, grades served, star rating + review count, featured review snippet + reviewer role, Overall Niche Grade, Students (enrollment), Student-teacher ratio, tuition (private lists), links (View nearby homes, Virtual tour, Add to List). Sponsored cards are labeled and typed (PRIVATE SCHOOL / CHRISTIAN SCHOOL / CATHOLIC DIOCESE).

Note: tuition and rating filters have appeared historically on private-school searches; the confirmed 2025-26 facet set is the table above.

---

## (d) Rankings Methodology Summary (Niche-published)

### Pipeline (published on methodology hub)
1. Select factors per ranking. 2. Process data (Bayesian shrinkage on survey scores by response volume; outlier cleaning on factual data). 3. Z-score standardize each factor. 4. Apply published weights. 5. Composite → re-standardized final z-score. 6. Eligibility: missing ≥50% of factor weight → excluded; has ≥50% but missing a required factor → grade only, no rank; complete → rank + grade. 7. Grade = fixed z-score bands (A+ top 2.5%, A next 7.5%, A- next 10%, B+ 13%, B 17%, B- 17%, C+ 13%, C 10%, C- 7.5%, D+ 1.3%, D 0.6%, D- 0.6%; nothing below D-). Annual refresh (2026 edition released 2025-09-29).

**2026 change:** new "Top Enrolled Colleges" factor using National Student Clearinghouse-verified enrollment; "Top Popular Colleges" (user interest) weight reduced.

### Published factor weights (2024-25 archived pages; 2026 shifts some Top Colleges weight to NSC-verified enrollment)

**Best Public High Schools / Overall Grade (public HS):** Academics grade 60%, Culture & Diversity grade 12.5%, Overall-experience surveys 10%, Teachers grade 10%, Clubs & Activities 2.5%, Resources & Facilities 2.5%, Sports 2.5%.

**Best Private High Schools / Overall (private HS):** Top Colleges Score 32.6%, College Enrollment 21.2%, Culture & Diversity 15.4%, Overall-experience surveys 15.4%, Student-Teacher Ratio 15.4%.

**Best School Districts / Overall (district):** Academics 50%, Teachers 15%, Culture & Diversity 12.5%, Overall-experience surveys 12.5%, Resources & Facilities 5%, Clubs & Activities 2.5%, Sports 2.5%.

**Academics grade (public HS):** Top Colleges Score 27.9% (users), State Assessment Proficiency 19.4% (ED; within-state percentiles for cross-state comparison), Graduation Rate 13.9% (ED), Academics surveys 13.9% (users), AP Enrollment 8.3% (CRDC), AP Pass Rate 8.3% (CRDC), Student-Teacher Ratio 8.3% (NCES).

**Diversity grade:** Student Racial Diversity Index 60% (ED), Culture & Diversity surveys 20% (users), Economically Disadvantaged % 10% (ED, public only), Gender Diversity 10% (ED).

**Teachers grade:** Academics grade 30%, Teacher surveys 25% (users), Teacher Absenteeism 15% (CRDC), Teacher Salary Index 10% (ED + county income), First/Second-Year Teachers 10% (CRDC), Average Teacher Salary 5% (NCES), Student-Teacher Ratio 5% (NCES).

**College Prep grade (public HS):** Top Colleges Score 35% (users), Culture & Diversity grade 20%, College-prep surveys 15% (users), AP Enrollment 8% (CRDC), College Enrollment 8% (NCES/NSC), Graduation Rate 8% (ED), AP Pass Rate 6% (CRDC).

**Clubs & Activities grade:** Extracurricular surveys 50% (users), Resources & Facilities grade 30%, Sports grade 10%, Student-Teacher Ratio 10% (NCES).

**Administration grade:** Administration surveys 50% (users), Overall Niche Grade 20%, Education-Admin Expense Ratio 10% (NCES), Expenses per Student 10% (NCES), Student Absenteeism 5% (CRDC), Teacher Absenteeism 5% (CRDC).

**Sports grade:** Sports surveys 50% (users), Total HS Enrollment 20% (NCES), Championships 10% (state associations), Number of Sports 10% (CRDC), Boys Participation 5% (CRDC), Girls Participation 5% (CRDC).

**Food grade:** Food surveys 80% (users), Expenses per Student 20% (NCES).

**Resources & Facilities grade:** Facilities surveys 50% (users), Student-Teacher Ratio 20% (NCES), Expenses per Student 15% (NCES), Student-Counselor Ratio 15% (NCES).

### Ranking families published
Per state + national, for: Public HS, Private HS, Charter HS, Public/Private Elementary, Public/Private Middle, Private K-8, Public K-8, School Districts, College Prep, STEM, Most Diverse, Best Teachers, Best for Athletes, Best Places to Teach, Boarding Schools, Standout HS. Grade-methodology sets differ by segment: Private K-8 gets Overall/Academics/Diversity/Teachers only; Public HS and Districts get the full 10-grade report card.

### Data sources Niche cites (from `niche.com/about/data/`)
- **NCES CCD** — school/district universe, enrollment, staffing
- **NCES PSS** — private school universe + enrollment
- **NCES CCD F-33 School District Finance Survey** — district finance
- **Civil Rights Data Collection (CRDC)** — AP/IB, discipline, athletics, absenteeism
- **NCES SABS** — attendance boundaries
- **US Dept of Education** — graduation rates, state test scores (EDFacts/state DOE)
- **National Student Clearinghouse** — verified college enrollment (added 2026)
- **State athletic associations** — championships ("source varies by state")
- **Census ACS / TIGER, FBI UCR** — area context (places product)
- **Niche K-12 Student & Parent Surveys** — reviews, polls, SAT/ACT, college interest
- **Niche Partner Portal** — school-reported updates (tuition, admissions, boarding, photos, events); explicitly the substitute channel for private schools not covered by federal reporting

---

## (e) Proprietary/UGC vs Public-Data Dependence

**Fully public-data replicable (~60% of structured fields):** entire identity/classification layer (CCD/PSS), proficiency + graduation (state DOE/EDFacts), AP/athletics/absenteeism/staff-experience (CRDC), finance (F-33), enrollment/demographics/S-T ratio (CCD/PSS), boundaries (SABS), area economics (ACS). All the quantitative inputs a counselling engine actually needs are here.

**School-reported (partner portal / PSS-supplemented):** private-school tuition, financial aid, admissions requirements, boarding details, events, marketing copy, photos. Public sources have no equivalent; requires school outreach or third-party private-school datasets.

**Niche-proprietary / UGC (not replicable, and the core of their moat):**
- ~3M reviews + poll responses → feeds 10-80% of every grade (Food is 80% UGC; every grade carries a 10-50% survey component).
- User-reported SAT/ACT averages and Popular Colleges (from Niche's college-search user base — a cross-product data asset).
- Top Colleges Score (depends on their own college rankings).
- The grades/rankings themselves (methodology public, inputs partly private).
- Engagement layer: lists, quiz matching, comparisons, lead-gen, sponsored placement.

**Design implication for GlobalyApp:** Niche's letter grades are a *presentation* layer over mostly-public data plus a survey moat. A counselling engine can reproduce the objective ~60% directly from NCES/CRDC/state DOE, use Niche-style categorical binning (z-score bands) for explainability, and must source subjective fit signals (safety, culture, teacher quality) from its own users or omit them — they cannot be scraped or licensed implicitly from Niche.

---

*Structure cataloged from public methodology documentation and archived page structure. No Niche review content, proprietary scores, or ranking values are reproduced for reuse.*
