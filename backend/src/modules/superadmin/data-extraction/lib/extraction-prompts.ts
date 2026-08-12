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

// ── Service: Accommodation extraction ──

export const ACCOMMODATION_EXTRACTION_SYSTEM = `You are a strict data extraction assistant for a student services platform.
Extract student accommodation and housing listings from the provided webpage content.
ONLY extract information that is EXPLICITLY stated on the page. NEVER infer, guess, or fabricate data.
If a field is not found, use null. Respond in valid JSON only.`;

export function accommodationExtractionPrompt(
  url: string,
  pageText: string,
  guidanceNotes?: string | null,
) {
  const guidance = guidanceNotes ? `\nOperator guidance: ${guidanceNotes}` : "";
  return `Extract all student accommodation listings from this page.
Source URL: ${url}${guidance}

Page content:
${pageText}

Return JSON:
{
  "accommodations": [
    {
      "name": "property/listing name",
      "provider_name": "management company or provider name or null",
      "type": "student_housing|homestay|shared_room|studio|apartment|residence|other or null",
      "property_type": "e.g. purpose-built, converted house, apartment block or null",
      "description": "description or null",
      "address": "full address or null",
      "street1": "street line 1 or null",
      "street2": "street line 2 or null",
      "city": "city or null",
      "state": "state/province or null",
      "country": "country or null",
      "postcode": "postal code or null",
      "latitude": null,
      "longitude": null,
      "distance_to_campus": "e.g. 5 min walk, 2 km or null",
      "nearest_public_transport": "nearest station/stop or null",
      "price_amount": null,
      "price_currency": "currency code or null",
      "price_period": "per_week|per_month|per_semester|per_year or null",
      "price_from": null,
      "price_to": null,
      "deposit_amount": null,
      "bond_amount": null,
      "application_fee": null,
      "bills_included": null,
      "room_type": "single|twin_share|ensuite|studio|apartment or null",
      "bed_type": "single|double|king or null",
      "bathroom_type": "private|shared or null",
      "furnished": null,
      "bedrooms": null,
      "bathrooms": null,
      "room_size_sqm": null,
      "min_stay_weeks": null,
      "max_stay_weeks": null,
      "availability": "available|waitlist|sold_out or null",
      "lease_type": "fixed|flexible or null",
      "amenities": [],
      "facilities": [],
      "wifi_included": null,
      "meals_included": null,
      "meal_plan_details": "meal plan description or null",
      "cancellation_policy": "cancellation terms or null",
      "pet_policy": "pet rules or null",
      "guest_policy": "guest rules or null",
      "smoking_policy": "smoking rules or null",
      "alcohol_policy": "alcohol rules or null",
      "gender_policy": "mixed|female_only|male_only or null",
      "security_features": [],
      "wheelchair_accessible": null,
      "images": [],
      "virtual_tour_url": "virtual tour link or null",
      "average_rating": null,
      "review_count": null,
      "contact_name": "contact person or null",
      "contact_email": "email or null",
      "contact_phone": "phone or null",
      "contact_whatsapp": "whatsapp number or null",
      "website": "website or null",
      "booking_url": "booking link or null",
      "nearby_institutions": [],
      "managed_by": "management entity or null"
    }
  ]
}

Rules:
- Extract ALL accommodation listings visible on this page
- If the page shows a single property, return exactly 1 item
- Never invent prices, availability, or amenities — only extract what is explicitly stated
- amenities, facilities, security_features, nearby_institutions, images are JSON arrays of strings
- Boolean fields (bills_included, wifi_included, furnished, meals_included, wheelchair_accessible) should be true, false, or null if not stated
- Price fields are numbers (no currency symbols)`;
}

// ── Service: Insurance extraction ──

export const INSURANCE_EXTRACTION_SYSTEM = `You are a strict data extraction assistant for a student services platform.
Extract student insurance products (OSHC, OVHC, health, travel) from the provided webpage content.
ONLY extract information that is EXPLICITLY stated on the page. NEVER infer, guess, or fabricate data.
If a field is not found, use null. Respond in valid JSON only.`;

