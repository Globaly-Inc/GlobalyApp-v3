// LLM prompts for each extraction phase.

// The closed platform lists the model chooses from are passed in, not hardcoded: they are read
// from public.areas_of_study / public.degree_levels (seeded from
// database/seeders/globalyapp/*_seeder.ts), so a prompt can never offer a value a course cannot
// actually be linked to, and editing a seed file changes the prompt with no code change.
import type { LookupLists } from "./lookup-catalog.js";

// ── Phase 1: Site analysis (job worker) ──

export const SITE_ANALYSIS_SYSTEM = `You are a data extraction specialist for educational institutions.
You analyze institution websites and extract structured information.
Always respond in valid JSON. Never include markdown or explanation outside the JSON.`;

export function siteAnalysisPrompt(url: string, pageText: string, guidanceNotes?: string | null) {
  return `Analyze this educational institution's homepage and extract overview information.

URL: ${url}
${guidanceNotes ? `\nAdmin notes: ${guidanceNotes}` : ""}

Page content:
${pageText}

Extract this JSON structure:
{
  "institution": {
    "name": "full institution name",
    "website": "${url}",
    "phone": "main phone or null",
    "email": "the institution's own contact email or null — priority: 1) main/general (info@/contact@/enquiries@) 2) department (admissions@) 3) any other listed email",
    "address": "street address line only — do NOT repeat city/state/postcode here, they have their own fields",
    "city": "city or null",
    "state": "state/province or null",
    "country": "country or null",
    "zip_code": "postal code or null",
    "ownership_type": "\"public\" or \"private\" — ONLY if explicitly stated (e.g. \"a public research university\", \"private college\"); null if the page doesn't say",
    "description": "brief description of the institution",
    "logo_url": "logo image URL or null",
    "facebook_url": "a facebook.com link, or null — never put a link to a different platform here just because it was near a Facebook icon",
    "instagram_url": "an instagram.com link, or null",
    "twitter_url": "a twitter.com or x.com link, or null — do NOT put tiktok.com, threads.net or any other domain here",
    "linkedin_url": "a linkedin.com link, or null",
    "youtube_url": "a youtube.com or youtu.be link, or null",
    "other_social_urls": [{ "label": "short platform/site name, e.g. \"TikTok\", \"WhatsApp\", \"Booking\"", "url": "the link" }]
  },
  "site_intelligence": {
    "institution_type": "university|college|tafe|polytechnic|training_provider|other",
    "country": "country code like AU, US, UK",
    "currency": "primary currency code like AUD, USD",
    "extraction_hints": ["array of observations about site structure that help extraction"],
    "fee_structure": { "format": "per_year|per_semester|per_course|total", "notes": "any observations" }
  },
  "course_page_patterns": ["URL patterns that indicate course listing or detail pages, e.g. /courses/, /study/"]
}`;
}

// ── Phase 1b: URL discovery (job worker) ──

export function urlDiscoveryPrompt(links: string[], patterns: string[]) {
  return `From these URLs found on an educational institution website, identify which ones are likely course detail or listing pages.

Known course URL patterns for this site: ${patterns?.join(", ") || "none identified yet"}

URLs found (${links.length}):
${links.slice(0, 500).join("\n")}

Return JSON:
{
  "course_urls": ["array of URLs that are likely course detail or listing pages"],
  "listing_urls": ["array of URLs that are course listing/catalog/search pages to crawl further"]
}

Rules:
- Include only URLs that clearly relate to academic courses/programs/degrees
- Exclude general pages (about, contact, news, staff, events, login)
- Prefer detail pages over listing pages
- If unsure, include it — false positives are better than missing courses`;
}

// ── Phase 2: Course extraction (page worker) ──

export const COURSE_EXTRACTION_SYSTEM = `You are a data extraction specialist. Extract structured course data from educational institution web pages.
Always respond in valid JSON. Extract everything you can find — fees, intakes, campuses, entry requirements.
If a field is not found on the page, use null. Never invent data.`;

