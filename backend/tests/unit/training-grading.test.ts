// Grading, certificate levels and gamification arithmetic.
//
// Every expectation here is read off the V2 contract (routes/training.ts's
// grading loop, certLevelFor and awardXp) — the spec, not the implementation.

import { describe, expect, it } from "vitest";

import {
  certLevelFor,
  gradeAnswers,
  newVerificationCode,
  nextGamificationState,
  stripAnswers,
  type GamificationState,
  type Question,
} from "../../src/modules/training/lib/grading.js";
import { STREAK_BONUS_XP } from "../../src/modules/training/consts.js";

const QUESTIONS: Question[] = [
  { question: "1 + 1", options: ["1", "2", "3"], correct_index: 1, explanation: "obviously" },
  { question: "2 + 2", options: ["3", "4"], correct_index: 1 },
  { question: "3 + 3", options: ["6", "7"], correct_index: 0 },
  { question: "4 + 4", options: ["8", "9"], correct_index: 0 },
];

describe("stripAnswers", () => {
  it("removes correct_index and explanation from every question", () => {
    const stripped = stripAnswers(QUESTIONS);
    for (const q of stripped) {
      expect(q).not.toHaveProperty("correct_index");
      expect(q).not.toHaveProperty("explanation");
    }
    expect(stripped[0]).toEqual({ question: "1 + 1", options: ["1", "2", "3"] });
  });

  it("does not carry through a field added to the stored shape", () => {
    const withExtra = [
      { question: "q", options: ["a"], correct_index: 0, marking_notes: "secret" },
    ] as Question[];
    expect(stripAnswers(withExtra)[0]).not.toHaveProperty("marking_notes");
  });
});

describe("gradeAnswers", () => {
  it("scores from the server's correct_index, keyed by question index as a string", () => {
    expect(gradeAnswers(QUESTIONS, { "0": 1, "1": 1, "2": 0, "3": 0 })).toEqual({
      correct: 4,
      total: 4,
      score: 100,
    });
    expect(gradeAnswers(QUESTIONS, { "0": 1, "1": 1, "2": 1, "3": 1 })).toEqual({
      correct: 2,
      total: 4,
      score: 50,
    });
  });

  it("ignores a correct_index smuggled into the submitted answers", () => {
    // The body is Record<string, number>; a caller cannot inject an answer key
    // and there is nothing in the body the grader reads other than choices.
    const cheat = { "0": 0, "1": 0, "2": 1, "3": 1, correct_index: 1 } as Record<string, number>;
    expect(gradeAnswers(QUESTIONS, cheat).score).toBe(0);
  });

  it("treats a missing answer as wrong rather than throwing", () => {
    expect(gradeAnswers(QUESTIONS, {}).score).toBe(0);
  });

  it("scores an empty assessment 0, not 100", () => {
    expect(gradeAnswers([], {})).toEqual({ correct: 0, total: 0, score: 0 });
  });

  it("rounds to the nearest whole percent", () => {
    const three = QUESTIONS.slice(0, 3);
    expect(gradeAnswers(three, { "0": 1 }).score).toBe(33);
  });
});

describe("certLevelFor", () => {
  const thresholds = { gold: 95, silver: 85, bronze: 70 };

  it("maps a score onto the V2 level bands", () => {
    expect(certLevelFor(100, thresholds)).toBe("gold");
    expect(certLevelFor(95, thresholds)).toBe("gold");
    expect(certLevelFor(94, thresholds)).toBe("silver");
    expect(certLevelFor(85, thresholds)).toBe("silver");
    expect(certLevelFor(84, thresholds)).toBe("bronze");
    expect(certLevelFor(70, thresholds)).toBe("bronze");
    expect(certLevelFor(69, thresholds)).toBe("completion");
  });

  it("falls back to V2's defaults when a program has no thresholds", () => {
    expect(certLevelFor(96, null)).toBe("gold");
    expect(certLevelFor(71, undefined)).toBe("bronze");
  });
});

describe("nextGamificationState", () => {
  const day = (iso: string) => new Date(`${iso}T10:00:00.000Z`);

  const seed = (over: Partial<GamificationState> = {}): GamificationState => ({
    total_xp: 100,
    current_streak: 3,
    longest_streak: 5,
    last_activity_date: day("2026-08-16").toISOString(),
    badges: [{ id: "first_course", name: "First Course Complete", earned_at: "2026-01-01" }],
    ...over,
  });

  it("starts a new learner at streak 1 with the first_course badge", () => {
    const next = nextGamificationState(null, 35, day("2026-08-17"));
    expect(next.total_xp).toBe(35);
    expect(next.current_streak).toBe(1);
    expect(next.longest_streak).toBe(1);
    expect(next.badges.map((b) => b.id)).toEqual(["first_course"]);
  });

  it("increments the streak on a consecutive day", () => {
    const next = nextGamificationState(seed(), 25, day("2026-08-17"));
    expect(next.current_streak).toBe(4);
    expect(next.total_xp).toBe(125);
  });

  it("leaves the streak alone on a same-day repeat but still pays the XP", () => {
    const next = nextGamificationState(seed(), 25, day("2026-08-16"));
    expect(next.current_streak).toBe(3);
    expect(next.total_xp).toBe(125);
  });

  it("resets the streak after a gap", () => {
    const next = nextGamificationState(seed(), 25, day("2026-08-20"));
    expect(next.current_streak).toBe(1);
  });

  it("pays a bonus on every 7th consecutive day, never on a same-day repeat", () => {
    const onSeven = nextGamificationState(
      seed({ current_streak: 6 }),
      25,
      day("2026-08-17"),
    );
    expect(onSeven.current_streak).toBe(7);
    expect(onSeven.total_xp).toBe(100 + 25 + STREAK_BONUS_XP);

    const sameDay = nextGamificationState(
      seed({ current_streak: 7, last_activity_date: day("2026-08-17").toISOString() }),
      25,
      day("2026-08-17"),
    );
    expect(sameDay.total_xp).toBe(125);
  });

  it("never lowers longest_streak", () => {
    const next = nextGamificationState(seed({ longest_streak: 9 }), 25, day("2026-08-20"));
    expect(next.longest_streak).toBe(9);
  });

  it("does not add the first_course badge twice", () => {
    const next = nextGamificationState(seed(), 25, day("2026-08-17"));
    expect(next.badges.filter((b) => b.id === "first_course")).toHaveLength(1);
  });
});

describe("newVerificationCode", () => {
  it("is prefixed, unguessable and unique per call", () => {
    const a = newVerificationCode();
    const b = newVerificationCode();
    expect(a).toMatch(/^GC-[0-9A-F]{20}$/);
    expect(a).not.toBe(b);
  });
});