export function insuranceExtractionPrompt(
  url: string,
  pageText: string,
  guidanceNotes?: string | null,
) {
  const guidance = guidanceNotes ? `\nOperator guidance: ${guidanceNotes}` : "";
  return `Extract all student insurance product listings from this page.
Source URL: ${url}${guidance}

Page content:
${pageText}

Return JSON:
{
  "insurance_products": [
    {
      "name": "product/plan name",
      "provider_name": "insurer name or null",
      "type": "oshc|ovhc|health|travel or null",
      "plan_tier": "e.g. basic, standard, premium or null",
      "product_code": "product code or null",
      "cover_type": "single|couple|family or null",
      "age_min": null,
      "age_max": null,
      "premium_amount": null,
      "premium_currency": "currency code or null",
      "premium_period": "per_month|per_year|per_week or null",
      "premium_annual": null,
      "premium_monthly": null,
      "payment_frequency": "monthly|quarterly|annually or null",
      "cover_duration_months": null,
      "benefits": [],
      "hospital_cover": null,
      "dental_cover": null,
      "optical_cover": null,
      "mental_health_cover": null,
      "ambulance_cover": null,
      "prescription_cover": null,
      "pregnancy_cover": null,
      "emergency_cover": null,
      "repatriation_cover": null,
      "annual_limit": null,
      "lifetime_limit": null,
      "exclusions": [],
      "waiting_period": "waiting period description or null",
      "excess_amount": null,
      "gap_cover": null,
      "pre_existing_conditions_covered": null,
      "meets_visa_requirement": null,
      "government_approved": null,
      "fund_code": "fund code or null",
      "claiming_process": "how to claim or null",
      "claims_phone": "claims phone or null",
      "claims_email": "claims email or null",
      "claims_portal_url": "claims portal URL or null",
      "country_code": "country code or null",
      "visa_types_eligible": [],
      "contact_email": "email or null",
      "contact_phone": "phone or null",
      "website": "website or null",
      "quote_url": "get a quote link or null",
      "apply_url": "apply link or null",
      "pds_url": "product disclosure statement URL or null"
    }
  ]
}

Rules:
- Extract ALL insurance products/plans visible on this page
- Cover booleans (hospital_cover, dental_cover, etc.) should be true, false, or null if not stated
- Premium amounts are numbers (no currency symbols)
- benefits, exclusions, visa_types_eligible are JSON arrays of strings
- If a plan has multiple cover_type variants (single/couple/family), extract each as a separate entry
- Never invent coverage details or premiums — only extract what is explicitly stated`;
}

// ── Service: Banking extraction ──

export const BANKING_EXTRACTION_SYSTEM = `You are a strict data extraction assistant for a student services platform.
Extract student banking products and financial service offerings from the provided webpage content.
ONLY extract information that is EXPLICITLY stated on the page. NEVER infer, guess, or fabricate data.
If a field is not found, use null. Respond in valid JSON only.`;