export function courseExtractionPrompt(
  url: string, pageText: string,
  guidanceNotes?: string | null,
  siteHints?: { fee_structure?: unknown; extraction_hints?: string[] } | null,
  lookups?: LookupLists,
) {
  const enumOf = (rows?: { name: string }[]) => (rows?.length ? rows.map((r) => r.name).join("|") : "null");
  const levelEnum = enumOf(lookups?.levels);
  const areaEnum = enumOf(lookups?.areas);
  const hints: string[] = [];
  if (guidanceNotes) hints.push(`Admin guidance: ${guidanceNotes}`);
  if (siteHints?.extraction_hints?.length) hints.push(`Site hints: ${siteHints.extraction_hints.join("; ")}`);
  if (siteHints?.fee_structure) hints.push(`Fee info: ${JSON.stringify(siteHints.fee_structure)}`);

  return `Extract all courses/programs from this educational institution page.

URL: ${url}
${hints.length ? "\n" + hints.join("\n") : ""}

Page content:
${pageText}

Extract this JSON:
{
  "courses": [
    {
      "name": "full course name, including its own qualification — e.g. 'Aerospace Engineering BEng(Hons)', not just 'Aerospace Engineering'",
      "short_name": "abbreviated name or null",
      "degree_level": "${levelEnum} — ONLY one of these exact values, taken from the qualification in the course's own name or heading (BSc/BA/MBBS → Bachelor; MSc/MA/MBA → Master; MRes/MPhil → a research master; PhD/EdD/JD/MD → the doctoral level; Grad Cert/PGCert → the graduate level; a minor, exchange, summer school, short course or foundation year → the non-award level). null if the page names no qualification — never invent a level, and never answer with a value that is not in the list above",
      "course_category": "academic|short_course — 'academic' is a formal qualification requiring sustained enrolment (any degree_level above); 'short_course' is a standalone, non-award offering — a workshop, single-topic training, professional development, or language course with no degree_level qualification",
      "subject_area": "the shared subject/program name this qualification belongs to, WITHOUT the qualification suffix — e.g. 'Aerospace Engineering', 'Computer Science', 'Medicine', 'Business'",
      "area_of_study": "${areaEnum} — ONLY one of these exact values: the single heading this course's subject belongs under. Judge it from the subject itself, not the wording — e.g. a nursing, dentistry or psychology course belongs under the health heading; economics, politics, media and social work under the social-studies heading; architecture, construction and urban planning under the architecture heading. null ONLY if the entry names no real discipline at all (an enrolment status like 'Visiting Student', or an offering bucket like 'Summer Programs'). Never answer with a value that is not in the list above",
      "duration_weeks": null,
      "duration_text": "the duration exactly as written on the page, e.g. '3 years full-time' or '18 months' — null if not stated",
      "study_mode": "on-campus|online|hybrid|null",
      "description": "course description or null",
      "awarding_institution": null,
      "source_url": "${url}",
      "career_paths": [],
      "fees": [
        {
          "name": "SHORT generic label for the KIND of fee — e.g. 'Tuition Fee', 'Semester Fee', 'Application Fee', 'Enrolment Fee', 'Material Fee', 'Student Services Fee', 'Health Cover' — max 40 characters. NEVER put amounts, currency symbols, credit counts, or the course name in the label",
          "description": "the page's own wording for this fee, verbatim — the per-credit breakdown, the full range, the 'contact us' note, what the fee covers. null if the page states nothing beyond the amount",
          "currency": "ISO 4217 code (AUD, USD, GBP, EUR, CAD, NPR, INR, ...) — NEVER a symbol like '$' or '£'. If the page shows only a symbol, use the code for the institution's own country. null if genuinely unstated",
          "student_type": "domestic|international|both",
          "period_type": "Per Year|Per Semester|Per Trimester|Total|Per Unit",
          "total_amount": "numeric amount — the lower bound if the page shows a range, null if no real figure is stated (e.g. \"Contact us\")"
        }
      ],
      "intakes": [
        {
          "intake_name": "e.g. \"Semester 1 2027\", \"Fall 2027\" — ALWAYS include the year, never a bare season (\"Fall\", \"Spring\", \"Summer\") or a bare term (\"Semester 1\")",
          "start_date": "YYYY-MM-DD when the page states a day, or YYYY-MM when it states only a month — never invent a day. null if unstated",
          "end_date": "YYYY-MM-DD when the page states a day, or YYYY-MM when it states only a month — never invent a day. null if unstated",
          "orientation_date": "YYYY-MM-DD when the page states a day, or YYYY-MM when it states only a month — never invent a day. null if unstated",
          "intake_month": "1-12, the month this intake starts — derive it from the intake name or start date when the page states it no other way",
          "intake_year": "4-digit year this intake starts — derive it from the intake name (\\"Semester 1 2027\\" -> 2027) or start date",
          "admission_deadline": "YYYY-MM-DD when the page states a day, or YYYY-MM when it states only a month — never invent a day. null if unstated",
          "custom_dates": "[] or, for any OTHER dated milestone this intake states, [{\"name\": \"the page's own label, e.g. Exam Date, Scholarship Deadline, Document Submission Deadline, Orientation Week\", \"date\": \"YYYY-MM-DD or YYYY-MM\"}] — never duplicate the four fields above"
        }
      ],
      "study_options": [
        {
          "name": "e.g. Full-time On Campus",
          "study_mode": "on_campus|online|hybrid",
          "study_load": "full_time|part_time",
          "duration_value": null,
          "duration_unit": "months|weeks|years|semesters|null",
          "duration_text": "this option's duration exactly as written, e.g. '2 years part-time' — null if not stated"
        }
      ],
      "eligibility": [
        {
          "name": "short label a student scans, e.g. Academic Entry",
          "applicable_to": "domestic|international|both",
          "description": "the requirement in the PAGE'S OWN WORDS — the sentence(s) stating it, verbatim where you can, keeping every condition, exception, equivalency and alternative pathway attached to it (\\"or a recognised equivalent\\", \\"applicants with 3 years of relevant experience may also apply\\", \\"subject prerequisites: Mathematics and Physics\\"). This is what a student reads to understand the requirement — never leave it null for a requirement you are reporting",
          "score_type": "percentage|gpa_4|gpa_10|cgpa|null — the kind of number in min_score, if this requirement states one",
          "min_score": "the numeric minimum stated (e.g. 65 for '65%', 3.0 for 'GPA of 3.0') — null if no number is stated",
          "min_degree_level": "Bachelor|Master|PhD|Diploma|Certificate|etc — the prior qualification level this requirement applies to, if stated or clearly implied (e.g. an 'undergraduate GPA' requirement for a Master's program implies Bachelor) — else null",
          "academic_tests": [
            {
              "test_name": "GRE|GMAT|SAT|ACT|LSAT|MCAT|DAT|UCAT|GAMSAT|NEET|JEE — the standardised admission test, NOT an English test",
              "score": "the MINIMUM score this course requires, as stated (e.g. \\"320\\", \\"1200\\") — null unless the page presents it as a floor",
              "typical_score": "what admitted students actually scored, when the page reports an average/median/percentile instead of a minimum (e.g. \\"49.5\\" from \\"average GMAT of 49.5\\") — null otherwise",
              "is_optional": false
            }
          ]
        }
      ],
      "english_requirements": [
        {
          "test_type_name": "IELTS|TOEFL|PTE|Duolingo|Cambridge|OET|… — the test this entry is about, exactly as the page names it. Omit the entry entirely if the page names no test",
          "overall_score": null,
          "listening_score": null,
          "reading_score": null,
          "writing_score": null,
          "speaking_score": null
        }
      ],
      "campus_names": ["campus names where this course is offered"],
      "study_units": [
        {
          "unit_code": "code or null",
          "unit_name": "unit/subject name as it appears in the curriculum",
          "credit_points": null
        }
      ],
      "curriculum_page_url": "URL to this course's dedicated curriculum/course-structure/programs-of-study page, if linked from this page — else null",
      "fees_page_url": "URL to this course's dedicated fees/tuition/cost page, if linked from this page and no real fee figures are stated on THIS page — else null"
    }
  ],
  "campuses_found": [
    {
      "name": "campus name",
      "city": null,
      "state": null,
      "country": null,
      "address": null,
      "phone": null,
      "email": null
    }
  ]
}

Rules:
- Extract ALL courses visible on this page
- If the page is a single course detail page, return exactly 1 course
- If it's a listing page with multiple courses, extract all of them
- Do NOT extract a page as a course if it describes a single SUBJECT/UNIT/MODULE that sits inside a larger qualification — e.g. a page titled "Introduction to Databases" or "COMP101 — Introduction to Databases", with a short code (2-4 letters + 2-3 digits) and content describing one subject rather than an entire degree/diploma/certificate. These belong in study_units under their parent course, never as a standalone course. If this page IS such a unit/subject page, return an empty courses array.
- Classify EVERY course's course_category yourself from what the page shows about it — never copy one value onto every course just because the page is generally about "programs" or "courses". A page mixing both (e.g. a Bachelor's degree next to a 6-week professional certificate with no admission/degree structure) must return each with its own correct course_category.
- If a page presents ONE subject area offered as MULTIPLE qualification variants — e.g. "Aerospace Engineering" offered as BEng(Hons), MEng, and BSc — extract ONE COURSE OBJECT PER VARIANT, never a single course for the subject as a whole. Each variant's "name" is its full specific title as shown (e.g. "Aerospace Engineering BEng(Hons)"), its "subject_area" is the shared subject name without the qualification (e.g. "Aerospace Engineering"), and its "degree_level" is that variant's own qualification, expressed as one of the degree_level values listed above. Never emit a course for the bare subject heading with no qualification attached.
- Do NOT extract a page as a course if it describes the ADMISSIONS PROCESS in general — e.g. "How to Apply as a First-Year Student", "Transfer Pathways", "Application Requirements", "Dates and Deadlines" — rather than one specific named qualification. These pages talk about applying, deadlines, or eligibility across many/all programs at once, and never name one degree with its own curriculum. Never invent a degree_level (e.g. "Bachelor") for a page like this just because it mentions undergraduate/first-year admission — if the page does not name one specific qualification, return an empty courses array.
- Do NOT extract a course from a NEWS ARTICLE, PRESS RELEASE, or RANKINGS ANNOUNCEMENT that merely mentions subject areas or program names in passing (e.g. "our graduate programs in nursing, law, and engineering all ranked in the top 10") — this is not a course listing page, and inventing one "course" per subject area mentioned is fabrication, not extraction. Only extract from a page whose actual purpose is to describe/detail specific qualifications.
- Never invent fees or dates — only extract what's explicitly stated
- EVERY intake needs a YEAR. intake_year is what makes an intake findable at all — an intake with no year is invisible to the site's intake filters and its "next intake" display. US and Canadian catalogues label intakes by bare season ("Fall", "Spring Semester"); the year is almost always stated nearby, in a heading, an academic-year label ("Academic Year 2026-27" -> Fall 2026 and Spring 2027), a deadline, or a term table. Read it from that context and put it in both intake_year and the intake_name ("Fall" -> "Fall 2027"). Also set intake_month from the season using the institution's own hemisphere — for a Northern-hemisphere institution Fall/Autumn is 9, Spring is 1, Summer is 5, Winter is 1; for a Southern-hemisphere one (Australia, NZ) Autumn is 3, Spring is 9, Summer is 12, Winter is 6.
- If the page truly states no year for an intake anywhere, still return it with its name, and leave intake_year null rather than guessing a year — a wrong year is worse than a missing one.
- NEVER INVENT A DAY. Every intake date takes either YYYY-MM-DD or YYYY-MM, and which one you use is decided by the page, not by convenience. A page that says "applications close in January 2027" states a MONTH: return "2027-01", never "2027-01-01". A page that says "Winter Quarter begins January 5, 2027" states a DAY: return "2027-01-05". Guessing the first of the month produces a deadline the institution never published, which a student can then miss by weeks. The same rule applies to every entry in custom_dates.
- AN INTAKE IS A TERM YOU ENROL IN, not any other dated thing on the page. A semester, quarter, trimester, session or named start ("Semester 1 2027", "Fall 2027", "January 2027 intake") is an intake. A row from an orientation timetable ("Day 1", "Day 2", "Week 1"), a single event, an exam sitting, a payment due date or a public holiday is NOT — those belong in that intake's custom_dates if they are dated, and are otherwise left out entirely. A stored example of getting this wrong: three intakes named "Day 1", "Day 2" and "Day 3", scraped from an orientation schedule, carrying no year and so invisible to every intake feature on the site.
- An ACADEMIC-YEAR label is not a date. "Autumn 2026-2027" or "Academic Year 2026-27" names a year span, not a start date — put it in intake_name and set intake_month/intake_year, and leave start_date null unless the page separately states when the term actually begins.
- NAME vs DESCRIPTION for an eligibility requirement, same split as fees: name is the short label a student scans ("Academic Entry", "Undergraduate Degree", "Honours Program GPA"); description is the page's own wording carrying every figure, condition, exception, subject prerequisite and accepted equivalent. NEVER return a requirement that has a name and NOTHING else — no description, no min_score, no min_degree_level, no academic_tests. A bare heading ("Entry Requirements", "Target Audience Requirements", "Admission Criteria") is a section title, not a requirement: fill it in from the text under that heading, or leave it out of the array entirely. A row carrying only a label tells a student nothing and states no bar anyone can be measured against.
- For eligibility requirements, always populate score_type + min_score when a specific numeric threshold is stated, not just in the free-text description: "percentage" for a % figure, "gpa_4" for a GPA (the default scale when no scale is named — most common convention), "gpa_10" only when the page explicitly says the GPA is out of 10, "cgpa" when the page uses that term specifically. Leave both null if no number is stated.
- Always fill duration_text verbatim when the page states a duration anywhere, even if you also converted it to duration_weeks
- score_type / min_score / min_degree_level describe the applicant's PRIOR QUALIFICATION GRADE and nothing else. A standardised admission test score (GRE, GMAT, SAT, ACT, LSAT, MCAT, …) goes in that requirement's academic_tests array — NEVER as an eligibility row named after the test with the test's score in min_score. Wrong: {"name": "GMAT Quantitative Score", "score_type": "percentage", "min_score": 95}. Right: {"name": "Admission test", "academic_tests": [{"test_name": "GMAT", "score": "49.5", "is_optional": true}]}.
- A COHORT STATISTIC IS NOT A REQUIREMENT. A percentile ("49.5, which is the 95th percentile"), a class average ("average GMAT of our intake is 700"), a median, a "top 10%" claim, an acceptance rate, or an employment/success rate is describing who got in, not the bar for getting in. Never put such a number in min_score, min_score_percent or a test's "score". Only a number the page presents as a floor ("minimum", "at least", "no less than", "required", "or above", or a plainly stated entry threshold) is a requirement. A test's average/median/percentile goes in that test's "typical_score" instead — so "Average quantitative GMAT scores are 49.5 (95th percentile)" is {"test_name": "GMAT", "score": null, "typical_score": "49.5", "is_optional": true}, never score 49.5 and never min_score_percent 95.
- Set is_optional true on a test the page calls optional, recommended, waivable, or "not required" — an optional test must never be recorded as a hard requirement.
- English/language tests (IELTS, TOEFL, PTE, Duolingo, Cambridge, OET, …) belong in english_requirements, never in academic_tests.
- Every English test the course ACCEPTS gets its own english_requirements entry — "IELTS 6.5, TOEFL 79 or PTE 58" is THREE entries, never one merged entry and never only the first. Fill in the per-component minimums (reading/writing/listening/speaking) whenever the page states them, whether as its own bands or as a blanket floor ("no band below 6.0" -> 6.0 in all four). Leave a component null if the page states none — never derive one from the overall score.
- An english_requirements entry holds SCORES ONLY. The wording around the English requirement — a waiver or exemption ("waived if your previous degree was taught in English"), an accepted equivalent ("or an approved equivalent qualification"), a validity window ("taken within the last two years") — goes in the DESCRIPTION of the eligibility requirement it belongs to, alongside that requirement's own conditions. Never drop it: it frequently decides whether the student needs the test at all. If the page's English section has no academic requirement of its own to hang it on, add one eligibility entry named "English Language Requirement" whose description carries that wording.
- For duration, convert to weeks if possible (1 year = 52 weeks, 1 semester = 26 weeks)
- Distinguish tuition/course fees from career salary ranges — salary outcomes are NOT fees
- If this page states no real fee figures but links to a dedicated fees/tuition/cost page (a schedule page, a catalog entry, an external PDF), leave fees empty and set fees_page_url to that link instead — never fabricate a fee entry with no amount just to record the URL
- NAME vs DESCRIPTION: name is only the label a student reads in a fee table ("Tuition Fee", "Semester Fee", "Application Fee"). Every figure, credit count, range, and caveat goes in description — never in name.
- If a fee is shown as a range (e.g. "$25,000-$30,000"), set total_amount to the lower bound and keep the full range in the fee's description — never average or invent a single figure. If a page shows both a per-year figure AND a total-program figure, extract BOTH as separate fees array entries distinguished by period_type — never collapse them into one guess.
- TOTAL vs PER-UNIT: When the page shows a per-credit/per-unit rate AND states the total credit requirement (e.g. "$325/credit hour × 12 credits = $3,900"), extract BOTH: one entry with period_type "Per Unit" and total_amount = the rate (325), AND one entry with period_type "Total" and total_amount = the computed or explicitly stated total (3900). Never capture ONLY the per-unit rate when a total is derivable or explicitly stated — the total is what matters most for display.
- STUDENT TYPE: Use student_type "both" whenever the page shows ONE fee figure with no domestic/international distinction. Only emit separate "domestic" and "international" entries when the page explicitly states TWO DIFFERENT amounts — one labelled for domestic students and one for international. Never duplicate the same amount into two separate entries.
- Use consistent campus names — prefer the shortest unambiguous form (e.g. "Sydney" not "Sydney Campus")
- study_units are the individual subjects/units taught within THIS course's curriculum (e.g. a listed core/elective unit with its own code or name) — only include units explicitly listed as part of this course's structure, not unrelated courses mentioned elsewhere on the page. A differently-titled qualification or award-level variant of the same subject (anything containing a degree word/abbreviation — BEng, MEng, BSc, MSc, BA, MA, PhD, "(Hons)", Diploma, Certificate, Bachelor, Master, Doctorate) is ALWAYS its own course per the rule above, NEVER a study_unit, regardless of what list or section it appears under.
- Set curriculum_page_url whenever a link on this page plausibly leads to THIS course's own detailed curriculum/program-structure page (e.g. "View Degree Program Website", "Course Structure", "Programs of Study", or a "Curriculum" link within a program-specific site) — not a generic institution-wide "Programs" or "Courses" catalog link. Set it EVEN IF you already found some study_units on this page: an admissions or overview page often names only a few example courses, while the dedicated curriculum page lists the full set — more complete data always wins.
- Set fees_page_url whenever a link on this page plausibly leads to THIS course's own fees/tuition/cost detail (e.g. a "Tuition & Fees", "Program Costs", or catalog/schedule link naming this specific program) and this page itself has no fees array entries — not a generic institution-wide tuition homepage.`;
}

