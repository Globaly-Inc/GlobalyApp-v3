// Fee-to-course fuzzy matcher for bulk fee extraction.
// Pure functions, no external deps.

const STRIP_PREFIXES = [
  "bachelor of",
  "master of",
  "diploma of",
  "graduate certificate in",
  "graduate diploma of",
  "certificate iii in",
  "certificate iv in",
  "advanced diploma of",
];

/** Lowercase + strip common degree prefixes */
function normalize(name: string): string {
  let s = name.toLowerCase().trim();
  for (const p of STRIP_PREFIXES) {
    if (s.startsWith(p)) {
      s = s.slice(p.length).trim();
      break;
    }
  }
  return s;
}

/** The degree-level prefix a name explicitly states, if any (e.g. "bachelor of"). */
function degreeLevelOf(name: string): string | null {
  const s = name.toLowerCase().trim();
  return STRIP_PREFIXES.find((p) => s.startsWith(p)) ?? null;
}

function tokenize(s: string): string[] {
  return s.match(/[a-z0-9]+/g) || [];
}

function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setB = new Set(b);
  const shared = a.filter((w) => setB.has(w)).length;
  const all = new Set([...a, ...b]);
  return all.size === 0 ? 0 : shared / all.size;
}

/** Levenshtein distance between two strings */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // ponytail: single-row DP, upgrade to Myers' bit-parallel if perf matters
  const prev = new Uint16Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] =
        a[i - 1] === b[j - 1]
          ? prevDiag
          : 1 + Math.min(prevDiag, prev[j - 1], prev[j]);
      prevDiag = tmp;
    }
  }
  return prev[n];
}

/** Normalized Levenshtein ratio (0 = identical, 1 = completely different) */
function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 0 : levenshtein(a, b) / maxLen;
}

const MATCH_THRESHOLD = 0.5;

/**
 * Score how well a course name matches a fee's course name.
 * Returns 0-1, higher = better match.
 * Combined: 0.7 * token_overlap + 0.3 * (1 - levenshtein_ratio)
 */
export function fuzzyMatchCourseToFee(
  courseName: string,
  feeCourseName: string,
): number {
  // Both names explicitly state a degree level and they differ (e.g. "Bachelor of Nursing"
  // vs "Master of Nursing") — normalize() strips both prefixes before comparing, so without
  // this guard two different-level courses on the same subject score as a near-exact match
  // and a fee can get linked to the wrong one. Only disqualifies when BOTH sides state a
  // level — a fee row like "Nursing" (no prefix) still matches "Bachelor of Nursing" fine.
  const courseLevel = degreeLevelOf(courseName);
  const feeLevel = degreeLevelOf(feeCourseName);
  if (courseLevel && feeLevel && courseLevel !== feeLevel) return 0;

  const normCourse = normalize(courseName);
  const normFee = normalize(feeCourseName);
  const tokCourse = tokenize(normCourse);
  const tokFee = tokenize(normFee);
  const overlap = tokenOverlap(tokCourse, tokFee);
  const levRatio = levenshteinRatio(normCourse, normFee);
  return 0.7 * overlap + 0.3 * (1 - levRatio);
}

interface FeeEntry {
  course_name: string;
  student_type: string;
  amount: number;
  currency: string;
  period: string;
}

interface CourseEntry {
  id: string;
  name: string;
}

interface MatchResult {
  courseId: string;
  fee: FeeEntry;
}

/**
 * Match each fee to the highest-scoring course above threshold.
 * A course can receive multiple fees (e.g. domestic + international).
 * Fees that don't clear the threshold are returned as `unmatched` rather than dropped —
 * the caller should still persist them (unlinked) so an admin can review and manually link
 * them from the Fees tab, instead of the extracted figure just vanishing with no trace.
 */
export function matchFeesToCourses(
  fees: FeeEntry[],
  courses: CourseEntry[],
): { matched: MatchResult[]; unmatched: FeeEntry[] } {
  const matched: MatchResult[] = [];
  const unmatched: FeeEntry[] = [];

  for (const fee of fees) {
    let bestId: string | null = null;
    let bestScore = 0;

    for (const course of courses) {
      const score = fuzzyMatchCourseToFee(course.name, fee.course_name);
      if (score > bestScore) {
        bestScore = score;
        bestId = course.id;
      }
    }

    if (bestId && bestScore >= MATCH_THRESHOLD) {
      matched.push({ courseId: bestId, fee });
    } else {
      unmatched.push(fee);
    }
  }

  return { matched, unmatched };
}