export function bankingExtractionPrompt(
  url: string,
  pageText: string,
  guidanceNotes?: string | null,
) {
  const guidance = guidanceNotes ? `\nOperator guidance: ${guidanceNotes}` : "";
  return `Extract all student banking products and account offerings from this page.
Source URL: ${url}${guidance}

Page content:
${pageText}

Return JSON:
{
  "banking_products": [
    {
      "name": "account/product name",
      "provider_name": "bank/institution name or null",
      "type": "savings|everyday|term_deposit or null",
      "account_type": "e.g. student, international student, youth or null",
      "product_code": "product code or null",
      "monthly_fee": null,
      "annual_fee": null,
      "fee_currency": "currency code or null",
      "fee_waiver_available": null,
      "fee_waiver_conditions": "conditions for fee waiver or null",
      "atm_fee_domestic": null,
      "atm_fee_international": null,
      "international_transaction_fee_percent": null,
      "interest_rate": null,
      "interest_type": "variable|fixed or null",
      "bonus_interest_rate": null,
      "bonus_interest_conditions": "conditions for bonus rate or null",
      "has_debit_card": null,
      "card_type": "visa|mastercard|eftpos or null",
      "has_mobile_app": null,
      "has_internet_banking": null,
      "has_branch_access": null,
      "has_apple_pay": null,
      "has_google_pay": null,
      "has_samsung_pay": null,
      "has_payid": null,
      "has_bpay": null,
      "has_international_transfers": null,
      "features": [],
      "eligibility": [],
      "min_age": null,
      "max_age": null,
      "visa_types_accepted": [],
      "min_deposit": null,
      "documents_required": [],
      "can_open_before_arrival": null,
      "daily_transfer_limit": null,
      "daily_withdrawal_limit": null,
      "sign_up_bonus": "bonus description or null",
      "sign_up_bonus_conditions": "conditions for bonus or null",
      "country_code": "country code or null",
      "contact_email": "email or null",
      "contact_phone": "phone or null",
      "website": "website or null",
      "apply_url": "apply link or null"
    }
  ]
}

Rules:
- Extract ALL banking products/accounts visible on this page
- Fee and rate fields are numbers (no currency symbols or % signs)
- Boolean fields (has_debit_card, has_mobile_app, fee_waiver_available, can_open_before_arrival, etc.) should be true, false, or null if not stated
- features, eligibility, visa_types_accepted, documents_required are JSON arrays of strings
- Never invent fees, rates, or features — only extract what is explicitly stated`;
}

// ── Service: Visa Services extraction ──

export const VISA_SERVICES_EXTRACTION_SYSTEM = `You are a strict data extraction assistant for a student services platform.
Extract visa service providers and migration agent listings from the provided webpage content.
ONLY extract information that is EXPLICITLY stated on the page. NEVER infer, guess, or fabricate data.
If a field is not found, use null. Respond in valid JSON only.`;

export function visaServicesExtractionPrompt(
  url: string,
  pageText: string,
  guidanceNotes?: string | null,
) {
  const guidance = guidanceNotes ? `\nOperator guidance: ${guidanceNotes}` : "";
  return `Extract all visa service providers and migration agent listings from this page.
Source URL: ${url}${guidance}

Page content:
${pageText}

Return JSON:
{
  "visa_services": [
    {
      "name": "business/agent name",
      "provider_name": "parent company or null",
      "type": "visa_application|migration_advice|appeal or null",
      "registration_number": "MARN or registration number or null",
      "registration_body": "e.g. MARA, OMARA or null",
      "registration_status": "active|suspended|cancelled or null",
      "registration_expiry": "YYYY-MM-DD or null",
      "registration_level": "e.g. full, limited or null",
      "visa_types_handled": [],
      "services_offered": [],
      "specializations": "areas of specialization or null",
      "fee_amount": null,
      "fee_currency": "currency code or null",
      "fee_type": "flat|hourly|per_application or null",
      "fee_from": null,
      "fee_to": null,
      "consultation_fee": null,
      "consultation_free": null,
      "success_rate": null,
      "cases_handled": null,
      "years_experience": null,
      "team_size": null,
      "countries_serviced": [],
      "nationalities_serviced": [],
      "languages_spoken": [],
      "address": "full address or null",
      "city": "city or null",
      "state": "state/province or null",
      "country": "country or null",
      "contact_name": "contact person or null",
      "contact_email": "email or null",
      "contact_phone": "phone or null",
      "contact_whatsapp": "whatsapp number or null",
      "website": "website or null",
      "booking_url": "booking link or null",
      "operating_hours": "business hours or null",
      "appointment_required": null,
      "online_consultations": null,
      "average_rating": null,
      "review_count": null
    }
  ]
}

Rules:
- Extract ALL visa service providers visible on this page
- visa_types_handled, services_offered, countries_serviced, nationalities_serviced, languages_spoken are JSON arrays of strings
- Fee fields are numbers (no currency symbols)
- Boolean fields (consultation_free, appointment_required, online_consultations) should be true, false, or null if not stated
- success_rate is a number 0-100 representing percentage, or null
- Never invent credentials, fees, or success rates — only extract what is explicitly stated`;
}

