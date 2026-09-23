import { generateText } from "../../../shared/ai/gemini.js";
import { parseModelJson } from "../../../shared/ai/parse-model-json.js";
import { cleanProfile, type VisitorProfile } from "./card-parser.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("profile-extract");

/**
 * Pull the visitor's own background out of their message.
 *
 * This used to ride the counsellor's reply as a server-only ```block. That failed in practice and
 * the failure mode was instructive: on a turn where the model emitted three course cards and four
 * chips it simply skipped the invisible record-keeping block, twice, across two rewrites of the
 * instruction. An obligation with no visible consequence loses to one the student can see.
 *
 * So it is its own call, with one job and nothing to trade off against. Three things fall out of
 * that which the in-band version could not have:
 * - it reads the STUDENT's message, not the counsellor's reply, which is where the facts were
 *   actually stated — no relay, no paraphrase, no risk of recording a course's requirements as
 *   the student's own grades;
 * - a small model can do it, because "return this JSON" is a far easier instruction to follow
 *   than "also append an invisible block"; and
 * - the main reply's prompt gets ~1.4k tokens shorter on every single turn.
 */

/**
 * Turns worth spending a call on.
 *
 * The modal widget message is "what are the fees" and reveals nothing, so the default has to be
 * "don't call". This is deliberately loose — a false positive costs one cheap call, a false
 * negative loses data permanently — but it must stay cheap enough to run on every turn.
 *
 * ponytail: anaphora is the known gap. "yes, 7 in each" after the counsellor asked about IELTS
 * has no test name in it and is skipped. Pass the previous assistant turn in too if that shows up
 * in real transcripts; it is a one-line change and not worth the tokens until it does.
 */
export const LOOKS_LIKE_BACKGROUND =
  /\b(ielts|toefl|pte|duolingo|celpip|gre|gmat|sat|act|bachelor|bachelors|master|masters|mba|phd|doctorate|degree|diploma|undergrad|undergraduate|postgrad|postgraduate|gpa|cgpa|grade|grades|graduated|graduating|studied|studying|marks|percentage|percentile|honours|honors|first class|second class|distinction|band|overall|score|scored|semester|transcript|work|worked|working|job|role|intern|internship|experience|employed|employer|company)\b/i;

const SYSTEM = [
  "You extract a student's stated background from one message. Return ONLY a JSON object. No prose, no code fence, no explanation.",
  "",
  "Shape — include ONLY the arrays that message actually revealed, and inside them only the fields it gave:",
  '{"qualifications":[{"qualification_type":"","degree_title":"","subject_area":"","institution_name":"","grading_system":"","grade_value":"","is_current":false,"start_date":"","end_date":""}],',
  '"language_tests":[{"test_status":"","test_type":"","overall_score":"","test_date":"","sub_scores":{}}],',
  '"academic_tests":[{"test_status":"","test_type":"","overall_score":"","test_date":"","sub_scores":{}}],',
  '"work_experiences":[{"job_title":"","organization_name":"","is_current":false,"start_date":"","end_date":""}]}',
  "",
  "language_tests are English tests (IELTS, TOEFL, PTE, Duolingo, CELPIP). academic_tests are GRE, GMAT, SAT, ACT.",
  "",
  "sub_scores carries EVERY component score they listed, keyed by skill, as strings. This is the part most often lost — capture all of it.",
  '  "I got 7 in IELTS, 7 in writing, 7 in speaking, 7 reading and 7 in listening"',
  '  -> {"language_tests":[{"test_type":"IELTS","overall_score":"7","sub_scores":{"writing":"7","speaking":"7","reading":"7","listening":"7"}}]}',
  '  "IELTS 7.5 overall, L8 R7.5 W6.5 S7"',
  '  -> {"language_tests":[{"test_type":"IELTS","overall_score":"7.5","sub_scores":{"listening":"8","reading":"7.5","writing":"6.5","speaking":"7"}}]}',
  '  "bachelors in computing, upper second class"',
  '  -> {"qualifications":[{"qualification_type":"Bachelor","degree_title":"Bachelors in Computing","subject_area":"Computing","grading_system":"UK Honours","grade_value":"Upper Second Class"}]}',
  '  "two years as a junior developer at Infosys, still there"',
  '  -> {"work_experiences":[{"job_title":"Junior Developer","organization_name":"Infosys","is_current":true}]}',
  "",
  "One message often reveals SEVERAL of these at once. Return every array it revealed — never stop at the first:",
  '  "I have done bachelors in computing with an upper second class degree and i have got 7 in ielts"',
  '  -> {"qualifications":[{"qualification_type":"Bachelor","degree_title":"Bachelors in Computing","subject_area":"Computing","grading_system":"UK Honours","grade_value":"Upper Second Class"}],"language_tests":[{"test_type":"IELTS","overall_score":"7"}]}',
  "",
  "Rules:",
  "- Record only what THEY stated about THEMSELVES. Never a course's entry requirement, never a recommendation, never an inference.",
  "- Scores and grades stay EXACTLY as written: '7.0' stays '7.0', '2:1' stays '2:1', '3.6 GPA' stays '3.6'. Never convert, never round, never normalise.",
  "- A test they PLAN to sit is not a test they took: test_status 'planned' and no score.",
  "- Omit any field they did not give. No nulls, no empty strings, no placeholders.",
  "- Each array holds a LIST of objects, even when there is only one. Never emit a bare object.",
  '- Message reveals nothing about their own background: return exactly {}',
].join("\n");

/**
 * Whether this message is worth a call. Exported because it is the only branch here that can lose
 * data silently — a message it rejects is never looked at again.
 *
 * The regex is the whole filter. An earlier version also required 8 characters, to stop a tiny
 * message matching on a stray word; the test caught that it rejected "gre 320", which is a real
 * score in seven characters. The floor was guarding against a cheap failure (one wasted call
 * returning `{}`) at the price of an expensive one (a fact lost for good), so it is gone. Short
 * acknowledgements — "ok", "yes", "thanks!" — carry none of these words and are filtered anyway.
 */
export function worthExtracting(message: string): boolean {
  return LOOKS_LIKE_BACKGROUND.test(message.trim());
}

/**
 * The four arrays this message revealed, or null.
 *
 * Never throws: this runs beside a reply that has already been streamed to the visitor, and a
 * failed extraction must cost them nothing. Both the model call and the parse resolve to null.
 */
export async function extractProfile(message: string): Promise<VisitorProfile | null> {
  const text = message.trim();
  if (!worthExtracting(text)) return null;

  try {
    const raw = await generateText({
      system: SYSTEM,
      prompt: text,
      maxTokens: 600,
      // Extraction, not writing. Any creativity here is a fabricated grade.
      temperature: 0,
    });

    const { value, via } = parseModelJson<Record<string, unknown>>(raw);
    if (!value || typeof value !== "object") {
      logger.warn("Profile extraction unparseable", { via, sample: raw.slice(0, 200) });
      return null;
    }
    // Same cleaner as the old in-band path: unknown keys dropped, values bounded, strings only.
    // The model is told the exact shape but is not trusted to have produced it.
    const profile = cleanProfile(value);

    // Both key sets, because "the model only returned one array" and "the cleaner dropped one"
    // are the two ways this loses data and they are indistinguishable from the column alone.
    // Finding that out cost a round trip through the user once already.
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
