// Binds a course to the platform's CLOSED lookup lists: public.areas_of_study and
// public.degree_levels. Extraction may only link to a row that already exists — it never adds one.
//
// The LISTS themselves are not here. They are defined once, in
// database/seeders/globalyapp/{areas_of_study,degree_levels}_seeder.ts, and read from the database
// at runtime (cached per process). Adding or renaming an area or a level is a seed-file edit plus
// `knex seed:run`; no code change, nothing here to keep in sync.
//
// The MODEL does the classification: the extraction prompt offers it the live list of area names
// and level names, and it picks the heading a course belongs under. This module validates that
// pick against the list, so a hallucinated or stale value links to nothing rather than inventing a
// category.
//
// It also has to place a course the model did NOT classify — a row staged before the prompt asked
// for an area, a re-run during a model outage, an admin edit. So each side keeps a MAPPING from
// the wording a page uses onto the list: the qualification in a course's name and the platform's
// Course Level folds for the level, the platform's own subject taxonomy for the area. Mapping,
// never list data — every target is a slug that has to exist in the seeded table, and the areas
// and levels themselves are defined only in the seeders.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { createChildLogger } from "../../../../shared/logger.js";

const logger = createChildLogger("lookup-catalog");

export interface LookupRow {
  slug: string;
  name: string;
}

export interface LookupLists {
  /** Active public.areas_of_study rows, in sort order. */
  areas: LookupRow[];
  /** Active public.degree_levels rows, in sort order. */
  levels: LookupRow[];
}

// ─── Loading the lists ────────────────────────────────────────────────────────

// ponytail: per-process cache. The lists change only when someone edits a seeder and re-seeds,
// which means a deploy — so there is no invalidation and none is needed.
let cached: LookupLists | null = null;

/** The live lists, cached. Empty arrays (and a warning) if the lookup tables were never seeded. */
export async function loadLookupLists(): Promise<LookupLists> {
  if (cached) return cached;
  const [areas, levels] = await Promise.all([
    masterKnex("areas_of_study").where({ is_active: true }).orderBy("sort_order").select("slug", "name"),
    masterKnex("degree_levels").where({ is_active: true }).orderBy("sort_order").select("slug", "name"),
  ]);
  cached = { areas, levels };
  const health = lookupListsHealth(cached);
  if (!health.ok) logger.warn("Lookup lists are not healthy — courses will not link correctly", health);
  return cached;
}

// ─── Countries ───────────────────────────────────────────────────────────────
// public.countries is a closed platform list too, and extraction_courses.country_code is joined
// against it — the public course search does `upper(c.iso2) = upper(ec.country_code)`. So the
// same rule applies as for areas and levels: store a value that exists on the list, or nothing.

// ponytail: per-process cache, same reasoning as the lists above — the country table is reference
// data that changes on a deploy.
let countryIndex: Map<string, string> | null = null;

/**
 * Colloquial forms the countries table cannot supply. Site intelligence returns whatever the
 * model wrote, and "UK" is the one it writes most — it is not an ISO2 code (that is GB), so
 * without this every UK course fails the country join.
 */
const COUNTRY_ALIASES: Record<string, string> = {
  uk: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
  "northern ireland": "GB", uae: "AE", "south korea": "KR", "united states of america": "US",
};

/** iso2 → iso2, plus iso3 and country name → iso2. Built once from the table itself. */
async function loadCountryIndex(): Promise<Map<string, string>> {
  if (countryIndex) return countryIndex;
  const rows: Array<{ name: string; iso2: string; iso3: string }> =
    await masterKnex("countries").select("name", "iso2", "iso3");
  const idx = new Map<string, string>();
  for (const r of rows) {
    for (const key of [r.iso2, r.iso3, r.name]) if (key) idx.set(key.trim().toLowerCase(), r.iso2);
  }
  for (const [alias, iso2] of Object.entries(COUNTRY_ALIASES)) if (!idx.has(alias)) idx.set(alias, iso2);
  if (!rows.length) logger.warn("public.countries is empty — courses will not link to a country");
  countryIndex = idx;
  return idx;
}