// ── Service: Test Preparation extraction ──

export const TEST_PREPARATION_EXTRACTION_SYSTEM = `You are a strict data extraction assistant for a student services platform.
Extract test preparation course listings (IELTS, TOEFL, PTE, etc.) from the provided webpage content.
ONLY extract information that is EXPLICITLY stated on the page. NEVER infer, guess, or fabricate data.
If a field is not found, use null. Respond in valid JSON only.`;

export function testPreparationExtractionPrompt(
  url: string,
  pageText: string,
  guidanceNotes?: string | null,
) {
  const guidance = guidanceNotes ? `\nOperator guidance: ${guidanceNotes}` : "";
  return `Extract all test preparation course listings from this page.
Source URL: ${url}${guidance}

Page content:
${pageText}

Return JSON:
{
  "test_prep_courses": [
    {
      "name": "course/program name",
      "provider_name": "provider/school name or null",
      "test_type": "ielts|toefl|pte|cambridge|oet|gmat|gre or null",
      "test_variant": "e.g. Academic, General Training or null",
      "format": "in_person|online|hybrid or null",
      "duration_hours": null,
      "duration_weeks": null,
      "level": "e.g. beginner, intermediate, advanced or null",
      "target_score": null,
      "guaranteed_score": null,
      "modules": [],
      "skills_covered": "e.g. reading, writing, speaking, listening or null",
      "practice_tests_count": null,
      "total_lessons": null,
      "class_size_max": null,
      "includes_mock_test": null,
      "includes_materials": null,
      "includes_marking": null,
      "includes_feedback": null,
      "includes_certificate": null,
      "one_on_one_available": null,
      "recorded_sessions": null,
      "schedule": [],
      "start_dates": [],
      "flexible_start": null,
      "intake_frequency": "weekly|monthly|quarterly or null",
      "fee_amount": null,
      "fee_currency": "currency code or null",
      "fee_period": "per_course|per_week|per_month or null",
      "fee_per_hour": null,
      "average_score_improvement": null,
      "pass_rate": null,
      "students_trained": null,
      "teacher_qualifications": "teacher credentials or null",
      "native_speakers": null,
      "address": "full address or null",
      "city": "city or null",
      "state": "state/province or null",
      "country": "country or null",
      "contact_name": "contact person or null",
      "contact_email": "email or null",
      "contact_phone": "phone or null",
      "website": "website or null",
      "booking_url": "enrol/book link or null"
    }
  ]
}

Rules:
- Extract ALL test preparation courses visible on this page
- modules, schedule, start_dates are JSON arrays of strings
- Boolean fields (includes_mock_test, includes_materials, flexible_start, native_speakers, etc.) should be true, false, or null if not stated
- Fee fields are numbers (no currency symbols)
- target_score and guaranteed_score are numbers (e.g. 7.0 for IELTS)
- pass_rate is a number 0-100 representing percentage, or null
- Never invent scores, fees, or class details — only extract what is explicitly stated`;
}

// ── Service: Career Services extraction ──

export const CAREER_SERVICES_EXTRACTION_SYSTEM = `You are a strict data extraction assistant for a student services platform.
Extract career service offerings (resume writing, job placement, internships, coaching) from the provided webpage content.
ONLY extract information that is EXPLICITLY stated on the page. NEVER infer, guess, or fabricate data.
If a field is not found, use null. Respond in valid JSON only.`;

