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
import type { CustomField } from "../../institution-memory/schemas/profile.schema.js";

/** The jsonb arrays, which are already the right shape, plus whatever scalars map cleanly. */
type VisitorLike = Pick<
  VisitorRow,
  "name" | "age" | "gender" | "nationality" | "nationality_raw" | "study_preference"
  | "qualifications" | "language_tests" | "academic_tests" | "work_experiences"
>;

const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

/**
 * The visitor row, with everything this institution no longer collects stripped out.
 *
 * The collection rules gate what the extractor WRITES. They did not gate what gets read back, so
 * a field switched off yesterday kept flowing into today's prompt and memory query from rows
 * written while it was still on. Withdrawing permission has to apply to the data already held,
 * or "stop collecting this" means "stop collecting more of this".
 *
 * `allowed = null` means the rules could not be read (see StoredProfile.degraded). Everything is
 * stripped in that case, on the same reasoning as the extractor's empty keep-list: a blip costs
 * the counsellor its memory of this visitor for a turn, which is recoverable, where guessing
 * wrong about permissions is not.
 *
 * `nationality_raw` is not a collectable field of its own — it is the visitor's wording for
 * `nationality` — so it lives or dies with it.
 */
export function applyCollectionRules(
  v: VisitorLike | null | undefined,
  allowed: readonly string[] | null | undefined,
): VisitorLike | null {
  if (!v) return null;
  if (allowed === undefined) return v; // no institution — the built-in behaviour, unchanged
  const ok = (field: string) => !!allowed?.includes(field);
  return {
    name: ok("name") ? v.name : null,
    age: ok("age") ? v.age : null,
    gender: ok("gender") ? v.gender : null,
    nationality: ok("nationality") ? v.nationality : null,
    nationality_raw: ok("nationality") ? v.nationality_raw : null,
    study_preference: ok("study_preference") ? v.study_preference : null,
    qualifications: ok("qualifications") ? v.qualifications : null,
    language_tests: ok("language_tests") ? v.language_tests : null,
    academic_tests: ok("academic_tests") ? v.academic_tests : null,
    work_experiences: ok("work_experiences") ? v.work_experiences : null,
  };
}

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
/**
 * Where this visitor is in their journey, for the prompt's STAGE block.
 *
 * That block has existed since phase 8 (exploring → widen the field; narrowing → compare two or
 * three; applying → deadlines and documents; post_offer → visa and funding) but ONLY a platform
 * session ever set it: there the model writes it through `update_student_context`. A widget
 * visitor has no tool loop and no such call, so the one instruction that changes how directive
 * the counsellor is never rendered for the public surfaces at all.
 *
 * Inferred from the turn instead, and from the turn FIRST: what they just asked is the only
 * signal that moves. Someone with a stored subject who starts asking about deadlines has moved
 * on, and "narrowing" would keep comparing courses at them.
 *
 * ponytail: word match, no classifier. A wrong stage costs one reply's posture, never an answer —
 * every other rule in the prompt still applies. Upgrade to the extractor if it visibly misreads.
 */
function stageFor(v: VisitorLike, asked: string): CounsellingContext["stage"] {
  const text = ` ${asked.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  // Checked before `applying`: an offer message usually names the application too ("I applied and
  // got an offer"), and the later stage is the true one.
  if (/\b(offer letter|got an offer|have an offer|my offer|accepted me|been accepted|coe|visa application|enrolled)\b/.test(text)) return "post_offer";
  if (/\b(apply|applying|application|applications|admission|admissions|enrol|enroll|deadline|deadlines|document|documents|transcript|transcripts|sop|statement of purpose|entry requirement|entry requirements)\b/.test(text)) return "applying";
  // A subject on file is the narrowing signal: they are past "what is out there".
  return v.study_preference ? "narrowing" : "exploring";
}

export function visitorCounsellingContext(
  v: VisitorLike | null | undefined,
  /** The institution's custom fields. A subject it has deleted is not read back. */
  custom: readonly CustomField[] = [],
  /** Their answers, from ai_widget_visitor_custom_values — keyed by field_key. */
  values: Readonly<Record<string, string>> = {},
  /** This turn's message. Absent — a caller that has no turn — means no stage is inferred, which
   *  keeps a context with nothing else in it null, as before. */
  asked = "",
): CounsellingContext | null {
  if (!v) return null;
  const ctx: CounsellingContext = {};
  if (asked) ctx.stage = stageFor(v, asked);
  if (v.study_preference) ctx.interests = [v.study_preference];
  const notes: string[] = [];
  if (v.age) notes.push(`age ${v.age}`);
  if (v.name) notes.push(`their name is ${v.name}`);
  // Labelled, because the storage key is ours and the label is the institution's own words —
  // "Preferred intake: September 2027" is readable guidance, "preferred_intake" is a column.
  // Driven by the field list rather than the bag's keys, so a deleted subject stops being read
  // back even though the value is still on the row.
  for (const f of custom) {
    const value = values[f.key];
    if (typeof value === "string" && value) notes.push(`${f.label}: ${value}`);
  }
  if (notes.length) ctx.notes = notes;
  return Object.keys(ctx).length ? ctx : null;
}