/**
 * An ISO2 code that exists in public.countries, or null. Accepts what site intelligence actually
 * produces: a code ("US"), a colloquial code ("UK"), an ISO3 ("GBR"), or a full name.
 */
export async function resolveCountryCode(value: unknown): Promise<string | null> {
  if (typeof value !== "string" || !value.trim()) return null;
  return (await loadCountryIndex()).get(value.trim().toLowerCase()) ?? null;
}

export interface LookupListsHealth {
  ok: boolean;
  /** Seeders never run: nothing can link at all. */
  areas_seeded: number;
  levels_seeded: number;
  /**
   * Course Level folds, and subject→area entries, whose target is not seeded. Editing a seeder is
   * meant to need no code change, so a rename that orphans a mapping has to be visible: that
   * wording silently stops linking otherwise.
   */
  missing_fold_targets: string[];
}

/**
 * Is the platform's lookup configuration usable? Reported by the verify worker alongside the link
 * counts, because an empty list or an orphaned fold is the ROOT CAUSE behind a job full of
 * unlinked courses — the counts alone don't say why.
 */
// ─── Which levels each service category is after ─────────────────────────────
// The stepper's service category ("Academic Courses" / "Short Courses") is a second, coarser
// scope alongside the degree-level picker. Mapping, not list data: every slug must exist in the
// seeder, and lookupListsHealth reports a seeded level that lands in neither bucket — such a level
// would be out of scope on BOTH kinds of job.
// Follows the SEEDED category descriptions, the platform's own definition: Academic Courses is
// "Degree programs, diplomas, and certificates"; Short Courses is "Professional development and
// language courses" — the non-award bucket and nothing else.
const ACADEMIC_LEVELS = new Set([
  "school", "high_school", "certificate", "diploma", "advance_diploma",
  "bachelor", "graduate_diploma", "master", "master_research", "doctoral",
]);
const SHORT_COURSE_LEVELS = new Set(["non_aqf_award"]);

export type CourseCategory = "academic" | "short_course";

/** The kind of course a degree level implies. Null when the course linked to no level. */
export function courseCategoryForLevel(levelSlug: unknown): CourseCategory | null {
  if (typeof levelSlug !== "string") return null;
  if (ACADEMIC_LEVELS.has(levelSlug)) return "academic";
  if (SHORT_COURSE_LEVELS.has(levelSlug)) return "short_course";
  return null;
}

/** public.service_categories.slug → the kind of course that job is for. */
export function categoryForServiceSlug(slug: unknown): CourseCategory | null {
  if (slug === "courses") return "academic";
  if (slug === "short_courses") return "short_course";
  return null;
}

export function lookupListsHealth(lists: LookupLists): LookupListsHealth {
  const missing = [
    ...[...new Set(Object.values(COURSE_LEVEL_FOLDS))]
      .filter((target) => !lists.levels.some((l) => norm(l.name) === norm(target))),
    ...Object.keys(SUBJECTS_BY_AREA)
      .filter((slug) => !lists.areas.some((a) => a.slug === slug)),
    ...lists.levels
      .filter((l) => !courseCategoryForLevel(l.slug))
      .map((l) => `level "${l.slug}" is in no course-category bucket`),
  ];
  return {
    ok: lists.areas.length > 0 && lists.levels.length > 0 && missing.length === 0,
    areas_seeded: lists.areas.length,
    levels_seeded: lists.levels.length,
    missing_fold_targets: missing,
  };
}

// ─── Matching helpers ─────────────────────────────────────────────────────────

