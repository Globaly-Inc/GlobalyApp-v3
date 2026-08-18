// LLM prompts for each extraction phase.

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
    "email": "main contact email or null",
    "address": "street address or null",
    "city": "city or null",
    "state": "state/province or null",
    "country": "country or null",
    "zip_code": "postal code or null",
    "description": "brief description of the institution",
    "logo_url": "logo image URL or null",
    "facebook_url": "null if not found",
    "instagram_url": "null if not found",
    "twitter_url": "null if not found",
    "linkedin_url": "null if not found",
    "youtube_url": "null if not found"
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
) {
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
      "name": "full course name",
      "short_name": "abbreviated name or null",
      "degree_level": "Bachelor|Master|PhD|Diploma|Certificate|Graduate Certificate|Graduate Diploma|Associate Degree|Doctorate|Other",
      "subject_area": "e.g. Computer Science, Medicine, Business",
      "duration_weeks": null,
      "study_mode": "on-campus|online|hybrid|null",
      "description": "course description or null",
      "domestic_fee_total": null,
      "domestic_currency": null,
      "international_fee_total": null,
      "international_currency": null,
      "awarding_institution": null,
      "source_url": "${url}",
      "career_paths": [],
      "fees": [
        {
          "name": "fee description",
          "student_type": "domestic|international|both",
          "period_type": "Per Year|Per Semester|Total|Per Unit",
          "currency": "AUD",
          "total_amount": 0
        }
      ],
      "intakes": [
        {
          "intake_name": "e.g. Semester 1 2027",
          "start_date": "YYYY-MM-DD or null",
          "intake_month": null,
          "intake_year": null,
          "admission_deadline": "YYYY-MM-DD or null"
        }
      ],
      "study_options": [
        {
          "name": "e.g. Full-time On Campus",
          "study_mode": "on_campus|online|hybrid",
          "study_load": "full_time|part_time",
          "duration_value": null,
          "duration_unit": "months|weeks|years"
        }
      ],
      "eligibility": [
        {
          "name": "requirement name",
          "applicable_to": "domestic|international|both",
          "description": "details",
          "min_score_percent": null
        }
      ],
      "english_requirements": [
        {
          "test_type_name": "IELTS|TOEFL|PTE|Cambridge|null",
          "overall_score": null,
          "listening_score": null,
          "reading_score": null,
          "writing_score": null,
          "speaking_score": null
        }
      ],
      "campus_names": ["campus names where this course is offered"]
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
- Never invent fees or dates — only extract what's explicitly stated
- For duration, convert to weeks if possible (1 year = 52 weeks, 1 semester = 26 weeks)
- Distinguish tuition/course fees from career salary ranges — salary outcomes are NOT fees
- If fees link to an external PDF or schedule page, include that URL in the fee name (e.g. "See fee schedule: <url>")
- Use consistent campus names — prefer the shortest unambiguous form (e.g. "Sydney" not "Sydney Campus")`;
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
  "email": "main contact email or null",
  "phone": "main phone or null",
  "description": "brief description or null",
  "country": "country or null",
  "state": "state/province or null",
  "city": "city or null",
  "address": "street address or null",
  "zip_code": "postal code or null",
  "facebook_url": "null if not found",
  "instagram_url": "null if not found",
  "twitter_url": "null if not found",
  "linkedin_url": "null if not found",
  "youtube_url": "null if not found"
}`;
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
- Extract both domestic and international fees where available
- If a fee is per semester/term, calculate the annual total
- If you cannot find a fee for a specific course, set its totals to 0
- Currency: default to ${currency}${countryNote}. Only use a different code if explicitly stated
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
  "currency": "AUD",
  "fees": [{ "name": "fee description", "student_type": "domestic|international|both", "period_type": "Per Year|Per Semester|Total", "total_amount": 0 }]
}`,
    intakes: `{
  "intakes": [{ "intake_name": "e.g. Semester 1 2027", "start_date": "YYYY-MM-DD or null", "intake_month": null, "intake_year": null, "admission_deadline": "YYYY-MM-DD or null" }]
}`,
    units: `{
  "study_units": [{ "unit_code": "code or null", "unit_name": "unit name", "credit_points": null }]
}`,
    eligibility: `{
  "requirements": [{ "name": "requirement name", "applicable_to": "domestic|international|both", "description": "details", "min_score_percent": null }],
  "english_requirements": [{ "test_type_name": "IELTS|TOEFL|PTE", "overall_score": null, "listening_score": null, "reading_score": null, "writing_score": null, "speaking_score": null }]
}`,
    accreditations: `{
  "accreditations": [{ "name": "accreditation body name", "issuing_organization": "org or null" }]
}`,
    course: `{
  "name": "full course name", "short_name": null, "description": "2-4 sentences", "degree_level": "Bachelor|Master|Diploma|Certificate|etc",
  "subject_area": null, "duration_weeks": null, "study_mode": null, "career_paths": [], "awarding_institution": null
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

// ── Final-batch quality audit (judgement rules only) ───────────────────────
// The duplicate / fee_anomaly / missing_required_fields rules V1 also puts in
// this prompt are computed in lib/quality-rules.ts instead; see the header there.

export const QUALITY_AUDIT_SYSTEM = `You are a strict data quality auditor for an education extraction pipeline.

You judge only two things: whether a course name contradicts its stated degree level, and whether the "course" is a course at all.
Do not report duplicates, fee problems, or missing fields — those are checked separately and reporting them here double-counts every flag.
Only flag genuine issues. Return an empty issues array if everything looks correct.
Return ONLY valid JSON.`;

export function qualityAuditPrompt(
  courses: readonly {
    id: string;
    name: string;
    degree_level?: string | null;
    description?: string | null;
  }[],
  institutionName: string,
) {
  const list = courses.map((c) => ({
    id: c.id,
    name: c.name,
    degree_level: c.degree_level ?? null,
    description: c.description ? c.description.slice(0, 200) : null,
  }));

  return `Review these ${list.length} courses extracted from "${institutionName}".

RULES — flag issues matching these EXACT criteria and no others:

1. CONTRADICTION: the course name clearly contradicts its degree_level — e.g. the name says "Certificate" but degree_level is "Master", or the name says "PhD" but degree_level is "Diploma".
   A legitimate pathway name is NOT a contradiction: "Graduate Certificate leading to a Master of X" with degree_level "Graduate Certificate" is correct.
   Use severity "high".

2. NONSENSICAL_NAME: the name is clearly not a course — a blog title, a staff member, an event, or a navigation label ("News", "Contact Us", "Meet Our Team", "Top 5 reasons to study abroad").
   Use severity "high".

Do NOT flag a course for missing optional fields, for formatting, or for a name you merely find unusual.

COURSES:
${JSON.stringify(list, null, 2)}

Return JSON:
{
  "issues": [
    { "course_id": "the uuid from the list above", "issue_type": "contradiction|nonsensical_name", "severity": "high", "suggestion": "one sentence: what is wrong and what to do" }
  ],
  "summary": "one-line summary of the check"
}`;
}

// ── Job context bundle (supporting documents → structured pre-fill) ────────

export const CONTEXT_BUNDLE_SYSTEM = `You convert education provider context documents (PDFs, brochures, fee schedules, course handbooks) into a strict JSON bundle that mirrors the platform's data model.

CRITICAL RULES:
- Only include fields present verbatim in the documents. Never guess, never infer, never fill a gap.
- For shared entities (fees, intakes, eligibility, units), list each ONCE and use applies_to_courses to say which courses it belongs to. Do NOT repeat the same fee against multiple courses.
- Every name in applies_to_courses must match a course name in the courses array exactly.
- Currencies are ISO codes (AUD, USD, GBP, EUR, INR, NZD, ...).
- period is one of "year", "semester", "trimester", "term", "month", "total".
- Omit a key entirely rather than emitting an empty string or a null placeholder.
Return ONLY valid JSON.`;

export function contextBundlePrompt(documentContext: string, guidanceNotes?: string | null) {
  const guidance = guidanceNotes ? `\n\nOperator guidance for this job:\n${guidanceNotes}` : "";

  return `Parse this document context into the bundle.${guidance}

${documentContext}

Return JSON with exactly this shape (omit any array the documents do not support):
{
  "institution": { "name": "", "legal_name": "", "website": "", "country": "", "city": "", "type": "", "description": "" },
  "branches": [{ "name": "", "city": "", "country": "", "address": "" }],
  "courses": [{ "name": "", "code": "", "degree_level": "", "duration": "", "study_mode": "", "source_url": "", "branch_name": "" }],
  "fees": [{ "fee_type": "", "amount": 0, "currency": "", "period": "", "applies_to_courses": [""] }],
  "intakes": [{ "month": "", "year": 2026, "mode": "", "applies_to_courses": [""] }],
  "eligibility": [{ "requirement_type": "", "value": "", "condition": "", "applies_to_courses": [""] }],
  "units": [{ "name": "", "code": "", "credits": 0, "applies_to_courses": [""] }]
}`;
}
