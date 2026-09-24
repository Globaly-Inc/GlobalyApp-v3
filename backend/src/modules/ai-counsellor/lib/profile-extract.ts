import { generateText } from "../../../shared/ai/gemini.js";
import { parseModelJson } from "../../../shared/ai/parse-model-json.js";
import { cleanProfile, type VisitorProfile } from "./card-parser.js";
import { resolveCountryName } from "../../superadmin/data-extraction/lib/lookup-catalog.js";
import type { Turn } from "./conclusion-detect.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("profile-extract");

/**
 * Pull what the visitor has said about themselves out of the conversation.
 *
 * This used to ride the counsellor's reply as a server-only ```block. That failed in practice and
 * the failure mode was instructive: on a turn where the model emitted three course cards and four
 * chips it simply skipped the invisible record-keeping block, twice, across two rewrites of the
 * instruction. An obligation with no visible consequence loses to one the student can see.
 *
 * So it is its own call, with one job and nothing to trade off against. Three things fall out of
 * that which the in-band version could not have:
 * - it reads the STUDENT's words, not the counsellor's reply, which is where the facts were
 *   actually stated — no relay, no paraphrase, no risk of recording a course's requirements as
 *   the student's own grades;
 * - a small model can do it, because "return this JSON" is a far easier instruction to follow
 *   than "also append an invisible block"; and
 * - the main reply's prompt gets ~1.4k tokens shorter on every single turn.
 *
 * It reads the recent TRANSCRIPT rather than one message, which is what makes "22" after
 * "how old are you?" and "yes, 7 in each" after an IELTS question resolvable at all — but it
 * returns only what the LATEST message states. The prompt carries the weight of keeping the
 * counsellor's own words, and the visitor's already-recorded ones, out of this turn's record.
 */

/** How much conversation the extraction sees. Mirrors conclusion-detect deliberately. */
const TRANSCRIPT_TURNS = 12;
const MAX_TURN_CHARS = 600;

/**
 * Turns worth spending a call on.
 *
 * A false positive costs one cheap call returning `{}`; a false negative loses a fact for good,
 * because a message this rejects is never looked at again. So it is deliberately loose, and it
 * got much looser when the four scalar attributes were added: `study_preference` is stated with
 * the most ordinary phrasing in a course widget ("tell me about your MBA"), and age, gender and
 * nationality are open-vocabulary in a way the background terms never were.
 *
 * It matches VERBS AND FRAMING, not vocabularies — "from", "citizen", "interested in" — because
 * listing 200 country names and every course title is not a filter anyone can maintain. The cost
 * is that it now fires on most real messages, which is the correct trade: what it still filters
 * out is "hi", "thanks", "ok" and the pure-logistics questions, and those are genuinely frequent.
 */
export const LOOKS_LIKE_BACKGROUND = new RegExp(
  [
    // Qualifications, tests, work — the original set.
    "ielts|toefl|pte|duolingo|celpip|gre|gmat|sat|act",
    "bachelor|bachelors|master|masters|mba|phd|doctorate|degree|diploma|undergrad|undergraduate|postgrad|postgraduate",
    "gpa|cgpa|grade|grades|graduated|graduating|studied|studying|marks|percentage|percentile",
    "honours|honors|first class|second class|distinction|band|overall|score|scored|semester|transcript",
    "work|worked|working|job|role|intern|internship|experience|employed|employer|company",
    // Age. The bare-number form is handled separately below.
    "years old|yrs old|how old|age|aged|birthday|born in",
    // Gender, only ever as an explicit self-description.
    "male|female|man|woman|non-binary|nonbinary|transgender|he/him|she/her|they/them|pronouns",
    // Nationality — framing, never country names.
    "nationality|citizen|citizenship|passport|i am from|i'm from|im from|come from|based in|living in|resident of",
    // Study preference — how a visitor names a course they want.
    "interested in|looking for|want to study|wish to study|plan to study|apply for|applying|admission",
    "tell me about|do you have|do you offer|course|courses|program|programme|programs|programmes|major|specialisation|specialization",
  ].join("|"),
  "i",
);