// ── Phase 2i: Fees from a course's secondary fees/tuition page (page worker) ──
// Mirrors studyUnitsFromPagePrompt — most course overview pages don't carry real fee
// figures; they link out to a dedicated fees/tuition/catalog page, flagged above as
// fees_page_url.

export const FEES_FROM_PAGE_SYSTEM = `You are a strict data extraction assistant for an education platform.
Your ONLY job is to extract the tuition/fee figures explicitly stated on this page for the named course.
ONLY extract fees EXPLICITLY stated on the page. NEVER invent or estimate a figure.
Respond in valid JSON only.`;

export function feesFromPagePrompt(courseName: string, url: string, pageText: string) {
  return `Extract the tuition/fee figures on this page for "${courseName}".
Source URL: ${url}

Page content:
${pageText}

Return JSON:
{
  "fees": [
    {
      "name": "SHORT generic label for the KIND of fee — e.g. 'Tuition Fee', 'Semester Fee', 'Application Fee', 'Enrolment Fee', 'Material Fee', 'Student Services Fee', 'Health Cover' — max 40 characters. NEVER put amounts, currency symbols, credit counts, or the course name in the label",
      "description": "the page's own wording for this fee, verbatim — the per-credit breakdown, the full range, the 'contact us' note, what the fee covers. null if the page states nothing beyond the amount",
      "currency": "ISO 4217 code (AUD, USD, GBP, EUR, CAD, NPR, INR, ...) — NEVER a symbol like '$' or '£'. If the page shows only a symbol, use the code for the institution's own country. null if genuinely unstated",
      "student_type": "domestic|international|both",
      "period_type": "Per Year|Per Semester|Per Trimester|Total|Per Unit",
      "total_amount": "numeric amount — the lower bound if the page shows a range, null if no real figure is stated"
    }
  ]
}

Rules:
- NAME vs DESCRIPTION: name is only the label a student reads in a fee table ("Tuition Fee", "Semester Fee", "Application Fee"). Every figure, credit count, range, and caveat goes in description — never in name.
- If a fee is shown as a range, set total_amount to the lower bound and keep the full range in description
- If the page shows both a per-year figure AND a total-program figure, extract BOTH as separate entries
- TOTAL vs PER-UNIT: When the page shows a per-credit/per-unit rate AND states the total credit requirement (e.g. "$325/credit hour × 12 credits = $3,900"), extract BOTH: period_type "Per Unit" with total_amount = rate, AND period_type "Total" with total_amount = the stated or computed total. Never capture only the per-unit rate when a total is derivable or stated.
- STUDENT TYPE: Use student_type "both" when the page shows one fee with no domestic/international distinction. Only split into separate "domestic" and "international" entries when the page explicitly states two DIFFERENT amounts. Never duplicate the same amount into two entries.
- If no fee figures for this course are stated on this page, return an empty fees array`;
}

