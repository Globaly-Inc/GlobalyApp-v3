export interface ParsedCard {
  id: string;
  /** `{slugified-name}-{id-fragment}` for the internal /course/[slug] page. */
  slug?: string;
  name: string;
  institution: string;
  degree_level?: string;
  duration?: string;
  fees?: number;
  currency?: string;
  /** How `fees` is charged — "per year", "per semester", "per credit", "total". Without it the
   * card can only guess, and a per-credit rate rendered as annual tuition is off by 30x. */
  fee_period?: string;
  country?: string;
  city?: string;
  intakes?: string[];
  study_modes?: string[];
  source_url?: string;
  /** Filled server-side from the institution record — never from model output. */
  institution_logo_url?: string | null;
  institution_cover_url?: string | null;
  institution_website?: string | null;
}

/* ── Generic UI blocks ──
 * The model emits ```block fences containing one typed JSON object; the
 * frontend maps each type to a React component. course-card/chips predate
 * this and keep their own fences for backward compatibility. */

type Action = { label: string; value: string };

export type ResponseBlock =
  | { type: "comparison"; title?: string; columns: string[]; rows: { label: string; values: string[] }[] }
  | { type: "breakdown"; title?: string; items: { title: string; description?: string }[] }
  | { type: "timeline"; title?: string; steps: { title: string; description?: string }[] }
  | { type: "recommendation"; title: string; subtitle?: string; description?: string; image_url?: string; tags?: string[]; actions?: Action[] }
  | { type: "image"; url: string; title?: string; caption?: string }
  | { type: "quick_replies"; question?: string; options: Action[] }
  // Appended by chat.service after a course search, never parsed from model text —
  // there is deliberately no validator for it, so a model-emitted "link" block (with
  // an invented URL) is dropped by toBlock's validator lookup.
  | { type: "link"; label: string; url: string }
  /**
   * The mirror image of `link`: model → server only, never rendered.
   *
   * The counsellor emits this when it judges the visitor's enquiry resolved, and the embed
   * route turns it into a transient offer to end the chat and be emailed a summary. It rides
   * the `block` fence rather than a tag of its own because BOTH strippers are tag-hardcoded —
   * `stripBlocks` here returns unknown fences to the prose, and the frontend's
   * `stripStructuredBlocks` only knows course-card/chips/block — so a bespoke tag would be
   * visible to the visitor mid-stream and would persist into the message row.
   *
   * It needs a VALIDATORS entry for exactly that reason: the entry is what lets stripBlocks
   * remove it. parseBlocks then filters it back out so it never reaches the client as UI.
   *
   * Three fields because they have three different readers:
   * - `completion_likelihood` is the judgement. Only "high" acts; "medium" is logged as a
   *   near-miss, which is the signal for tuning the instruction.
   * - `reason` is internal — why the model classified it that way. It goes to the log, never
   *   to the visitor, so it can be blunt ("three distinct questions asked, all answered").
   * - `covered` is the visitor-facing clause naming what was discussed. Different register
   *   entirely: it has to read as the counsellor talking.
   */
  | {
      type: "conclusion";
      completion_likelihood: "low" | "medium" | "high";
      reason: string;
      covered?: string;
    }
  /**
   * The second model → server only block: what the visitor said about their own background.
   *
   * Field names are verbatim from the platform_user_* tables (qualifications, language_tests,
   * academic_tests, work_experiences) so a visitor who later signs up copies across rather than
   * being translated. Arrays because every one of those tables is one-to-many.
   *
   * Like `conclusion`, it rides the `block` fence and needs a VALIDATORS entry — without one
   * `stripBlocks` returns it to the prose and the visitor reads their own data back as JSON.
   */
  | ({ type: "profile" } & VisitorProfile);

/** One entry per platform_user_qualifications row. */
export interface ProfileQualification {
  qualification_type?: string;
  degree_title?: string;
  subject_area?: string;
  institution_name?: string;
  grading_system?: string;
  grade_value?: string;
  is_current?: boolean;
  start_date?: string;
  end_date?: string;
}