// --- self-check ---
function selfCheck(): void {
  // levenshtein basics
  console.assert(levenshtein("", "") === 0, "lev empty");
  console.assert(levenshtein("abc", "abc") === 0, "lev equal");
  console.assert(levenshtein("abc", "abd") === 1, "lev one sub");
  console.assert(levenshtein("kitten", "sitting") === 3, "lev classic");

  // normalize strips prefixes
  console.assert(
    normalize("Bachelor of Computer Science") === "computer science",
    "norm bachelor",
  );
  console.assert(
    normalize("Master of Business Administration") ===
      "business administration",
    "norm master",
  );
  console.assert(
    normalize("Certificate III in Carpentry") === "carpentry",
    "norm cert iii",
  );

  // exact match → high score
  const exact = fuzzyMatchCourseToFee("Computer Science", "Computer Science");
  console.assert(exact > 0.95, `exact match score should be ~1, got ${exact}`);

  // prefix-stripped match → high score, when only ONE side states a degree level
  // (fee tables commonly omit it, e.g. a row just labeled "Nursing")
  const stripped = fuzzyMatchCourseToFee("Bachelor of Nursing", "Nursing");
  console.assert(
    stripped > 0.7,
    `level-less fee should still match its course, got ${stripped}`,
  );

  // same subject, explicit DIFFERENT degree levels → must NOT match. This was the actual
  // bug: normalize() stripped both prefixes before comparing, so "Bachelor of Nursing" and
  // "Master of Nursing" scored as a near-exact match and a fee could link to the wrong level.
  const crossLevel = fuzzyMatchCourseToFee("Bachelor of Nursing", "Master of Nursing");
  console.assert(
    crossLevel === 0,
    `different degree levels must not match, got ${crossLevel}`,
  );

  // unrelated → low score
  const unrelated = fuzzyMatchCourseToFee(
    "Bachelor of Computer Science",
    "Diploma of Hairdressing",
  );
  console.assert(
    unrelated < MATCH_THRESHOLD,
    `unrelated should be below threshold, got ${unrelated}`,
  );

  // matchFeesToCourses end-to-end
  const courses: CourseEntry[] = [
    { id: "c1", name: "Bachelor of Computer Science" },
    { id: "c2", name: "Master of Nursing" },
    { id: "c3", name: "Diploma of Business" },
    { id: "c4", name: "Bachelor of Nursing" },
  ];
  const fees: FeeEntry[] = [
    {
      course_name: "Computer Science",
      student_type: "domestic",
      amount: 10000,
      currency: "AUD",
      period: "Per Year",
    },
    {
      course_name: "Computer Science",
      student_type: "international",
      amount: 30000,
      currency: "AUD",
      period: "Per Year",
    },
    {
      // No degree prefix — should match c2, never c4, purely on subject overlap
      course_name: "Master of Nursing",
      student_type: "domestic",
      amount: 8000,
      currency: "AUD",
      period: "Per Year",
    },
    {
      course_name: "Underwater Basket Weaving",
      student_type: "domestic",
      amount: 5000,
      currency: "AUD",
      period: "Per Year",
    },
  ];
  const { matched, unmatched } = matchFeesToCourses(fees, courses);

  // Both CS fees should match c1
  const csMatches = matched.filter((m) => m.courseId === "c1");
  console.assert(
    csMatches.length === 2,
    `CS should get 2 fees, got ${csMatches.length}`,
  );

  // "Master of Nursing" fee should match c2 (Master's), never c4 (Bachelor's)
  const nurseMatches = matched.filter((m) => m.fee.course_name === "Master of Nursing");
  console.assert(
    nurseMatches.length === 1 && nurseMatches[0].courseId === "c2",
    `Master of Nursing fee should match c2 only, got ${JSON.stringify(nurseMatches)}`,
  );

  // Underwater Basket Weaving should not match anything, but should surface as unmatched
  // (not silently dropped) so an admin can review/link it manually
  const uwbwMatched = matched.filter((m) => m.fee.course_name === "Underwater Basket Weaving");
  console.assert(uwbwMatched.length === 0, "unrelated fee should not match");
  console.assert(
    unmatched.some((f) => f.course_name === "Underwater Basket Weaving"),
    "unrelated fee should be returned as unmatched, not dropped",
  );

  console.log("fee-matcher: all self-checks passed");
}

// Run when executed directly: npx tsx src/modules/superadmin/data-extraction/lib/fee-matcher.ts
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1]?.replace(/\\/g, "/").endsWith("fee-matcher.ts");
if (isDirectRun) selfCheck();
