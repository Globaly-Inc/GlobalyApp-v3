/**
 * Course identity from a course name. Deterministic, free, no model.
 *
 * Why a parser and not a cleaner: "Certificate - Finance (Graduate)", "Certificate – Finance –
 * Graduate" and "Certificate in Finance (Graduate)" are one course, while "MBA General Management"
 * and "MBA International Business" are two — the difference lives in WHICH words differ, not in how
 * many. So the name is split into a qualification (level + award), a subject and a specialisation,
 * plus the delivery/pathway flags that make a variant rather than a new course, and the identity
 * key is built from those parts. A prototype of this key over the live table collapsed 358 rows
 * with no false merge in a 45-group audit (docs: Extraction Entity Quality Investigation).
 *
 * The key is the dedup key for extraction_courses (institution_key + name_key). Change this file
 * and re-run scripts/backfill-course-identity.ts so stored keys match.
 */

export const COURSE_NAME_PARSER_VERSION = 1;

export interface ParsedCourseName {
  /** Level word: bachelor | master | doctor | graduate certificate | ... | null when none stated. */
  qualifier: string | null;
  /** Award when the qualifier carries one (science, arts, business administration) else the
   *  discipline text; the "what" of the course. Never null — a name with nothing else keeps its text here. */
  subject: string;
  /** Remaining discipline/concentration text after qualifier + subject, or null. */
  specialisation: string | null;
  /** Sorted delivery/pathway markers: honours, foundation_year, placement_year, online, ... */
  flags: string[];
  /** Institution unit/course code seen in the name (COMP101, 254HC), uppercase, or null. */
  code: string | null;
  /** Two awards joined into one programme ("BA / BCom"). */
  dual: boolean;
  /** `${qualifier}|${subject}|${specialisation}|${flags}` — the identity key. */
  key: string;
}

// Abbreviation -> [level, award]. Whole-token matches only. The two-letter ones (ma, ba, ms, bs,
// mn) are ambiguous inside prose ("MA" = Massachusetts) but a course NAME is not prose: they are
// expanded only when they stand at the start or end of a segment, which is where an award sits.
const ABBR: Record<string, [string, string | null]> = {
  mba: ["master", "business administration"], emba: ["master", "business administration"],
  msc: ["master", "science"], ms: ["master", "science"], mres: ["master", "research"],
  ma: ["master", "arts"], meng: ["master", "engineering"], mphil: ["master", "philosophy"],
  llm: ["master", "laws"], mfa: ["master", "fine arts"], msw: ["master", "social work"],
  mph: ["master", "public health"], med: ["master", "education"], mcom: ["master", "commerce"],
  mcomm: ["master", "commerce"], mmus: ["master", "music"], march: ["master", "architecture"],
  magr: ["master", "agriculture"], mn: ["master", "nursing"], mtech: ["master", "technology"],
  mdes: ["master", "design"], mpa: ["master", "public administration"], mpp: ["master", "public policy"],
  bsc: ["bachelor", "science"], bs: ["bachelor", "science"], ba: ["bachelor", "arts"],
  beng: ["bachelor", "engineering"], bba: ["bachelor", "business administration"],
  llb: ["bachelor", "laws"], bfa: ["bachelor", "fine arts"], bed: ["bachelor", "education"],
  bcom: ["bachelor", "commerce"], bcomm: ["bachelor", "commerce"], bmus: ["bachelor", "music"],
  barch: ["bachelor", "architecture"], bn: ["bachelor", "nursing"], bnurs: ["bachelor", "nursing"],
  bacc: ["bachelor", "accounting"], btech: ["bachelor", "technology"], bdes: ["bachelor", "design"],
  bbus: ["bachelor", "business"],
  phd: ["doctor", "philosophy"], dphil: ["doctor", "philosophy"], edd: ["doctor", "education"],
  dba: ["doctor", "business administration"], jd: ["doctor", "juris"], md: ["doctor", "medicine"],
  dnp: ["doctor", "nursing practice"], drph: ["doctor", "public health"], dprof: ["doctor", "professional studies"],
  psyd: ["doctor", "psychology"], dsc: ["doctor", "science"], dmin: ["doctor", "ministry"], mat: ["master", "teaching"],
  mcm: ["master", "church music"], mdiv: ["master", "divinity"], mls: ["master", "library science"],
  pgcert: ["graduate certificate", null], pgdip: ["graduate diploma", null],
  gradcert: ["graduate certificate", null], graddip: ["graduate diploma", null],
  fda: ["foundation degree", "arts"], fdsc: ["foundation degree", "science"], fdeng: ["foundation degree", "engineering"],
  hnd: ["higher national diploma", null], hnc: ["higher national certificate", null],
  pgce: ["graduate certificate", "education"],
};
const AMBIGUOUS_ABBR = new Set(["ma", "ba", "ms", "bs", "mn", "md", "bn", "med", "bed"]);

