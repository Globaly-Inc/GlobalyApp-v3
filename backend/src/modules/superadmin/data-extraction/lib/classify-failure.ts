// Queue-level failure classification for the page worker's retry routing.
// ponytail: ported from V2's classifyFailure + routeFailure

export type FailureClass = "anti_bot" | "not_found" | "not_a_course" | "ai_5xx" | "parse_error" | "other";

export function classifyFailure(error: string): FailureClass {
  const e = error.toLowerCase();
  // Authoritative tag from llm-client's withRetry: the AI call itself failed transiently.
  // Checked first — it may quote arbitrary upstream text that the sniffs below misread.
  if (e.includes("ai_transient:")) return "ai_5xx";
  if (e.includes("blocked") || e.includes("minimal_content") || e.includes("empty") || e.includes("anti-bot")) return "anti_bot";
  if (e.includes("not a course") || e.includes("blog") || e.includes("news") || e.includes("staff")) return "not_a_course";
  // Word-bounded status sniffs for errors that never pass through llm-client. The old
  // broad /5\d{2}/ matched any digit run starting with 5 — "ECONNREFUSED 127.0.0.1:5432"
  // classified a DB outage as an AI 5xx, and each retry re-scraped the page and re-billed
  // Gemini for an extraction that had already succeeded.
  if (/\b(429|5\d{2}|5xx)\b/.test(e) || e.includes("overloaded") || e.includes("rate limit")) return "ai_5xx";
  if (e.includes("parse") || e.includes("no structured data")) return "parse_error";
  return "other";
}