// ── Phase 2j: Combined units + fees from ONE secondary page (page worker) ──
// The fees fallback commonly resolves to the same catalog page as curriculum_page_url
// (an Acalog entry bundles both under one "degree requirements" link). Extracting them
// with two separate Gemini calls billed the identical page content twice — one combined
// call halves the input tokens for the dominant secondary-fetch case.

export const CURRICULUM_AND_FEES_SYSTEM = `You are a strict data extraction assistant for an education platform.
Your ONLY job is to extract the study units/subjects and the tuition/fee figures explicitly stated on this page for the named course.
ONLY extract what is EXPLICITLY stated on the page. NEVER infer, invent, or estimate.
Respond in valid JSON only.`;

export function curriculumAndFeesPrompt(courseName: string, url: string, pageText: string) {
  return `Extract the study units/subjects and the tuition/fee figures on this page for "${courseName}".
Source URL: ${url}

Page content:
${pageText}

Return JSON:
{
  "study_units": [
    {
      "unit_code": "code or null",
      "unit_name": "unit/subject name as it appears in the curriculum",
      "credit_points": null
    }
  ],
  "fees": [
    {
      "name": "SHORT generic label for the KIND of fee — e.g. 'Tuition Fee', 'Semester Fee', 'Application Fee', 'Enrolment Fee', 'Material Fee', 'Student Services Fee', 'Health Cover' — max 40 characters. NEVER put amounts, currency symbols, credit counts, or the course name in the label",
      "description": "the page's own wording for this fee, verbatim — the per-credit breakdown, the full range, the 'contact us' note, what the fee covers. null if the page states nothing beyond the amount",
      "currency": "ISO 4217 code (AUD, USD, GBP, EUR, CAD, NPR, INR, ...) — NEVER a symbol like '$' or '£'. If the page shows only a symbol, use the code for the institution's own country. null if genuinely unstated",
      "student_type": "domestic|international|both",
      "period_type": "Per Year|Per Semester|Per Trimester|Total|Per Unit",
      "total_amount": "numeric amount — the lower bound if the page shows a range, null if no real figure is stated"
    }
  ]
}

Rules:
- NAME vs DESCRIPTION: name is only the label a student reads in a fee table ("Tuition Fee", "Semester Fee", "Application Fee"). Every figure, credit count, range, and caveat goes in description — never in name.
- If a fee is shown as a range, set total_amount to the lower bound and keep the full range in description
- If the page shows both a per-year figure AND a total-program figure, extract BOTH as separate entries
- TOTAL vs PER-UNIT: When the page shows a per-credit/per-unit rate AND states the total credit requirement (e.g. "$325/credit hour × 12 credits = $3,900"), extract BOTH: period_type "Per Unit" with total_amount = rate, AND period_type "Total" with total_amount = the stated or computed total. Never capture only the per-unit rate when a total is derivable or stated.
- STUDENT TYPE: Use student_type "both" when the page shows one fee with no domestic/international distinction. Only split into separate "domestic" and "international" entries when the page explicitly states two DIFFERENT amounts. Never duplicate the same amount into two entries.
- If no fee figures for this course are stated on this page, return an empty fees array
- If no study units are listed on this page, return an empty study_units array`;
}

