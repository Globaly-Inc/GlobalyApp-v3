// Eligibility evaluation — pure, no DB. Same split as rankCandidates: this file decides, the
// repository fetches. Output shape follows platform-users/services/completion.ts's
// `{ label, met }[]` + percentage checklist, for the same reason it exists — one implementation,
// so the course page and the enquiry form can never show a student two different answers.
//
// This NEVER gates anything. It tells a student how well their profile lines up with a course
// and nothing more; no caller may refuse an enquiry on the strength of it. Requirements are
// scraped (`verification_status` defaults to 'unverified') and both sides store scores as free
// text, which is far too thin a basis for turning a student away.
//
// Three-state by design: "we could not tell" is a real answer and must never be reported as a
// failure, nor counted against the percentage.

export type CriterionStatus = "pass" | "fail" | "unknown";

export interface EligibilityCriterion {
  key: "min_degree" | "min_score" | "academic_test" | "language_test";
  label: string;
  /** What the course asks for, formatted for display. */
  required: string | null;
  /** What the student has, formatted for display. Null when they have nothing to compare. */
  actual: string | null;
  status: CriterionStatus;
  /** The two sides used different scales and were converted before comparing. */
  converted?: boolean;
  hint?: string;
}

export interface EligibilityVerdict {
  status: "eligible" | "not_eligible" | "unknown";
  /**
   * How much of the course's stated criteria this student meets, 0-100.
   *
   * Counted over the criteria that could actually be compared: `unknown` ones are excluded from
   * both halves of the fraction rather than counted as failures, so a thin profile reads as "we
   * checked less", not "you scored badly". Null when nothing was comparable at all.
   */
  percentage: number | null;
  criteria: EligibilityCriterion[];
  /** Which requirement row (entry pathway) this verdict is against. Null when the course lists none. */
  requirement_id: string | null;
  student_type: "domestic" | "international";
  evaluated_at: string;
}

export interface EligibilityRequirementRow {
  id: string;
  name: string | null;
  applicable_to: string | null;
  min_degree_level: string | null;
  min_score_percent: string | number | null;
  min_score_grade: string | null;
  score_type: string | null;
  min_score: string | number | null;
  description: string | null;
  academic_tests: { test_name?: string; score?: string }[] | null;
  language_tests: { test_type_name?: string; overall_score?: string }[] | null;
}

export interface EnglishRequirementRow {
  id: string;
  test_type_name: string | null;
  overall_score: string | null;
  listening_score: string | null;
  reading_score: string | null;
  writing_score: string | null;
  speaking_score: string | null;
}

export interface StudentEligibilitySnapshot {
  qualifications: {
    qualification_type: string | null;
    grading_system: string | null;
    grade_value: string | null;
    end_date: string | null;
  }[];
  languageTests: {
    test_type: string | null;
    overall_score: string | null;
    sub_scores: Record<string, unknown> | null;
  }[];
  academicTests: { test_type: string | null; overall_score: string | null }[];
}

/**
 * Score scale -> percentage.
 *
 * These are the plain linear conversions. Real institutions use their own tables and will
 * disagree at the margins, which is why every comparison that goes through here is reported with
 * `converted: true` and both raw values echoed, rather than presented as authoritative.
 *
 * Course side allows percentage|gpa_4|gpa_10|cgpa (CHECK on extraction_eligibility_requirements);
 * student side adds gpa_5|gpa_7 (qualification-dialog's GRADING_SYSTEMS). Both sets are covered.
 * letter_grade | pass_fail | other have no numeric meaning and are deliberately absent — they
 * resolve to `unknown`.
 */
const TO_PERCENT: Record<string, (v: number) => number> = {
  percentage: (v) => v,
  gpa_4: (v) => (v / 4) * 100,
  gpa_5: (v) => (v / 5) * 100,
  gpa_7: (v) => (v / 7) * 100,
  gpa_10: (v) => (v / 10) * 100,
  // CGPA in this dataset is the 10-point Indian scale — the same conversion as gpa_10.
  cgpa: (v) => (v / 10) * 100,
};