/** One entry per platform_user_language_tests / platform_user_academic_tests row. */
export interface ProfileTest {
  test_status?: string;
  test_type?: string;
  overall_score?: string;
  test_date?: string;
  sub_scores?: Record<string, string>;
}

/** One entry per platform_user_work_experiences row. */
export interface ProfileWork {
  job_title?: string;
  organization_name?: string;
  is_current?: boolean;
  start_date?: string;
  end_date?: string;
}

export interface VisitorProfile {
  qualifications?: ProfileQualification[];
  language_tests?: ProfileTest[];
  academic_tests?: ProfileTest[];
  work_experiences?: ProfileWork[];
}

/** The four keys, and the only fields each accepts. Anything else the model invents is dropped. */
export const PROFILE_FIELDS = {
  qualifications: ["qualification_type", "degree_title", "subject_area", "institution_name",
    "grading_system", "grade_value", "is_current", "start_date", "end_date"],
  language_tests: ["test_status", "test_type", "overall_score", "test_date", "sub_scores"],
  academic_tests: ["test_status", "test_type", "overall_score", "test_date", "sub_scores"],
  work_experiences: ["job_title", "organization_name", "is_current", "start_date", "end_date"],
} as const;

export type ProfileKey = keyof typeof PROFILE_FIELDS;
export const PROFILE_KEYS = Object.keys(PROFILE_FIELDS) as ProfileKey[];

/** Bounds on model output going into a database column. Generous, but not unbounded. */
const MAX_PROFILE_ITEMS = 10;
const MAX_PROFILE_VALUE = 200;

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isActions = (v: unknown): v is Action[] =>
  Array.isArray(v) && v.length > 0 && v.every((o) => isStr(o?.label) && isStr(o?.value));

/**
 * One profile entry, stripped to fields we recognise.
 *
 * Returns null rather than throwing, and drops unknown keys instead of rejecting the whole entry:
 * a model that adds `"confidence": 0.8` to an otherwise perfect qualification should cost us the
 * extra key, not the qualification. This is the boundary between model prose and a database
 * column, so nothing crosses it that is not a known field holding a string, a boolean, or — for
 * sub_scores alone — a flat object of strings.
 */
function cleanProfileEntry(raw: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.includes(k)) continue;
    if (typeof v === "boolean") { out[k] = v; continue; }
    if (isStr(v)) { out[k] = (v as string).slice(0, MAX_PROFILE_VALUE); continue; }
    if (k === "sub_scores" && v && typeof v === "object" && !Array.isArray(v)) {
      const scores: Record<string, string> = {};
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (isStr(sv)) scores[sk.slice(0, 40)] = (sv as string).slice(0, MAX_PROFILE_VALUE);
        else if (typeof sv === "number") scores[sk.slice(0, 40)] = String(sv);
      }
      if (Object.keys(scores).length) out[k] = scores;
      continue;
    }
    // A number where a score was expected is the model being helpful, not wrong. The
    // platform_user_* columns are text, so this matches them rather than fighting it.
    if (typeof v === "number") out[k] = String(v);
  }

  // An entry with nothing left is not an entry. Without this a bare `{}` would be merged in and
  // then dedupe against every future mention, swallowing the real one.
  return Object.keys(out).length ? out : null;
}

/**
 * The whole profile block, cleaned. Null when the model emitted nothing usable.
 *
 * Exported because the writer needs the same cleaning applied to anything it merges, and two
 * implementations of "what counts as a valid entry" would drift on the first change.
 */
export function cleanProfile(raw: Record<string, unknown>): VisitorProfile | null {
  const out: Record<string, Record<string, unknown>[]> = {};

  for (const key of PROFILE_KEYS) {
    const value = raw[key];
    // A single qualification is the case a model is likeliest to emit as a bare object rather
    // than a one-element array. Rejecting that dropped the entry with no trace anywhere — the
    // column just stayed null — so it is accepted and wrapped instead.
    const list = Array.isArray(value)
      ? value
      : value && typeof value === "object" ? [value] : null;
    if (!list) continue;
    const entries = list
      .slice(0, MAX_PROFILE_ITEMS)
      .map((e) => cleanProfileEntry(e, PROFILE_FIELDS[key]))
      .filter((e): e is Record<string, unknown> => e !== null);
    if (entries.length) out[key] = entries;
  }

  return Object.keys(out).length ? (out as VisitorProfile) : null;
}