// Level phrases, longest first so "graduate certificate" wins over "certificate".
const LEVELS = [
  "postgraduate certificate", "postgraduate diploma", "graduate certificate", "graduate diploma",
  "pg cert", "pg dip", "grad cert", "grad dip", "pgcert", "pgdip",
  "undergraduate certificate", "undergraduate diploma", "undergraduate minor", "undergraduate major",
  "higher national diploma", "higher national certificate", "advanced diploma", "associate degree",
  "foundation degree", "foundation year", "juris doctor", "doctorate", "doctoral", "doctor",
  "bachelors", "bachelor", "masters", "master", "certificate", "diploma", "associate", "minor", "major",
];
const LEVEL_CANON: Record<string, string> = {
  bachelors: "bachelor", masters: "master", doctorate: "doctor", doctoral: "doctor",
  "postgraduate certificate": "graduate certificate", "postgraduate diploma": "graduate diploma",
  "pg cert": "graduate certificate", "pgcert": "graduate certificate", "grad cert": "graduate certificate",
  "pg dip": "graduate diploma", "pgdip": "graduate diploma", "grad dip": "graduate diploma",
  "juris doctor": "doctor",
};
const LEVEL_RE = new RegExp(`\\b(${LEVELS.join("|")})\\b`);

// Awards that follow "of": when X in "bachelor of X" is one of these, X is the award and the
// discipline comes after ("Bachelor of Science in Nursing"); otherwise X is the discipline itself
// ("Bachelor of Computer Science"). Compound awards before their heads.
const AWARDS = new Set([
  "business administration", "public administration", "public health", "public policy", "social work",
  "fine arts", "applied science", "health science", "information technology", "nursing practice",
  "professional studies", "science", "arts", "engineering", "laws", "law", "philosophy", "education",
  "commerce", "business", "nursing", "medicine", "music", "architecture", "design", "technology",
  "accounting", "economics", "research", "agriculture", "juris", "divinity", "pharmacy", "surgery",
  "dental surgery", "veterinary science", "physiotherapy", "midwifery", "letters", "theology",
]);

// Delivery / pathway markers. Each becomes a flag; the phrase is removed from the name.
const FLAG_PATTERNS: Array<[RegExp, string]> = [
  [/\((?:hons|honours|honors)\)|\b(?:honours|honors)\b|\bhons\b/g, "honours"],
  [/\bwith (?:a |an )?(?:integrated )?foundation year\b|\bincluding foundation year\b/g, "foundation_year"],
  [/\bwith (?:a |an )?(?:industrial |professional |optional |work |integrated )?placement(?: year)?\b|\bwith (?:a )?year in industry\b|\bsandwich\b/g, "placement_year"],
  [/\bwith (?:a )?year abroad\b|\bwith (?:a )?year in [a-z]+\b|\bstudy abroad\b/g, "year_abroad"],
  [/\btop[- ]?up\b/g, "top_up"],
  [/\b(?:online|distance learning|distance|by distance)\b/g, "online"],
  [/\bpart[- ]time\b/g, "part_time"],
  [/\baccelerated\b|\bfast[- ]track\b/g, "accelerated"],
  [/\b(?:executive|exec)\b/g, "executive"],
  [/\bapprenticeship\b|\bdegree apprenticeship\b/g, "apprenticeship"],
];

// A subject/unit code: 2-4 letters then 3-4 digits (COMP101, CSL6832, MGT-5670), or 3 digits then
// letters (254HC). Never a CRICOS (6 digits + letter) or a year.
export const UNIT_CODE_RE = /\b([A-Z]{2,4})[ -]?(\d{3,4})([A-Z]?)\b|\b(\d{3})([A-Z]{1,2})\b/;