// ── Phase 2h: Study units from a course's secondary curriculum page (page worker) ──
// See docs/data-extraction/2026-08-21-study-units-discovery-design.md — most course
// overview pages don't carry unit-level curriculum; it lives on a separate,
// course-specific page flagged above as curriculum_page_url.

export const STUDY_UNITS_SYSTEM = `You are a strict data extraction assistant for an education platform.
Your ONLY job is to extract the study units/subjects explicitly listed on this page.
ONLY extract units EXPLICITLY listed on the page. NEVER infer or guess.
Respond in valid JSON only.`;

export function studyUnitsFromPagePrompt(url: string, pageText: string) {
  return `Extract the study units/subjects listed on this curriculum/course-structure page.
Source URL: ${url}

Page content:
${pageText}

Return JSON:
{
  "study_units": [
    {
      "unit_code": "code or null",
      "unit_name": "unit/subject name as it appears in the curriculum",
      "credit_points": null
    }
  ]
}`;
}

// ── Visa service extraction (source_type: "visa_service") ──
// Mirrors Phase 1 / Phase 1b / Phase 2 above, but for a visa/migration consultancy's own
// website instead of an educational institution — populates extraction_visa_services
// instead of extraction_courses. See docs/data-extraction (visa-services-extraction-plan).

export function visaServiceSiteAnalysisPrompt(url: string, pageText: string, guidanceNotes?: string | null) {
  return `Analyze this visa/migration consultancy's homepage and extract overview information.

URL: ${url}
${guidanceNotes ? `\nAdmin notes: ${guidanceNotes}` : ""}

Page content:
${pageText}

Extract this JSON structure:
{
  "institution": {
    "name": "full provider/business name",
    "website": "${url}",
    "phone": "main phone or null",
    "email": "main contact email or null",
    "address": "street address or null",
    "city": "city or null",
    "state": "state/province or null",
    "country": "country or null",
    "zip_code": "postal code or null",
    "description": "brief description of the provider",
    "logo_url": "logo image URL or null",
    "facebook_url": "a facebook.com link, or null — never put a link to a different platform here just because it was near a Facebook icon",
    "instagram_url": "an instagram.com link, or null",
    "twitter_url": "a twitter.com or x.com link, or null — do NOT put tiktok.com, threads.net or any other domain here",
    "linkedin_url": "a linkedin.com link, or null",
    "youtube_url": "a youtube.com or youtu.be link, or null",
    "other_social_urls": [{ "label": "short platform/site name, e.g. \"TikTok\", \"WhatsApp\", \"Booking\"", "url": "the link" }]
  },
  "site_intelligence": {
    "institution_type": "visa_service_provider",
    "country": "country code like AU, US, UK",
    "currency": "primary currency code like AUD, USD",
    "extraction_hints": ["array of observations about site structure that help extraction"],
    "fee_structure": { "format": "flat|hourly|per_application|from", "notes": "any observations" }
  },
  "course_page_patterns": ["URL patterns that indicate a services or pricing page, e.g. /services/, /visas/"]
}`;
}

export function visaServiceUrlDiscoveryPrompt(links: string[], patterns: string[]) {
  return `From these URLs found on a visa/migration consultancy website, identify which ones are likely to describe the services this provider offers (visa applications, migration advice, sponsorship, appeals, skills assessments) or their fees/team/registration.

Known service-page URL patterns for this site: ${patterns?.join(", ") || "none identified yet"}

URLs found (${links.length}):
${links.slice(0, 500).join("\n")}

Return JSON:
{
  "course_urls": ["array of URLs that likely describe a specific service, its fees, the team, or registration/accreditation"],
  "listing_urls": ["array of URLs that list/link to multiple services, to crawl further"]
}

Rules:
- Include only URLs that relate to the provider's own services, fees, team, or registration
- Exclude general pages (blog, news, careers, privacy, login)
- Prefer detail pages over listing pages
- If unsure, include it — false positives are better than missing a service`;
}