/** Requirement column -> the band's display name. */
const BAND_KEYS = [
  ["listening_score", "Listening"],
  ["reading_score", "Reading"],
  ["writing_score", "Writing"],
  ["speaking_score", "Speaking"],
] as const;

/**
 * Band lookup, insensitive to how the key was spelled.
 *
 * The student's `sub_scores` jsonb is keyed by whatever the profile dialog derived from its field
 * label — `label.toLowerCase().replace(/[^a-z]+/g, "_")`, so "Listening" is stored as `listening`.
 * Reading it back as `"Listening"` matched nothing, and a student with all four bands filled in was
 * reported as "has not provided" on every one of them.
 *
 * Stripping to letters on both sides absorbs that and any future spelling: `listening`,
 * `Listening`, `listening_score` and `Listening Score` all resolve to the same band.
 */
function bandScore(subScores: Record<string, unknown> | null | undefined, band: string): string | undefined {
  if (!subScores) return undefined;
  const wanted = band.toLowerCase().replace(/[^a-z]/g, "");
  for (const [key, value] of Object.entries(subScores)) {
    if (key.toLowerCase().replace(/[^a-z]/g, "").replace(/score$/, "") === wanted) {
      return value == null ? undefined : String(value);
    }
  }
  return undefined;
}

/** First number in a free-text score. "6.0-6.5" -> 6, "6.5 overall" -> 6.5, "Credit" -> null. */
export function parseScore(text: string | number | null | undefined): number | null {
  if (text == null) return null;
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  const match = /-?\d+(\.\d+)?/.exec(text);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/** Strip everything but letters and digits so "Bachelor's" and "bachelor" are the same key. */
export function normalizeKey(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Do two free-text test names refer to the same test?
 *
 * ponytail: two-way normalised substring, so "IELTS" matches "IELTS Academic" and "TOEFL"
 * matches "TOEFL iBT" — which is every real case in the data. Resolve both sides against
 * `public.tests.name` if this ever has to tell "Cambridge C1" from "Cambridge C2", which it
 * currently declines to do (neither contains the other, so they simply do not match).
 */
function sameTest(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeKey(a);
  const y = normalizeKey(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

function toPercent(value: number | null, scale: string | null): number | null {
  if (value == null || !scale) return null;
  const fn = TO_PERCENT[scale];
  return fn ? fn(value) : null;
}

/** The student's highest qualification: best degree rank, most recent on a tie. */
function highestQualification(
  quals: StudentEligibilitySnapshot["qualifications"],
  ladder: Map<string, number>,
) {
  let best: (typeof quals)[number] | null = null;
  let bestRank = -1;
  for (const q of quals) {
    const rank = ladder.get(normalizeKey(q.qualification_type)) ?? -1;
    if (rank > bestRank || (rank === bestRank && (q.end_date ?? "") > (best?.end_date ?? ""))) {
      best = q;
      bestRank = rank;
    }
  }
  return { qualification: best, rank: bestRank };
}

function degreeCriterion(
  req: EligibilityRequirementRow,
  student: StudentEligibilitySnapshot,
  ladder: Map<string, number>,
): EligibilityCriterion | null {
  if (!req.min_degree_level) return null;

  const requiredRank = ladder.get(normalizeKey(req.min_degree_level));
  const { qualification, rank } = highestQualification(student.qualifications, ladder);
  const base = { key: "min_degree" as const, label: "Minimum degree", required: req.min_degree_level };

  // An unrecognised label on either side is not evidence of anything. `other` is seeded at the
  // bottom of degree_levels but is a bucket, not a rank, so the loader leaves it out of the map.
  if (requiredRank == null) {
    return { ...base, actual: qualification?.qualification_type ?? null, status: "unknown", hint: "This course's minimum degree could not be recognised." };
  }
  if (!qualification || rank < 0) {
    return { ...base, actual: null, status: "unknown", hint: "Add your education background to check this." };
  }
  return {
    ...base,
    actual: qualification.qualification_type,
    status: rank >= requiredRank ? "pass" : "fail",
  };
}

function scoreCriterion(
  req: EligibilityRequirementRow,
  student: StudentEligibilitySnapshot,
  ladder: Map<string, number>,
): EligibilityCriterion | null {
  // score_type + min_score is the newer pair; min_score_percent is the legacy one and is always
  // a percentage. min_score_grade ("Credit", "Distinction") carries no number and is display-only.
  const required = req.score_type && req.min_score != null
    ? { value: parseScore(req.min_score), scale: req.score_type }
    : req.min_score_percent != null
      ? { value: parseScore(req.min_score_percent), scale: "percentage" }
      : null;
  if (!required || required.value == null) return null;

  const label = "Minimum score";
  const requiredLabel = required.scale === "percentage" ? `${required.value}%` : `${required.value} (${required.scale})`;
  const { qualification } = highestQualification(student.qualifications, ladder);

  const studentValue = parseScore(qualification?.grade_value);
  const studentScale = qualification?.grading_system ?? null;
  if (studentValue == null || !studentScale) {
    return {
      key: "min_score",
      label,
      required: requiredLabel,
      actual: qualification?.grade_value ?? null,
      status: "unknown",
      hint: "Add a numeric grade and grading system to your education background to check this.",
    };
  }

  const requiredPct = toPercent(required.value, required.scale);
  const studentPct = toPercent(studentValue, studentScale);
  const actualLabel = studentScale === "percentage" ? `${studentValue}%` : `${studentValue} (${studentScale})`;
  if (requiredPct == null || studentPct == null) {
    return {
      key: "min_score",
      label,
      required: requiredLabel,
      actual: actualLabel,
      status: "unknown",
      hint: "This grading system can't be compared numerically.",
    };
  }

  return {
    key: "min_score",
    label,
    required: requiredLabel,
    actual: actualLabel,
    status: studentPct >= requiredPct ? "pass" : "fail",
    converted: required.scale !== studentScale,
  };
}

/** One criterion per required test, matched against whatever the student has recorded. */
function testCriteria(
  key: "academic_test" | "language_test",
  required: { name: string | null | undefined; score: string | null | undefined }[],
  held: { test_type: string | null; overall_score: string | null }[],
): EligibilityCriterion[] {
  const out: EligibilityCriterion[] = [];
  for (const r of required) {
    const requiredScore = parseScore(r.score);
    if (!r.name || requiredScore == null) continue;

    const match = held.find((h) => sameTest(h.test_type, r.name));
    const heldScore = parseScore(match?.overall_score);
    const base = { key, label: r.name, required: `≥ ${requiredScore}` };

    if (!match || heldScore == null) {
      out.push({
        ...base,
        actual: match?.overall_score ?? null,
        status: "unknown",
        hint: `Add your ${r.name} score to check this.`,
      });
      continue;
    }
    out.push({ ...base, actual: String(heldScore), status: heldScore >= requiredScore ? "pass" : "fail" });
  }
  return out;
}

/**
 * The course's English bar. It sits on the course, not on a requirement row (see
 * course-entry-requirements-card.tsx), so it is evaluated once and appended to every pathway.
 *
 * A missing test is `unknown`, never `fail` — the student may have one booked
 * (`platform_user_language_tests.test_status`).
 */
function englishCriteria(
  reqs: EnglishRequirementRow[],
  student: StudentEligibilitySnapshot,
): EligibilityCriterion[] {
  const out: EligibilityCriterion[] = [];
  for (const req of reqs) {
    const name = req.test_type_name ?? "English test";
    const match = student.languageTests.find((t) => sameTest(t.test_type, req.test_type_name));

    const overall = parseScore(req.overall_score);
    if (overall != null) {
      const held = parseScore(match?.overall_score);
      out.push(
        held == null
          ? { key: "language_test", label: name, required: `≥ ${overall}`, actual: match?.overall_score ?? null, status: "unknown", hint: `Add your ${name} score to check this.` }
          : { key: "language_test", label: name, required: `≥ ${overall}`, actual: String(held), status: held >= overall ? "pass" : "fail" },
      );
    }

    // Per-band minimums, when extraction captured them. The two sides name the bands
    // differently — columns here, the profile dialog's derived keys in the student's sub_scores
    // jsonb — so the lookup normalises rather than assuming a spelling. See bandScore.
    for (const [column, subScoreKey] of BAND_KEYS) {
      const band = parseScore(req[column]);
      if (band == null) continue;
      const held = parseScore(bandScore(match?.sub_scores, subScoreKey));
      out.push(
        held == null
          ? { key: "language_test", label: `${name} — ${subScoreKey}`, required: `≥ ${band}`, actual: null, status: "unknown", hint: `Add your ${subScoreKey.toLowerCase()} band score to check this.` }
          : { key: "language_test", label: `${name} — ${subScoreKey}`, required: `≥ ${band}`, actual: String(held), status: held >= band ? "pass" : "fail" },
      );
    }
  }
  return out;
}

function rollup(criteria: EligibilityCriterion[]): EligibilityVerdict["status"] {
  if (criteria.some((c) => c.status === "fail")) return "not_eligible";
  if (criteria.some((c) => c.status === "pass")) return "eligible";
  return "unknown";
}

/** Share of the comparable criteria that passed. Null when none were comparable. */
function scorePercentage(criteria: EligibilityCriterion[]): number | null {
  const comparable = criteria.filter((c) => c.status !== "unknown");
  if (comparable.length === 0) return null;
  return Math.round((comparable.filter((c) => c.status === "pass").length / comparable.length) * 100);
}

const RANK: Record<EligibilityVerdict["status"], number> = { eligible: 2, unknown: 1, not_eligible: 0 };

/**
 * Multiple requirement rows are alternative entry pathways, not a conjunction — a course that
 * accepts either a Bachelor's or a Diploma-plus-experience lists both. The student passes if ANY
 * pathway passes, and the verdict records which one it was judged against, so the percentage is
 * always read against a single named pathway rather than smeared across all of them.
 *
 * `requirements` must already be filtered by `applicable_to` (the caller knows the student's
 * domestic/international status; this function does not do I/O).
 */
export function evaluateEligibility(input: {
  requirements: EligibilityRequirementRow[];
  englishRequirements: EnglishRequirementRow[];
  /** Normalised degree name AND slug -> sort_order, both keys pointing at the same rank. */
  degreeLadder: Map<string, number>;
  student: StudentEligibilitySnapshot;
  studentType: "domestic" | "international";
}): EligibilityVerdict {
  const { requirements, englishRequirements, degreeLadder, student, studentType } = input;
  const evaluated_at = new Date().toISOString();
  const english = englishCriteria(englishRequirements, student);

  const pathways = requirements.map((req) => {
    const criteria = [
      degreeCriterion(req, student, degreeLadder),
      scoreCriterion(req, student, degreeLadder),
      ...testCriteria("academic_test", (req.academic_tests ?? []).map((t) => ({ name: t.test_name, score: t.score })), student.academicTests),
      ...testCriteria("language_test", (req.language_tests ?? []).map((t) => ({ name: t.test_type_name, score: t.overall_score })), student.languageTests),
      ...english,
    ].filter((c): c is EligibilityCriterion => c !== null);
    return {
      requirement_id: req.id,
      criteria,
      status: rollup(criteria),
      percentage: scorePercentage(criteria),
    };
  });

  // No academic requirement rows at all, but the course still states an English bar: that bar is
  // the whole verdict rather than being silently discarded.
  if (pathways.length === 0) {
    return {
      status: rollup(english),
      percentage: scorePercentage(english),
      criteria: english,
      requirement_id: null,
      student_type: studentType,
      evaluated_at,
    };
  }

  // Best status wins; among equally-ranked pathways the higher percentage does, so the one shown
  // is the one the student comes closest on rather than whichever the query returned first.
  const best = pathways.reduce((a, b) => {
    if (RANK[b.status] !== RANK[a.status]) return RANK[b.status] > RANK[a.status] ? b : a;
    return (b.percentage ?? -1) > (a.percentage ?? -1) ? b : a;
  });
  return {
    status: best.status,
    percentage: best.percentage,
    criteria: best.criteria,
    requirement_id: best.requirement_id,
    student_type: studentType,
    evaluated_at,
  };
}