const STOP = new Set(["in", "of", "the", "and", "a", "an", "for", "degree", "program", "programme", "programs", "course", "courses", "specialization", "specialisation", "concentration", "track", "pathway", "stream", "emphasis", "option", "focus"]);

function fold(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

function words(s: string): string {
  return s.split(" ").filter((w) => w && !STOP.has(w)).join(" ");
}

/** Lowercase, ASCII, dotted abbreviations collapsed, & -> and; separators become " | ". */
function clean(raw: string): string {
  // An ambiguous award abbreviation written in CAPITALS by the site ("Sociology MA by Research") is
  // an award wherever it stands; marked before lowercasing so parseSegment can tell.
  let s = fold(raw).replace(/\b(MA|BA|MS|BS|MN|MD|BN|MEd|BEd|MAT)\b(?!\.)/g, (m) => `~${m}`).toLowerCase();
  s = s.replace(/\b[a-z]{1,2}(?:\.[a-z]{1,3})+\.?/g, (m) => m.replace(/\./g, ""));
  s = s.replace(/&/g, " and ");
  s = s.replace(/\s+(?:and|with|\+)\s+(?=(?:bachelor|master|doctor|graduate|diploma|certificate|associate|\b(?:b|m)[a-z]{1,4}\b)\b)/g, " | ");
  s = s.replace(/[\/,;:()\[\]{}]|\s[-–—]\s|–|—/g, " | ");
  s = s.replace(/[^a-z0-9|+~ ]+/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

interface Segment { qualifier: string | null; award: string | null; rest: string; abbr?: boolean }

/** Find the level phrase in a segment (abbreviation or long form); return parts. */
function parseSegment(seg: string): Segment {
  const raw = seg.split(" ").filter(Boolean);
  const marked = raw.map((t) => t.startsWith("~"));
  const toks = raw.map((t) => t.replace(/^~/, ""));
  // A capitalised ambiguous abbreviation, or any unambiguous one, anywhere; a lowercase ambiguous
  // one only at an edge.
  const pick = toks.findIndex((t, i) => ABBR[t] && (marked[i] || !AMBIGUOUS_ABBR.has(t) || i === 0 || i === toks.length - 1));
  if (pick >= 0) {
    const [level, award] = ABBR[toks[pick]];
    return { qualifier: level, award, rest: stripLeading(toks.filter((_, i) => i !== pick).join(" ")), abbr: true };
  }
  const plain = toks.join(" ");
  const m = plain.match(LEVEL_RE);
  if (!m || m.index == null) return { qualifier: null, award: null, rest: plain };
  const level = LEVEL_CANON[m[1]] ?? m[1];
  let award: string | null = level === "doctor" && m[1] === "juris doctor" ? "juris" : null;
  const pre = plain.slice(0, m.index).trim();
  let post = plain.slice(m.index + m[0].length).trim();
  if (level === "doctor" && /^of philosophy\b/.test(post)) { award = "philosophy"; post = post.replace(/^of philosophy\b/, "").trim(); }
  else if (/^of\s+/.test(post)) {
    const after = post.replace(/^of\s+/, "");
    // Award = the longest AWARDS entry the text starts with, stopping before "in"/"with".
    const head = after.split(/\s+(?:in|with|for)\s+/)[0];
    const hit = [...AWARDS].filter((a) => head === a || head.startsWith(a + " ")).sort((a, b) => b.length - a.length)[0];
    if (hit) { award = hit; post = after.slice(hit.length).trim(); }
    else post = after; // "bachelor of computer science": discipline follows directly
  }
  const rest = [pre, stripLeading(post)].filter(Boolean).join(" ");
  return { qualifier: level, award, rest };
}

function stripLeading(s: string): string {
  return s.replace(/^(?:in|of|for|with)\s+/, "").trim();
}

function parseSingle(cleaned: string): Omit<ParsedCourseName, "key" | "dual" | "flags" | "code"> {
  const segments = cleaned.split("|").map((s) => s.trim()).filter(Boolean);
  let qualifier: string | null = null;
  let award: string | null = null;
  let levelModifier: string | null = null;
  const rests: string[] = [];
  for (const seg of segments) {
    if (/^(under|post)?graduate$/.test(seg)) { levelModifier = seg; continue; }
    if (/^(hons|honours|honors)$/.test(seg)) continue;
    const p = parseSegment(seg);
    if (p.qualifier && !qualifier) { qualifier = p.qualifier; award = p.award; }
    // A bare repeat of the award — "Business Administration (MBA)" — says nothing new. A second
    // award phrase WITH its own subject ("Bachelor of Business / Bachelor of Business Informatics")
    // is a combined degree and its words stay: dropping them merged the double with the single.
    else if (p.qualifier && p.abbr && p.qualifier === qualifier && (p.award ?? null) === (award ?? null) && !p.rest) { continue; }
    else if (p.qualifier) { rests.push(p.qualifier + (p.award ? " of " + p.award : "")); }
    if (p.rest) rests.push(p.rest);
  }
  if (levelModifier && qualifier && /^(certificate|diploma|minor|major)$/.test(qualifier)) qualifier = `${levelModifier} ${qualifier}`;
  else if (levelModifier && !qualifier) qualifier = levelModifier;
  let subject = award ?? "";
  // A rest segment that IS the award ("Business Administration (MBA)", "Bachelor of Accounting -
  // Accounting") repeats it; one that merely contains an award word ("Arts Management" under
  // "Master of Arts") is a different subject and every word stays.
  const kept = rests.map((r) => words(r)).filter((r) => r && r !== words(award ?? ""));
  const distinct = kept.join(" ").split(" ").filter(Boolean);
  let specialisation: string | null = distinct.length ? distinct.join(" ") : null;
  if (!subject) { subject = specialisation ?? ""; specialisation = null; }
  return { qualifier, subject, specialisation };
}

export function parseCourseName(raw: string): ParsedCourseName {
  let s = clean(raw);
  const flags = new Set<string>();
  for (const [re, flag] of FLAG_PATTERNS) {
    if (re.test(s)) { flags.add(flag); s = s.replace(re, " "); }
    re.lastIndex = 0;
  }
  const codeMatch = raw.toUpperCase().match(UNIT_CODE_RE);
  const code = codeMatch ? (codeMatch[1] ? `${codeMatch[1]}${codeMatch[2]}${codeMatch[3] ?? ""}` : `${codeMatch[4]}${codeMatch[5]}`) : null;
  if (code) s = s.replace(new RegExp(code.toLowerCase().replace(/(\D)(\d)/, "$1[ -]?$2"), "g"), " ");
  s = s.replace(/\s+/g, " ").replace(/(\|\s*)+\|/g, "|").trim();

  // A combined award ("BA / BCom", "Master of Psychology (Clinical) / PhD") is ONE key made of all
  // its text: the second award phrase is kept as ordinary words, so two combined awards differing
  // only in a parenthetical never collapse. Reordered halves ("BA/BSc" vs "BSc/BA") are the one case
  // this misses; the resolver's flag tier or review catches them.
  const parsed = parseSingle(s);
  const awards = new Set(s.split("|").map((seg) => parseSegment(seg.trim())).filter((p) => p.qualifier).map((p) => `${p.qualifier}/${p.award ?? ""}`));
  const dual = awards.size > 1;
  const sortedFlags = [...flags].sort();
  const key = `${parsed.qualifier ?? ""}|${parsed.subject}|${parsed.specialisation ?? ""}|${sortedFlags.join(",")}${code ? `|${code}` : ""}`;
  return { ...parsed, flags: sortedFlags, code, dual, key };
}

/** Whether the name itself states a qualification (any level word or award abbreviation). */
export function nameStatesAward(raw: string): boolean {
  return parseCourseName(raw).qualifier != null;
}

/** The institution partition every identity check runs in: registrable host, no www. */
export function institutionKey(institutionUrl: string): string {
  try {
    const u = new URL(institutionUrl.includes("://") ? institutionUrl.trim() : `https://${institutionUrl.trim()}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return institutionUrl.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

/**
 * A course's own page as an identity: scheme/www/fragment/tracking/trailing-slash insensitive.
 * null when the URL is the institution home page (AgentCIS rows, and list-page fallbacks), which
 * identifies nothing.
 */
export function canonicalCourseUrl(sourceUrl: string | null | undefined, institutionUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    const u = new URL(sourceUrl.includes("://") ? sourceUrl.trim() : `https://${sourceUrl.trim()}`);
    u.protocol = "https:";
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$)/i.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    if (u.pathname === "/" && !u.search) return null;
    if (institutionUrl && institutionKey(institutionUrl) === u.hostname && u.pathname === "/") return null;
    return u.toString();
  } catch {
    return null;
  }
}
