import { generateText } from "../../../shared/ai/gemini.js";
import { parseModelJson } from "../../../shared/ai/parse-model-json.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("handover-detect");

/**
 * Is the visitor asking to talk to a person?
 *
 * Visitor-initiated only: the AI never offers a handover, so this is the one way a chat reaches
 * the "waiting for a person" state. Its own call, made BEFORE the reply — a hidden instruction in
 * the counsellor's reply gets dropped on busy turns and by the fallback model, and asking after
 * the reply would let the AI answer "can I speak to someone?" itself first.
 *
 * The regex only decides whether the call is worth making. The model decides intent: "is there
 * a person I can email about visas?" passes the regex and should come back false.
 */
export const MIGHT_WANT_HUMAN =
  /\b(human|person|people|someone|somebody|staff|agent|advis[eo]r|counsell?or|representative|admissions?|team|real|call|phone|speak|talk|chat with|contact)\b/i;

const SYSTEM = [
  "You read the latest message a student sent to a university's AI chat assistant and judge ONE thing:",
  "are they asking, right now, to be put through to a human member of staff in this chat?",
  "",
  'Return ONLY a JSON object, no prose, no code fence: {"wants_human": true|false}',
  "",
  "true — 'can I talk to a real person', 'I want to speak to someone from admissions', 'connect me to an advisor', 'is there a human here?'",
  "false — asking FOR information about staff or contact details ('who is the course coordinator?', 'what is the admissions email?', 'can I call the office?'), thanks, or anything else.",
  "When unsure, answer false.",
].join("\n");

/** Never throws: a failed check means the AI answers, which is today's behaviour. */
export async function judgeWantsHuman(latestUserMessage: string): Promise<boolean> {
  if (!MIGHT_WANT_HUMAN.test(latestUserMessage)) return false;
  try {
    // The one model call that blocks the reply — the visitor waits out this whole round trip
    // before the counsellor starts writing, on every message the regex above lets through.
    // `lite` keeps the decision and halves the wait: npm run handover:check scores the verdicts of
    // both models over this prompt's own true/false cases — they agreed 12/12 while
    // lite averaged 926ms against 1767ms.
    //
    // maxTokens is the thinking budget too (see profile-extract) — a rambling 1000-char message
    // must not spend it all on thought and return an empty verdict, which reads as "no handover".
    const raw = await generateText({ system: SYSTEM, prompt: latestUserMessage.slice(0, 1000), maxTokens: 8000, temperature: 0, tier: "lite" });
    const { value } = parseModelJson<{ wants_human?: unknown }>(raw);
    const wants = value?.wants_human === true;
    logger.debug("Handover judged", { wants });
    return wants;
  } catch (err) {
    logger.warn("Handover judgement failed", { err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