export function careerServicesExtractionPrompt(
  url: string,
  pageText: string,
  guidanceNotes?: string | null,
) {
  const guidance = guidanceNotes ? `\nOperator guidance: ${guidanceNotes}` : "";
  return `Extract all career service offerings from this page.
Source URL: ${url}${guidance}

Page content:
${pageText}

Return JSON:
{
  "career_services": [
    {
      "name": "service/package name",
      "provider_name": "provider/company name or null",
      "type": "resume_writing|job_placement|internship|career_coaching or null",
      "services_offered": [],
      "industries": "target industries or null",
      "job_types": "e.g. full-time, part-time, casual or null",
      "fee_amount": null,
      "fee_currency": "currency code or null",
      "fee_type": "flat|hourly|per_session or null",
      "fee_from": null,
      "fee_to": null,
      "free_initial_consultation": null,
      "free_services_available": null,
      "duration": "service duration or null",
      "sessions_included": null,
      "session_duration": "e.g. 30 min, 1 hour or null",
      "delivery_mode": "in_person|online|hybrid or null",
      "inclusions": [],
      "resume_review": null,
      "cover_letter": null,
      "linkedin_optimization": null,
      "portfolio_review": null,
      "interview_coaching": null,
      "turnaround_time": "e.g. 3 business days or null",
      "placement_rate": null,
      "average_salary": null,
      "employer_partnerships_count": null,
      "partner_companies": [],
      "candidates_placed": null,
      "eligibility": "eligibility criteria or null",
      "visa_types_eligible": [],
      "target_audience": "e.g. international students, graduates or null",
      "address": "full address or null",
      "city": "city or null",
      "state": "state/province or null",
      "country": "country or null",
      "contact_email": "email or null",
      "contact_phone": "phone or null",
      "website": "website or null",
      "booking_url": "booking link or null"
    }
  ]
}

Rules:
- Extract ALL career service offerings visible on this page
- services_offered, inclusions, partner_companies, visa_types_eligible are JSON arrays of strings
- Boolean fields (free_initial_consultation, free_services_available, resume_review, cover_letter, linkedin_optimization, portfolio_review, interview_coaching) should be true, false, or null if not stated
- Fee fields are numbers (no currency symbols)
- placement_rate is a number 0-100 representing percentage, or null
- Never invent placement rates, fees, or partner details — only extract what is explicitly stated`;
}

// ── Service: Translation extraction ──

export const TRANSLATION_EXTRACTION_SYSTEM = `You are a strict data extraction assistant for a student services platform.
Extract translation and interpreting service providers from the provided webpage content.
ONLY extract information that is EXPLICITLY stated on the page. NEVER infer, guess, or fabricate data.
If a field is not found, use null. Respond in valid JSON only.`;

export function translationExtractionPrompt(
  url: string,
  pageText: string,
  guidanceNotes?: string | null,
) {
  const guidance = guidanceNotes ? `\nOperator guidance: ${guidanceNotes}` : "";
  return `Extract all translation and interpreting service listings from this page.
Source URL: ${url}${guidance}

Page content:
${pageText}

Return JSON:
{
  "translation_services": [
    {
      "name": "business/service name",
      "provider_name": "parent company or null",
      "type": "document_translation|interpreting|naati_certified|notarised or null",
      "languages_from": [],
      "languages_to": [],
      "language_pairs_count": null,
      "document_types": "accepted document types or null",
      "specializations": "specialization areas or null",
      "certification": "e.g. NAATI Certified or null",
      "certification_number": "certification number or null",
      "certification_body": "e.g. NAATI or null",
      "certification_level": "e.g. Certified, Recognised or null",
      "is_sworn_translator": null,
      "court_approved": null,
      "fee_amount": null,
      "fee_currency": "currency code or null",
      "fee_type": "per_page|per_word|per_document|flat or null",
      "fee_per_page": null,
      "fee_per_word": null,
      "minimum_charge": null,
      "rush_fee_multiplier": null,
      "notarisation_fee": null,
      "turnaround_time": "standard turnaround or null",
      "express_available": null,
      "express_turnaround": "express turnaround time or null",
      "delivery_format": "e.g. PDF, hard copy, email or null",
      "accepts_online_orders": null,
      "quality_assurance": "QA process or null",
      "revision_included": null,
      "revision_count": null,
      "address": "full address or null",
      "city": "city or null",
      "state": "state/province or null",
      "country": "country or null",
      "contact_name": "contact person or null",
      "contact_email": "email or null",
      "contact_phone": "phone or null",
      "website": "website or null",
      "order_url": "order/submit link or null",
      "quote_url": "get a quote link or null"
    }
  ]
}

Rules:
- Extract ALL translation service listings visible on this page
- languages_from, languages_to are JSON arrays of language names (e.g. ["English", "Mandarin"])
- Boolean fields (is_sworn_translator, court_approved, express_available, accepts_online_orders, revision_included) should be true, false, or null if not stated
- Fee fields are numbers (no currency symbols)
- rush_fee_multiplier is a number (e.g. 1.5 for 50% surcharge), or null
- Never invent certifications, fees, or language pairs — only extract what is explicitly stated`;
}

