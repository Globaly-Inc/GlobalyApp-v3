// What a widget visitor has already told the counsellor, shaped so the EXISTING prompt and
// retrieval paths can read it.
//
// The gap this closes: extractProfile writes a visitor's nationality, qualifications and test
// scores onto ai_widget_visitors every turn, and the guest chat path then passed
// `profile: null` — so none of it ever reached the model. A visitor who gave their IELTS on
// message two was asked for it again on message five, and situation-bound institution guidance
// could never match because the retrieval query had no situation in it.
//
// Deliberately NO new prompt section. The visitor's structured background maps onto
// ProfileContext field for field (the jsonb columns were named after platform_user_* for exactly
// this), and the loose scalars map onto CounsellingContext, which already renders as "WHAT THIS
// CONVERSATION HAS ESTABLISHED" and already feeds rag.situationText. Two renderers that exist,
// zero new ones to keep in step.
//
// Scope: one visitor_key, one widget, read on that visitor's own turn. This must never be
// aggregated, embedded, or retrieved by similarity — see the Rack design note on why
// ai_widget_visitors may not gain a vector column.

import type { ProfileContext } from "../repositories/knowledge.repository.js";
import type { CounsellingContext } from "../repositories/sessions.repository.js";
import type { VisitorRow } from "../services/visitor.service.js";

/** The jsonb arrays, which are already the right shape, plus whatever scalars map cleanly. */
type VisitorLike = Pick<
  VisitorRow,
  "name" | "age" | "gender" | "nationality" | "nationality_raw" | "study_preference"
  | "qualifications" | "language_tests" | "academic_tests" | "work_experiences"
>;

const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

/**
 * The visitor's structured background as a ProfileContext, or null when they have told us
 * nothing yet.
 *
 * `individual_category` is left null ON PURPOSE, and it is the one field that matters most here:
 * buildSystemPrompt only emits the PROFILE COMPLETION nag when it reads "student", and a widget
 * visitor has no platform profile to complete. Everything else the block renders — nationality,
 * qualifications, tests, work — is real, and ELIGIBILITY CHECK keys off the same data, which is
 * the point: a visitor who said "IELTS 6.0" should be told which of our courses that meets.
 */
export function visitorProfileContext(v: VisitorLike | null | undefined): ProfileContext | null {
  if (!v) return null;
  const qualifications = list(v.qualifications);
  const language_tests = list(v.language_tests);
  const academic_tests = list(v.academic_tests);
  const work_experiences = list(v.work_experiences);
  const nationality = v.nationality ?? v.nationality_raw ?? null;

  if (!nationality && !v.gender
    && !qualifications.length && !language_tests.length && !academic_tests.length && !work_experiences.length) {
    return null;
  }

  return {
    profile: {
      nationality,
      country_of_residence: null,
      city_of_residence: null,
      date_of_birth: null,
      gender: v.gender ?? null,
      degree_level: null,
      // Never "student": that string is what turns on the profile-completion nag, and there is
      // no profile for a visitor to complete.
      individual_category: null,
      preferred_destinations: null,
      fields_of_study: null,
      budget_min: null,
      budget_max: null,
      budget_currency: null,
      expected_start_date: null,
    },
    qualifications,
    language_tests,
    academic_tests,
    work_experiences,
  } as ProfileContext;
}

/**
 * The loose scalars, as the session context the prompt already renders as "treat as known,
 * never re-ask".
 *
 * `age` goes to notes rather than anywhere structured because it is stored VERBATIM ("early
 * 30s") and nothing downstream may treat it as a number. Gender is omitted entirely: it is off
 * by default in the Rack's collection rules, and repeating it back to a visitor is exactly the
 * behaviour those rules exist to prevent — if it was collected, the profile block above carries
 * it for eligibility purposes and that is enough.
 */
export function visitorCounsellingContext(v: VisitorLike | null | undefined): CounsellingContext | null {
  if (!v) return null;
  const ctx: CounsellingContext = {};
  if (v.study_preference) ctx.interests = [v.study_preference];
  const notes: string[] = [];
  if (v.age) notes.push(`age ${v.age}`);
  if (v.name) notes.push(`their name is ${v.name}`);
  if (notes.length) ctx.notes = notes;
  return Object.keys(ctx).length ? ctx : null;
}