/** Comparison form: lowercase, "&" → "and", punctuation → space, single-spaced. */
function norm(s: string): string {
  return s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/**
 * Does `phrase` appear in `haystack` as whole words? Both are already norm()'d, so a word boundary
 * is a space or an end of string.
 *
 * Phrases under 4 characters are matched only by equality, never inside a longer string: "IT",
 * "art" and "law" are real subjects on their own but wreck everything they touch as substrings.
 * The AREA_KEYWORDS pass below catches them in a longer phrase.
 */
function containsPhrase(haystack: string, phrase: string): boolean {
  if (phrase.length < 4) return false;
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(phrase, from);
    if (i < 0) return false;
    const end = i + phrase.length;
    if ((i === 0 || haystack[i - 1] === " ") && (end === haystack.length || haystack[end] === " ")) return true;
    from = i + 1;
  }
}

/** Find a list row by its name or slug, however the value was cased or punctuated. */
function byNameOrSlug(rows: LookupRow[], value: unknown): LookupRow | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const n = norm(value);
  const v = value.trim();
  return rows.find((r) => norm(r.name) === n || r.slug === v || norm(r.slug) === n) ?? null;
}

// ─── Degree level ─────────────────────────────────────────────────────────────

/**
 * The platform's own "Course Level → Degree Level" table: the granular wording a course may use,
 * and the level it links to. Kept in code because it is MAPPING, not list data — the target on the
 * right must exist in public.degree_levels, which `lookupListsHealth()` checks at runtime.
 *
 * Two rows of the source table are transcription errors and are not reproduced: "School → High
 * School" (contradicted by its own "School → School" row) and "High School → Certificate". Both
 * map to themselves here.
 */
const COURSE_LEVEL_FOLDS: Record<string, string> = {
  "kindergarten studies": "School",
  "primary school studies": "School",
  "junior secondary studies": "School",
  "bachelor honours degree": "Bachelor",
  "associate degree": "Bachelor",
  "undergraduate higher diploma": "Bachelor",
  "graduate certificate": "Graduate Diploma",
  "masters degree extended": "Master",
  "certificate i": "Certificate",
  "certificate ii": "Certificate",
  // Wordings the platform table doesn't list but pages and models produce constantly.
  bachelors: "Bachelor",
  undergraduate: "Bachelor",
  honours: "Bachelor",
  masters: "Master",
  postgraduate: "Master",
  "postgraduate taught": "Master",
  mres: "Master (Research)",
  mphil: "Master (Research)",
  "master of research": "Master (Research)",
  "master by research": "Master (Research)",
  phd: "PHD",
  "ph d": "PHD",
  doctorate: "PHD",
  doctoral: "PHD",
  "doctoral phd": "PHD",
  "doctor of philosophy": "PHD",
  dphil: "PHD",
  "advanced diploma": "Advance Diploma",
  "foundation degree": "Diploma",
  hnd: "Diploma",
  hnc: "Diploma",
  other: "Non AQF Award",
  "short course": "Non AQF Award",
  "short courses": "Non AQF Award",
  "professional development": "Non AQF Award",
  cpd: "Non AQF Award",
  "non degree": "Non AQF Award",
  "non award": "Non AQF Award",
  minor: "Non AQF Award",
  secondary: "High School",
  "secondary school": "High School",
  "senior secondary": "High School",
  primary: "School",
  "primary school": "School",
  kindergarten: "School",
};