// ── Service: Transport extraction ──

export const TRANSPORT_EXTRACTION_SYSTEM = `You are a strict data extraction assistant for a student services platform.
Extract transport service listings (airport pickup, shuttles, local transport) from the provided webpage content.
ONLY extract information that is EXPLICITLY stated on the page. NEVER infer, guess, or fabricate data.
If a field is not found, use null. Respond in valid JSON only.`;

export function transportExtractionPrompt(
  url: string,
  pageText: string,
  guidanceNotes?: string | null,
) {
  const guidance = guidanceNotes ? `\nOperator guidance: ${guidanceNotes}` : "";
  return `Extract all transport service listings from this page.
Source URL: ${url}${guidance}

Page content:
${pageText}

Return JSON:
{
  "transport_services": [
    {
      "name": "service/company name",
      "provider_name": "parent company or null",
      "type": "airport_pickup|shuttle|local_transport|car_rental or null",
      "coverage_area": "service area or null",
      "airports_serviced": [],
      "cities_serviced": [],
      "routes": [],
      "pickup_points": "pickup locations or null",
      "dropoff_points": "dropoff locations or null",
      "vehicle_types": "vehicle types available or null",
      "max_passengers": null,
      "wheelchair_accessible": null,
      "child_seat_available": null,
      "luggage_capacity": "luggage info or null",
      "luggage_included": null,
      "fee_amount": null,
      "fee_currency": "currency code or null",
      "fee_type": "flat|per_km|per_trip or null",
      "fee_from": null,
      "fee_to": null,
      "surge_pricing": null,
      "group_discount": null,
      "student_discount": null,
      "payment_methods": "accepted payment methods or null",
      "booking_method": "how to book or null",
      "advance_booking_required": null,
      "min_notice_hours": null,
      "booking_url": "booking link or null",
      "app_name": "mobile app name or null",
      "operating_hours": "operating hours or null",
      "twenty_four_hour_service": null,
      "frequency": "service frequency or null",
      "meet_and_greet": null,
      "flight_monitoring": null,
      "door_to_door": null,
      "shared_ride_available": null,
      "gps_tracking": null,
      "wifi_onboard": null,
      "multilingual_drivers": null,
      "languages_spoken": [],
      "address": "full address or null",
      "city": "city or null",
      "state": "state/province or null",
      "country": "country or null",
      "contact_email": "email or null",
      "contact_phone": "phone or null",
      "website": "website or null",
      "license_number": "license/permit number or null"
    }
  ]
}

Rules:
- Extract ALL transport services visible on this page
- airports_serviced, cities_serviced, routes, languages_spoken are JSON arrays of strings
- Boolean fields (wheelchair_accessible, child_seat_available, luggage_included, surge_pricing, group_discount, student_discount, advance_booking_required, twenty_four_hour_service, meet_and_greet, flight_monitoring, door_to_door, shared_ride_available, gps_tracking, wifi_onboard, multilingual_drivers) should be true, false, or null if not stated
- Fee fields are numbers (no currency symbols)
- Never invent fees, routes, or service details — only extract what is explicitly stated`;
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
