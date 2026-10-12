import { generateText } from "../../../shared/ai/gemini.js";
import { parseModelJson } from "../../../shared/ai/parse-model-json.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("escalation-detect");

/** Why AI hands a conversation to the team instead of answering — ai_widget_visitors.attention_reason. */
export type EscalationReason = "sensitive" | "ai_unsure";

/**
 * Should this message go to the team rather than be answered by AI?
 *
 * Its own call, BEFORE the reply, for the same reason as judgeWantsHuman: an instruction hidden in
 * the counsellor's prompt gets dropped on busy turns and by the fallback model, so the decision
 * must not depend on the reply obeying it.
 *
 * The regex only decides whether the call is worth making; most messages ("what IELTS score do I
 * need?") never reach the model.
 */
const MIGHT_ESCALATE =
  /\b(visa|refus|reject|denied|deport|chance|guarantee|promise|refund|complain|complaint|lawyer|legal|court|police|sue|fraud|scam|sick|ill|hospital|depress|suicid|abuse|harass|pregnan|debt|loan|money back|my application|my file|status of)\w*/i;

const SYSTEM = [
  "You read one message a customer sent to a study-abroad agency's AI assistant on WhatsApp, Instagram or Facebook.",
  "Decide whether the AI should NOT answer it itself and a human staff member should handle it instead.",
  "",
  'Return ONLY a JSON object, no prose, no code fence: {"reason": "sensitive" | "needs_team" | null}',
  "",
  '"sensitive" — a previous visa refusal or rejection, a complaint, legal trouble, threats, health, money hardship, harassment, or anything personal and distressing.',
  '"needs_team" — asks for something only staff can decide or know: their chances of a visa or admission, a guarantee or promise, a refund, a decision on a scholarship, or the status of their own application or file.',
  "null — ordinary questions about programs, countries, requirements, fees, intakes or the process. Most messages are null.",
  "When unsure, answer null.",
].join("\n");

/** Never throws: a failed check means AI answers, the safe default for an ordinary question. */
export async function judgeEscalation(message: string, allow: { sensitive: boolean; unsure: boolean }): Promise<EscalationReason | null> {
  if ((!allow.sensitive && !allow.unsure) || !MIGHT_ESCALATE.test(message)) return null;
  try {
    const raw = await generateText({ system: SYSTEM, prompt: message.slice(0, 1000), maxTokens: 400, temperature: 0 });
    const { value } = parseModelJson<{ reason?: unknown }>(raw);
    const reason = value?.reason === "sensitive" ? "sensitive" : value?.reason === "needs_team" ? "ai_unsure" : null;
    if (reason === "sensitive" && !allow.sensitive) return null;
    if (reason === "ai_unsure" && !allow.unsure) return null;
    logger.debug("Escalation judged", { reason });
    return reason;
  } catch (err) {
    logger.warn("Escalation judgement failed", { err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
