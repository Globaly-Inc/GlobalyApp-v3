// Typical score scales per test, keyed by the catalogue's test name — same key as
// SUB_SCORE_FIELDS in academic-test-dialog.tsx / test-score-dialog.tsx. Purely UI sugar
// (range hint + placeholder), never enforced as validation: an admin-added test not listed
// here just shows a plain "Overall Score" with no hint, which is the sane default.
type Range = [number, number];

const OVERALL_RANGES: Record<string, Range> = {
  SAT: [400, 1600],
  GMAT: [205, 805],
  ACT: [1, 36],
  GRE: [260, 340],
  LSAT: [120, 180],
  IELTS: [0, 9],
  TOEFL: [0, 120],
  PTE: [10, 90],
  Duolingo: [10, 160],
  OET: [0, 500],
};

const SUB_SCORE_RANGES: Record<string, Record<string, Range>> = {
  SAT: { Math: [200, 800], "Reading & Writing": [200, 800] },
  GMAT: { Quantitative: [60, 90], Verbal: [60, 90], "Integrated Reasoning": [1, 8], "Analytical Writing": [0, 6] },
  ACT: { English: [1, 36], Math: [1, 36], Reading: [1, 36], Science: [1, 36] },
  GRE: { Verbal: [130, 170], Quantitative: [130, 170], "Analytical Writing": [0, 6] },
  IELTS: { Reading: [0, 9], Writing: [0, 9], Listening: [0, 9], Speaking: [0, 9] },
  TOEFL: { Reading: [0, 30], Writing: [0, 30], Listening: [0, 30], Speaking: [0, 30] },
  PTE: { Reading: [10, 90], Writing: [10, 90], Listening: [10, 90], Speaking: [10, 90] },
  Duolingo: { Literacy: [10, 160], Comprehension: [10, 160], Conversation: [10, 160], Production: [10, 160] },
  OET: { Reading: [0, 500], Writing: [0, 500], Listening: [0, 500], Speaking: [0, 500] },
};

export function overallScoreRange(testType: string): Range | null {
  return OVERALL_RANGES[testType] ?? null;
}

export function subScoreRange(testType: string, label: string): Range | null {
  return SUB_SCORE_RANGES[testType]?.[label] ?? null;
}

export function rangeHint(range: Range | null): string {
  return range ? ` (${range[0]}–${range[1]})` : "";
}

export function rangePlaceholder(range: Range | null): string {
  if (!range) return "";
  return `e.g. ${Math.round((range[0] + range[1]) / 2)}`;
}
