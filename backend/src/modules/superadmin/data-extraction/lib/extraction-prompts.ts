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

Known course URL patterns for this site: ${patterns.join(", ") || "none identified yet"}

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

export function courseExtractionPrompt(url: string, pageText: string, guidanceNotes?: string | null) {
  return `Extract all courses/programs from this educational institution page.

URL: ${url}
${guidanceNotes ? `\nAdmin guidance: ${guidanceNotes}` : ""}

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
- For duration, convert to weeks if possible (1 year = 52 weeks, 1 semester = 26 weeks)`;
}

// ── Phase 3: Verification (verify worker) ──

export const VERIFICATION_SYSTEM = `You compare extracted data against live web page content to verify accuracy.
Respond in valid JSON only.`;

export function verificationPrompt(
  courseData: { name: string; fields: Record<string, string> },
  livePageText: string,
) {
  return `Verify this extracted course data against the current page content.

Extracted course: ${courseData.name}
Fields to verify:
${Object.entries(courseData.fields).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Current page content:
${livePageText}

For each field, determine if the extracted value matches what's on the page.

Return JSON:
{
  "results": [
    {
      "field_name": "field name",
      "extracted_value": "what was extracted",
      "live_value": "what the page currently shows (or null if not found)",
      "status": "match|mismatch|not_found"
    }
  ]
}`;
}