/**
 * Qualification abbreviations as written in course names, matched CASE-SENSITIVELY once dots are
 * stripped ("Ph.D." → "PhD", "A.B." → "AB"). Case matters: "be", "ma", "ab" are English words;
 * "BE", "MA", "AB" are degrees. Most specific first.
 */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\b(PhD|DPhil)\b/, "PHD"],
  [/\b(JD|MD|DDS|DMD|DVM|PharmD|OD|DPT|DC)\b/, "PHD"],
  [/\b(EdD|DBA|DSc|EngD|DProf|DNP|DClinPsy|DMus|DMA|ThD|SJD|DEng|DSocSci|DrPH)\b/, "PHD"],
  [/\b(MRes|MPhil)\b/, "Master (Research)"],
  [/\b(EdS|SSP)\b/, "Master"],
  [/\b(GradCert|PGCert|PgCert|PGCE|GCert|GradDip|PGDip|PgDip|GDip|PGD)\b/, "Graduate Diploma"],
  [/\b(MSc|MA|MEng|MBA|LLM|MPH|MEd|MFA|MArch|MFin|MSt|MS|SM|MSW|MPA|MPP|MComm?|MMus|MChem|MBiol|MPhys|MMath|MPharm|MNurs|MCD|MDes|MTech|MEnvSc|MAcc|MIB|MBiochem|MGeol|MSci|MLA|MUP|MHA|MHS|MPS|MDiv|MTh|MEM|MPlan|MCom|MEc|MEcon|MAppSc|MProf)\b/, "Master"],
  [/\b(BSc|BA|BEng|BE|BCom|BBus|BBA|BEd|BFA|BArch|BN|BNurs|LLB|MBChB|MBBS|MBBCh|BDS|BVSc|BVMS|BPharm|AB|SB|BS|BASc|BTech|BDes|BMus|BAppSc|BIT|BInfTech|BSW|BPsych|BSocSc|BMed|BOptom|BPhty|BHSc|BMedSc|BCA|BAcc|BComm|BM|BMid|BEnvSc|BAgr|BCrim|BEcon|BPE|BPH|BSN|BFin|BLaws|BPlan|BLA|AA|AS|AAS)\b/, "Bachelor"],
  [/\b(ADip|AdvDip)\b/, "Advance Diploma"],
  [/\b(HND|HNC|FdA|FdSc|FdEng|DipHE|CertHE)\b/, "Diploma"],
  [/\bCert\s?(?:I|II|III|IV|1|2|3|4)\b/, "Certificate"],
];

