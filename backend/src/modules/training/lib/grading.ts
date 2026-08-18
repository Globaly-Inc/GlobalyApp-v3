// Pure grading + gamification arithmetic — no database, no ambient clock, so
// every rule below is directly unit testable.
//
// Behavioural spec: V2 routes/training.ts (its inline grading loop, certLevelFor
// and awardXp), which itself ports V1's `grade-assessment` edge function.

import { randomUUID } from "node:crypto";
import {
  DEFAULT_LEVEL_THRESHOLDS,
  STREAK_BONUS_EVERY_DAYS,
  STREAK_BONUS_XP,
  VERIFICATION_CODE_PREFIX,
  FIRST_COURSE_BADGE,
  type CertificateLevel,
} from "../consts.js";

export interface Question {
  question?: string;
  options?: string[];
  correct_index?: number;
  explanation?: string;
}

/** The learner-facing shape: the correct answer is stripped, not merely unused. */
export interface PublicQuestion {
  question: string | null;
  options: string[];
}

/**
 * Project questions for a learner. `correct_index` and `explanation` are dropped
 * by rebuilding the object rather than deleting keys, so a new field added to
 * the stored question shape is excluded by default instead of leaking.
 */
export function stripAnswers(questions: readonly Question[]): PublicQuestion[] {
  return questions.map((q) => ({
    question: q.question ?? null,
    options: Array.isArray(q.options) ? q.options : [],
  }));
}

export interface GradeResult {
  correct: number;
  total: number;
  score: number;
}

/**
 * Grade against the SERVER's copy of the answers. `answers` maps the question
 * index (as a string key, exactly as V1's edge function received it) to the
 * chosen option index — it never carries a correct answer, so a learner cannot
 * self-certify by editing the request.
 *
 * An empty question list scores 0, not 100: a program with no questions has not
 * been passed by anyone.
 */
export function gradeAnswers(
  questions: readonly Question[],
  answers: Readonly<Record<string, number>>,
): GradeResult {
  let correct = 0;
  questions.forEach((q, i) => {
    if (q.correct_index !== undefined && answers[String(i)] === q.correct_index) correct += 1;
  });
  const total = questions.length;
  return { correct, total, score: total > 0 ? Math.round((correct / total) * 100) : 0 };
}

export interface LevelThresholds {
  gold: number;
  silver: number;
  bronze: number;
}

export function certLevelFor(
  score: number,
  thresholds: Partial<LevelThresholds> | null | undefined,
): CertificateLevel {
  const t = { ...DEFAULT_LEVEL_THRESHOLDS, ...(thresholds ?? {}) };
  if (score >= t.gold) return "gold";
  if (score >= t.silver) return "silver";
  if (score >= t.bronze) return "bronze";
  return "completion";
}

export interface Badge {
  id: string;
  name: string;
  earned_at: string;
}

export interface GamificationState {
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  badges: Badge[];
}

function dayOf(value: string | Date): string {
  const iso = value instanceof Date ? value.toISOString() : value;
  return iso.split("T")[0]!;
}

/**
 * V2's awardXp, made explicit and total.
 *   * same day as the last activity → streak unchanged, no bonus;
 *   * exactly the next day        → streak + 1;
 *   * anything else               → streak resets to 1;
 *   * every 7th consecutive day pays a 20 XP bonus (never on a same-day repeat).
 * `longest_streak` only ever grows.
 */
export function nextGamificationState(
  existing: GamificationState | null,
  xp: number,
  now: Date,
): GamificationState {
  const today = dayOf(now);
  const nowIso = now.toISOString();

  if (!existing) {
    return {
      total_xp: xp,
      current_streak: 1,
      longest_streak: 1,
      last_activity_date: nowIso,
      badges: [{ ...FIRST_COURSE_BADGE, earned_at: nowIso }],
    };
  }

  const last = existing.last_activity_date ? dayOf(existing.last_activity_date) : null;
  const yesterday = dayOf(new Date(now.getTime() - 86_400_000));
  const sameDay = last === today;
  const consecutive = last === yesterday;

  const streak = sameDay
    ? existing.current_streak
    : consecutive
      ? existing.current_streak + 1
      : 1;
  const bonus =
    !sameDay && streak >= STREAK_BONUS_EVERY_DAYS && streak % STREAK_BONUS_EVERY_DAYS === 0
      ? STREAK_BONUS_XP
      : 0;

  const badges = [...existing.badges];
  if (!badges.some((b) => b.id === FIRST_COURSE_BADGE.id)) {
    badges.push({ ...FIRST_COURSE_BADGE, earned_at: nowIso });
  }

  return {
    total_xp: existing.total_xp + xp + bonus,
    current_streak: streak,
    longest_streak: Math.max(existing.longest_streak, streak),
    last_activity_date: nowIso,
    badges,
  };
}

/**
 * A certificate's public identifier. Random, not derived: the row id is a serial
 * and would be trivially enumerable, which is exactly what a verification URL
 * must not be.
 */
export function newVerificationCode(): string {
  return `${VERIFICATION_CODE_PREFIX}-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}