export const VISA_SERVICE_EXTRACTION_SYSTEM = `You are a data extraction specialist. Extract structured visa/migration service data from a consultancy's web pages.
Always respond in valid JSON. Extract everything you can find — fees, registration, coverage, contact details.
If a field is not found on the page, use null. Never invent data.`;

export function visaServiceExtractionPrompt(
  url: string, pageText: string,
  guidanceNotes?: string | null,
  siteHints?: { fee_structure?: unknown; extraction_hints?: string[] } | null,
) {
  const hints: string[] = [];
  if (guidanceNotes) hints.push(`Admin guidance: ${guidanceNotes}`);
  if (siteHints?.extraction_hints?.length) hints.push(`Site hints: ${siteHints.extraction_hints.join("; ")}`);
  if (siteHints?.fee_structure) hints.push(`Fee info: ${JSON.stringify(siteHints.fee_structure)}`);

  return `Extract all distinct visa/migration services offered by this provider from this page.

URL: ${url}
${hints.length ? "\n" + hints.join("\n") : ""}

Page content:
${pageText}

Extract this JSON:
{
  "visa_services": [
    {
      "name": "full service name, e.g. 'Skilled Independent Visa (Subclass 189) Lodgement'",
      "provider_name": "the consultancy's own business name",
      "type": "visa_application|migration_advice|appeal|sponsorship|skills_assessment|citizenship|other",
      "description": "service description or null",
      "registration_number": "MARN, OISC or equivalent registration number, or null",
      "registration_body": "e.g. MARA, OISC, ICCRC, or null",
      "registration_status": "active|suspended|expired, or null",
      "registration_level": "e.g. OISC Level 1/2/3, or null",
      "visa_types_handled": ["visa subclass codes or names this service covers, e.g. '189', '482', 'Partner Visa'"],
      "services_offered": ["e.g. visa_lodgement, sponsorship, appeal, skills_assessment"],
      "specializations": ["e.g. student_visas, employer_sponsored, family_visas"],
      "fee_amount": null,
      "fee_currency": "AUD",
      "fee_type": "flat|hourly|per_application|from",
      "fee_from": null,
      "fee_to": null,
      "consultation_fee": null,
      "consultation_free": null,
      "success_rate": null,
      "cases_handled": null,
      "years_experience": null,
      "team_size": null,
      "qualified_agents_count": null,
      "countries_serviced": ["countries this provider operates in or serves clients from"],
      "nationalities_serviced": ["nationalities explicitly mentioned as served"],
      "languages_spoken": ["languages the team speaks"],
      "address": "full street address or null",
      "city": "city or null",
      "state": "state/province or null",
      "country": "country or null",
      "contact_name": "named contact person or null",
      "contact_email": "email or null",
      "contact_phone": "phone or null",
      "website": "${url}",
      "booking_url": "consultation booking link or null",
      "average_rating": null,
      "review_count": null
    }
  ]
}

Rules:
- Extract ALL distinct services visible on this page — a page can describe more than one
- If the page is a single service detail page, return exactly 1 service
- Never invent fees, registration numbers, or ratings — only extract what's explicitly stated
- Do NOT extract a page as a service if it's a blog post, news article, or general "about migration" educational content with no specific service being offered by THIS provider
- Distinguish this provider's own registration/MARN from a visa subclass code — they are never the same field`;
}

// ── Phase 2b: Institution extraction (step worker) ──

export const INSTITUTION_EXTRACTION_SYSTEM = `You are a strict data extraction assistant for an education platform.
Your ONLY job is to extract institution-level information from the provided webpage content.
ONLY extract information that is EXPLICITLY stated on the page. NEVER infer or guess.
If a field is not found, use null. Respond in valid JSON only.`;

export function institutionExtractionPrompt(
  url: string,
  pageText: string,
  guidanceNotes?: string | null,
) {
  const guidance = guidanceNotes ? `\nOperator guidance: ${guidanceNotes}` : "";
  return `Extract institution-level information from this webpage.
Source URL: ${url}${guidance}

Page content:
${pageText}

Return JSON:
{
  "name": "full institution name or null",
  "logo_url": "logo image URL or null",
  "website": "institution website or null",
  "email": "the institution's own contact email or null — priority: 1) main/general (info@/contact@/enquiries@) 2) department (admissions@) 3) any other listed email",
  "phone": "main phone or null",
  "description": "brief description or null",
  "country": "country or null",
  "state": "state/province or null",
  "city": "city or null",
  "address": "street address line only — do NOT repeat city/state/postcode here, they have their own fields",
  "zip_code": "postal code or null",
  "ownership_type": "\"public\" or \"private\" — ONLY if explicitly stated (e.g. \"a public research university\", \"private college\"); null if the page doesn't say",
  "facebook_url": "a facebook.com link, or null — never put a link to a different platform here just because it was near a Facebook icon",
  "instagram_url": "an instagram.com link, or null",
  "twitter_url": "a twitter.com or x.com link, or null — do NOT put tiktok.com, threads.net or any other domain here",
  "linkedin_url": "a linkedin.com link, or null",
  "youtube_url": "a youtube.com or youtu.be link, or null",
  "other_social_urls": [{ "label": "short platform/site name, e.g. \"TikTok\", \"WhatsApp\", \"Booking\"", "url": "the link" }]
}

Email selection rule, in priority order:
1. The main/general institution email (e.g. info@institution.com, contact@, enquiries@).
2. If none is stated, a department email (e.g. admissions@institution.com).
3. If neither is stated, any other email address listed on the page.
Only use null if the page lists no email address at all.`;
}

// ── Phase 2c: Campus extraction (step worker) ──

export const CAMPUS_EXTRACTION_SYSTEM = `You are a strict data extraction assistant for an education platform.
Extract campus/branch/location information from the provided webpage content.

CRITICAL RULES:
1. ONLY extract information explicitly stated in the TEXT — not from URLs, map embeds, or image alt text
2. NEVER infer, guess, or make up any information — use null for missing fields
3. Look for NAMED campuses, branches, or locations — return each distinct NAMED location separately
4. STRICT ADDRESS RULE: Only create a campus entry if it has a complete street address (street number + street name + city or postcode). Prefixes like "Level", "Suite", "Unit" before the street number are acceptable
5. Skip vague entries: city name alone, country alone, or region without full address
6. FOOTER RULE: Pay SPECIAL attention to the footer — institutions commonly list campus addresses there
7. DEDUP: Same campus mentioned multiple times = ONE entry with the most complete address
8. SINGLE SOURCE PRINCIPLE: Extract only campuses clearly listed on THIS page — do not invent additional ones
Respond in valid JSON only.`;

