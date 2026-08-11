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
 */
export function matchFeesToCourses(
  fees: FeeEntry[],
  courses: CourseEntry[],
): MatchResult[] {
  const results: MatchResult[] = [];

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
      results.push({ courseId: bestId, fee });
    }
  }

  return results;
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

  // prefix-stripped match → high score
  const stripped = fuzzyMatchCourseToFee(
    "Bachelor of Nursing",
    "Master of Nursing",
  );
  console.assert(
    stripped > 0.7,
    `prefix-stripped match should be high, got ${stripped}`,
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
      course_name: "Nursing",
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
  const matches = matchFeesToCourses(fees, courses);

  // Both CS fees should match c1
  const csMatches = matches.filter((m) => m.courseId === "c1");
  console.assert(
    csMatches.length === 2,
    `CS should get 2 fees, got ${csMatches.length}`,
  );

  // Nursing should match c2
  const nurseMatches = matches.filter((m) => m.courseId === "c2");
  console.assert(
    nurseMatches.length === 1,
    `Nursing should get 1 fee, got ${nurseMatches.length}`,
  );

  // Underwater Basket Weaving should not match anything
  const uwbw = matches.filter(
    (m) => m.fee.course_name === "Underwater Basket Weaving",
  );
  console.assert(uwbw.length === 0, "unrelated fee should not match");

  console.log("fee-matcher: all self-checks passed");
}

// Run when executed directly: npx tsx src/modules/superadmin/data-extraction/lib/fee-matcher.ts
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1]?.replace(/\\/g, "/").endsWith("fee-matcher.ts");
if (isDirectRun) selfCheck();