/**
 * One conclusion judgement, cleaned. Null when the model emitted nothing usable.
 *
 * Exported for the same reason as cleanProfile: the dedicated classifier call and the (retired,
 * but still leak-guarded) in-band block must agree on what counts as valid, and two copies of
 * that rule would drift on the first change.
 */
export function cleanConclusion(raw: Record<string, unknown>): ConclusionSignal | null {
  if (!LIKELIHOODS.has(raw.completion_likelihood as string)) return null;
  if (!isStr(raw.reason)) return null;
  // `covered` is DROPPED when oversized, not truncated and not fatal. Truncating would cut a
  // visitor-facing clause mid-word onto the card; rejecting the whole signal would throw away a
  // sound judgement over one optional display field. Without it the card falls back to its own
  // body copy, which is already the path for a model that omitted `covered` entirely.
  const covered = isStr(raw.covered) && (raw.covered as string).length <= MAX_CONCLUSION_COVERED
    ? (raw.covered as string)
    : null;
  return {
    likelihood: raw.completion_likelihood as ConclusionSignal["likelihood"],
    reason: (raw.reason as string).slice(0, MAX_CONCLUSION_REASON),
    covered,
  };
}

/** Per-type shape checks — just enough that the frontend can render without crashing. */
const VALIDATORS: Record<string, (b: Record<string, unknown>) => boolean> = {
  comparison: (b) =>
    Array.isArray(b.columns) && b.columns.every(isStr) &&
    Array.isArray(b.rows) && b.rows.every((r) => isStr(r?.label) && Array.isArray(r?.values)),
  breakdown: (b) => Array.isArray(b.items) && b.items.length > 0 && b.items.every((i) => isStr(i?.title)),
  timeline: (b) => Array.isArray(b.steps) && b.steps.length > 0 && b.steps.every((s) => isStr(s?.title)),
  recommendation: (b) => isStr(b.title) && (b.actions === undefined || isActions(b.actions)),
  image: (b) => isStr(b.url) && /^https?:\/\//.test(b.url as string),
  quick_replies: (b) => isActions(b.options),
  // Server-consumed, never rendered. `covered` is bounded because it IS shown to the visitor,
  // and a model that decides to write an essay there should be ignored rather than have its
  // essay put on screen. `reason` only reaches the log, so it gets more room.
  // Valid only if at least one of the four arrays survives cleaning. A block with four empty
  // arrays would otherwise validate, get stripped from the prose, and write nothing — the worst
  // outcome, because it looks like it worked.
  profile: (b) => cleanProfile(b) !== null,
  conclusion: (b) => cleanConclusion(b) !== null,
};

const LIKELIHOODS = new Set(["low", "medium", "high"]);
/** Internal classification note — logged, never shown. */
const MAX_CONCLUSION_REASON = 300;
/** The clause the visitor actually reads in the offer. */
const MAX_CONCLUSION_COVERED = 200;

/** Types the client never renders, so parseBlocks must not hand them over. */
const SERVER_ONLY_BLOCKS = new Set(["conclusion", "profile"]);

// ponytail: model drifts on fence tags (```json / bare ```) and drops "type" on
// quick_replies — accept any fence whose JSON validates as a known block.
const FENCE_RE = /```(?!course-card|chips)[\w-]*[ \t]*\n?([\s\S]*?)```/g;

/** Parse one fence body into a validated block, or null. */
function toBlock(raw: string): ResponseBlock | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.type === undefined && isActions(parsed.options)) parsed.type = "quick_replies";
    const validate = typeof parsed.type === "string" ? VALIDATORS[parsed.type] : undefined;
    return validate?.(parsed) ? (parsed as unknown as ResponseBlock) : null;
  } catch {
    return null;
  }
}