/** Whole words in a course name, case-insensitive. Most specific first. */
const LEVEL_WORDS: Array<[RegExp, string]> = [
  [/\b(doctor (?:of|in) philosophy|doctor (?:of|in)|doctorate|doctoral|professional doctorate)\b/i, "PHD"],
  [/\b(master (?:of|by|in) research|research master'?s?|master (?:of |in )?philosophy)\b/i, "Master (Research)"],
  [/\b(graduate certificate|(?:post)?graduate [\w\s-]{0,30}?certificate|postgraduate certificate|grad\.? cert(?:ificate)?|graduate diploma|postgraduate diploma|grad\.? dip(?:loma)?)\b/i, "Graduate Diploma"],
  // "of" is not the only preposition a catalogue uses — US programmes write "Master In Teaching".
  [/\b(master (?:of|in)|master'?s|masters|magister|executive master|educational specialist)\b/i, "Master"],
  [/\b(bachelor (?:of|in)|bachelor'?s|bachelors|bachelor|licenciatura|honou?rs degree)\b/i, "Bachelor"],
  [/\b(associate degree|associate of|associate in|undergraduate higher diploma)\b/i, "Bachelor"],
  [/\b(advanced? diploma)\b/i, "Advance Diploma"],
  [/\b(diploma of higher education|foundation degree|higher national diploma|diploma)\b/i, "Diploma"],
  // Above `certificate` too: a microcredential, an edX-style MOOC ("7.03.2x Genetics…") and a
  // half-day workshop all carry the word "certificate" or none at all, so the certificate row
  // claimed them. NON_AWARD_RE cannot help — it is only consulted after LEVEL_WORDS has missed.
  [/\b(microcert\w*|microcred\w*|micro[- ]cert\w*|individual certificate|(?:half|one|two|three)[\s\u2010-\u2015-]?day)\b|^\d+\.[\dA-Za-z.]*x\s/i, "Non AQF Award"],
  // Above `certificate`: a school qualification usually HAS "certificate" in its name — HSC, VCE,
  // GCSE — and the bare certificate row would swallow them all. The school ones are NAMED, so they
  // are enumerated rather than matched on a bare "certificate of education", which would also
  // catch the tertiary CertEd — and because a name match outranks the model's own answer, that
  // would silently override a correct "Certificate".
  // Still below both diploma rows, so "Advanced Diploma of Primary School Teaching" stays a diploma.
  [/\b(high school|secondary school|senior secondary|higher school certificate|secondary education|(?:victorian|western australian|south australian|queensland|tasmanian|northern territory|general) certificate of education|year (?:11|12)|sixth form|a-?levels?)\b/i, "High School"],
  [/\b(primary school|elementary school|junior secondary|middle school|kindergarten|early years)\b/i, "School"],
  [/\b(certificate (?:i|ii|iii|iv|1|2|3|4) in|certificate)\b/i, "Certificate"],
  [/\b(foundation (?:year|programme|program|course|pathway)|year (?:0|zero)|pre-?masters?|pre-?sessional|access to he|short course|professional development|cpd)\b/i, "Non AQF Award"],
];

/**
 * Not a qualification at all — a component of one, or an unassessed offering. Only consulted when
 * the name carries no qualification token, so "Minor Surgery MSc" stays a Master.
 */
const NON_AWARD_RE = /\b(minor|non-?degree|non-?award|visiting student|exchange (?:program(?:me)?|student)|summer (?:school|session|program(?:me)?)|certificate of (?:attendance|participation|completion)|study abroad)\b/i;

/** The qualification a course NAME states, as a platform level name (unvalidated). */
function levelFromName(name: string): string | null {
  const undotted = name.replace(/\.(?=\S)/g, "").replace(/\./g, " ");
  for (const [re, level] of ABBREVIATIONS) if (re.test(undotted)) return level;
  for (const [re, level] of LEVEL_WORDS) if (re.test(name)) return level;
  return null;
}

/**
 * The platform degree level for a course.
 *
 * The qualification in the course's own NAME wins — it is verbatim from the page, and measured
 * over 1,918 staged courses it was the single most reliable signal. Then the model's pick,
 * validated against the live list. Then the platform's Course Level folds for wording the list
 * doesn't carry ("Associate Degree", "Graduate Certificate", "Other"). Null when none of that
 * lands: the course is left UNLINKED for review rather than guessed at.
 */
export function resolveDegreeLevel(lists: LookupLists, modelPick: unknown, courseName?: string | null): LookupRow | null {
  const fold = (value: unknown): LookupRow | null => {
    if (typeof value !== "string" || !value.trim()) return null;
    const n = norm(value).replace(/\s+(degree|level|program(me)?)s?$/, "");
    const target = COURSE_LEVEL_FOLDS[norm(value)] ?? COURSE_LEVEL_FOLDS[n];
    return target ? byNameOrSlug(lists.levels, target) : null;
  };

  if (courseName) {
    const fromName = levelFromName(courseName);
    // A bare "Certificate in X" is less specific than a model that read the page and said
    // Graduate Certificate — let the more specific answer through.
    if (fromName === "Certificate") {
      const specific = byNameOrSlug(lists.levels, modelPick) ?? fold(modelPick);
      if (specific?.name === "Graduate Diploma") return specific;
    }
    if (fromName) {
      const hit = byNameOrSlug(lists.levels, fromName);
      if (hit) return hit;
    }
  }

  const picked = byNameOrSlug(lists.levels, modelPick);
  if (picked) return picked;

  const folded = fold(modelPick);
  if (folded) return folded;

  if (courseName && NON_AWARD_RE.test(courseName)) return byNameOrSlug(lists.levels, "Non AQF Award");
  return null;
}

// ─── Area of study ────────────────────────────────────────────────────────────

/**
 * The platform area a course belongs to. Every course should land on one of the 14 — they are
 * broad enough to cover essentially any discipline, so an unlinked course is a miss, not a course
 * that genuinely has no area.
 *
 * Candidates are tried most-trustworthy first: the MODEL's pick (the prompt gives it the live area
 * names and asks which one the course sits under, and it read the page), then the subject wording,
 * then the course's own name. Each is first checked for BEING an area, then run through the
 * subject → area map below.
 *
 * Every pass lands on a seeded row or on nothing, so an off-list answer links to nothing instead
 * of creating a category — but "Nursing", which is not an area name, still reaches Health and
 * Medicine rather than being thrown away. Null = unlinked, reported by the link log and the verify
 * worker, never a guessed category.
 */
export function resolveAreaOfStudy(lists: LookupLists, modelPick: unknown, ...texts: unknown[]): LookupRow | null {
  const candidates = [modelPick, ...texts];
  for (const c of candidates) {
    const hit = byNameOrSlug(lists.areas, c);
    if (hit) return hit;
  }
  for (const c of candidates) {
    const slug = areaSlugForSubject(c);
    const hit = slug ? lists.areas.find((a) => a.slug === slug) : null;
    if (hit) return hit;
  }
  return null;
}

// ─── Subject → area fallback ──────────────────────────────────────────────────
//
// The model picks the area while it reads the page, and that stays the primary path. This is the
// fallback for when there is no pick to validate: courses staged before the model was asked, a
// re-run during a model outage, an admin editing by hand. Without it those rows never link at all
// — which is the whole point of the lists, since the 14 areas cover essentially every discipline.
//
// This is MAPPING, not list data — the same category as COURSE_LEVEL_FOLDS above. The areas
// themselves still live only in the seeder; these are the platform taxonomy's own subjects, keyed
// by the area slug they belong under, so placement follows the platform (Psychology → Health and
// Medicine, Economics → Social Studies and Media) rather than intuition.
const SUBJECTS_BY_AREA: Record<string, string[]> = {
  agriculture_veterinary_medicine: ["agriculture", "farm management", "horticulture", "plant and crop sciences", "veterinary medicine", "veterinary", "agribusiness", "animal science", "forestry"],
  applied_pure_science: ["biology", "biomedical sciences", "chemistry", "earth sciences", "environmental sciences", "food science and technology", "general sciences", "life sciences", "materials sciences", "mathematics", "physical geography", "physics", "sports science", "biochemistry", "neuroscience", "statistics", "geology", "astronomy", "biotechnology", "genetics", "microbiology", "kinesiology", "geoscience", "geosciences", "astrophysics", "planetary science", "polymers", "algebra", "linear algebra"],
  architecture_construction: ["architecture", "built environment", "construction", "maintenance services", "planning", "property management", "surveying", "urban planning", "urban studies", "landscape architecture", "real estate"],
  business_management: ["accounting", "business studies", "e-commerce", "entrepreneurship", "finance", "human resource management", "management", "marketing", "mba", "office administration", "quality management", "retail", "transportation and logistics", "business", "business administration", "commerce", "economics and management", "supply chain management", "logistics", "leadership", "advertising", "public relations", "operations research", "operations management", "organizational behavior", "organisational behaviour", "transportation", "negotiation", "mediation", "project management"],
  computer_science_it: ["computer science", "computing", "computer information systems", "it", "multimedia", "software", "information technology", "information systems", "data science", "artificial intelligence", "machine learning", "cyber security", "cybersecurity", "software engineering", "informatics", "bioinformatics"],
  creative_arts_design: ["art", "art administration", "crafts", "dance", "fashion and textile design", "graphic design", "industrial design", "interior design", "music", "non-industrial design", "theatre and drama studies", "fine arts", "studio art", "art history", "visual arts", "design", "fashion", "textiles", "theatre", "theater", "drama", "animation", "musicology", "drawing", "painting", "sculpture", "printmaking", "illustration", "bookmaking", "creative writing"],
  education_training: ["adult education", "cpd", "career advice", "childhood education", "coaching", "education learning", "education management", "education research", "educational psychology", "pedagogy", "special education", "specialised teaching", "teacher training pgce", "education", "teaching", "teacher education", "early childhood", "professional development", "instructional design", "higher education"],
  engineering: ["aerospace engineering", "biomedical engineering", "chemical and materials engineering", "civil engineering", "electrical engineering", "electronic engineering", "environmental engineering", "general engineering and technology", "manufacturing and production", "marine engineering", "mechanical engineering", "metallurgy", "mining and oil & gas operations", "power and energy engineering", "quality control", "structural engineering", "telecommunications", "vehicle engineering", "chemical engineering", "computer engineering", "industrial engineering", "petroleum engineering", "bioengineering", "robotics", "aeronautics"],
  health_medicine: ["complementary health", "counselling", "dentistry", "health studies", "health and safety", "medicine", "midwifery", "nursing", "nutrition and health", "ophthalmology", "pharmacology", "physiology", "physiotherapy", "psychology", "public health", "health", "health science", "health sciences", "medical", "pharmacy", "nutrition", "dental", "nurse practitioner", "biomedical informatics", "biostatistics", "bioethics", "virology", "immunology", "oncology", "endodontics", "orthodontics", "periodontics", "periodontology", "prosthodontics", "oral health", "occupational therapy", "speech pathology", "radiography", "paramedicine"],
  humanities: ["archaeology", "classics", "cultural studies", "english studies", "general studies", "history", "languages", "literature", "museum studies", "philosophy", "regional studies", "religious studies", "english", "language", "religion", "theology", "liberal arts", "humanities", "gender studies", "asian studies", "european studies", "latin american studies", "middle eastern studies", "african studies", "jewish studies", "medieval studies", "divinity", "theology", "folklore", "mythology"],
  law: ["civil law", "criminal law", "international law", "legal advice", "legal studies", "public law", "law", "legal", "jurisprudence"],
  personal_care_fitness: ["aromatherapy", "beauty therapy", "hairdressing", "health and fitness", "massage", "reflexology", "therapeutic", "beauty", "cosmetology", "fitness", "personal training", "strength and conditioning"],
  social_studies_media: ["anthropology", "economics", "environmental management", "film & television", "human geography", "international development", "international relations", "journalism", "library studies", "linguistics", "media", "photography", "politics", "public administration", "social sciences", "social work", "sociology", "writing", "political science", "government", "public policy", "public affairs", "communication", "communications", "media studies", "global studies", "international studies", "environmental studies", "sustainability", "criminology", "geography"],
  travel_hospitality: ["aviation", "catering", "food and drink production", "hospitality", "hotel management", "leisure management", "travel and tourism", "tourism", "culinary arts", "event management"],
};

/** norm(subject) → area slug, longest phrase first so "human resource management" beats "management". */
const SUBJECT_INDEX: Array<[string, string]> = Object.entries(SUBJECTS_BY_AREA)
  .flatMap(([slug, subjects]) => subjects.map((s) => [norm(s), slug] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length);

/** Last resort when no subject phrase appears: one strong token decides the area. Ordered. */
const AREA_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(engineering|technolog\w*|energy|vehicle|nuclear|robotic\w*|mechatronic\w*)\b/, "engineering"],
  [/\b(law|legal|jurisprudence)\b/, "law"],
  [/\b(nursing|medic\w*|clinical|health\w*|pharm\w*|dental|dentistry|surg\w*|therap\w*|midwif\w*|physiolog\w*|psycholog\w*|anatom\w*|patholog\w*|\w*odontic\w*|\w*odontolog\w*|cancer|oncolog\w*|asthma|behavio\w*|diagnos\w*|disease)\b/, "health_medicine"],
  [/\b(education|teaching|teacher|pedagog\w*|curriculum)\b/, "education_training"],
  [/\b(business|manag\w*|finance|financial|accounting|marketing|entrepreneur\w*|commerce|banking|insurance|mba|sales|operations?|strateg\w*|negotiation|mediation|organi[sz]ational|transport\w*|logistics|economics and)\b/, "business_management"],
  [/\b(computer\w*|computing|software|informatics|cyber\w*|data|digital|programming|network\w*|comput\w*|web|ai|artificial)\b/, "computer_science_it"],
  [/\b(architect\w*|construction|building|surveying|planning|property|urban)\b/, "architecture_construction"],
  [/\b(hospitality|tourism|travel|hotel|culinary|catering|aviation|leisure|event)\b/, "travel_hospitality"],
  [/\b(agricultur\w*|veterinary|horticultur\w*|farm\w*|crop|animal|forestry|food)\b/, "agriculture_veterinary_medicine"],
  [/\b(beauty|hair\w*|massage|cosmet\w*|fitness|wellness|spa)\b/, "personal_care_fitness"],
  [/\b(art|arts|design|music|dance|theatre|theater|drama|film|fashion|photograph\w*|creative|animation|craft\w*|drawing|painting|sculpt\w*|pictorial)\b/, "creative_arts_design"],
  [/\b(scien\w*|biolog\w*|chemi\w*|physic\w*|mathematic\w*|math\w*|geolog\w*|geoscien\w*|ecolog\w*|astro\w*|planet\w*|polymer\w*|algebra|calculus|molecul\w*|organism\w*|bio\w*)\b/, "applied_pure_science"],
  // A named language is the platform's "Languages" subject. Not an attempt at every language on
  // earth — the model names the area for anything past this, and an unmatched one stays unlinked.
  [/\b(french|german|spanish|italian|portuguese|chinese|mandarin|cantonese|japanese|korean|arabic|hebrew|russian|hindi|urdu|bengali|punjabi|persian|farsi|turkish|greek|latin|dutch|swedish|norwegian|danish|polish|czech|swahili|vietnamese|thai|indonesian|tagalog|filipino|nepali|tamil|telugu|serbo|croatian|bosnian|chichewa|yoruba|zulu|hausa|amharic)\b/, "humanities"],
  [/\b(history|philosophy|language\w*|literature|linguistic\w*|religio\w*|theolog\w*|divinity|folklore|mytholog\w*|classic\w*|archaeolog\w*|cultur\w*|humanit\w*|studies)\b/, "humanities"],
  [/\b(sociolog\w*|econom\w*|politic\w*|media|journalism|anthropolog\w*|social|communication\w*|international|public|geograph\w*|writing|policy|development|security|governance|sustainab\w*)\b/, "social_studies_media"],
];

/**
 * Not a subject — an enrolment status or offering bucket a catalogue used where a subject was
 * expected. These stay unlinked rather than being filed under an invented discipline. Tested
 * against the norm()'d string, so the patterns are in normalised form (no punctuation).
 */
const NON_SUBJECT_RE = /^(various|other|others|misc|miscellaneous|n a|na|none|null|unknown|tbc|tbd|all|any|general|online courses?|summer (programs?|schools?|sessions?)|(under)?graduate studies|advanced studies programs?|microcertificates?|visiting (student|students|undergraduate studies|graduate studies)|community auditing|external fellowships|interdisciplinary|non departmental)$/;

/** The area slug a subject string belongs under, by the platform's own taxonomy. */
export function areaSlugForSubject(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const n = norm(text);
  if (!n || NON_SUBJECT_RE.test(n)) return null;
  for (const [subject, slug] of SUBJECT_INDEX) {
    if (n === subject || containsPhrase(n, subject)) return slug;
  }
  for (const [re, slug] of AREA_KEYWORDS) if (re.test(n)) return slug;
  return null;
}