export function campusExtractionPrompt(
  url: string,
  pageText: string,
  singleCampusMode?: boolean,
) {
  return `Extract all campus, branch, and location information from this webpage.
Check the FOOTER carefully — campus addresses are frequently listed there.
Return EVERY distinct location as a separate entry, but do NOT create duplicates.
${singleCampusMode ? "This institution likely has only ONE campus — extract it if found." : ""}

Source URL: ${url}

Page content:
${pageText}

Return JSON:
{
  "campuses": [
    {
      "name": "campus/branch name or null",
      "address": "full street address or null",
      "city": "city or null",
      "state": "state/province or null",
      "country": "country or null",
      "phone": "phone or null",
      "email": "email or null"
    }
  ]
}`;
}

// ── Phase 2d: Agent extraction (step worker) ──

export const AGENT_EXTRACTION_SYSTEM = `You are a data extraction assistant for an education platform.
Extract REGISTERED EDUCATION AGENTS or RECRUITMENT AGENCIES listed on the page.
These are companies or individuals who officially recruit international students on behalf of the institution.

Extract ONLY entries that represent agents/agencies with at least a name or country.
DO NOT extract: sponsors, donors, industry partners, news mentions, or general business partnerships.
NEVER guess or infer contact details not explicitly shown on the page.
Capture the FULL postal address verbatim when shown. Populate structured fields when possible.
Leave all fields null if not explicitly stated.
Respond in valid JSON only.`;

export function agentExtractionPrompt(
  url: string,
  pageText: string,
  institutionName?: string | null,
) {
  return `Extract all registered education agent and recruitment agency listings from this page.
${institutionName ? `Institution: ${institutionName}` : ""}
Source URL: ${url}

Page content:
${pageText}

Return JSON:
{
  "agents": [
    {
      "name": "agent/agency name",
      "country": "country or null",
      "email": "email or null",
      "phone": "phone or null",
      "website": "website or null",
      "address": "full address or null",
      "city": "city or null",
      "state": "state/province or null",
      "postcode": "postcode or null"
    }
  ]
}`;
}

// ── Phase 2e: Course list extraction (step worker) ──

export const COURSE_LIST_SYSTEM = `You are a course catalogue data extractor for an education platform.

Your primary task: identify whether this page lists REAL individual courses or just CATEGORY/SUBJECT AREA groupings.

REAL INDIVIDUAL COURSE — has ALL of these signals:
- A qualification code (e.g. "CHC30125", "SIT40521", "BSB50120") OR
- A clear qualification level in the name ("Certificate III in...", "Diploma of...", "Bachelor of...", "Master of...")
- Links directly to a single course detail page

STUDY UNIT / SUBJECT (EXCLUDE — these are NOT courses):
- Has a short alphanumeric code: 2-4 letters + 2-3 digits (e.g. "ACC203", "ICT100")
- These are individual subjects/modules taken WITHIN a degree program
- NEVER extract these as courses

CATEGORY / SUBJECT AREA LISTING — the page shows groupings like:
- "Early Childhood Education and Care — 2 Courses"
- "Kitchen and Hospitality Management"
These are NOT real courses — they are folders containing multiple courses.

Respond in valid JSON only.`;

export function courseListPrompt(url: string, pageText: string) {
  return `Analyse this page and extract courses or detect category listings.
Source URL: ${url}

Page content:
${pageText}

Return JSON:
{
  "is_category_listing": false,
  "category_urls": [],
  "courses": [
    {
      "name": "exact course name as displayed",
      "url": "direct URL to course detail page or null",
      "degree_level": "Certificate|Diploma|Advanced Diploma|Associate Degree|Bachelor|Graduate Certificate|Graduate Diploma|Master|PhD|Short Course|Other"
    }
  ]
}

Rules:
- If the page lists REAL individual courses, set is_category_listing=false and populate courses
- If the page lists SUBJECT AREA CATEGORIES, set is_category_listing=true and populate category_urls
- Extract EVERY real course — be thorough
- Do NOT extract navigation links, footer links, blog posts, news, staff profiles`;
}

// ── Phase 2f: Bulk fee extraction (step worker) ──

export const BULK_FEE_SYSTEM = `You are a precise fee extraction assistant for an education data platform.
You match fees from fee tables/pages to specific courses.
Only extract fees that are explicitly stated — do NOT guess or infer amounts.
Respond in valid JSON only.`;

export function bulkFeePrompt(
  courseNames: string[],
  feePageText: string,
  siteHints?: { currency?: string; country?: string } | null,
) {
  const currency = siteHints?.currency || "USD";
  const countryNote = siteHints?.country ? ` (institution is based in ${siteHints.country})` : "";
  const courseList = courseNames.map((c, i) => `${i + 1}. ${c}`).join("\n");

  return `Below is content from an educational institution's FEES PAGE, followed by a numbered list of ALL courses.

Your task: Extract the fee for EACH course in the list. Match course names against fee tables, headings, or categories.

Rules:
- If a fee applies to a category (e.g. "all Bachelor programs"), map it to each matching course
- Only split domestic_total and international_total when the page explicitly shows TWO DIFFERENT amounts. If there is one undifferentiated fee, set it on whichever field matches the label, or use domestic_total as the default and leave international_total as 0
- TOTAL vs PER-UNIT: When the page shows a per-credit rate AND credit requirements (e.g. "$325/credit × 12 credits"), use the computed or stated total (3900) as the fee amount, not the per-unit rate (325)
- If a fee is per semester/term, calculate the annual total
- If you cannot find a fee for a specific course, set its totals to 0
- Currency: an ISO 4217 code only (never a symbol like "$"), defaulting to ${currency}${countryNote}. Only use a different code if explicitly stated
- Only extract fees explicitly stated — do NOT guess

=== FEES PAGE ===
${feePageText}

=== COURSE LIST ===
${courseList}

Return JSON:
{
  "fee_schedule": [
    {
      "course_name": "course name as listed",
      "domestic_total": 0,
      "international_total": 0,
      "currency": "${currency}",
      "period_type": "Per Year|Per Term|Total"
    }
  ]
}`;
}

// ── Phase 2g: Course data re-extraction (step worker) ──

export const COURSE_DATA_SYSTEM = `You are a course data extraction assistant for an education platform.
Extract the requested data type accurately from the page content.
Only extract fields that are explicitly stated — do NOT guess.
Respond in valid JSON only.`;