/**
 * Extract typed-block fences from Gemini output. Unknown/malformed types are dropped.
 *
 * Server-only types are dropped here too, rather than at the call sites: filtering in one
 * place is the only version a third caller cannot forget, and forgetting means shipping a
 * control signal to the browser as a block it has no component for.
 */
export function parseBlocks(text: string): ResponseBlock[] {
  const blocks: ResponseBlock[] = [];
  for (const match of text.matchAll(FENCE_RE)) {
    const block = toBlock(match[1]);
    if (block && !SERVER_ONLY_BLOCKS.has(block.type)) blocks.push(block);
  }
  return blocks;
}

/** The counsellor's read on whether the visitor has got what they came for. */
export interface ConclusionSignal {
  likelihood: "low" | "medium" | "high";
  /** Internal — why it classified this way. For the log, never the visitor. */
  reason: string;
  /** Visitor-facing clause naming what was discussed. Absent when the model omitted it. */
  covered: string | null;
}

/**
 * The counsellor's judgement about whether the conversation has run its course, if it made one.
 *
 * Null when the model said nothing, which is the normal case and the cheap one — it is
 * instructed to stay silent while the answer is clearly "low", so most turns cost no tokens
 * here at all.
 *
 * This deliberately returns the whole signal rather than a boolean: "medium" is worth logging
 * as a near-miss even though it never acts, and that log is the only way to tell an instruction
 * that is too shy from one that is too eager.
 *
 * Whether the offer is actually SHOWN is not decided here. The model proposes; the server's
 * state, cooldown and email checks decide (see visitor.service decidePrompt).
 */
export function parseConclusion(text: string): ConclusionSignal | null {
  for (const match of text.matchAll(FENCE_RE)) {
    const block = toBlock(match[1]);
    if (block?.type === "conclusion") {
      // Re-cleaned rather than reused: toBlock returns the raw parsed JSON, so the validator's
      // bounded copy is discarded. Same reasoning as parseProfile.
      return cleanConclusion(block as unknown as Record<string, unknown>);
    }
  }
  return null;
}

/**
 * What the visitor told us about themselves on this turn, or null.
 *
 * Merged into whatever the row already holds rather than replacing it — a visitor mentions their
 * degree on message 2 and their IELTS on message 7, and each turn's block carries only what that
 * turn revealed. See visitor.service `recordProfile`.
 */
export function parseProfile(text: string): VisitorProfile | null {
  for (const match of text.matchAll(FENCE_RE)) {
    const block = toBlock(match[1]);
    if (block?.type === "profile") {
      // Cleaned again here, NOT reused from the validator: toBlock returns the raw parsed JSON
      // on success, so the validator's cleaned copy is discarded. Returning `block` directly
      // would carry every invented key and unbounded string straight into a jsonb column.
      return cleanProfile(block as unknown as Record<string, unknown>);
    }
  }
  return null;
}

/** Extract COURSE_CARD JSON blocks from Gemini output. */
export function parseCards(text: string): ParsedCard[] {
  const cards: ParsedCard[] = [];
  const regex = /```course-card\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.id && parsed.name && parsed.institution) {
        cards.push(parsed as ParsedCard);
      }
    } catch { /* skip malformed */ }
  }
  return cards;
}

/** Extract CHIPS array from Gemini output. */
export function parseChips(text: string): string[] {
  const match = /```chips\n([\s\S]*?)\n```/.exec(text);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}

/** Remove structured blocks from display text (they're sent as separate SSE events). */
export function stripBlocks(text: string): string {
  return text
    .replace(/```(?:course-card|chips)\n[\s\S]*?\n```/g, "")
    // Only strip generic fences that actually parse as a block — real code
    // snippets in prose stay untouched.
    .replace(FENCE_RE, (full, body: string) => (toBlock(body) ? "" : full))
    .trim();
}