/** "I'm 22", "I am 25", "22 years old" — an age with no surrounding keyword. */
const BARE_AGE = /\b(i'?m|i am|im|age)\s*:?\s*\d{1,2}\b|\b\d{1,2}\s*(years?|yrs?)\b/i;

/**
 * "I'm Nepali", "I am an Italian", "im Chinese" — a demonym, which no framing word above catches.
 * Matched by SUFFIX (-i, -an, -ese, -ish), not a list of nationalities. Over-fires on "I'm Rohan";
 * that is one cheap call returning {}.
 */
const DEMONYM = /\b(i'?m|i am|im)\s+(an?\s+)?[a-z]+(i|an|ese|ish)\b/i;

/** The last question in a counsellor turn: "…great choice. How old are you?" -> "How old are you?" */
function lastQuestion(text: string): string | undefined {
  return text.match(/[^.?!\n]*\?/g)?.pop();
}

const SYSTEM = [
  "You read a conversation between a student and a university counsellor, and extract what the student's LATEST message says about themselves. Return ONLY a JSON object. No prose, no code fence, no explanation.",
  "",
  "The conversation ends with the latest message. Everything before it is context: use it to understand what the latest message means (the question it answers, what \"it\" or \"that one\" refers to), but NEVER return a fact that only appears earlier. Those were already recorded, and returning them again overwrites later corrections.",
  '  COUNSELLOR: "How old are you?"  STUDENT (latest): "22"          -> {"age":"22"}',
  '  STUDENT: "I\'m 22"  ...  STUDENT (latest): "tell me about the MBA" -> {"study_preference":"MBA"}   (age is NOT returned)',
  "",
  "Shape — include ONLY the keys the latest message actually revealed:",
  '{"age":"","gender":"","nationality":"","study_preference":"",',
  '"qualifications":[{"qualification_type":"","degree_title":"","subject_area":"","institution_name":"","grading_system":"","grade_value":"","is_current":false,"start_date":"","end_date":""}],',
  '"language_tests":[{"test_status":"","test_type":"","overall_score":"","test_date":"","sub_scores":{}}],',
  '"academic_tests":[{"test_status":"","test_type":"","overall_score":"","test_date":"","sub_scores":{}}],',
  '"work_experiences":[{"job_title":"","organization_name":"","is_current":false,"start_date":"","end_date":""}]}',
  "",
  "THE FOUR SCALARS — each only when the student STATED it about themselves:",
  "- age: exactly as they said it. \"I'm 22\" -> \"22\". \"I'm in my early 30s\" -> \"early 30s\". Do not convert to a range or a birth year.",
  "- gender: only their own explicit statement, e.g. \"I'm a woman\" -> \"female\", \"my pronouns are he/him\" -> \"male\".",
  "- nationality: the COUNTRY, written as the country's English NAME, never the adjective. \"I'm Nepali\" -> \"Nepal\". \"I'm from the UK\" -> \"United Kingdom\". If they name a region that is not a country, write what they said and we will handle it.",
  "- study_preference: the SPECIFIC course or program THEY asked about.",
  '    "I\'m interested in the Master of Computer Science." -> "Master of Computer Science"',
  '    "Can you tell me about your MBA?"                   -> "MBA"',
  '    "I\'m looking for IT courses."                       -> omit it. That is a broad interest, not a course.',
  "  If they ask about several, use the one they are asking about NOW. Never join two courses into one string.",
  "  A course the COUNSELLOR recommended is not their preference. Only one they named or clearly picked.",
  "",
  "NEVER INFER ANY OF THESE. Do not determine age, gender or nationality from a name, a writing style, the language they write in, where they say they live, a course choice, or any other indirect signal. A name is not a gender. A language is not a nationality. Country of residence is not nationality. If they did not say it, omit the key.",
  "",
  "language_tests are English tests (IELTS, TOEFL, PTE, Duolingo, CELPIP). academic_tests are GRE, GMAT, SAT, ACT.",
  "",
  "sub_scores carries EVERY component score they listed, keyed by skill, as strings. This is the part most often lost — capture all of it.",
  '  "I got 7 in IELTS, 7 in writing, 7 in speaking, 7 reading and 7 in listening"',
  '  -> {"language_tests":[{"test_type":"IELTS","overall_score":"7","sub_scores":{"writing":"7","speaking":"7","reading":"7","listening":"7"}}]}',
  '  "bachelors in computing, upper second class"',
  '  -> {"qualifications":[{"qualification_type":"Bachelor","degree_title":"Bachelors in Computing","subject_area":"Computing","grading_system":"UK Honours","grade_value":"Upper Second Class"}]}',
  '  "two years as a junior developer at Infosys, still there"',
  '  -> {"work_experiences":[{"job_title":"Junior Developer","organization_name":"Infosys","is_current":true}]}',
  "",
  "One message often reveals SEVERAL of these at once. Return every key it revealed — never stop at the first:",
  '  "I\'m 24, from Nepal, done bachelors in computing with an upper second class and 7 in ielts. Interested in the MSc Data Science."',
  '  -> {"age":"24","nationality":"Nepal","study_preference":"MSc Data Science","qualifications":[{"qualification_type":"Bachelor","degree_title":"Bachelors in Computing","subject_area":"Computing","grading_system":"UK Honours","grade_value":"Upper Second Class"}],"language_tests":[{"test_type":"IELTS","overall_score":"7"}]}',
  "",
  "Rules:",
  "- Record only what THEY stated about THEMSELVES. Never a course's entry requirement, never the counsellor's recommendation, never an inference.",
  "- The latest message is often a bare reply to the counsellor's question (\"how old are you?\" / \"22\"). Read the question to understand it.",
  "- If the latest message CORRECTS something they said earlier, return the corrected value.",
  "- Scores and grades stay EXACTLY as written: '7.0' stays '7.0', '2:1' stays '2:1', '3.6 GPA' stays '3.6'. Never convert, never round, never normalise.",
  "- A test they PLAN to sit is not a test they took: test_status 'planned', no score.",
  "- Omit any key they did not give. No nulls, no empty strings, no placeholders, no guesses.",
  "- Each array holds a LIST of objects, even when there is only one. Never emit a bare object.",
  "- The latest message reveals nothing new about them: return exactly {}",
].join("\n");

/**
 * Whether this turn is worth a call. Exported because it is the only branch here that can lose
 * data silently — a message it rejects is never looked at again.
 *
 * An earlier version also required 8 characters, to stop a tiny message matching on a stray word;
 * a test caught that it rejected "gre 320", a real score in seven characters. The floor was
 * guarding against a cheap failure (one wasted call returning `{}`) at the price of an expensive
 * one, so it is gone.
 */
export function worthExtracting(message: string, previousCounsellorTurn?: string): boolean {
  const text = message.trim();
  if (LOOKS_LIKE_BACKGROUND.test(text) || BARE_AGE.test(text) || DEMONYM.test(text)) return true;
  // An answer carries no keyword of its own — "22", "Nepali", "yes, 7 in each" — so it is judged
  // by the question it answers. Only the counsellor's LAST question counts: almost every
  // counsellor turn mentions a course somewhere, and matching the whole turn would make every
  // reply qualify.
  const question = previousCounsellorTurn && lastQuestion(previousCounsellorTurn);
  return !!question && LOOKS_LIKE_BACKGROUND.test(question);
}

/** The counsellor's most recent words, or undefined at the start of a chat. */
function lastCounsellorTurn(history: Turn[]): string | undefined {
  const turn = [...history].reverse().find((t) => t.role === "model");
  return turn?.parts.map((p) => p.text).join(" ");
}

/** The recent conversation as plain labelled lines, newest last. */
function transcriptOf(history: Turn[], latestUserMessage: string): string {
  return [
    ...history.map((t) => ({
      who: t.role === "user" ? "STUDENT" : "COUNSELLOR",
      text: t.parts.map((p) => p.text).join(" "),
    })),
    { who: "STUDENT", text: latestUserMessage },
  ]
    .slice(-TRANSCRIPT_TURNS)
    .map((t) => `${t.who}: ${t.text.slice(0, MAX_TURN_CHARS)}`)
    .join("\n\n");
}

/**
 * What the conversation reveals about the visitor, or null.
 *
 * Never throws: this runs beside a reply that has already been streamed to the visitor, and a
 * failed extraction must cost them nothing. Both the model call and the parse resolve to null.
 *
 * The prefilter reads only the LATEST message (plus the question it answers) — the decision is
 * "did this turn add anything", and a transcript would make every turn qualify forever. The
 * model is held to the same line: earlier turns are context for reading the latest message, not
 * facts to return. Re-returning them would overwrite an owner's correction with a value the
 * visitor never restated, and resurrect a record entry the owner deleted.
 */
export async function extractProfile(
  history: Turn[],
  latestUserMessage: string,
): Promise<VisitorProfile | null> {
  if (!worthExtracting(latestUserMessage, lastCounsellorTurn(history))) return null;

  try {
    const raw = await generateText({
      system: SYSTEM,
      prompt: transcriptOf(history, latestUserMessage),
      maxTokens: 700,
      // Extraction, not writing. Any creativity here is a fabricated grade or an invented gender.
      temperature: 0,
    });

    const { value, via } = parseModelJson<Record<string, unknown>>(raw);
    if (!value || typeof value !== "object") {
      // SHAPE ONLY — never the response body. Everything this call returns is by definition the
      // visitor's own demographics, grades, institutions and employers, so a "just the first 200
      // chars to debug" sample puts personal data into the console and the retained combined log.
      // The three fields below are enough to tell a truncation from a prose preamble from an
      // empty reply, which is all the sample was ever used for.
      logger.warn("Profile extraction unparseable", {
        via,
        length: raw.length,
        looksJson: raw.trimStart().startsWith("{"),
      });
      return null;
    }

    // Unknown keys dropped, values bounded, strings only. The model is told the exact shape but
    // is not trusted to have produced it.
    const profile = cleanProfile(value);
    if (profile) await resolveNationality(profile);

    // Both key sets, because "the model only returned one key" and "the cleaner dropped one" are
    // the two ways this loses data and they are indistinguishable from the columns alone.
    // Finding that out cost a round trip through the user once already. Key NAMES only — the
    // values are the personal data.
    logger.debug("Profile extracted", {
      returned: Object.keys(value),
      kept: profile ? Object.keys(profile) : null,
      via,
    });
    return profile;
  } catch (err) {
    logger.warn("Profile extraction failed", { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Split the model's nationality answer into a resolved country and the visitor's own wording.
 *
 * Mutates in place; a lookup failure is not an error. The model is asked for a country NAME
 * rather than a demonym precisely so this stays a lookup and never becomes a guess — mapping
 * "Nepali" to Nepal is a language task the model does correctly, while a demonym table here
 * would be 200 irregular entries maintained by hand.
 *
 * An answer matching no country keeps `nationality_raw` and leaves `nationality` unset: "I'm
 * Kashmiri" is a real thing to have said, and neither discarding it nor filing it under a country
 * they did not name is acceptable.
 */
async function resolveNationality(profile: VisitorProfile): Promise<void> {
  const stated = profile.nationality;
  if (!stated) return;

  const resolved = await resolveCountryName(stated);
  if (resolved) {
    profile.nationality = resolved;
    // Only kept when it adds something. "Nepal" -> "Nepal" needs no second copy.
    if (resolved.toLowerCase() !== stated.toLowerCase()) profile.nationality_raw = stated;
  } else {
    delete profile.nationality;
    profile.nationality_raw = stated;
  }
}
