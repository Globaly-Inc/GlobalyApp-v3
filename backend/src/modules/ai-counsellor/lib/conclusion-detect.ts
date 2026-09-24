import { generateText } from "../../../shared/ai/gemini.js";
import { parseModelJson } from "../../../shared/ai/parse-model-json.js";
import { cleanConclusion, type ConclusionSignal } from "./card-parser.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("conclusion-detect");

/**
 * Has this visitor got what they came for?
 *
 * This used to ride the counsellor's own reply as a server-only ```block. It never fired in
 * practice: with every server gate open (`detectConclusion: true`, `endPromptCount: 0`,
 * `hasEmail: true`) on a conversation that ended with the student thanking the counsellor and
 * the counsellor wishing them luck, the logged `likelihood` was still `null` — the model emitted
 * no block at all. Three rewrites of the instruction did not change that, which is the same
 * result profile capture produced before it was moved out. An obligation the student never sees
 * loses to the reply, every time.
 *
 * So it is its own call. Two things follow that the in-band version could not have:
 * - the judgement is not made by the model that just wrote four quick_replies suggesting more
 *   questions. That model has effectively already voted "not finished"; a clean reader of the
 *   transcript has not.
 * - it is asked ONLY when the answer could change what happens, so it costs nothing on the turns
 *   where the card could not appear anyway. See `judgementMatters` at the call site.
 */

const SYSTEM = [
  "You read a conversation between a student and a university counsellor and judge ONE thing: has the student accomplished what they came here to accomplish?",
  "",
  "Return ONLY a JSON object. No prose, no code fence.",
  '{"completion_likelihood":"low|medium|high","reason":"why, plainly, for our records","covered":"the clause shown to the student naming what was discussed"}',
  "",
  "This is a judgement about their INTENT, not their wording — most students never say goodbye, they simply stop needing things.",
  "Ask yourself: what was this student actually trying to find out? Has that been answered, or only the last question they happened to type? Are there loose ends THEY raised that are still open? Are their messages getting shorter or more acknowledging?",
  "",
  "high — you are confident their purpose here is served.",
  "  A student who asked about entry requirements, then fees, then scholarships, and has all three, is done even in silence.",
  "  A student who thanks you, acknowledges the answer and stops asking is done. 'thank you for the suggestion', 'okay', 'that helps'. This is the clearest signal there is — do not wait for a goodbye.",
  "medium — it might be served, but something they raised is unresolved. Say what, in reason.",
  "low — their real goal has barely been touched. One short question answered is usually low.",
  "",
  "Judge what the STUDENT has done, not what the counsellor offered. The counsellor suggests follow-up topics on every turn, including its last one; that is not evidence the student wants them. A question the counsellor raised itself is not a loose end — only one the student raised is.",
  "Never answer high on a turn where the student asked something new, opened a fresh topic, or was told something partial. When genuinely torn, choose the lower one.",
  "",
  "`reason` is internal — be blunt and specific ('asked entry requirements, fees and deadlines; all answered; last message was thanks').",
  "`covered` is shown to the student, so it must read as the counsellor still talking, under 200 characters: \"we've covered the postgraduate options, their fees and the September intake\". Omit it when the answer is low.",
].join("\n");

/** How much of the conversation the judgement sees. The opening turns rarely change it. */
const TRANSCRIPT_TURNS = 12;
const MAX_TURN_CHARS = 600;

export interface Turn {
  role: "user" | "model";
  parts: { text: string }[];
}

/**
 * The counsellor's read on whether the conversation has run its course, or null.
 *
 * Never throws. This runs after the reply has already streamed, so a failed judgement must cost
 * the visitor nothing — it simply means no card this turn, which is the same as "low".
 */
export async function judgeConclusion(
  history: Turn[],
  latestUserMessage: string,
  latestReply: string,
): Promise<ConclusionSignal | null> {
  const lines = [
    ...history.map((t) => ({ who: t.role === "user" ? "STUDENT" : "COUNSELLOR", text: t.parts.map((p) => p.text).join(" ") })),
    { who: "STUDENT", text: latestUserMessage },
    { who: "COUNSELLOR", text: latestReply },
  ]
    .slice(-TRANSCRIPT_TURNS)
    .map((t) => `${t.who}: ${t.text.slice(0, MAX_TURN_CHARS)}`)
    .join("\n\n");

  try {
    const raw = await generateText({
      system: SYSTEM,
      prompt: lines,
      maxTokens: 400,
      // A judgement, not prose. Sampling here makes the same conversation classify differently
      // on two consecutive turns, which reads to the visitor as the card appearing at random.
      temperature: 0,
    });

    const { value, via } = parseModelJson<Record<string, unknown>>(raw);
    const signal = value && typeof value === "object" ? cleanConclusion(value) : null;
    // Same rule as profile-extract: shape, never body. This call is fed the transcript, so an
    // unparseable response can echo the student's own words straight back — and `reason`, when it
    // DOES parse, is a deliberate internal note rather than raw model text.
    logger.debug("Conclusion judged", {
      via,
      likelihood: signal?.likelihood ?? null,
      ...(signal ? {} : { length: raw.length, looksJson: raw.trimStart().startsWith("{") }),
    });
    return signal;
  } catch (err) {
    logger.warn("Conclusion judgement failed", { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