export function courseDataPrompt(
  url: string,
  pageText: string,
  dataType: string,
  guidanceNotes?: string | null,
) {
  const guidance = guidanceNotes ? `\nOperator guidance: ${guidanceNotes}` : "";

  const schemas: Record<string, string> = {
    fees: `{
  "domestic_fee_total": null,
  "international_fee_total": null,
  "fees": [{
    "name": "SHORT generic label for the KIND of fee — 'Tuition Fee', 'Semester Fee', 'Application Fee' — max 40 characters, never an amount or the course name",
    "description": "the page's own wording for this fee, verbatim (the per-credit breakdown, the range, what it covers) — null if the page states nothing beyond the amount",
    "currency": "ISO 4217 code (AUD, USD, GBP, ...) — never a symbol like '$'. If the page shows only a symbol, use the code for the institution's own country. null if unstated",
    "student_type": "domestic|international|both",
    "period_type": "Per Year|Per Semester|Per Trimester|Total|Per Unit",
    "total_amount": 0
  }]
}`,
    intakes: `{
  "intakes": [{ "intake_name": "e.g. Semester 1 2027", "start_date": "YYYY-MM-DD when the page states a day, or YYYY-MM when it states only a month — never invent a day. null if unstated", "end_date": "YYYY-MM-DD when the page states a day, or YYYY-MM when it states only a month — never invent a day. null if unstated", "orientation_date": "YYYY-MM-DD when the page states a day, or YYYY-MM when it states only a month — never invent a day. null if unstated", "intake_month": "1-12, the month this intake starts — derive it from the intake name or start date when the page doesn't state it separately", "intake_year": "4-digit year this intake starts — derive it from the intake name (\\"Semester 1 2027\\" -> 2027) or start date", "admission_deadline": "YYYY-MM-DD when the page states a day, or YYYY-MM when it states only a month — never invent a day. null if unstated", "custom_dates": "[] or [{\"name\": \"the page's own label\", \"date\": \"YYYY-MM-DD or YYYY-MM\"}] for any OTHER dated milestone — never duplicate the four fields above" }]
}`,
    units: `{
  "study_units": [{ "unit_code": "code or null", "unit_name": "unit name", "credit_points": null }]
}`,
    eligibility: `{
  "requirements": [{ "name": "short label a student scans, e.g. Academic Entry", "applicable_to": "domestic|international|both", "description": "the requirement in the PAGE'S OWN WORDS — the sentence(s) stating it, verbatim where you can, keeping every condition, exception, equivalency, subject prerequisite and alternative pathway. Never null for a requirement you are reporting", "score_type": "percentage|gpa_4|gpa_10|cgpa|null", "min_score": "numeric minimum stated, or null", "min_degree_level": "Bachelor|Master|etc, if stated or implied, else null", "academic_tests": [{ "test_name": "GRE|GMAT|SAT|ACT|LSAT|MCAT|etc — a standardised admission test, never an English test", "score": "the MINIMUM score required, or null if the page states no floor", "typical_score": "the average/median/percentile score of admitted students, if the page reports one instead of a minimum, else null", "is_optional": false }] }],
  "english_requirements": [{ "test_type_name": "IELTS|TOEFL|PTE|Duolingo|Cambridge|OET|… as the page names it — omit the entry if it names no test", "overall_score": null, "listening_score": null, "reading_score": null, "writing_score": null, "speaking_score": null }]
}

Rules for requirements:
- NAME vs DESCRIPTION: name is the short label a student scans; description is the page's own wording with every figure, condition, exception, subject prerequisite and accepted equivalent. NEVER return a requirement with a name and nothing else — no description, no min_score, no min_degree_level, no academic_tests. A bare heading ("Entry Requirements", "Target Audience Requirements") is a section title, not a requirement: fill it in from the text beneath it, or leave it out of the array.
- Every English test the course accepts is its OWN english_requirements entry ("IELTS 6.5, TOEFL 79 or PTE 58" is three entries), with the per-component minimums when the page states them — including a blanket floor ("no band below 6.0" -> 6.0 in all four). Never derive a component score from the overall one.
- score_type / min_score / min_degree_level describe the applicant's PRIOR QUALIFICATION GRADE only. A standardised test score (GRE, GMAT, SAT, …) goes in that requirement's academic_tests array, NEVER as a requirement row named after the test with its score in min_score.
- A cohort statistic is not a requirement: a percentile ("95th percentile"), a class average, a median, "top 10%", an acceptance rate or an employment rate describes who got in, not the bar for getting in. Keep min_score/min_score_percent null; a test's average/median goes in that test's "typical_score", never its "score".
- Set is_optional true when the page calls a test optional, recommended, or waivable.`,
    accreditations: `{
  "accreditations": [{ "name": "accreditation body name", "issuing_organization": "org or null" }]
}`,
    course: `{
  "name": "full course name", "short_name": null, "description": "2-4 sentences", "degree_level": "Bachelor|Master|Diploma|Certificate|etc",
  "course_category": "academic|short_course", "subject_area": null, "duration_weeks": null, "duration_text": "duration exactly as written on the page or null", "study_mode": null, "career_paths": [], "awarding_institution": null
}`,
  };

  return `Extract ${dataType} information for this course page.
Source URL: ${url}${guidance}

Page content:
${pageText}

Return JSON matching this schema:
${schemas[dataType] || "{}"}`;
}

// ── Phase 3: Verification (verify worker) ──

export const VERIFICATION_SYSTEM = `You verify extracted course data against live web page content.
You understand that data may be represented differently — e.g. "3 years" = 156 weeks, "AUD $45,000" = 45000.
Respond in valid JSON only.`;

export function verificationPrompt(
  courseData: { name: string; fields: Record<string, string> },
  livePageText: string,
) {
  return `Verify this extracted course data against the current live page.

Course: ${courseData.name}
Extracted fields:
${Object.entries(courseData.fields).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Live page content:
${livePageText}

For each field, search the page for the equivalent information and compare.

Return JSON:
{
  "results": [
    {
      "field_name": "field name",
      "extracted_value": "what was extracted",
      "live_value": "what the page currently shows (or null if truly absent)",
      "status": "match|mismatch|not_found"
    }
  ]
}

Rules:
- "match": the extracted value is semantically equivalent to what's on the page, even if formatted differently (e.g. "156" weeks vs "3 years", "Bachelor" vs "Bachelor's Degree")
- "mismatch": the page shows a DIFFERENT value for this field (e.g. extracted "2 years" but page says "3 years")
- "not_found": the field genuinely does not appear anywhere on the page (fees behind external links count as not_found, not mismatch)
- Search the ENTIRE page content, not just headers — data may be in tables, sidebars, or accordion sections
- For null extracted values, mark as "match" if the page also doesn't show this info`;
}
