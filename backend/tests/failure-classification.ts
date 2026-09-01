/**
 * classifyFailure() regression test — reproduces the real bug: the ai_5xx branch used
 * the broad /5\d{2}/, so a DB outage error ("connect ECONNREFUSED 127.0.0.1:5432")
 * pattern-matched as an AI 5xx and the page worker re-queued the page up to 3 times,
 * re-scraping and re-billing Gemini for an extraction that had already succeeded.
 * Run: node --import tsx tests/failure-classification.ts
 */
let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function main() {
  const { classifyFailure } = await import("../src/modules/superadmin/data-extraction/lib/classify-failure.js");

  // The bug: infrastructure errors carrying incidental 5xx-shaped digits must NOT retry as AI errors
  assertEqual(classifyFailure("connect ECONNREFUSED 127.0.0.1:5432"), "other", "Postgres port 5432 is not an AI 5xx");
  assertEqual(classifyFailure("connect ETIMEDOUT 10.0.0.5:6379"), "other", "arbitrary host:port is not an AI 5xx");
  assertEqual(classifyFailure('insert into fees (total_amount) values (5030) - constraint violation'), "other", "a fee amount like 5030 is not an AI 5xx");

  // Genuine AI failures must still be retried
  assertEqual(classifyFailure("AI_TRANSIENT: [503 Service Unavailable] model overloaded"), "ai_5xx", "llm-client's tag is authoritative");
  assertEqual(classifyFailure("AI_TRANSIENT: fetch failed"), "ai_5xx", "tagged network failure from the AI call retries");
  assertEqual(classifyFailure("[429 Too Many Requests] quota exceeded"), "ai_5xx", "word-bounded 429 still classifies");
  assertEqual(classifyFailure("upstream returned 503"), "ai_5xx", "word-bounded 503 still classifies");
  assertEqual(classifyFailure("The model is overloaded. Please try again later."), "ai_5xx", "overload text classifies");

  // The tag wins even when its quoted message contains other classes' keywords
  assertEqual(classifyFailure("AI_TRANSIENT: response was empty"), "ai_5xx", "tag outranks the anti_bot 'empty' sniff");

  // Neighbouring classes unchanged
  assertEqual(classifyFailure("Page blocked after 2 retries"), "anti_bot", "blocked still classifies anti_bot");
  assertEqual(classifyFailure("LLM returned invalid JSON, parse error"), "parse_error", "parse errors don't retry as ai_5xx");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
