// Fee-to-course fuzzy matcher for bulk fee extraction.
// Pure functions, no external deps.
// Covered by tests/unit/extraction-fee-matcher.test.ts, which replaced the inline
// self-check this file used to carry: the same assertions, exact rather than
// console.assert, and runnable by the suite instead of only by hand.

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
